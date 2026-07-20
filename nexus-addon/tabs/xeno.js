// Xeno tab: scans outward from a source planet for the nearest system holding
// an unowned "Ancient" moon and launches a ruins survey there.
//
// Ruins survey: POST /api/fleet/xeno-survey { sourcePlanetId, targetMoonId, ships }
// (confirmed against a live send).
//
// Eligibility (the game exposes no moon cooldown/survey-state field anywhere,
// so this is a best-effort proxy): moonType 'ancient' AND unowned
// (userId == null), not already targeted by an in-flight xeno_survey (checked
// via GET_MISSIONS' cargo._targetMoonId), and not within 48h of when our last
// survey there finished (returnDepartsAt, not launch time — tracked locally
// in storage since the game gives no way to read this back, so it's lost if
// storage is cleared/reset).

import { SCAN_CACHE_MAX, getSystemPlanets } from './finder.js';
import { loadFleetTemplates } from './fleets.js';
import { RESOURCE_SERIES, appendExtraResourceCards, applySort, attachSortable, clearAvailStrip, computeSeries, confirmDialog, fillResourceCards, filterZone, fmt, fmtCountdown, fuelForMode, getLabelKey, getMode, inWindowRange, makeMissionBar, makeResourceDoughnut, makeResourceLineChart, makeStatCard, periodLabelFor, renderAvailStrip, renderPagedTable, rememberSelection, rememberedSelections, store, windowActive, zeroCell } from '../common.js';

const XENO_CACHE_TTL = 24 * 3600 * 1000;   // moon ownership rarely changes
const XENO_COOLDOWN_MS = 48 * 3600 * 1000; // local cooldown after we survey a moon

// moonId → { at, name, systemName } — when we launched a survey there and
// where, for both the eligibility check and the cooldown table. Pruned to
// entries still within the cooldown window whenever loaded.
async function loadSurveyedMoons() {
  const { xeno_surveyed_moons } = await browser.storage.local.get('xeno_surveyed_moons');
  const now = Date.now();
  const kept = {};
  for (const [id, entry] of Object.entries(xeno_surveyed_moons || {})) {
    if (now - entry.at < XENO_COOLDOWN_MS) kept[id] = entry;
  }
  return kept;
}

async function markMoonSurveyed(moonId, name, systemName, finishAt) {
  const surveyed = await loadSurveyedMoons();
  surveyed[moonId] = { at: finishAt, name, systemName };
  await browser.storage.local.set({ xeno_surveyed_moons: surveyed });
}

// The just-launched mission for this moon, or null. Used to read its
// returnDepartsAt (when the survey itself finishes and the cooldown should
// start) — the send response doesn't include the mission record.
async function findXenoMissionForMoon(moonId) {
  const mi = await browser.runtime.sendMessage({ type: 'GET_MISSIONS' });
  if (mi.error) return null;
  return (mi.missions || []).find(m => m.missionType === 'xeno_survey' && m.cargo && m.cargo._targetMoonId === moonId) || null;
}

let inited = false;
let xnPlanets = [];
let xnTemplates = [];
let xnMap = null;          // { systems, byId } from GET_GALAXY_MAP, cached
let xnRunning = false;
let xnMissions = [];       // in-flight xeno_survey missions
let xnTicks = [];

// ── Historical stats/charts/table (mirrors tabs/expeditions.js) ────────────
export let chartXeno, chartXenoComp;
export let xnReportPage = 1;

export function xnRecordsForMode(mode) {
  const filtered = filterZone(store.xeno_recent_reports || []);
  if (mode === 'all' && !windowActive()) return filtered;
  return inWindowRange(filtered);
}

export function getXnTotalsForMode(mode) {
  const t = { ore: 0, silicates: 0, hydrogen: 0, alloys: 0, rare: {}, missions: 0, ships_lost: 0 };
  for (const r of xnRecordsForMode(mode)) {
    for (const [k, v] of Object.entries(r.loot || {})) {
      if (k in t && k !== 'rare' && k !== 'missions' && k !== 'ships_lost') t[k] += v;
      else if (!['ore', 'silicates', 'hydrogen', 'alloys'].includes(k)) t.rare[k] = (t.rare[k] || 0) + v;
    }
    t.missions += 1;
    t.ships_lost += r.ships_lost || 0;
  }
  return t;
}

export function getXnSeriesForMode(mode) {
  const getters = { missions: () => 1 };
  for (const d of RESOURCE_SERIES) getters[d.field] = r => (r.loot && r.loot[d.field]) || 0;
  return computeSeries(filterZone(store.xeno_recent_reports || []), mode, getters);
}

export function renderXenoTab() {
  const mode = getMode();
  const periodLabel = periodLabelFor(mode);
  const t = getXnTotalsForMode(mode);
  const el = document.getElementById('xn-stats-collected');
  if (!el) return;   // dashboard.html not loaded yet on first call
  el.textContent = '';
  if (!t.missions) {
    const p = document.createElement('p');
    p.style.cssText = 'color:#484f58;padding:8px 0';
    p.textContent = 'No ruins survey reports recorded yet.';
    el.appendChild(p);
  } else {
    // No ore/silicates/hydrogen card here — ruins-survey loot is always
    // precursor fragments + artifacts (both in EXTRA_RESOURCES), never the
    // core resources.
    appendExtraResourceCards(el, t, periodLabel);
    el.append(
      makeStatCard(`Surveys${periodLabel}`, fmt(t.missions), 'missions'),
      makeStatCard(`Ships lost${periodLabel}`, fmt(t.ships_lost), '', 'color:#ff7b72'),
      makeStatCard(`Fuel spent${periodLabel}`, fmt(fuelForMode('xeno', mode)), 'hydrogen'),
    );
  }

  const lost = store.xeno_resources_lost || { destroyed: {}, repair: {} };
  fillResourceCards('xn-stats-lost', lost.destroyed, '');

  if (chartXeno) chartXeno.destroy();
  chartXeno = makeResourceLineChart('chart-xeno', getXnSeriesForMode(mode),
    getLabelKey(mode), { field: 'missions', label: 'Surveys' });

  if (chartXenoComp) chartXenoComp.destroy();
  chartXenoComp = makeResourceDoughnut('chart-xeno-comp', t);

  renderXnReportTable();
}

export const xnReportSort = { key: 'created_at', dir: -1 };
attachSortable('xn-reports-head', xnReportSort, () => { xnReportPage = 1; renderXnReportTable(); });

export function renderXnReportTable() {
  const reports = applySort('xn-reports-head', filterZone(store.xeno_recent_reports || []), xnReportSort);
  renderPagedTable(reports, xnReportPage, 'xn-report-page-info', 'xn-report-btn-prev', 'xn-report-btn-next', 'xn-reports-tbody', r => {
    const tr = document.createElement('tr');
    const tdDate = document.createElement('td');
    tdDate.textContent = new Date(r.created_at).toLocaleString();
    const loot = r.loot || {};
    tr.append(tdDate, zeroCell(loot.precursor_fragments), zeroCell(loot.artifact));
    return tr;
  });
}

document.getElementById('xn-report-btn-prev').addEventListener('click', () => { xnReportPage--; renderXnReportTable(); });
document.getElementById('xn-report-btn-next').addEventListener('click', () => { xnReportPage++; renderXnReportTable(); });

export function setXnReportPage(n) { xnReportPage = n; }

export async function initXenoTab() {
  if (inited) return;
  inited = true;
  const status = document.getElementById('xn-progress');
  status.textContent = 'Loading…';

  const planets = await browser.runtime.sendMessage({ type: 'GET_PLANETS' });
  if (planets.error) { status.textContent = `Error: ${planets.error}`; inited = false; return; }
  xnPlanets = (planets.planets || []).filter(p => p.systemId != null);

  const pSel = document.getElementById('xn-planet');
  pSel.textContent = '';
  for (const p of xnPlanets) {
    const o = document.createElement('option');
    o.value = p.id;
    o.textContent = p.systemName ? `${p.name} (${p.systemName})` : p.name;
    if (p.isHomeworld) o.selected = true;
    pSel.appendChild(o);
  }
  const saved = await rememberedSelections();
  if (saved['xn-planet'] && xnPlanets.some(p => String(p.id) === saved['xn-planet'])) {
    pSel.value = saved['xn-planet'];
  }

  await refreshTemplates();
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.fleet_templates) refreshTemplates();
  });

  document.getElementById('xn-planet').addEventListener('change', e => {
    rememberSelection('xn-planet', e.target.value);
    updateAvail();
  });
  document.getElementById('xn-template').addEventListener('change', e => rememberSelection('xn-template', e.target.value));
  document.getElementById('xn-scan').addEventListener('click', launchRuinsSurvey);

  setInterval(() => {
    if (document.getElementById('xeno-content').style.display === 'none') return;
    for (const upd of xnTicks) upd();
    renderCooldownTable();   // re-render each tick so "time left" counts down / expired rows drop
  }, 1000);

  status.textContent = '';
  updateAvail();
  refreshMissions();
  renderCooldownTable();
}

async function refreshTemplates() {
  xnTemplates = await loadFleetTemplates();
  xnTemplates.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const sel = document.getElementById('xn-template');
  const saved = await rememberedSelections();
  const want = saved['xn-template'] || sel.value;
  sel.textContent = '';
  if (!xnTemplates.length) {
    const o = document.createElement('option');
    o.value = ''; o.textContent = '— none (create in Fleet Templates) —';
    sel.appendChild(o);
  } else {
    for (const t of xnTemplates) {
      const o = document.createElement('option');
      o.value = t.id; o.textContent = t.name;
      sel.appendChild(o);
    }
    if (want && xnTemplates.some(t => String(t.id) === want)) sel.value = want;
  }
}

// Resolve a template's ships, capped to what the source planet actually has.
// Returns { ships, short, name, avail } or { error }.
async function templateShips(templateId, planetId) {
  const tpl = xnTemplates.find(t => String(t.id) === templateId);
  if (!tpl) return { error: 'No fleet template selected — create one in Fleet Templates.' };
  const wanted = Object.entries(tpl.ships || {})
    .map(([shipDefId, quantity]) => ({ shipDefId: Number(shipDefId), quantity }))
    .filter(s => s.quantity > 0);
  if (!wanted.length) return { error: `Template "${tpl.name}" has no ships.` };

  const av = await browser.runtime.sendMessage({ type: 'GET_PLANET_SHIPS', planetId });
  if (av.error) return { error: av.error };
  const ships = wanted
    .map(s => ({ shipDefId: s.shipDefId, quantity: Math.min(s.quantity, av.available[s.shipDefId] || 0) }))
    .filter(s => s.quantity > 0);
  if (!ships.length) return { error: `None of template "${tpl.name}"'s ships are on this planet.` };
  return { ships, short: wanted.some(s => (av.available[s.shipDefId] || 0) < s.quantity), name: tpl.name };
}

async function updateAvail() {
  const box = document.getElementById('xn-avail');
  const planetId = Number(document.getElementById('xn-planet').value);
  if (!planetId) { clearAvailStrip(box); return; }
  const [av, defs] = await Promise.all([
    browser.runtime.sendMessage({ type: 'GET_PLANET_SHIPS', planetId }),
    browser.runtime.sendMessage({ type: 'GET_SHIP_DEFS' }),
  ]);
  if (av.error) { clearAvailStrip(box, av.error); return; }
  renderAvailStrip(box, defs.ships || [], av.available, 'No ships on this planet.');
}

async function loadMap() {
  if (xnMap) return xnMap;
  const res = await browser.runtime.sendMessage({ type: 'GET_GALAXY_MAP' });
  if (res.error) throw new Error(res.error);
  const systems = res.systems || [];
  const byId = {};
  for (const s of systems) byId[s.id] = s;
  xnMap = { systems, byId };
  return xnMap;
}

async function refreshMissions() {
  const mi = await browser.runtime.sendMessage({ type: 'GET_MISSIONS' });
  if (mi.error) return;
  if (mi.maxFleetSlots != null) {
    document.getElementById('xn-slots').textContent = `${(mi.missions || []).length}/${mi.maxFleetSlots} fleet slots`;
  }
  xnMissions = (mi.missions || []).filter(m => m.missionType === 'xeno_survey');
  renderTransit();
}

function renderTransit() {
  const box = document.getElementById('xn-transit-list');
  box.textContent = '';
  xnTicks = [];
  document.getElementById('xn-transit-count').textContent = `${xnMissions.length} in flight`;
  if (!xnMissions.length) {
    const d = document.createElement('div');
    d.style.cssText = 'color:#484f58; padding:4px 0;';
    d.textContent = 'No ruins surveys in transit.';
    box.appendChild(d);
    return;
  }
  for (const m of xnMissions) {
    const target = m.targetSystemName || `#${m.targetSystemId ?? m.id}`;
    const row = document.createElement('div');
    const head = document.createElement('div');
    head.style.cssText = 'display:flex; align-items:baseline; gap:8px; font-size:0.85rem; margin-bottom:3px;';
    const name = document.createElement('span');
    name.style.color = '#e6edf3';
    name.textContent = `${target} · Ruins Survey`;
    head.appendChild(name);
    const bar = makeMissionBar(m);
    bar.el.style.marginTop = '0';
    row.append(head, bar.el);
    box.appendChild(row);
    xnTicks.push(bar.upd);
  }
}

// Moons still within our local 48h cooldown, soonest-expiring first.
async function renderCooldownTable() {
  const tbody = document.getElementById('xn-cooldown-tbody');
  if (!tbody) return;
  const surveyed = await loadSurveyedMoons();
  const rows = Object.entries(surveyed)
    .map(([id, entry]) => ({ id, ...entry, endsAt: entry.at + XENO_COOLDOWN_MS }))
    .sort((a, b) => a.endsAt - b.endsAt);
  document.getElementById('xn-cooldown-count').textContent = `${rows.length} on cooldown`;
  tbody.textContent = '';
  if (!rows.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 3; td.style.color = '#484f58';
    td.textContent = 'No moons on cooldown.';
    tr.appendChild(td); tbody.appendChild(tr);
    return;
  }
  const now = Date.now();
  for (const r of rows) {
    const tr = document.createElement('tr');
    const cells = [r.name || `#${r.id}`, r.systemName || '—', fmtCountdown(r.endsAt - now)];
    cells.forEach(v => { const td = document.createElement('td'); td.textContent = v; tr.appendChild(td); });
    tbody.appendChild(tr);
  }
}

// The nearest unowned Ancient moon not already targeted by an in-flight ruins
// survey, scanning outward system-by-system from `src` (reuses finder.js's
// shared per-system cache). Returns { moon, system, distance } or null.
async function findNearestAncientMoon(src, srcSystemId, targetedMoonIds, surveyedMoons, onProgress) {
  const map = await loadMap();
  const targets = map.systems
    .filter(s => s.id !== srcSystemId && (s.visibility === 'full' || s.visibility === 'partial'))
    .map(s => ({ s, d: Math.hypot(s.x - src.x, s.y - src.y) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 500);

  const { planet_scan_cache } = await browser.storage.local.get('planet_scan_cache');
  const cache = planet_scan_cache || {};

  let scanned = 0;
  try {
    for (const { s: sys, d } of targets) {
      if (!xnRunning) break;
      let data;
      try {
        data = await getSystemPlanets(sys.id, cache, XENO_CACHE_TTL);
      } catch { scanned++; continue; }
      const moon = (data.moons || []).find(m =>
        m.moonType === 'ancient' && m.userId == null && !targetedMoonIds.has(m.id) && !(m.id in surveyedMoons));
      scanned++;
      if (moon) return { moon, system: sys, distance: Math.round(d) };
      if (scanned % 10 === 0) onProgress(scanned, targets.length);
      await new Promise(r => setTimeout(r, 80));   // be polite to the game API
    }
  } finally {
    // Persist the shared scan cache, oldest entries dropped first.
    const ids = Object.keys(cache);
    if (ids.length > SCAN_CACHE_MAX) {
      ids.sort((a, b) => cache[a].at - cache[b].at)
        .slice(0, ids.length - SCAN_CACHE_MAX)
        .forEach(id => delete cache[id]);
    }
    await browser.storage.local.set({ planet_scan_cache: cache });
  }
  return null;
}

async function launchRuinsSurvey() {
  const btn = document.getElementById('xn-scan');
  if (xnRunning) { xnRunning = false; return; }

  const status = document.getElementById('xn-progress');
  const planetId = Number(document.getElementById('xn-planet').value);
  const planet = xnPlanets.find(p => p.id === planetId);
  if (!planet) return;

  status.textContent = 'Loading galaxy map…';
  let map;
  try { map = await loadMap(); } catch (e) { status.textContent = `Error: ${e.message}`; return; }
  const src = map.byId[planet.systemId];
  if (!src) { status.textContent = 'Source system not on the map.'; return; }

  const [mi, surveyedMoons] = await Promise.all([
    browser.runtime.sendMessage({ type: 'GET_MISSIONS' }),
    loadSurveyedMoons(),
  ]);
  const targetedMoonIds = new Set((mi.missions || [])
    .filter(m => m.missionType === 'xeno_survey')
    .map(m => m.cargo && m.cargo._targetMoonId)
    .filter(id => id != null));

  xnRunning = true;
  btn.textContent = 'Stop';
  status.textContent = 'Scanning for the nearest Ancient moon…';
  let found;
  try {
    found = await findNearestAncientMoon(src, planet.systemId, targetedMoonIds, surveyedMoons,
      (scanned, total) => { status.textContent = `Scanning… ${scanned}/${total} systems.`; });
  } finally {
    xnRunning = false;
    btn.textContent = 'Launch Ruins Survey';
  }
  if (!found) { status.textContent = 'No unclaimed Ancient moon found nearby.'; return; }

  const r = await templateShips(document.getElementById('xn-template').value, planetId);
  if (r.error) { status.textContent = r.error; return; }
  const sysName = found.system.name || `#${found.system.id}`;
  if (!await confirmDialog(`Launch ruins survey?\n\nTarget: ${found.moon.name} (${sysName}, ${found.distance} away)\n` +
    `From: ${planet.name}\nTemplate: ${r.name}` +
    (r.short ? '\n\n⚠ Some template ships are short; sending what is available.' : ''), r.ships)) return;

  status.textContent = `Launching survey to ${found.moon.name}…`;
  const res = await browser.runtime.sendMessage({
    type: 'SEND_XENO_SURVEY', sourcePlanetId: planetId, targetMoonId: found.moon.id, ships: r.ships,
  });
  if (res.error) { status.textContent = `Launch failed: ${res.error}`; return; }
  status.textContent = `Fleet sent to ${found.moon.name} ✓`;
  updateAvail();
  refreshMissions();

  // Cooldown starts when the survey itself finishes (returnDepartsAt), not at
  // launch — fetch the new mission (retrying once for post-POST API lag) to
  // read that time. Falls back to now if it never shows up.
  let mission = await findXenoMissionForMoon(found.moon.id);
  if (!mission) {
    await new Promise(r => setTimeout(r, 2000));
    mission = await findXenoMissionForMoon(found.moon.id);
    refreshMissions();
  }
  const finishAt = mission && mission.returnDepartsAt ? Date.parse(mission.returnDepartsAt) : Date.now();
  await markMoonSurveyed(found.moon.id, found.moon.name, found.system.name || `#${found.system.id}`, finishAt);
  renderCooldownTable();
}
