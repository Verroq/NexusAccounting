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
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), '[companion]', ...a);

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
let ws = null, nextId = 1, pageUrl = '', frameId = null, worldCtx = null;
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
const retry = () => attach().catch(e => log('attach:', e.message));
async function attach() {
  let target;
  try { target = await findPage(); } catch { target = null; }
  if (!target) { setTimeout(retry, 5000); return; }
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
  spawn(...cmd, { detached: true, stdio: 'ignore' }).on('error', () => log('open in browser:', url)).unref();
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
    if (matchesAny(response.url, urls)) { log('live-refresh', new URL(response.url).pathname); fn({ tabId: TAB_ID, statusCode: response.status, url: response.url }); }
  }
});

// ── HTTP: static addon files + RPC for page shims ──────────────────────────
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.md': 'text/markdown', '.json': 'application/json' };
async function dispatchMessage(msg) {
  for (const fn of messageListeners) {
    const r = fn(msg, {});
    if (r !== undefined && r !== false) return await r;
  }
}
const RPC = {
  '/message': dispatchMessage,
  '/storage/get': k => storageLocal.get(k),
  '/storage/set': v => storageLocal.set(v),
  '/storage/remove': k => storageLocal.remove(k),
  '/storage/clear': () => storageLocal.clear(),
};
http.createServer(async (req, res) => {
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
}).listen(PORT, '127.0.0.1', () => log(`dashboard at ${BASE}/dashboard.html`));

// ── Boot ───────────────────────────────────────────────────────────────────
// No top-level await: the single-executable build loads this file with
// require(esm), which refuses async modules.
async function main() {
  await retry();
  await import(pathToFileURL(path.join(ADDON, 'background.js')));
  if (freshInstall) for (const fn of installedListeners) fn({ reason: 'install' });
  else { for (const fn of startupListeners) fn(); dispatchMessage({ type: 'SCRAPE_NOW' }).catch(e => log('scrape:', e.message)); }
}
main().catch(e => { console.error(e); process.exit(1); });
