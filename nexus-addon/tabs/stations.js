// Stations tab: what the alliance is holding across every station it controls,
// who has been taking it, and the withdraw/deposit dispatch.
//
// Three endpoints feed it (all proxied through background.js):
//   /api/alliances/station-storage  — every controlled station, ABSOLUTE
//     amounts plus caps and the viewer's withdraw permission. One call, all
//     stations, so it drives the roll-up, the listing and every filter.
//   /api/galaxy/station-index       — one call, every station in the galaxy;
//     the only cheap source of "someone is capturing this".
//   /api/stations/{id}              — buildings, garrison and capture timers.
//     Per station, so it is fetched lazily for the cards actually on screen.
//
// NOTE the per-station resource fields in /api/stations/* are FRACTIONS of the
// cap, while /api/alliances/station-storage returns absolute amounts. This tab
// is built on the absolute ones; anything read from a station detail is only
// used for state/garrison/buildings, never for amounts.

import { loadFleetTemplates } from './fleets.js';
import { RARE_WEIGHT, RESOURCE_WEIGHTS, capPlanToStock, cargoShipsFrom, editFleetDialog, fmt, nsGet, planFleet, rememberSelection, rememberedSelections } from '../common.js';

// key = the API's snake_case log/cargo key, field = its camelCase station
// field, storage = which cap applies.
export const STATION_RESOURCES = [
  { key: 'ore', field: 'ore', label: 'Ore', storage: 'basic' },
  { key: 'silicates', field: 'silicates', label: 'Silicates', storage: 'basic' },
  { key: 'hydrogen', field: 'hydrogen', label: 'Hydrogen', storage: 'basic' },
  { key: 'alloys', field: 'alloys', label: 'Alloys', storage: 'basic' },
  { key: 'cryo_ice', field: 'cryoIce', label: 'Cryo-Ice', storage: 'rare' },
  { key: 'quantum_dust', field: 'quantumDust', label: 'Quantum Dust', storage: 'rare' },
  { key: 'plasma_core', field: 'plasmaCore', label: 'Plasma Core', storage: 'rare' },
  { key: 'bio_extract', field: 'bioExtract', label: 'Bio Extract', storage: 'rare' },
  { key: 'dark_matter', field: 'darkMatter', label: 'Dark Matter', storage: 'rare' },
  { key: 'antimatter', field: 'antimatter', label: 'Antimatter', storage: 'rare' },
];
// Only these four ride a supply_station mission — the game's deposit cargo has
// no rare slots (see sendStationTransfer in background.js).
export const DEPOSITABLE = new Set(['ore', 'silicates', 'hydrogen', 'alloys']);

const NEAR_FULL = 0.9;
const WARN_FULL = 0.75;
const CARD_LIMIT = 12;          // cards are tall; the table is the "show me all 200" view
const LEDGER_STATIONS = 12;     // stations to pull logs for when nothing is selected
const LEDGER_MAX = 250;         // merged rows kept for the ledger table
const STATE_OPTS = ['All', 'Secure', 'Under capture', 'Vulnerable'];
// Alliance ranks, least to most privileged — the order the game's own client
// uses. `withdrawAccessRole` is the rank a station demands before anyone may
// withdraw from it; the dropdown lists only the ranks actually in use.
export const WITHDRAW_ROLES = ['member', 'commander', 'officer', 'deputy', 'leader'];
export const ALL_ROLES = 'All rights';
const SORT_OPTS = ['Fullest first', 'Emptiest first', 'Highest value', 'Nearest', 'Coordinates'];

const resVar = key => `var(--res-${key.replace(/_/g, '-')})`;
const pctColor = f => (f >= NEAR_FULL ? 'var(--color-danger)' : f >= WARN_FULL ? 'var(--color-warning)' : 'var(--color-accent)');

// ── Pure helpers (unit-tested) ─────────────────────────────────────────────

// 'G23-25' → 'G23'. The slot suffix (5/15/25/35/45) is the station's position
// in its sector, so the prefix is the sector code.
export function sectorCode(systemName) {
  const m = /^([A-Za-z]+\d+)-\d+$/.exec(String(systemName || ''));
  return m ? m[1] : '';
}

export const roleLabel = role => (role ? role[0].toUpperCase() + role.slice(1) : 'Unknown');

// Withdraw-rights present in the current station set, ordered by rank so the
// dropdown reads member → leader. A rank the game adds later still shows up,
// appended after the ones we know.
export function roleOptions(list) {
  const seen = [...new Set(list.map(st => st.withdrawAccessRole || 'unknown'))];
  const rank = r => {
    const i = WITHDRAW_ROLES.indexOf(r);
    return i === -1 ? WITHDRAW_ROLES.length : i;
  };
  return seen.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

export function capFor(st, res) {
  return (res.storage === 'basic' ? st.basicStorage : st.rareStorage) || 0;
}

// Per-resource stock for one station: absolute amount, its cap and the fill
// fraction the whole screen colours by.
export function stationResources(st) {
  return STATION_RESOURCES.map(res => {
    const amount = Number(st[res.field]) || 0;
    const cap = capFor(st, res);
    return { ...res, amount, cap, fill: cap > 0 ? amount / cap : 0 };
  });
}

// mean drives the storage bar, peak drives its colour and the near-full flag —
// a station 99% full of ore is not "59% full" in any useful sense.
export function fillStats(st) {
  const rows = stationResources(st);
  const fills = rows.map(r => r.fill);
  const peakRow = rows.reduce((a, b) => (b.fill > a.fill ? b : a), rows[0]);
  return {
    mean: fills.reduce((a, b) => a + b, 0) / (fills.length || 1),
    peak: peakRow ? peakRow.fill : 0,
    peakLabel: peakRow ? peakRow.label : '',
  };
}

// Weighted stock value, using the dashboard's own resource weights so a
// station's "Value" means the same thing as every other total in the addon.
export function stationValue(st) {
  return stationResources(st).reduce(
    (sum, r) => sum + r.amount * (RESOURCE_WEIGHTS[r.key] ?? RARE_WEIGHT), 0);
}

// ponytail: three states off cheap data. "Under capture" is authoritative
// (station-index carries the capturing tag for every station in one call);
// "Vulnerable" means the shield is down, which needs a station detail, so a
// station reads Secure until its detail has been loaded. The real in-game
// vulnerability window lives in /api/stations/{id}.vulnerabilityWindow —
// wire that in if per-station polling ever becomes affordable.
export function stationState(st) {
  if (st.capturingAllianceTag) return 'Under capture';
  if (st.shieldHp === 0) return 'Vulnerable';
  return 'Secure';
}

export function filterStations(list, { sector = 'All sectors', query = '', state = 'All', nearFull = false, role = ALL_ROLES } = {}) {
  const q = query.trim().toLowerCase();
  return list.filter(st => {
    if (sector !== 'All sectors' && sectorCode(st.systemName) !== sector) return false;
    if (role !== ALL_ROLES && (st.withdrawAccessRole || 'unknown') !== role) return false;
    if (state !== 'All' && stationState(st) !== state) return false;
    if (nearFull && fillStats(st).peak < NEAR_FULL) return false;
    if (q && !`${st.name} ${st.systemName}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

// distOf returns null when the station's distance can't be computed (no
// reference planet, or its system coords were never scraped) — those sort last.
export function sortStations(list, sort, distOf = () => null) {
  const rows = list.slice();
  const coords = (a, b) => String(a.systemName || '').localeCompare(String(b.systemName || ''), undefined, { numeric: true });
  const byDist = (a, b) => {
    const da = distOf(a), db = distOf(b);
    if (da == null && db == null) return coords(a, b);
    if (da == null) return 1;
    if (db == null) return -1;
    return da - db;
  };
  const cmp = {
    'Fullest first': (a, b) => fillStats(b).mean - fillStats(a).mean,
    'Emptiest first': (a, b) => fillStats(a).mean - fillStats(b).mean,
    'Highest value': (a, b) => stationValue(b) - stationValue(a),
    Nearest: byDist,
    Coordinates: coords,
  }[sort] || coords;
  return rows.sort(cmp);
}

// Alerts are generated from live data, never hardcoded: one per near-full
// resource (worst first) and one per station being captured.
export function buildAlerts(list) {
  const out = [];
  for (const st of list) {
    if (!st.capturingAllianceTag) continue;
    out.push({
      kind: 'capture',
      title: `${st.name} is under capture`,
      body: `${st.capturingAllianceTag} is capturing ${st.name} (${st.systemName}).`
        + (st.captureEndsAt ? ` Capture completes ${new Date(st.captureEndsAt).toLocaleString()}.` : ''),
    });
  }
  const full = [];
  for (const st of list) {
    for (const r of stationResources(st)) {
      if (r.fill >= NEAR_FULL) full.push({ st, r });
    }
  }
  full.sort((a, b) => b.r.fill - a.r.fill);
  for (const { st, r } of full.slice(0, 3)) {
    const mean = Math.round(fillStats(st).mean * 100);
    out.push({
      kind: 'full',
      title: `${st.name} — ${r.label.toLowerCase()} at ${Math.round(r.fill * 100)}% of its cap`,
      body: `${fmt(Math.round(r.amount))} of ${fmt(r.cap)} in ${st.systemName}. `
        + `Its storage overall sits at ${mean}% — only this resource is close to spilling.`,
    });
  }
  return out;
}

// Only withdraw/deposit rows have a member behind them; mining_income is the
// station producing for itself and would drown the leaderboard.
export const MEMBER_ACTIONS = new Set(['withdraw', 'deposit']);

export function aggregateMembers(logs) {
  const by = new Map();
  for (const l of logs) {
    if (!MEMBER_ACTIONS.has(l.action)) continue;
    const name = l.username || `#${l.userId ?? '?'}`;
    const row = by.get(name) || { name, withdrawn: 0, deposited: 0, entries: 0 };
    const weighted = (Number(l.amount) || 0) * (RESOURCE_WEIGHTS[l.resource] ?? RARE_WEIGHT);
    if (l.action === 'withdraw') row.withdrawn += weighted; else row.deposited += weighted;
    row.entries++;
    by.set(name, row);
  }
  return [...by.values()].sort((a, b) => b.withdrawn - a.withdrawn);
}

// Signed rows for the ledger table: the API reports magnitudes and puts the
// direction in `action`.
export function ledgerRows(logs, stationName = () => '') {
  return logs
    .filter(l => MEMBER_ACTIONS.has(l.action))
    .map(l => ({
      time: l.createdAt,
      member: l.username || `#${l.userId ?? '?'}`,
      station: stationName(l.stationId),
      direction: l.action,
      resource: l.resource,
      amount: (l.action === 'withdraw' ? -1 : 1) * (Number(l.amount) || 0),
    }))
    .sort((a, b) => new Date(b.time) - new Date(a.time));
}

export function ledgerCsv(rows) {
  const head = 'time,member,station,direction,resource,amount';
  const body = rows.map(r => [r.time, r.member, r.station, r.direction, r.resource, r.amount]
    .map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','));
  return [head, ...body].join('\n');
}

// ── Tab state ──────────────────────────────────────────────────────────────

let inited = false;
let stStations = [];                  // /api/alliances/station-storage rows, enriched in place
let stPlanets = [];
let stShipDefs = [];
const stDetails = new Map();          // stationId → detail (buildings/garrison), lazily filled
const stLogs = new Map();             // stationId → logs
let stSelected = null;                // selected station id, filters the ledger
let stCollapsed = false;
let stView = 'Table';
const stFilters = { sector: 'All sectors', query: '', state: 'All', nearFull: false, role: ALL_ROLES };
let stRefCoords = null;               // source planet's system coords, for Distance
let stTemplates = [];                 // saved fleet templates, for the Defend dispatch
let stCargoShips = [];                // haulers with their researched capacity, largest first
const stCargoSel = new Set();         // picked hauler types (remembered across sessions)
let stMvAvail = {};                   // source planet's ship stock, refreshed with the dialog

const byId = id => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

export async function initStationsTab() {
  refreshTemplates();   // the Fleets tab may have changed them since the last visit
  if (inited) return;
  inited = true;

  // One-time wiring for the controls that live in dashboard.html.
  byId('st-refresh').addEventListener('click', () => loadStations(true));
  byId('st-search')?.addEventListener('input', function () {
    stFilters.query = this.value;
    renderStations();
  });
  byId('st-sector')?.addEventListener('change', function () {
    stFilters.sector = this.value;
    renderStations();
    loadLedger();
  });
  byId('st-role')?.addEventListener('change', function () {
    stFilters.role = this.value;
    renderStations();
    loadLedger();
  });
  byId('st-sort')?.addEventListener('change', renderStations);
  byId('st-near')?.addEventListener('click', () => {
    stFilters.nearFull = !stFilters.nearFull;
    renderStations();
  });
  byId('st-clear')?.addEventListener('click', () => {
    stFilters.sector = 'All sectors';
    stFilters.query = '';
    stFilters.state = 'All';
    stFilters.nearFull = false;
    stFilters.role = ALL_ROLES;
    byId('st-search').value = '';
    renderStations();
    loadLedger();
  });
  byId('st-mv-close')?.addEventListener('click', closeMove);
  byId('st-mv-cancel')?.addEventListener('click', closeMove);
  byId('st-modal')?.addEventListener('click', ev => { if (ev.target.id === 'st-modal') closeMove(); });
  byId('st-toast-dismiss')?.addEventListener('click', () => { byId('st-toast').style.display = 'none'; });
  byId('st-move').addEventListener('click', () => openMove('withdraw', stSelected));
  byId('st-collapse').addEventListener('click', toggleCollapse);
  byId('st-collapse-head').addEventListener('click', toggleCollapse);
  byId('st-export').addEventListener('click', exportLedger);
  byId('st-planet').addEventListener('change', async function () {
    await rememberSelection('st-planet', this.value);
    await updateRefCoords();
    renderStations();
    refreshMvAvail();
  });

  byId('st-template').addEventListener('change', function () {
    rememberSelection('st-template', this.value);
  });

  loadPlanets();
  loadCargoShips();
  await loadStations(false);
}

function toggleCollapse() {
  stCollapsed = !stCollapsed;
  renderStations();
}

async function loadPlanets() {
  const [res, remembered] = await Promise.all([
    browser.runtime.sendMessage({ type: 'GET_PLANETS' }),
    rememberedSelections(),
  ]);
  if (res.error) return;
  stPlanets = res.planets || [];
  const sel = byId('st-planet');
  sel.textContent = '';
  for (const p of stPlanets) {
    const o = document.createElement('option');
    o.value = p.id;
    o.textContent = p.name + (p.isHomeworld ? ' (home)' : '');
    sel.appendChild(o);
  }
  const want = remembered['st-planet'];
  if (want && stPlanets.some(p => String(p.id) === String(want))) sel.value = want;
  else {
    const home = stPlanets.find(p => p.isHomeworld);
    if (home) sel.value = home.id;
  }
  await updateRefCoords();
  renderStations();
}

// Fleet templates seed the Defend dispatch. Same list the Fleets tab edits and
// the asteroid sender uses — the template itself is never modified here.
async function refreshTemplates() {
  stTemplates = (await loadFleetTemplates()).slice()
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const sel = byId('st-template');
  const want = (await rememberedSelections())['st-template'] || sel.value;
  sel.textContent = '';
  const none = document.createElement('option');
  none.value = '';
  none.textContent = stTemplates.length ? 'No template' : '— no templates yet —';
  sel.appendChild(none);
  for (const t of stTemplates) {
    const o = document.createElement('option');
    o.value = t.id;
    o.textContent = t.name;
    sel.appendChild(o);
  }
  if (want && stTemplates.some(t => String(t.id) === String(want))) sel.value = want;
}

// Distance is measured from the selected source planet's system, using the
// coords the scraper already caches. No coords → the column reads '—'.
async function updateRefCoords() {
  stRefCoords = null;
  const planet = stPlanets.find(p => String(p.id) === byId('st-planet').value);
  if (!planet || planet.systemId == null) return;
  const res = await browser.runtime.sendMessage({ type: 'GET_SYSTEM_COORDS', ids: [planet.systemId] });
  const hit = res && !res.error && res[planet.systemId];
  if (hit) stRefCoords = { x: hit.x, y: hit.y };
}

function distanceOf(st) {
  if (!stRefCoords || st.systemX == null) return null;
  return Math.round(Math.hypot(st.systemX - stRefCoords.x, st.systemY - stRefCoords.y));
}

const distLabel = st => {
  const d = distanceOf(st);
  return d == null ? '—' : `${fmt(d)}`;
};

async function loadStations(force) {
  const status = byId('st-status');
  status.textContent = 'Loading alliance stations…';
  if (force) { stDetails.clear(); stLogs.clear(); }

  const [storage, index] = await Promise.all([
    browser.runtime.sendMessage({ type: 'GET_ALLIANCE_STATIONS' }),
    browser.runtime.sendMessage({ type: 'GET_STATION_INDEX' }),
  ]);
  if (storage.error) {
    status.textContent = `Error: ${storage.error}`;
    return;
  }
  const capturing = new Map();
  if (!index.error) {
    for (const s of (index.stations || [])) capturing.set(s.stationId, s.capturingAllianceTag || null);
  }
  stStations = (storage.stations || []).map(s => ({ ...s, capturingAllianceTag: capturing.get(s.id) || null }));
  status.textContent = stStations.length
    ? `${stStations.length} station${stStations.length === 1 ? '' : 's'} under control`
    : 'Your alliance controls no stations.';

  renderStations();
  loadLedger();
}

// Station details (buildings, garrison, shields) only exist per station, so
// they are fetched for what is actually on screen — the card grid, or the
// selected row — and cached for the session.
async function loadDetails(stations) {
  const missing = stations.filter(s => !stDetails.has(s.id)).slice(0, CARD_LIMIT);
  if (!missing.length) return;
  for (const s of missing) {
    const res = await browser.runtime.sendMessage({ type: 'GET_STATION_DETAIL', stationId: s.id });
    if (res.error) continue;
    stDetails.set(s.id, res.station || {});
    const st = stStations.find(x => x.id === s.id);
    if (st) {
      st.shieldHp = res.station?.shieldHp;
      st.captureEndsAt = res.station?.captureEndsAt || null;
    }
  }
  renderStations();
}

// Ledger + leaderboard scope: the selected station, else the first N of the
// current filter (200 stations × a log walk each is not a page load).
function ledgerScopeStations() {
  if (stSelected != null) {
    const one = stStations.find(s => s.id === stSelected);
    return one ? [one] : [];
  }
  return sortStations(filterStations(stStations, stFilters), 'Highest value', distanceOf).slice(0, LEDGER_STATIONS);
}

async function loadLedger() {
  const scope = ledgerScopeStations();
  const note = byId('st-ledger-note');
  const missing = scope.filter(s => !stLogs.has(s.id));
  if (missing.length) note.textContent = `Loading ${missing.length} station log${missing.length === 1 ? '' : 's'}…`;
  for (const s of missing) {
    const res = await browser.runtime.sendMessage({ type: 'GET_STATION_LOG', stationId: s.id, pages: stSelected != null ? 4 : 1 });
    stLogs.set(s.id, res.error ? [] : (res.logs || []).map(l => ({ ...l, stationId: s.id })));
  }
  note.textContent = '';
  renderLedger();
}

function scopeLogs() {
  return ledgerScopeStations().flatMap(s => stLogs.get(s.id) || []);
}

function scopeLabel() {
  if (stSelected != null) {
    const one = stStations.find(s => s.id === stSelected);
    return one ? one.name : 'no station';
  }
  const n = ledgerScopeStations().length;
  return `${n} station${n === 1 ? '' : 's'}`;
}

// ── Rendering ──────────────────────────────────────────────────────────────

export function renderStations() {
  renderAlerts();
  renderRollup();
  renderListing();
  renderLedger();
}

function renderAlerts() {
  const box = byId('st-alerts');
  box.textContent = '';
  for (const a of buildAlerts(stStations)) {
    const card = el('div', 'st-alert');
    card.appendChild(el('div', 'st-alert-icon', a.kind === 'capture' ? '⚠' : '▲'));
    const body = el('div');
    body.appendChild(el('div', 'st-alert-title', a.title));
    body.appendChild(el('div', 'st-alert-body', a.body));
    card.appendChild(body);
    box.appendChild(card);
  }
}

function filtered() {
  return filterStations(stStations, stFilters);
}

function renderRollup() {
  const rows = filtered();
  const scope = stFilters.sector === 'All sectors'
    ? `all ${stStations.length} stations`
    : `sector ${stFilters.sector}`;
  const filtersOn = stFilters.query || stFilters.state !== 'All' || stFilters.nearFull || stFilters.role !== ALL_ROLES;
  byId('st-stock-scope').textContent = `Alliance stock on hand — ${scope}${filtersOn ? ' · current filters' : ''}`;

  const totals = STATION_RESOURCES.map(res => ({ ...res, amount: 0, cap: 0 }));
  for (const st of rows) {
    stationResources(st).forEach((r, i) => { totals[i].amount += r.amount; totals[i].cap += r.cap; });
  }

  const box = byId('st-stock');
  box.textContent = '';
  for (const t of totals) {
    if (!t.cap) continue;
    const fill = t.cap ? t.amount / t.cap : 0;
    const card = el('div', 'st-stock-card');
    const head = el('div', 'st-stock-head');
    head.appendChild(el('span', 'st-stock-label', t.label));
    const pct = el('span', 'st-stock-pct', `${Math.round(fill * 100)}%`);
    pct.style.color = fill >= NEAR_FULL ? 'var(--color-danger)' : fill >= WARN_FULL ? 'var(--color-warning)' : 'color-mix(in srgb, var(--color-text) 55%, transparent)';
    head.appendChild(pct);
    card.appendChild(head);
    const value = el('div', 'st-stock-value', fmt(Math.round(t.amount)));
    value.style.color = resVar(t.key);
    card.appendChild(value);
    card.appendChild(track(fill, resVar(t.key), 5));
    card.appendChild(el('div', 'st-stock-cap', `of ${fmt(t.cap)} cap`));
    box.appendChild(card);
  }
}

function track(fill, color, height) {
  const outer = el('div', 'st-track');
  outer.style.height = `${height}px`;
  const inner = el('div', 'st-track-fill');
  inner.style.width = `${Math.min(100, Math.round(fill * 100))}%`;
  inner.style.background = color;
  outer.appendChild(inner);
  return outer;
}

function statePill(state) {
  const pill = el('span', 'st-pill', state);
  const color = state === 'Under capture' ? 'var(--color-danger)'
    : state === 'Vulnerable' ? 'var(--color-warning)' : 'var(--color-success)';
  pill.style.color = color;
  pill.style.background = `color-mix(in srgb, ${color} 14%, transparent)`;
  return pill;
}

function renderListing() {
  byId('st-collapse').textContent = stCollapsed ? 'Show stations' : 'Hide stations';
  byId('st-caret').textContent = stCollapsed ? '▸' : '▾';
  byId('st-listing').style.display = stCollapsed ? 'none' : '';

  const rows = sortStations(filtered(), currentSort(), distanceOf);
  const summary = byId('st-collapsed-note');
  summary.style.display = stCollapsed ? '' : 'none';
  if (stCollapsed) {
    const sel = stSelected != null ? stStations.find(s => s.id === stSelected) : null;
    summary.textContent = sel
      ? `⌕ Filtered to ${sel.name} (${sel.systemName})`
      : `⌕ ${rows.length} stations match · no station selected, the ledger covers ${scopeLabel()}`;
  }

  renderFilterBar(rows.length);
  if (stCollapsed) return;

  const empty = byId('st-empty');
  empty.style.display = rows.length ? 'none' : '';
  byId('st-table-wrap').style.display = rows.length && stView === 'Table' ? '' : 'none';
  byId('st-cards').style.display = rows.length && stView === 'Cards' ? '' : 'none';
  byId('st-cards-more').style.display = 'none';

  if (!rows.length) return;
  if (stView === 'Table') renderTable(rows);
  else renderCards(rows);
}

function currentSort() {
  const sel = byId('st-sort');
  return sel && sel.value ? sel.value : 'Fullest first';
}

function renderFilterBar(count) {
  const sectorSel = byId('st-sector');
  const sectors = [...new Set(stStations.map(s => sectorCode(s.systemName)).filter(Boolean))].sort();
  const wantSector = stFilters.sector;
  if (sectorSel.dataset.sig !== sectors.join(',')) {
    sectorSel.dataset.sig = sectors.join(',');
    sectorSel.textContent = '';
    for (const code of ['All sectors', ...sectors]) {
      const o = document.createElement('option');
      o.value = code; o.textContent = code;
      sectorSel.appendChild(o);
    }
  }
  sectorSel.value = wantSector;

  const roleSel = byId('st-role');
  const roles = roleOptions(stStations);
  if (roleSel.dataset.sig !== roles.join(',')) {
    roleSel.dataset.sig = roles.join(',');
    roleSel.textContent = '';
    for (const r of [ALL_ROLES, ...roles]) {
      const o = document.createElement('option');
      o.value = r;
      o.textContent = r === ALL_ROLES ? r : `Withdraw: ${roleLabel(r)}`;
      roleSel.appendChild(o);
    }
  }
  roleSel.value = stFilters.role;

  const sortSel = byId('st-sort');
  if (!sortSel.options.length) {
    for (const s of SORT_OPTS) {
      const o = document.createElement('option');
      o.value = s; o.textContent = s;
      sortSel.appendChild(o);
    }
  }

  const chips = byId('st-states');
  chips.textContent = '';
  for (const s of STATE_OPTS) {
    const chip = el('span', 'st-chip', s);
    if (stFilters.state === s) {
      const color = s === 'Under capture' ? 'var(--color-danger)'
        : s === 'Vulnerable' ? 'var(--color-warning)'
          : s === 'Secure' ? 'var(--color-success)' : 'var(--color-accent)';
      chip.classList.add('on');
      chip.style.color = color;
      chip.style.borderColor = color;
      chip.style.background = `color-mix(in srgb, ${color} 12%, transparent)`;
    }
    chip.addEventListener('click', () => { stFilters.state = s; renderStations(); loadLedger(); });
    chips.appendChild(chip);
  }

  byId('st-near').classList.toggle('on', stFilters.nearFull);
  byId('st-count').textContent = `${count} of ${stStations.length} stations`;

  const views = byId('st-views');
  views.textContent = '';
  for (const v of ['Table', 'Cards']) {
    const opt = el('span', 'st-seg', v);
    if (stView === v) opt.classList.add('on');
    opt.addEventListener('click', () => { stView = v; renderStations(); });
    views.appendChild(opt);
  }
}

function selectStation(id) {
  stSelected = stSelected === id ? null : id;
  renderStations();
  loadLedger();
}

function renderTable(rows) {
  const tbody = byId('st-tbody');
  tbody.textContent = '';
  for (const st of rows) {
    const { mean, peak, peakLabel } = fillStats(st);
    const tr = el('tr');
    if (st.id === stSelected) tr.classList.add('st-selected');
    tr.addEventListener('click', () => selectStation(st.id));

    tr.appendChild(el('td', null, st.name));
    tr.appendChild(el('td', 'st-num', st.systemName));
    tr.appendChild(el('td', 'st-num', distLabel(st)));

    const storage = el('td');
    const bar = el('div', 'st-bar-row');
    bar.appendChild(track(mean, pctColor(peak), 6));
    const pct = el('span', 'st-bar-pct', `${Math.round(mean * 100)}%`);
    pct.style.color = pctColor(peak);
    bar.appendChild(pct);
    storage.appendChild(bar);
    if (peak >= NEAR_FULL) {
      const flag = el('div', 'st-peak', `peak ${Math.round(peak * 100)}% ${peakLabel.toLowerCase()}`);
      storage.appendChild(flag);
    }
    tr.appendChild(storage);

    const state = el('td');
    state.appendChild(statePill(stationState(st)));
    tr.appendChild(state);

    const det = stDetails.get(st.id);
    const g = det && det.totalGarrison;
    tr.appendChild(el('td', 'st-num', g ? `${fmt(g.total)}${g.damaged ? ` · ${fmt(g.damaged)} dmg` : ''}` : '—'));
    tr.appendChild(el('td', 'st-muted', st.withdrawAccessRole || '—'));
    tr.appendChild(el('td', 'st-num st-right', `${fmt(Math.round(stationValue(st) / 1000))}k`));

    const actions = el('td', 'st-right');
    actions.appendChild(actionButton('Withdraw', 'primary', st, 'withdraw'));
    actions.appendChild(actionButton('Deposit', 'ghost', st, 'deposit'));
    actions.appendChild(defendButton(st));
    tr.appendChild(actions);
    tbody.appendChild(tr);
  }
}

function actionButton(label, kind, st, direction) {
  const b = el('button', `st-act st-act-${kind}`, label);
  b.addEventListener('click', ev => {
    ev.stopPropagation();   // the row/card click is "select", not "dispatch"
    openMove(direction, st.id);
  });
  return b;
}

// Reinforce: a garrison_station deploy, which is where the station's orbital
// defence is drawn from. Warships, not haulers, so this uses the shared fleet
// editor rather than the cargo planner.
function defendButton(st) {
  const b = el('button', 'st-act st-act-ghost', '⛨ Defend');
  b.title = `Send ships to ${st.name}'s garrison — the pool its orbital defence is rostered from.`;
  b.addEventListener('click', ev => {
    ev.stopPropagation();
    sendDefense(st);
  });
  return b;
}

async function sendDefense(st) {
  const planetId = Number(byId('st-planet').value);
  if (!planetId) { toast('Pick a source planet first.', false); return; }

  const av = await browser.runtime.sendMessage({ type: 'GET_PLANET_SHIPS', planetId });
  if (av.error) { toast(av.error, false); return; }

  // The picked template only seeds the editor — it is sent as-is or edited
  // first, and either way the saved template is left untouched.
  const tpl = stTemplates.find(t => String(t.id) === byId('st-template').value);
  const seed = {};
  for (const [id, qty] of Object.entries((tpl && tpl.ships) || {})) seed[Number(id)] = Math.ceil(qty);

  const ships = await editFleetDialog({
    title: `Defend ${st.name}`,
    subtitle: `Garrison at ${st.systemName}`
      + (tpl ? `\nSeeded from template "${tpl.name}"` : '')
      + '\nShips stay stationed until recalled; the alliance rosters them into orbital defence.',
    avail: av.available || {},
    seed,
  });
  if (!ships || !ships.length) return;

  const res = await browser.runtime.sendMessage({
    type: 'SEND_STATION_DEFENSE', stationId: st.id, sourcePlanetId: planetId, ships,
  });
  const err = res && (res.error || (res.ok === false && res.data && res.data.error));
  toast(err ? `Dispatch failed: ${err}` : `Defence fleet sent to ${st.name}.`, !err);
  if (!err) {
    stDetails.delete(st.id);   // garrison count is stale until it arrives
    loadStations(false);
  }
}

function renderCards(rows) {
  const grid = byId('st-cards');
  grid.textContent = '';
  const shown = rows.slice(0, CARD_LIMIT);
  loadDetails(shown);

  for (const st of shown) {
    const card = el('div', 'st-card');
    if (st.id === stSelected) card.classList.add('st-selected');
    card.addEventListener('click', () => selectStation(st.id));

    const head = el('div', 'st-card-head');
    const title = el('div');
    title.appendChild(el('div', 'st-card-name', st.name));
    title.appendChild(el('div', 'st-card-sub', `${st.systemName} · ${distLabel(st)}`));
    head.appendChild(title);
    head.appendChild(statePill(stationState(st)));
    card.appendChild(head);

    const res = stationResources(st);
    const bars = el('div', 'st-card-bars');
    for (const group of [
      { label: 'Basic storage', rows: res.filter(r => r.storage === 'basic') },
      { label: 'Rare storage', rows: res.filter(r => r.storage === 'rare') },
    ]) {
      const amount = group.rows.reduce((s, r) => s + r.amount, 0);
      const cap = group.rows.reduce((s, r) => s + r.cap, 0);
      const fill = cap ? amount / cap : 0;
      const wrap = el('div');
      const line = el('div', 'st-card-barline');
      line.appendChild(el('span', 'st-muted', group.label));
      const val = el('span', 'st-num', `${Math.round(fill * 100)}% · ${fmt(Math.round(amount))} / ${fmt(cap)}`);
      val.style.color = pctColor(Math.max(...group.rows.map(r => r.fill), 0));
      line.appendChild(val);
      wrap.appendChild(line);
      wrap.appendChild(track(fill, pctColor(Math.max(...group.rows.map(r => r.fill), 0)), 6));
      bars.appendChild(wrap);
    }
    card.appendChild(bars);

    const grid3 = el('div', 'st-card-res');
    for (const r of res) {
      const cell = el('div');
      cell.appendChild(el('div', 'st-card-res-label', r.label));
      const line = el('div', 'st-card-res-line');
      const amt = el('span', 'st-card-res-amt', fmt(Math.round(r.amount)));
      amt.style.color = resVar(r.key);
      line.appendChild(amt);
      const p = el('span', 'st-card-res-pct', `${Math.round(r.fill * 100)}%`);
      p.style.color = r.fill >= NEAR_FULL ? 'var(--color-danger)' : r.fill >= WARN_FULL ? 'var(--color-warning)' : 'color-mix(in srgb, var(--color-text) 40%, transparent)';
      line.appendChild(p);
      cell.appendChild(line);
      grid3.appendChild(cell);
    }
    card.appendChild(grid3);

    const det = stDetails.get(st.id);
    if (det && (det.buildings || []).length) {
      const b = el('div', 'st-card-buildings');
      for (const bld of det.buildings) {
        const chip = el('span', 'st-build', `${bld.buildingKey.replace(/_/g, ' ')} `);
        chip.appendChild(el('span', 'st-build-lvl', `L${bld.level}`));
        b.appendChild(chip);
      }
      card.appendChild(b);
    }

    const facts = el('div', 'st-card-facts');
    const g = det && det.totalGarrison;
    const fleet = el('span', null, g ? `▶ ${fmt(g.total)} ships · ` : '▶ garrison unknown');
    if (g) {
      const dmg = el('span', null, g.damaged ? `${fmt(g.damaged)} damaged` : 'all combat-ready');
      dmg.style.color = g.damaged ? 'var(--color-danger)' : 'var(--color-success)';
      fleet.appendChild(dmg);
    }
    facts.appendChild(fleet);
    facts.appendChild(el('span', null, `⚿ Withdraw: ${st.withdrawAccessRole || '—'}`));
    card.appendChild(facts);

    const actions = el('div', 'st-card-actions');
    actions.appendChild(actionButton('Withdraw', 'primary', st, 'withdraw'));
    actions.appendChild(actionButton('Deposit', 'ghost', st, 'deposit'));
    actions.appendChild(defendButton(st));
    card.appendChild(actions);

    grid.appendChild(card);
  }

  const more = byId('st-cards-more');
  if (rows.length > CARD_LIMIT) {
    more.style.display = '';
    more.textContent = `Showing the first ${CARD_LIMIT} — narrow the filters or switch to Table for all ${rows.length}.`;
  }
}

function renderLedger() {
  const logs = scopeLogs();
  const scope = scopeLabel();
  byId('st-members-scope').textContent = `Withdrawn weighted value per member · ${scope}`;
  byId('st-ledger-scope').textContent = `Deposits and withdrawals, newest first · ${scope}`;

  const members = aggregateMembers(logs);
  const top = members.length ? members[0].withdrawn : 0;
  const box = byId('st-members');
  box.textContent = '';
  if (!members.length) box.appendChild(el('div', 'st-muted', 'No withdrawals or deposits recorded for this scope yet.'));
  for (const m of members) {
    const row = el('div', 'st-member');
    const avatar = el('div', 'st-avatar', (m.name[0] || '?').toUpperCase());
    row.appendChild(avatar);
    row.appendChild(el('div', 'st-member-name', m.name));
    const share = top ? m.withdrawn / top : 0;
    const barColor = share > 0.66 ? 'var(--color-danger)' : share > 0.33 ? 'var(--color-warning)' : 'var(--color-accent)';
    const bar = track(share, barColor, 8);
    bar.classList.add('st-member-bar');
    row.appendChild(bar);
    row.appendChild(signed(m.withdrawn, -1, 'st-member-out'));
    row.appendChild(signed(m.deposited, 1, 'st-member-in'));
    row.appendChild(el('div', 'st-member-ops', String(m.entries)));
    box.appendChild(row);
  }

  const rows = ledgerRows(logs, id => (stStations.find(s => s.id === id) || {}).name || '').slice(0, LEDGER_MAX);
  const tbody = byId('st-ledger-tbody');
  tbody.textContent = '';
  for (const r of rows) {
    const tr = el('tr');
    tr.appendChild(el('td', 'st-num st-nowrap', new Date(r.time).toLocaleString()));
    tr.appendChild(el('td', null, r.member));
    tr.appendChild(el('td', 'st-muted', r.station));
    const dir = el('td', 'st-nowrap');
    const label = el('span', null, r.direction === 'withdraw' ? '↑ Withdrawal' : '↓ Deposit');
    label.style.color = r.direction === 'withdraw' ? 'var(--color-danger)' : 'var(--color-success)';
    dir.appendChild(label);
    tr.appendChild(dir);
    const res = STATION_RESOURCES.find(x => x.key === r.resource);
    const resCell = el('td', null, res ? res.label : r.resource);
    if (res) resCell.style.color = resVar(res.key);
    tr.appendChild(resCell);
    const amt = el('td', 'st-num st-right', `${r.amount < 0 ? '−' : '+'}${fmt(Math.abs(Math.round(r.amount)))}`);
    amt.style.color = r.amount < 0 ? 'var(--color-danger)' : 'var(--color-success)';
    tr.appendChild(amt);
    tbody.appendChild(tr);
  }
  byId('st-ledger-empty').style.display = rows.length ? 'none' : '';
}

// A zero reads as a bare muted dash — a signed 0 suggests activity there wasn't.
function signed(value, sign, cls) {
  const v = Math.round(value);
  const node = el('div', cls, v === 0 ? '—' : `${sign < 0 ? '−' : '+'}${fmt(v)}`);
  node.style.color = v === 0
    ? 'color-mix(in srgb, var(--color-text) 32%, transparent)'
    : sign < 0 ? 'var(--color-danger)' : 'var(--color-success)';
  return node;
}

function exportLedger() {
  const rows = ledgerRows(scopeLogs(), id => (stStations.find(s => s.id === id) || {}).name || '');
  const blob = new Blob([ledgerCsv(rows)], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `nexus-station-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── Move-resources dialog ──────────────────────────────────────────────────
// A withdraw or deposit is a fleet mission, not an instant transfer: the game
// flies haulers from one of your planets to the station and back. Ships are
// picked the way Scouting picks them for debris collection: you choose which
// hauler TYPES to use, and the fleet is planned from the cargo you asked for,
// capped to what the source planet actually has.

// amounts: { resourceKey: raw input string } — a mission can carry several
// resources at once, so the dialog tracks one amount per picked resource.
async function loadCargoShips() {
  const [defs, stored, me] = await Promise.all([
    browser.runtime.sendMessage({ type: 'GET_SHIP_DEFS' }),
    nsGet(['research']),
    browser.runtime.sendMessage({ type: 'GET_AUTH_ME' }),
  ]);
  if (defs.error) return;
  stShipDefs = defs.ships || [];
  stCargoShips = cargoShipsFrom(stShipDefs, stored.research, me?.user?.activeLeaderBonuses?.cargoBonus || 0);
  const saved = (await rememberedSelections())['st-cargo-ships'];
  if (Array.isArray(saved)) {
    stCargoSel.clear();
    for (const id of saved) if (stCargoShips.some(s => s.shipDefId === id)) stCargoSel.add(id);
  }
  if (!stCargoSel.size && stCargoShips.length) stCargoSel.add(stCargoShips[0].shipDefId);   // biggest hauler
  if (mv.open) renderMove();
}

// The dialog shows a capped plan, so it needs the source planet's stock.
async function refreshMvAvail() {
  const planetId = Number(byId('st-planet').value);
  if (!planetId) { stMvAvail = {}; return; }
  const av = await browser.runtime.sendMessage({ type: 'GET_PLANET_SHIPS', planetId });
  stMvAvail = av.error ? {} : (av.available || {});
  if (mv.open) renderMove();
}

// Fleet for the current ask: fewest picked haulers to carry it, trimmed to
// what is parked on the source planet.
export function planHaulers(total, cargoShips, selected, available) {
  const picked = cargoShips.filter(s => selected.has(s.shipDefId));
  const plan = planFleet(total, picked);
  const capOf = id => (cargoShips.find(s => s.shipDefId === id) || {}).cap || 0;
  const { ships, carried } = capPlanToStock(plan, available, capOf);
  return { plan, ships, carried, short: carried < total };
}

const mv = { open: false, dir: 'withdraw', stationId: null, amounts: {} };

function openMove(direction, stationId) {
  if (!stStations.length) return;
  mv.open = true;
  mv.dir = direction;
  mv.stationId = stationId ?? (stStations[0] && stStations[0].id);
  mv.amounts = {};
  renderMove();
  refreshMvAvail();
}

function closeMove() {
  mv.open = false;
  byId('st-modal').style.display = 'none';
}

export function moveLimit(st, direction, resourceKey) {
  if (!st) return 0;
  const row = stationResources(st).find(r => r.key === resourceKey);
  if (!row) return 0;
  return direction === 'withdraw' ? Math.floor(row.amount) : Math.max(0, Math.floor(row.cap - row.amount));
}

// Whole units per resource, blanks and zeroes dropped: what actually ships.
export function parsedAmounts(amounts) {
  const out = {};
  for (const [key, raw] of Object.entries(amounts || {})) {
    const qty = Math.floor(Number(String(raw).replace(/[^0-9]/g, '')) || 0);
    if (qty > 0) out[key] = qty;
  }
  return out;
}

// Resources asked for beyond what the station can give (or hold).
export function overLimit(st, direction, amounts) {
  return Object.entries(parsedAmounts(amounts))
    .filter(([key, qty]) => qty > moveLimit(st, direction, key))
    .map(([key]) => key);
}

export function totalAmount(amounts) {
  return Object.values(parsedAmounts(amounts)).reduce((a, b) => a + b, 0);
}

function renderMove() {
  const modal = byId('st-modal');
  modal.style.display = mv.open ? '' : 'none';
  if (!mv.open) return;
  const st = stStations.find(s => s.id === mv.stationId);

  byId('st-mv-title').textContent = mv.dir === 'withdraw' ? 'Withdraw from station' : 'Deposit to station';
  byId('st-mv-sub').textContent = mv.dir === 'withdraw'
    ? 'A collect mission flies your haulers to the station and brings the cargo home.'
    : 'A supply mission carries cargo from your planet into station storage.';

  const dirs = byId('st-mv-dirs');
  dirs.textContent = '';
  for (const [key, label] of [['withdraw', 'Withdraw'], ['deposit', 'Deposit']]) {
    const opt = el('span', 'st-seg', label);
    if (mv.dir === key) opt.classList.add('on');
    opt.addEventListener('click', () => {
      mv.dir = key;
      mv.amounts = {};   // limits differ per direction, and a deposit has no rare slots
      renderMove();
    });
    dirs.appendChild(opt);
  }

  const sel = byId('st-mv-station');
  sel.textContent = '';
  for (const s of stStations.slice().sort((a, b) => String(a.systemName).localeCompare(String(b.systemName), undefined, { numeric: true }))) {
    const o = document.createElement('option');
    o.value = s.id;
    o.textContent = `${s.name} · ${s.systemName}`;
    sel.appendChild(o);
  }
  sel.value = mv.stationId;
  sel.onchange = () => { mv.stationId = Number(sel.value); mv.amounts = {}; renderMove(); };

  byId('st-mv-role').textContent = st
    ? `⚿ Withdraw access: ${st.withdrawAccessRole || 'unknown'}${st.canWithdrawResources === false ? ' — you do not hold it' : ''}`
    : '';

  const resBox = byId('st-mv-res');
  resBox.textContent = '';
  for (const r of stationResources(st || {})) {
    if (mv.dir === 'deposit' && !DEPOSITABLE.has(r.key)) continue;
    const picked = r.key in mv.amounts;
    const opt = el('div', 'st-mv-res-opt');
    if (picked) {
      opt.classList.add('on');
      opt.style.borderColor = resVar(r.key);
      opt.style.background = `color-mix(in srgb, ${resVar(r.key)} 12%, transparent)`;
    }
    opt.appendChild(el('span', null, r.label));
    opt.appendChild(el('span', 'st-num st-dim', fmt(Math.round(r.amount))));
    // Toggle: one mission can carry several resources, so picking is additive.
    opt.addEventListener('click', () => {
      if (picked) delete mv.amounts[r.key];
      else mv.amounts[r.key] = '';
      renderMove();
    });
    resBox.appendChild(opt);
  }

  const over = overLimit(st, mv.dir, mv.amounts);
  const parsed = parsedAmounts(mv.amounts);
  const total = totalAmount(mv.amounts);
  const blocked = mv.dir === 'withdraw' && st && st.canWithdrawResources === false;

  // One amount row per picked resource, each with its own limit and Max.
  const rows = byId('st-mv-rows');
  rows.textContent = '';
  const picked = Object.keys(mv.amounts);
  byId('st-mv-empty').style.display = picked.length ? 'none' : '';
  for (const key of picked) {
    const res = STATION_RESOURCES.find(r => r.key === key) || { key, label: key };
    const limit = moveLimit(st, mv.dir, key);
    const row = el('div', 'st-mv-row');

    const name = el('div', 'st-mv-row-name', res.label);
    name.style.color = resVar(key);
    row.appendChild(name);

    const input = el('input', 'st-mv-row-input');
    input.type = 'text';
    input.inputMode = 'numeric';
    input.placeholder = '0';
    input.value = mv.amounts[key];
    input.style.borderColor = over.includes(key) ? 'var(--color-danger)' : 'var(--color-divider)';
    input.oninput = () => { mv.amounts[key] = input.value; renderMove(); };
    row.appendChild(input);

    const max = el('button', 'st-act st-act-ghost', 'Max');
    max.onclick = () => { mv.amounts[key] = String(limit); renderMove(); };
    row.appendChild(max);

    row.appendChild(el('div', 'st-mv-row-limit st-num',
      mv.dir === 'withdraw' ? `Available: ${fmt(limit)}` : `Free capacity: ${fmt(limit)}`));

    const drop = el('button', 'st-act st-act-ghost', '✕');
    drop.title = `Remove ${res.label}`;
    drop.onclick = () => { delete mv.amounts[key]; renderMove(); };
    row.appendChild(drop);

    rows.appendChild(row);
  }

  renderHaulers(total);

  const warn = byId('st-mv-warn');
  warn.textContent = blocked
    ? `You do not hold ${st.withdrawAccessRole || 'the required'} rank at ${st.name} — withdrawals here are blocked.`
    : over.length
      ? `Above the ${mv.dir === 'withdraw' ? 'available' : 'free capacity'} limit: `
        + over.map(k => (STATION_RESOURCES.find(r => r.key === k) || {}).label || k).join(', ') + '.'
      : '';
  warn.style.display = warn.textContent ? '' : 'none';

  const sign = mv.dir === 'withdraw' ? '−' : '+';
  const summary = byId('st-mv-summary');
  summary.textContent = total
    ? `${Object.entries(parsed).map(([k, q]) => `${sign}${fmt(q)} ${(STATION_RESOURCES.find(r => r.key === k) || {}).label || k}`).join(' · ')}`
      + ` · ${st ? st.name : ''}`
    : 'Enter an amount';
  summary.style.color = !total
    ? 'color-mix(in srgb, var(--color-text) 40%, transparent)'
    : mv.dir === 'withdraw' ? 'var(--color-danger)' : 'var(--color-success)';

  const confirm = byId('st-mv-confirm');
  confirm.textContent = mv.dir === 'withdraw' ? 'Confirm withdrawal' : 'Confirm deposit';
  confirm.classList.toggle('st-disabled', !total || over.length > 0 || blocked);
  const { ships } = planHaulers(total, stCargoShips, stCargoSel, stMvAvail);
  confirm.classList.toggle('st-disabled', !total || over.length > 0 || blocked || !ships.length);
  confirm.onclick = () => {
    if (total && !over.length && !blocked && ships.length) dispatchMove(st, parsed, ships);
  };
}

// Hauler type toggles + the fleet they add up to, mirroring Scouting's debris
// picker: pick the TYPES, the count is planned from the cargo.
function renderHaulers(total) {
  const box = byId('st-mv-ships');
  box.textContent = '';
  for (const ship of stCargoShips) {
    const on = stCargoSel.has(ship.shipDefId);
    const b = el('button', `st-hauler${on ? ' on' : ''}`);
    b.type = 'button';
    b.title = `${ship.name} — ${fmt(ship.cap)} cargo each · ${fmt(stMvAvail[ship.shipDefId] || 0)} on this planet`;
    if (ship.imageUrl) {
      const img = document.createElement('img');
      img.src = ship.imageUrl;
      b.appendChild(img);
    } else {
      b.textContent = ship.name;
    }
    b.addEventListener('click', () => {
      if (on) stCargoSel.delete(ship.shipDefId); else stCargoSel.add(ship.shipDefId);
      rememberSelection('st-cargo-ships', [...stCargoSel]);
      renderMove();
    });
    box.appendChild(b);
  }

  const note = byId('st-mv-plan');
  const nameOf = id => (stCargoShips.find(x => x.shipDefId === id) || {}).name || `#${id}`;
  if (!stCargoShips.length) { note.textContent = 'Loading haulers…'; return; }
  if (!stCargoSel.size) { note.textContent = 'Pick at least one hauler type.'; return; }
  if (!total) { note.textContent = 'Enter an amount to see the fleet it needs.'; return; }

  const { plan, ships, carried, short } = planHaulers(total, stCargoShips, stCargoSel, stMvAvail);
  if (!ships.length) {
    note.textContent = plan.length
      ? 'None of the picked haulers are on this planet.'
      : 'The picked haulers have no cargo capacity.';
    note.style.color = 'var(--color-danger)';
    return;
  }
  const named = ships.map(s => `${fmt(s.quantity)}× ${nameOf(s.shipDefId)}`).join(', ');
  note.textContent = short
    ? `${named} — carries ${fmt(carried)} of ${fmt(total)}; the rest stays put.`
    : `${named} — carries ${fmt(carried)}.`;
  note.style.color = short ? 'var(--color-warning)' : '';
}

async function dispatchMove(st, amounts, ships) {
  const planetId = Number(byId('st-planet').value);
  if (!planetId) { toast('Pick a source planet first.', false); return; }
  if (!ships.length) { toast('None of the picked haulers are on this planet.', false); return; }

  closeMove();
  const res = await browser.runtime.sendMessage({
    type: 'SEND_STATION_TRANSFER',
    stationId: st.id,
    direction: mv.dir,
    sourcePlanetId: planetId,
    ships,
    amounts,
  });
  const err = res && (res.error || (res.ok === false && res.data && res.data.error));
  toast(err ? `Dispatch failed: ${err}` : 'Fleet dispatched — the ledger updates once it arrives.', !err);
  if (!err) {
    stLogs.delete(st.id);
    loadStations(false);
  }
}

let toastTimer = null;
function toast(message, ok) {
  const box = byId('st-toast');
  byId('st-toast-text').textContent = message;
  byId('st-toast-icon').textContent = ok ? '✓' : '⚠';
  box.style.setProperty('--st-toast-color', ok ? 'var(--color-success)' : 'var(--color-danger)');
  box.style.display = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { box.style.display = 'none'; }, 8000);
}
