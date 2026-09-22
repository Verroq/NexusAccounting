// Desktop companion for the Steam (Electron) build of Nexus Legacy.
//
// The Steam client is a 40 KB Electron wrapper around https://nexuslegacy.space,
// with no extension support. Launch it with `--remote-debugging-port=9222` and
// this script attaches over the Chrome DevTools Protocol to do what the
// WebExtension runtime does in Firefox:
//   - cookies      → Network.getCookies
//   - content scripts → Page.addScriptToEvaluateOnNewDocument (isolated world)
//   - webRequest   → Network.responseReceived
//   - storage/alarms/downloads → JSON file / setInterval / ~/Downloads
// background.js runs unchanged in this Node process behind that `browser.*`
// shim; the dashboard is served over HTTP with page-shim.js in place of the
// polyfill, and every browser.* call from a page is an HTTP RPC back here.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, execFile } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isNewer } from './version.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ADDON = path.join(HERE, '..', 'nexus-addon');
const PORT = Number(process.env.NEXUS_PORT || 7777);
const BASE = `http://127.0.0.1:${PORT}`;
const CDP = process.env.NEXUS_CDP || 'http://127.0.0.1:9222';
const DATA = process.env.NEXUS_DATA || path.join(os.homedir(), '.nexus-accounting');
const STORAGE_FILE = path.join(DATA, 'storage.json');
const WORLD = 'nexus-accounting';
const TAB_ID = 1;
const manifest = JSON.parse(fs.readFileSync(path.join(ADDON, 'manifest.json'), 'utf8'));

// Every console line (ours and background.js's) goes to a ring buffer the
// dashboard's Companion screen shows, and to DATA/companion.log. The exe has
// no console window, so this is the only place output lands.
const LOG_KEEP = 200;
const logLines = [];
fs.mkdirSync(DATA, { recursive: true });
const logFile = fs.createWriteStream(path.join(DATA, 'companion.log'), { flags: 'a' });
for (const level of ['log', 'warn', 'error']) {
  const orig = console[level].bind(console);
  console[level] = (...a) => {
    const text = a.map(x => x instanceof Error ? x.message : typeof x === 'string' ? x : JSON.stringify(x)).join(' ');
    const line = { t: new Date().toISOString(), level, text };
    logLines.push(line);
    if (logLines.length > LOG_KEEP) logLines.shift();
    logFile.write(`${line.t} ${level} ${text}\n`);
    orig(...a);
  };
}
const log = (...a) => console.log('[companion]', ...a);

const globToRe = g => new RegExp('^' + g.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
const matchesAny = (url, globs) => globs.some(g => globToRe(g).test(url));

// ── Storage: one JSON file, whole-file write debounced ─────────────────────
const store = fs.existsSync(STORAGE_FILE) ? JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf8')) : {};
const freshInstall = !fs.existsSync(STORAGE_FILE);
let flushTimer = null;
function flush() {
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    fs.mkdirSync(DATA, { recursive: true });
    const tmp = STORAGE_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(store));
    fs.renameSync(tmp, STORAGE_FILE);   // atomic: a crash mid-write never truncates the data
  }, 500);
}
const changeListeners = [];     // Node-side onChanged
const sseClients = new Set();   // dashboard/game pages
function emitChanges(changes) {
  for (const fn of changeListeners) fn(changes, 'local');
  const line = `data: ${JSON.stringify(changes)}\n\n`;
  for (const res of sseClients) res.write(line);
}
const storageLocal = {
  async get(keys) {
    if (keys == null) return structuredClone(store);
    if (typeof keys === 'string') keys = [keys];
    const out = {};
    if (Array.isArray(keys)) { for (const k of keys) if (k in store) out[k] = structuredClone(store[k]); }
    else for (const [k, d] of Object.entries(keys)) out[k] = k in store ? structuredClone(store[k]) : d;
    return out;
  },
  async set(items) {
    const changes = {};
    for (const [k, v] of Object.entries(items)) { store[k] = structuredClone(v); changes[k] = { newValue: v }; }
    flush(); emitChanges(changes);
  },
  async remove(keys) {
    const changes = {};
    for (const k of (typeof keys === 'string' ? [keys] : keys)) if (k in store) { delete store[k]; changes[k] = {}; }
    flush(); emitChanges(changes);
  },
  async clear() {
    const changes = Object.fromEntries(Object.keys(store).map(k => [k, {}]));
    for (const k of Object.keys(store)) delete store[k];
    flush(); emitChanges(changes);
  },
};

// ── CDP client ─────────────────────────────────────────────────────────────
let ws = null, nextId = 1, pageUrl = '', frameId = null, worldCtx = null, attachedAt = 0;
const pending = new Map();
const cdpEvents = new Map();   // method → [fn]
const onCdp = (m, fn) => cdpEvents.set(m, [...(cdpEvents.get(m) || []), fn]);
function cdp(method, params = {}) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return Promise.reject(new Error('Game not attached.'));
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}
async function findPage() {
  const targets = await (await fetch(`${CDP}/json`)).json();
  return targets.find(t => t.type === 'page' && /nexuslegacy\.space/.test(t.url)) || targets.find(t => t.type === 'page');
}
let gameRunning = false;   // Nexus Legacy.exe seen while unattached → launch option missing
let waitLogged = false;
function checkGameProcess() {
  if (process.platform !== 'win32') return;
  execFile('tasklist', ['/FI', 'IMAGENAME eq Nexus Legacy.exe', '/NH'], { windowsHide: true }, (err, out) => {
    const running = !err && /Nexus Legacy\.exe/i.test(out);
    if (running && !gameRunning) log('Nexus Legacy.exe is running but nothing listens on', CDP, '— check the launch option');
    gameRunning = running;
  });
}
const retry = () => attach().catch(e => log('attach:', e.message));
async function attach() {
  let target;
  try { target = await findPage(); } catch { target = null; }
  if (!target) {
    if (!waitLogged) { log('game not found on', CDP, '— retrying every 5 s'); waitLogged = true; }
    checkGameProcess(); setTimeout(retry, 5000); return;
  }
  waitLogged = false;
  gameRunning = true;
  ws = new WebSocket(target.webSocketDebuggerUrl);
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id); pending.delete(m.id);
      m.error ? reject(new Error(m.error.message)) : resolve(m.result);
    } else if (m.method) for (const fn of cdpEvents.get(m.method) || []) fn(m.params);
  };
  ws.onclose = () => { log('game detached, retrying'); ws = null; worldCtx = null; for (const p of pending.values()) p.reject(new Error('Game closed.')); pending.clear(); setTimeout(retry, 5000); };
  ws.onerror = () => {};
  await new Promise((res, rej) => { ws.onopen = res; ws.addEventListener('close', () => rej(new Error('connect failed')), { once: true }); });
  pageUrl = target.url;
  log('attached to', pageUrl);
  attachedAt = Date.now();
  await cdp('Runtime.enable');
  await cdp('Network.enable');
  await cdp('Page.enable');
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: mainWorldScript() });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: isolatedWorldScript(), worldName: WORLD });
  // The page is already loaded: inject into it now rather than waiting for a reload.
  const { frameTree } = await cdp('Page.getFrameTree');
  frameId = frameTree.frame.id;
  await cdp('Runtime.evaluate', { expression: mainWorldScript() }).catch(e => log('main-world inject:', e.message));
  const { executionContextId } = await cdp('Page.createIsolatedWorld', { frameId, worldName: WORLD });
  worldCtx = executionContextId;
  await cdp('Runtime.evaluate', { expression: isolatedWorldScript(), contextId: worldCtx }).catch(e => log('isolated inject:', e.message));
  if (booted) dispatchMessage({ type: 'SCRAPE_NOW' }).catch(e => log('scrape:', e.message));
}
onCdp('Runtime.executionContextCreated', ({ context }) => { if (context.name === WORLD) worldCtx = context.id; });
onCdp('Runtime.executionContextsCleared', () => { worldCtx = null; });
onCdp('Page.frameNavigated', ({ frame }) => { if (!frame.parentId) { pageUrl = frame.url; frameId = frame.id; } });

// ── Injected scripts: the manifest's content_scripts, grouped by world ──────
const read = f => fs.readFileSync(path.join(ADDON, f), 'utf8');
const shimSource = () => read('../nexus-desktop/page-shim.js').replace('__NX_BASE__', BASE);
// document_idle scripts wait for DOM ready; each file is wrapped in its own
// function so top-level consts from different files don't collide.
const wrapIdle = src => `(() => { const run = () => {\n${src}\n}; document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', run) : run(); })();`;
function scriptsFor(world) {
  return manifest.content_scripts.filter(cs => (cs.world || 'ISOLATED') === world);
}
const mainWorldScript = () => scriptsFor('MAIN').flatMap(cs => cs.js).map(read).join('\n');
function isolatedWorldScript() {
  const seen = new Set();
  const parts = [shimSource()];
  for (const cs of scriptsFor('ISOLATED')) for (const f of cs.js) {
    if (f === 'browser-polyfill.js' || seen.has(f)) continue;
    seen.add(f);
    parts.push(cs.run_at === 'document_start' ? read(f) : wrapIdle(read(f)));
  }
  return parts.join('\n');
}

// ── browser.* for background.js ────────────────────────────────────────────
const alarms = new Map();
const alarmListeners = [];
const messageListeners = [];
const installedListeners = [], startupListeners = [];
const webRequestListeners = [];   // [{fn, urls}]
const listenerSet = arr => ({ addListener: fn => arr.push(fn) });
const noop = { addListener() {} };
const universeHosts = () => [...(store.universes || [{ key: 's0' }]).map(u => `https://${u.key}.nexuslegacy.space`), 'https://nexuslegacy.space'];

async function pageCookies(urls) {
  const { cookies } = await cdp('Network.getCookies', { urls });
  return cookies;
}
async function evalInWorld(expression) {
  if (worldCtx == null) throw new Error('Receiving end does not exist');
  const { result, exceptionDetails } = await cdp('Runtime.evaluate', { expression, contextId: worldCtx, awaitPromise: true, returnByValue: true });
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
  return result.value;
}
function openExternal(url) {
  const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  spawn(...cmd, { detached: true, stdio: 'ignore', windowsHide: true }).on('error', () => log('open in browser:', url)).unref();
}

globalThis.browser = {
  runtime: {
    id: 'nexus-desktop',
    getManifest: () => manifest,
    getURL: p => `${BASE}/${p}`,
    onInstalled: listenerSet(installedListeners),
    onStartup: listenerSet(startupListeners),
    onMessage: listenerSet(messageListeners),
    sendMessage: async () => undefined,   // ponytail: nothing in the dashboard listens (AUTH_FAILED only)
  },
  storage: { local: storageLocal, onChanged: listenerSet(changeListeners) },
  alarms: {
    create(name, { periodInMinutes, delayInMinutes }) {
      this.clear(name);
      const fire = () => alarmListeners.forEach(fn => fn({ name }));
      const period = periodInMinutes * 60000;
      const first = setTimeout(() => { fire(); alarms.set(name, setInterval(fire, period)); }, (delayInMinutes ?? periodInMinutes) * 60000);
      alarms.set(name, first);
    },
    clear(name) { const t = alarms.get(name); clearTimeout(t); clearInterval(t); alarms.delete(name); },
    onAlarm: listenerSet(alarmListeners),
  },
  cookies: {
    async get({ url, name }) { return (await pageCookies([url])).find(c => c.name === name) || null; },
    async getAll({ domain, name }) {
      return (await pageCookies(universeHosts())).filter(c => c.name === name && c.domain.replace(/^\./, '').endsWith(domain));
    },
    async getAllCookieStores() { return []; },
  },
  tabs: {
    async query({ url }) { return ws && matchesAny(pageUrl, [url]) ? [{ id: TAB_ID, url: pageUrl, windowId: 1 }] : []; },
    sendMessage: (_id, msg) => evalInWorld(`__nxDeliver(${JSON.stringify(msg)})`),
    async create({ url }) { openExternal(url); },
    async update() {},
  },
  windows: { async update() {} },
  scripting: {
    async executeScript({ func, args = [] }) {
      const { result, exceptionDetails } = await cdp('Runtime.evaluate', { expression: `(${func})(...${JSON.stringify(args)})`, awaitPromise: true, returnByValue: true });
      if (exceptionDetails) throw new Error(exceptionDetails.text);
      return [{ result: result.value }];
    },
  },
  webRequest: { onCompleted: { addListener: (fn, { urls }) => webRequestListeners.push({ fn, urls }) } },
  notifications: {
    async create(id, { title, message }) { log(`🔔 ${title}: ${message}`); return id; },
    async clear() {},
    onClicked: noop,
  },
  downloads: {
    async download({ url, filename }) {
      const target = path.join(os.homedir(), 'Downloads', filename);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, decodeURIComponent(url.slice(url.indexOf(',') + 1)));
      log('wrote', target);
      return 1;
    },
  },
  action: { onClicked: noop },
};
onCdp('Network.responseReceived', ({ response }) => {
  for (const { fn, urls } of webRequestListeners) {
    if (matchesAny(response.url, urls)) fn({ tabId: TAB_ID, statusCode: response.status, url: response.url });
  }
});

// ── Updates ────────────────────────────────────────────────────────────────
// The exe carries no runtime code — nexus-addon/ and nexus-desktop/ sit next
// to it — so an update is those two folders replaced from the release zip, and
// a restart. The exe itself is only rebuilt when Node moves on; a release that
// needs a new one says so in its notes.
const REPO = process.env.NEXUS_REPO || 'Verroq/NexusAccounting';
const INSTALL = path.join(HERE, '..');
const UPDATE_ASSET = /^nexus-companion-.*-win-x64\.zip$/;
let update = { current: manifest.version, latest: null, available: false, url: null, checkedAt: 0, state: 'idle', error: null };

async function checkUpdate() {
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { 'user-agent': 'nexus-companion', accept: 'application/vnd.github+json' },
    });
    if (!r.ok) throw new Error(`GitHub answered ${r.status}`);
    const rel = await r.json();
    const latest = String(rel.tag_name || '').replace(/^v/, '');
    const asset = (rel.assets || []).find(a => UPDATE_ASSET.test(a.name));
    update = {
      ...update, latest, checkedAt: Date.now(), error: null,
      available: !!asset && isNewer(latest, manifest.version),
      url: asset ? asset.browser_download_url : null,
      state: update.state === 'installed' ? 'installed' : 'idle',
    };
    if (update.available) log(`update available: v${latest} (running v${manifest.version})`);
  } catch (e) {
    update = { ...update, checkedAt: Date.now(), error: e.message };
    log(`update check failed: ${e.message}`);
  }
  return update;
}

async function applyUpdate() {
  if (!update.url) await checkUpdate();
  if (!update.available || !update.url) return update;
  update = { ...update, state: 'installing', error: null };
  const zip = path.join(DATA, `update-${update.latest}.zip`);
  try {
    const r = await fetch(update.url, { headers: { 'user-agent': 'nexus-companion' } });
    if (!r.ok) throw new Error(`download failed (${r.status})`);
    fs.writeFileSync(zip, Buffer.from(await r.arrayBuffer()));
    // bsdtar ships with Windows 10+ and reads zips, so no unzip dependency and
    // no hand-rolled inflate here. Only the two code folders are taken —
    // nexus-companion.exe in the zip is left alone, Windows holds it open.
    await new Promise((res, rej) => execFile('tar', ['-xf', zip, '-C', INSTALL, 'nexus-addon', 'nexus-desktop'],
      e => (e ? rej(new Error(`extract failed: ${e.message}`)) : res())));
    update = { ...update, state: 'installed' };
    log(`v${update.latest} installed — restart nexus-companion.exe to run it`);
  } catch (e) {
    update = { ...update, state: 'idle', error: e.message };
    log(`update failed: ${e.message}`);
  } finally {
    fs.rmSync(zip, { force: true });
  }
  return update;
}

// ── HTTP: static addon files + RPC for page shims ──────────────────────────
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.md': 'text/markdown', '.json': 'application/json' };
async function dispatchMessage(msg) {
  for (const fn of messageListeners) {
    const r = fn(msg, {});
    if (r !== undefined && r !== false) return await r;
  }
}
const DOWNLOADS = path.join(os.homedir(), 'Downloads', 'NexusAccounting');
function openFolder(dir) {
  fs.mkdirSync(dir, { recursive: true });
  openExternal(dir);
}
const RPC = {
  '/message': dispatchMessage,
  '/companion/status': async () => ({
    version: manifest.version, port: PORT, cdp: CDP, data: DATA, downloads: DOWNLOADS,
    attached: !!(ws && ws.readyState === WebSocket.OPEN), attachedAt, pageUrl, gameRunning,
    log: logLines, update,
  }),
  // A bodyless POST arrives as null, which a destructuring default won't catch.
  '/companion/update': body => (body && body.apply ? applyUpdate() : checkUpdate()),
  '/companion/open': ({ what }) => openFolder(what === 'downloads' ? DOWNLOADS : DATA),
  '/companion/quit': () => { log('quit requested from the dashboard'); setTimeout(() => process.exit(0), 100); },
  '/storage/get': k => storageLocal.get(k),
  '/storage/set': v => storageLocal.set(v),
  '/storage/remove': k => storageLocal.remove(k),
  '/storage/clear': () => storageLocal.clear(),
};
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, BASE);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  if (req.method === 'OPTIONS') return res.end();
  if (url.pathname === '/events') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
    res.write(':ok\n\n');
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }
  if (req.method === 'POST' && RPC[url.pathname]) {
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      const result = await RPC[url.pathname](JSON.parse(body || 'null'));
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ result: result ?? null }));
    } catch (e) {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }
  const rel = url.pathname === '/' ? 'dashboard.html' : url.pathname.slice(1);
  if (rel === 'browser-polyfill.js') { res.setHeader('content-type', 'text/javascript'); return res.end(shimSource()); }
  const file = path.join(ADDON, path.normalize(rel));
  if (!file.startsWith(ADDON) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; return res.end('not found'); }
  res.setHeader('content-type', MIME[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
const DASH_URL = `${BASE}/dashboard.html#companion`;
server.on('error', e => {
  if (e.code !== 'EADDRINUSE') throw e;
  // Second launch (double-clicked the exe again): the running one owns the port — just show it.
  openExternal(DASH_URL);
  process.exit(0);
});
server.listen(PORT, '127.0.0.1', () => {
  log(`dashboard at ${BASE}/dashboard.html`);
  if (process.env.NEXUS_OPEN !== '0') openExternal(DASH_URL);
  if (process.env.NEXUS_UPDATE_CHECK !== '0') checkUpdate();   // one GET, the screen shows the answer
});

// ── Boot ───────────────────────────────────────────────────────────────────
// No top-level await: the single-executable build loads this file with
// require(esm), which refuses async modules.
let booted = false;
async function main() {
  await import(pathToFileURL(path.join(ADDON, 'background.js')));
  if (freshInstall) for (const fn of installedListeners) fn({ reason: 'install' });
  else for (const fn of startupListeners) fn();
  booted = true;
  await retry();   // scrapes as soon as the game is attached (now or later)
}
main().catch(e => { console.error(e); process.exit(1); });
