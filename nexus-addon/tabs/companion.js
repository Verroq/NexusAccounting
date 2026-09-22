// Companion screen — status of the desktop companion (nexus-desktop/) that
// attaches to the Steam client. Only the companion's own dashboard reaches it:
// the sidebar entry is unhidden here when the runtime id says we are desktop.
// State comes from the companion's /companion/status RPC (polled while the
// screen is open); scrape figures come from `store` like every other tab.
import { dayKey, selectedUniverse, store, confirmDialog } from '../common.js';

const IS_DESKTOP = browser.runtime.id === 'nexus-desktop';
const LAUNCH_OPTION = '--remote-debugging-port=9222';
const POLL_MS = 2000;
const byId = id => document.getElementById(id);
const rpc = (route, payload) => fetch(browser.runtime.getURL(route), {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload ?? null),
}).then(r => r.json()).then(r => r.result);

if (IS_DESKTOP) document.querySelector('.tab[data-tab="companion"]').hidden = false;

let inited = false;
let timer = null;
let lastLog = '';
let lastUpdate = null;

export function initCompanionTab() {
  if (!inited) {
    inited = true;
    for (const b of document.querySelectorAll('.cp-copy-launch')) b.addEventListener('click', () => copy(b, LAUNCH_OPTION));
    byId('cp-open-faq').addEventListener('click', () => document.querySelector('.tab[data-tab="faq"]').click());
    byId('cp-open-data').addEventListener('click', () => rpc('companion/open', { what: 'data' }));
    byId('cp-backup').addEventListener('click', async () => {
      const b = byId('cp-backup'); b.disabled = true;
      await browser.runtime.sendMessage({ type: 'BACKUP_NOW', reason: 'manual' });
      b.disabled = false;
    });
    byId('cp-update').addEventListener('click', updateClick);
    byId('cp-copy-log').addEventListener('click', () => copy(byId('cp-copy-log'), lastLog));
    byId('cp-quit').addEventListener('click', async () => {
      if (!await confirmDialog('Quit the companion? Scraping stops until you start nexus-companion.exe again.')) return;
      await rpc('companion/quit');
      byId('cp-card-game').querySelector('.value').textContent = 'Stopped';
    });
  }
  clearInterval(timer);
  refresh();
  timer = setInterval(() => {
    // Stop polling once the user leaves the screen.
    if (byId('companion-content').style.display === 'none') return clearInterval(timer);
    refresh();
  }, POLL_MS);
}

// One button, two jobs: it checks until an update is found, then installs it.
// The companion only replaces nexus-addon/ and nexus-desktop/ next to the exe,
// so finishing means restarting nexus-companion.exe.
async function updateClick() {
  const btn = byId('cp-update');
  const known = lastUpdate;
  const apply = !!(known && known.available && known.state !== 'installed');
  if (apply && !await confirmDialog(`Download v${known.latest} and replace the companion's files? It runs on the next start of nexus-companion.exe.`)) return;
  btn.disabled = true;
  btn.textContent = apply ? 'Updating…' : 'Checking…';
  try { renderUpdate(await rpc('companion/update', { apply })); }
  catch { byId('cp-update-state').textContent = 'could not reach GitHub'; }
  btn.disabled = false;
}

function renderUpdate(u) {
  lastUpdate = u || null;
  const line = byId('cp-update-state');
  const btn = byId('cp-update');
  if (!u) { line.textContent = '—'; btn.textContent = 'Check for updates'; return; }
  if (u.state === 'installing') { line.textContent = `installing v${u.latest}…`; btn.textContent = 'Updating…'; return; }
  if (u.state === 'installed') {
    line.innerHTML = `<b>v${u.latest} installed</b> — restart nexus-companion.exe to run it`;
    btn.textContent = 'Check for updates';
    return;
  }
  if (u.available) {
    line.innerHTML = `<b>v${u.latest} available</b> · running v${u.current}`;
    btn.textContent = `Update to v${u.latest}`;
    return;
  }
  line.textContent = u.error ? `check failed: ${u.error}`
    : u.checkedAt ? `up to date · checked ${ago(u.checkedAt)}` : 'not checked yet';
  btn.textContent = 'Check for updates';
}

async function copy(btn, text) {
  await navigator.clipboard.writeText(text);
  const prev = btn.textContent; btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = prev; }, 1200);
}

function setCard(id, value, sub, { dim = false, top = '' } = {}) {
  const card = byId(id);
  const v = card.querySelector('.value');
  v.textContent = value; v.classList.toggle('dim', dim);
  card.querySelector('.sub').textContent = sub;
  card.style.borderTopColor = top;
}

const ago = ts => {
  const m = Math.round((Date.now() - ts) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(ts).toLocaleString();
};

async function refresh() {
  let s;
  try { s = await rpc('companion/status'); } catch { s = null; }
  if (!s) {
    setCard('cp-card-game', 'Stopped', 'the companion is not running', { dim: true, top: 'var(--color-danger)' });
    return;
  }
  const universeName = document.getElementById('universe-select').selectedOptions[0]?.textContent || selectedUniverse;

  byId('cp-waiting').style.display = !s.attached && !s.gameRunning ? '' : 'none';
  byId('cp-portclosed').style.display = !s.attached && s.gameRunning ? '' : 'none';

  if (s.attached) setCard('cp-card-game', 'Attached', `${s.pageUrl ? new URL(s.pageUrl).host : 'game'} · since ${ago(s.attachedAt)}`, { top: 'var(--color-success)' });
  else if (s.gameRunning) setCard('cp-card-game', 'Running', 'Nexus Legacy.exe · port closed', { top: 'var(--color-danger)' });
  else setCard('cp-card-game', 'Not attached', 'retrying every 5 s', { dim: true });

  if (store.planet_id) setCard('cp-card-session', universeName, `planet #${store.planet_id} · token from the game`, { top: 'var(--color-accent)' });
  else setCard('cp-card-session', '—', 'read from the game once attached', { dim: true });

  const last = store.last_scrape ? new Date(store.last_scrape).getTime() : 0;
  if (last) {
    const next = Math.max(0, Math.round((last + 15 * 60000 - Date.now()) / 60000));
    setCard('cp-card-scrape', ago(last), s.attached ? `next in ${next} min · every 15 min` : 'resumes when attached');
  } else setCard('cp-card-scrape', 'Never', 'first scrape runs once attached', { dim: true });

  const today = dayKey(Date.now());
  const n = (bucket, field) => bucket?.[today]?.[field] || 0;
  const counts = [n(store.daily, 'missions'), n(store.pirate_daily, 'raids'), n(store.mining_daily, 'deliveries')];
  setCard('cp-card-today', counts.join(' · '), 'survey · pirate · mining reports', { dim: !counts.some(Boolean) });

  byId('cp-version').textContent = `nexus-companion.exe · v${s.version}`;
  if (!byId('cp-update').disabled) renderUpdate(s.update);   // don't fight a click in flight
  byId('cp-cdp').textContent = s.cdp.replace(/^https?:\/\//, '');
  byId('cp-dash').textContent = `http://127.0.0.1:${s.port}`;
  byId('cp-data').textContent = s.data;
  byId('cp-downloads').textContent = s.downloads;

  const el = byId('cp-log');
  const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
  el.textContent = '';
  for (const l of s.log) {
    const row = document.createElement('div');
    const t = document.createElement('span'); t.className = 't'; t.textContent = new Date(l.t).toLocaleTimeString();
    const m = document.createElement('span');
    m.className = l.level === 'log' && /attached to|Scraped \d/.test(l.text) ? 'ok' : l.level;
    m.textContent = l.text.replace(/^\[(companion|NexusAccounting)\] /, '');
    row.append(t, m); el.appendChild(row);
  }
  if (atBottom) el.scrollTop = el.scrollHeight;
  lastLog = s.log.map(l => `${l.t} ${l.level} ${l.text}`).join('\n');
}
