// Scouting tab: launch probe surveys at the nearest un-surveyed system, and
// list anomalies awaiting investigation with a one-click investigate fleet.
//
// Survey:      POST /api/fleet/survey         { sourcePlanetId, targetSystemId, ships }
// Investigate: POST /api/fleet/investigate    { sourcePlanetId, reportId, ships }
// Collect:     POST /api/fleet/collect-debris { sourcePlanetId, debrisId, ships }
// All routed through the game tab (same-origin) like the asteroid mine call.

import { loadFleetTemplates } from './fleets.js';
import { applySort, attachSortable, clearAvailStrip, confirmDialog, fuelEstimate, rememberSelection, rememberedSelections, renderAvailStrip, store } from '../common.js';

let inited = false;
let scPlanets = [];          // [{ id, name, systemId, systemName }]
let scSystems = {};          // systemId → { x, y, name, zone }
let scTemplates = [];

const ZONES = ['sentinel', 'open', 'dead', 'rift'];
const ZONE_COLOR = { sentinel: '#56d364', open: '#f0883e', dead: '#ff7b72', rift: '#bc8cff' };
const scZoneFilter = new Set();   // empty = any zone
let scPending = [];               // anomalies awaiting investigation
let scInvestigating = new Set();  // systemIds with an investigate mission in flight
const scJustSurveyed = new Set(); // systemIds surveyed this session — the missions API lags, so exclude them locally
const scJustInvestigated = new Set(); // same, for investigate missions
let scTick = 0;

export async function initScoutingTab() {
  if (inited) return;
  inited = true;
  const status = document.getElementById('sc-progress');
  status.textContent = 'Loading…';

  const [planets, map] = await Promise.all([
    browser.runtime.sendMessage({ type: 'GET_PLANETS' }),
    browser.runtime.sendMessage({ type: 'GET_GALAXY_MAP' }),
  ]);
  if (map.error) { status.textContent = `Error: ${map.error}`; inited = false; return; }
  for (const s of (map.systems || [])) {
    scSystems[s.id] = { x: s.x, y: s.y, name: s.name, zone: s.securityZone || null };
  }
  scPlanets = (planets.planets || []).filter(p => p.systemId != null);

  const pSel = document.getElementById('sc-planet');
  pSel.textContent = '';
  for (const p of scPlanets) {
    const o = document.createElement('option');
    o.value = p.id;
    o.textContent = p.systemName ? `${p.name} (${p.systemName})` : p.name;
    if (p.isHomeworld) o.selected = true;
    pSel.appendChild(o);
  }
  const savedSel = await rememberedSelections();
  if (savedSel['sc-planet'] && scPlanets.some(p => String(p.id) === savedSel['sc-planet'])) {
    pSel.value = savedSel['sc-planet'];   // remembered planet survives tabs/sessions
  }

  await loadSurveyZone();
  drawZoneToggles();
  await loadDebrisZone();
  drawDebrisZoneToggles();
  await loadInvHistory();
  await refreshTemplates();
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.fleet_templates) refreshTemplates();
  });

  document.getElementById('sc-scan').addEventListener('click', launchScan);
  document.getElementById('sc-refresh').addEventListener('click', loadActiveSurveys);
  document.getElementById('sc-planet').addEventListener('change', e => { rememberSelection('sc-planet', e.target.value); renderSurveys(); computeDebrisFuel(); computeSalvageFuel(); updateAvail(); });
  document.getElementById('sc-scan-template').addEventListener('change', e => rememberSelection('sc-scan-template', e.target.value));
  document.getElementById('sc-inv-template').addEventListener('change', e => { rememberSelection('sc-inv-template', e.target.value); computeFuel(); });
  document.getElementById('sc-debris-refresh').addEventListener('click', loadDebris);
  document.getElementById('sc-debris-hidden').addEventListener('click', () => { scShowHidden = !scShowHidden; renderDebris(); });
  document.getElementById('sc-debris-invonly').addEventListener('change', e => { scInvestigatedOnly = e.target.checked; renderDebris(); });
  await loadCargoShips();
  updateAvail();

  // Tick the countdowns every second; refetch the list every 30s. Both only
  // while the tab is visible.
  setInterval(() => {
    if (document.getElementById('scouting-content').style.display === 'none') return;
    tickTimers();
    if (++scTick % 10 === 0) updateAvail();       // catch returning fleets
    if (scTick % 30 === 0) { loadActiveSurveys(); loadDebris(); }
  }, 1000);

  status.textContent = '';
  loadActiveSurveys();
  loadDebris();
}

async function refreshTemplates() {
  scTemplates = await loadFleetTemplates();
  scTemplates.sort((a, b) => (a.name || '').localeCompare(b.name || ''));   // alphabetical dropdowns
  const saved = await rememberedSelections();
  for (const id of ['sc-scan-template', 'sc-inv-template']) {
    const sel = document.getElementById(id);
    const want = saved[id] || sel.value;   // remembered choice survives tabs/sessions
    sel.textContent = '';
    if (!scTemplates.length) {
      const o = document.createElement('option');
      o.value = ''; o.textContent = '— none (create in Fleet Templates) —';
      sel.appendChild(o);
      continue;
    }
    for (const t of scTemplates) {
      const o = document.createElement('option');
      o.value = t.id; o.textContent = t.name;
      sel.appendChild(o);
    }
    if (want && scTemplates.some(t => String(t.id) === want)) sel.value = want;
  }
}

// Resolve a template's ships, capped to what the source planet actually has.
// Returns { ships, short } or { error }.
async function templateShips(templateId, planetId) {
  const tpl = scTemplates.find(t => String(t.id) === templateId);
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

// Clickable zone toggles, coloured per zone (mirrors the Asteroids filter).
// Empty selection means any zone. `redraw` re-renders this set, `onChange` runs
// extra side effects (e.g. re-filter the debris table).
function drawToggles(boxId, filter, redraw, onChange) {
  const box = document.getElementById(boxId);
  box.textContent = '';
  for (const z of ZONES) {
    const b = document.createElement('button');
    const on = filter.has(z);
    b.type = 'button';
    b.textContent = z;
    b.style.cssText = `padding:4px 10px; border-radius:6px; cursor:pointer; font-size:0.8rem;
      border:1px solid ${ZONE_COLOR[z]}; text-transform:capitalize;
      color:${on ? '#0d1117' : ZONE_COLOR[z]}; background:${on ? ZONE_COLOR[z] : 'transparent'};`;
    b.addEventListener('click', () => {
      if (on) filter.delete(z); else filter.add(z);
      redraw();
      if (onChange) onChange();
    });
    box.appendChild(b);
  }
}

// Survey-target zone filter (top of tab), persisted.
function drawZoneToggles() {
  drawToggles('sc-zone', scZoneFilter, drawZoneToggles, saveSurveyZone);
}

// Debris-table zone filter — independent from the survey filter above, persisted.
function drawDebrisZoneToggles() {
  drawToggles('sc-debris-zone', scDebrisZoneFilter, drawDebrisZoneToggles,
    () => { saveDebrisZone(); renderDebris(); });
}

// Nearest system to the source planet that isn't on survey cooldown and, if any
// zones are selected, sits in one of them.
function nearestTarget(srcSystemId, onCooldown) {
  const src = scSystems[srcSystemId];
  if (!src) return null;
  let best = null, bestD = Infinity;
  for (const [id, s] of Object.entries(scSystems)) {
    const sid = Number(id);
    if (onCooldown.has(sid)) continue;
    if (scZoneFilter.size && !scZoneFilter.has(s.zone)) continue;
    const d = Math.hypot(s.x - src.x, s.y - src.y);
    if (d < bestD) { bestD = d; best = { id: sid, name: s.name, dist: Math.round(d) }; }
  }
  return best;
}

async function launchScan() {
  const status = document.getElementById('sc-progress');
  const planetId = Number(document.getElementById('sc-planet').value);
  const planet = scPlanets.find(p => p.id === planetId);

  status.textContent = 'Finding nearest system…';
  const [cd, mi] = await Promise.all([
    browser.runtime.sendMessage({ type: 'GET_SURVEY_COOLDOWNS' }),
    browser.runtime.sendMessage({ type: 'GET_MISSIONS' }),
  ]);
  if (cd.error) { status.textContent = `Error: ${cd.error}`; return; }
  const now = Date.now();
  // Exclude systems on cooldown and systems with a survey already in flight
  // (cooldown only starts once that survey completes).
  const onCooldown = new Set((cd.cooldowns || [])
    .filter(c => new Date(c.cooldownEndsAt) > now).map(c => c.systemId));
  for (const m of (mi.missions || [])) {
    if (m.missionType === 'survey' && m.targetSystemId != null) onCooldown.add(m.targetSystemId);
  }
  for (const id of scJustSurveyed) onCooldown.add(id);

  const target = nearestTarget(planet ? planet.systemId : null, onCooldown);
  if (!target) {
    const zs = scZoneFilter.size ? [...scZoneFilter].join('/') + ' ' : '';
    status.textContent = `No available ${zs}system to survey.`;
    return;
  }

  const r = await templateShips(document.getElementById('sc-scan-template').value, planetId);
  if (r.error) { status.textContent = r.error; return; }
  if (!await confirmDialog(`Survey ${target.name} (${target.dist} away)?\n\n` +
    `From: ${planet ? planet.name : planetId}\nTemplate: ${r.name}` +
    (r.short ? '\n\n⚠ Some template ships are short; sending what is available.' : ''), r.ships)) return;

  status.textContent = `Surveying ${target.name}…`;
  const res = await browser.runtime.sendMessage({
    type: 'SEND_SURVEY', sourcePlanetId: planetId, targetSystemId: target.id, ships: r.ships,
  });
  if (res.error) { status.textContent = `Survey failed: ${res.error}`; return; }
  scJustSurveyed.add(target.id);
  status.textContent = `Probe sent to ${target.name} ✓`;
  loadActiveSurveys();
  updateAvail();
}

function fmtCountdown(ms) {
  if (ms <= 0) return 'expired';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const pad = n => String(n).padStart(2, '0');
  if (h) return `${h}h ${pad(m)}m ${pad(sec)}s`;
  if (m) return `${m}m ${pad(sec)}s`;
  return `${sec}s`;
}

async function loadActiveSurveys() {
  const [res, mi] = await Promise.all([
    browser.runtime.sendMessage({ type: 'GET_SURVEY_REPORTS' }),
    browser.runtime.sendMessage({ type: 'GET_MISSIONS' }),
  ]);
  if (res.error) { document.getElementById('sc-count').textContent = `Error: ${res.error}`; return; }
  if (mi.maxFleetSlots != null) {
    document.getElementById('sc-slots').textContent = `${(mi.missions || []).length}/${mi.maxFleetSlots} fleet slots`;
  }
  scInvestigating = new Set((mi.missions || [])
    .filter(m => m.missionType === 'investigate' && m.targetSystemId != null)
    .map(m => m.targetSystemId));
  for (const id of scJustInvestigated) scInvestigating.add(id);
  const now = Date.now();
  const exp = r => (r.anomalyExpiresAt ? new Date(r.anomalyExpiresAt).getTime() : Infinity);
  scPending = (res.reports || [])
    .filter(r => !r.investigated && (!r.anomalyExpiresAt || new Date(r.anomalyExpiresAt) > now))
    .sort((a, b) => exp(a) - exp(b));   // soonest expiry first
  let histChanged = false;
  for (const r of (res.reports || [])) {
    if (r.investigated && r.systemId != null && !scInvHistory.has(r.systemId)) {
      scInvHistory.set(r.systemId, Date.parse(r.createdAt) || Date.now()); histChanged = true;
    }
  }
  if (pruneInvHistory()) histChanged = true;
  if (histChanged) saveInvHistory();

  // Investigated reports with loot still on the ground and a live salvage timer.
  scSalvage = (res.reports || [])
    .map(r => {
      const loot = r.uncollectedLoot || {};
      const res_ = {};
      let total = 0;
      for (const k of SALVAGE_KEYS) { const v = loot[k] || 0; if (v) { res_[k] = v; total += v; } }
      return { reportId: r.id, systemId: r.systemId, system: r.systemName || `#${r.systemId}`,
        zone: r.securityZone || null, res: res_, total, expires: r.salvageExpiresAt || null };
    })
    .filter(s => s.total > 0 && (!s.expires || new Date(s.expires) > now))
    .sort((a, b) => b.total - a.total);

  renderSurveys();
  renderSalvage();
  if (scInvestigatedOnly) renderDebris();   // filter depends on the history just updated
}

function renderSurveys() {
  const tbody = document.getElementById('sc-surveys-tbody');
  tbody.textContent = '';
  document.getElementById('sc-count').textContent = `${scPending.length} awaiting investigation`;
  const now = Date.now();
  for (const r of scPending) {
    const tr = document.createElement('tr');
    if (r.anomalyExpiresAt) tr.dataset.expires = r.anomalyExpiresAt;

    const tgtTd = document.createElement('td');
    const btn = document.createElement('button');
    const busy = scInvestigating.has(r.systemId);
    btn.textContent = busy ? 'Investigating…' : 'Launch Investigation';
    btn.disabled = busy;
    btn.style.cssText = busy
      ? 'background:#30363d; border:1px solid #30363d; color:#8b949e;' +
        ' padding:6px 16px; border-radius:6px; cursor:not-allowed; font-size:0.85rem;'
      : 'background:#238636; border:1px solid #2ea043; color:#fff;' +
        ' padding:6px 16px; border-radius:6px; cursor:pointer; font-size:0.85rem;';
    if (!busy) btn.addEventListener('click', () => investigate(r));
    tgtTd.appendChild(btn);
    tr.appendChild(tgtTd);

    tr.dataset.system = r.systemId;
    const cells = [
      r.systemName || `#${r.systemId}`,
      r.eventTitle || r.eventType,
      r.securityZone || '—',
      '…',   // fuel cost, filled async
      '…',   // travel time, filled async
      r.anomalyExpiresAt ? fmtCountdown(new Date(r.anomalyExpiresAt) - now) : '—',
    ];
    cells.forEach((v, i) => {
      const td = document.createElement('td');
      td.textContent = v;
      if (i === 2) td.style.color = ZONE_COLOR[r.securityZone] || '#8b949e';
      if (i === 3) td.className = 'sc-fuel';
      if (i === 4) td.className = 'sc-time';
      if (i === 5) td.className = 'sc-timer';
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  }
  computeFuel();
}

// Fill the Fuel Cost column: one fuel-estimate per row for the selected
// investigate template's ships (capped to the source planet). A generation
// guard discards results from a superseded render/selection.
let fuelGen = 0;
async function computeFuel() {
  const gen = ++fuelGen;
  const planetId = Number(document.getElementById('sc-planet').value);
  const fuelCells = () => document.querySelectorAll('#sc-surveys-tbody td.sc-fuel');
  const timeCells = () => document.querySelectorAll('#sc-surveys-tbody td.sc-time');
  // Estimate uses the template as designed (not capped to the planet's stock).
  const tpl = scTemplates.find(t => String(t.id) === document.getElementById('sc-inv-template').value);
  const ships = Object.entries(tpl ? tpl.ships : {})
    .map(([shipDefId, quantity]) => ({ shipDefId: Number(shipDefId), quantity }))
    .filter(s => s.quantity > 0);
  if (!ships.length) {
    fuelCells().forEach(c => { c.textContent = '—'; c.title = tpl ? 'Template has no ships' : 'No template selected'; });
    timeCells().forEach(c => { c.textContent = '—'; });
    return;
  }

  for (const tr of document.querySelectorAll('#sc-surveys-tbody tr')) {
    if (gen !== fuelGen) return;
    const cell = tr.querySelector('.sc-fuel');
    const timeCell = tr.querySelector('.sc-time');
    const sysId = Number(tr.dataset.system);
    if (!cell || !sysId) continue;
    const est = await fuelEstimate(planetId, sysId, ships);
    if (gen !== fuelGen) return;
    if (est.error) { cell.textContent = '—'; cell.title = est.error; if (timeCell) timeCell.textContent = '—'; continue; }
    cell.textContent = `${est.fuelCost}`;
    cell.style.color = est.inRange === false ? '#ff7b72' : '';
    cell.title = est.inRange === false ? 'Out of range' : `distance ${est.distance.toFixed(1)} ly`;
    if (timeCell) timeCell.textContent = est.travelTime != null ? fmtCountdown(est.travelTime * 1000) : '—';
  }
}

// Update countdown cells in place; drop rows that just expired.
function tickTimers() {
  const now = Date.now();
  let expired = false;
  document.querySelectorAll('#sc-surveys-tbody tr').forEach(tr => {
    if (!tr.dataset.expires) return;
    const ms = new Date(tr.dataset.expires) - now;
    if (ms <= 0) { tr.remove(); expired = true; return; }
    const cell = tr.querySelector('.sc-timer');
    if (cell) cell.textContent = fmtCountdown(ms);
  });
  if (expired) {
    scPending = scPending.filter(r => !r.anomalyExpiresAt || new Date(r.anomalyExpiresAt) > now);
    document.getElementById('sc-count').textContent = `${scPending.length} awaiting investigation`;
  }

  let salvExpired = false;
  document.querySelectorAll('#sc-salvage-tbody tr').forEach(tr => {
    if (!tr.dataset.expires) return;
    const ms = new Date(tr.dataset.expires) - now;
    if (ms <= 0) { tr.remove(); salvExpired = true; return; }
    const cell = tr.querySelector('.sc-salvage-timer');
    if (cell) cell.textContent = fmtCountdown(ms);
  });
  if (salvExpired) {
    scSalvage = scSalvage.filter(s => !s.expires || new Date(s.expires) > now);
    document.getElementById('sc-salvage-count').textContent = `${scSalvage.length} awaiting collection`;
  }
}

async function investigate(report) {
  const status = document.getElementById('sc-progress');
  const planetId = Number(document.getElementById('sc-planet').value);
  const planet = scPlanets.find(p => p.id === planetId);

  const r = await templateShips(document.getElementById('sc-inv-template').value, planetId);
  if (r.error) { status.textContent = r.error; return; }
  if (!await confirmDialog(`Investigate ${report.systemName} (${report.eventTitle || report.eventType})?\n\n` +
    `From: ${planet ? planet.name : planetId}\nTemplate: ${r.name}` +
    (r.short ? '\n\n⚠ Some template ships are short; sending what is available.' : ''), r.ships)) return;

  status.textContent = `Investigating ${report.systemName}…`;
  const res = await browser.runtime.sendMessage({
    type: 'SEND_INVESTIGATE', sourcePlanetId: planetId, reportId: report.id, ships: r.ships,
  });
  if (res.error) { status.textContent = `Investigate failed: ${res.error}`; return; }
  scJustInvestigated.add(report.systemId);
  scInvestigating.add(report.systemId);
  status.textContent = `Fleet sent to ${report.systemName} ✓`;
  loadActiveSurveys();
  updateAvail();
}

// ── Live debris fields ─────────────────────────────────────────────────────

let scDebris = [];   // live debris fields from the latest scrape
const scJustCollected = new Set();   // debrisIds collected this session — keep the button disabled
// systemId → { field, seenRun }: a field we launched a collection on, kept
// visible even while the game drops it from debris_fields mid-flight, so the
// row doesn't flicker out. Dropped once its collect run finishes.
const scCollecting = new Map();
const scHiddenDebris = new Set();    // field ids the user hid from the table
let scShowHidden = false;            // reveal hidden rows (dimmed) for unhiding
let scInvestigatedOnly = false;      // restrict debris to systems in the investigation history
const scDebrisZoneFilter = new Set(); // debris-table zone filter (independent of survey filter)
let scInvHistory = new Map();        // systemId → investigation report time (ms); expires after 2h
const INV_HISTORY_TTL_MS = 2 * 60 * 60 * 1000;
const scDebrisSort = { key: 'total', dir: -1 };
attachSortable('sc-debris-head', scDebrisSort, () => renderDebris());

// Uncollected survey salvage: after a partial-recovery investigation, loot sits
// in-system (survey report `uncollectedLoot`) until `salvageExpiresAt`. Collected
// with the same cargo haulers as debris, via POST /api/fleet/collect-salvage.
const SALVAGE_KEYS = ['ore', 'silicates', 'hydrogen', 'alloys', 'ice', 'quantum_dust', 'plasma_core', 'dark_matter', 'antimatter'];
let scSalvage = [];                  // [{ reportId, systemId, system, zone, res, total, expires }]
const scJustSalvaged = new Set();    // reportIds launched this session — keep the button disabled
const scSalvageSort = { key: 'total', dir: -1 };
attachSortable('sc-salvage-head', scSalvageSort, () => renderSalvage());

// Investigation history persists across sessions: survey reports rotate out, so
// we accumulate investigated systemIds (→ report time) here. An entry drops when
// debris there is collected, or once it's older than INV_HISTORY_TTL_MS.
async function loadInvHistory() {
  const { debris_inv_history } = await browser.storage.local.get('debris_inv_history');
  scInvHistory = new Map(Object.entries(debris_inv_history || {}).map(([k, v]) => [Number(k), v]));
  if (pruneInvHistory()) saveInvHistory();
}
async function saveInvHistory() {
  await browser.storage.local.set({ debris_inv_history: Object.fromEntries(scInvHistory) });
}
// Drop entries past the TTL. Returns true if anything was removed.
function pruneInvHistory() {
  const cutoff = Date.now() - INV_HISTORY_TTL_MS;
  let changed = false;
  for (const [sysId, ts] of scInvHistory) {
    if (!(ts > cutoff)) { scInvHistory.delete(sysId); changed = true; }
  }
  return changed;
}

// Debris zone filter persists across sessions.
async function loadDebrisZone() {
  const { debris_zone_filter } = await browser.storage.local.get('debris_zone_filter');
  scDebrisZoneFilter.clear();
  for (const z of (debris_zone_filter || [])) scDebrisZoneFilter.add(z);
}
function saveDebrisZone() {
  browser.storage.local.set({ debris_zone_filter: [...scDebrisZoneFilter] });
}

// Survey-target zone filter persists across sessions.
async function loadSurveyZone() {
  const { survey_zone_filter } = await browser.storage.local.get('survey_zone_filter');
  scZoneFilter.clear();
  for (const z of (survey_zone_filter || [])) scZoneFilter.add(z);
}
function saveSurveyZone() {
  browser.storage.local.set({ survey_zone_filter: [...scZoneFilter] });
}

// Cargo haulers the user can pick to collect debris. Loaded from the shipyard
// (real cargoCapacity, scales with race/tech), filtered to these keys.
const CARGO_KEYS = ['ore_freighter', 'bulk_carrier', 'freighter', 'transport_shuttle'];
let scCargoShips = [];               // [{ shipDefId, name, imageUrl, cap }]
let scAllShips = [];                 // every ship def: [{ shipDefId, name, imageUrl }]
const scCargoSel = new Set();        // selected shipDefIds

async function loadCargoShips() {
  const [res, stored, me] = await Promise.all([
    browser.runtime.sendMessage({ type: 'GET_SHIP_DEFS' }),
    browser.storage.local.get('research'),
    browser.runtime.sendMessage({ type: 'GET_AUTH_ME' }),
  ]);
  const bonus = cargoBonuses(stored.research || []);
  const commander = me?.user?.activeLeaderBonuses?.cargoBonus || 0;   // leader cargo bonus
  scAllShips = (res.ships || []).map(s => ({ shipDefId: s.shipDefId, name: s.name, imageUrl: s.imageUrl }));
  scCargoShips = (res.ships || [])
    .filter(s => CARGO_KEYS.includes(s.key) && s.cargoCapacity > 0)
    .map(s => {
      // cargo_bonus + commander lift every hauler; shuttle_cargo_bonus adds on top.
      const b = bonus.general + commander + (s.key === 'transport_shuttle' ? bonus.shuttle : 0);
      return { shipDefId: s.shipDefId, name: s.name, imageUrl: s.imageUrl, cap: Math.floor(s.cargoCapacity * (1 + b)) };
    })
    .sort((a, b) => b.cap - a.cap);
  // Restore the remembered cargo-type selection (survives tabs/sessions).
  const saved = (await rememberedSelections())['sc-cargo-ships'];
  if (Array.isArray(saved)) {
    scCargoSel.clear();
    for (const id of saved) if (scCargoShips.some(s => s.shipDefId === id)) scCargoSel.add(id);
  }
  renderCargoToggles();
}

// Sum researched cargo bonuses (value × level) by effect type.
function cargoBonuses(research) {
  let general = 0, shuttle = 0;
  for (const r of research) {
    const lvl = r.level || 0;
    if (!lvl) continue;
    for (const e of (r.effects || [])) {
      if (e.type === 'cargo_bonus') general += (e.value || 0) * lvl;
      else if (e.type === 'shuttle_cargo_bonus') shuttle += (e.value || 0) * lvl;
    }
  }
  return { general, shuttle };
}

function renderCargoToggles() {
  const box = document.getElementById('sc-debris-ships');
  box.textContent = '';
  for (const s of scCargoShips) {
    const on = scCargoSel.has(s.shipDefId);
    const b = document.createElement('button');
    b.type = 'button';
    b.title = `${s.name} — ${s.cap.toLocaleString()} cargo`;
    b.style.cssText = `padding:2px; border-radius:6px; cursor:pointer; line-height:0;
      border:2px solid ${on ? '#2ea043' : '#30363d'}; background:${on ? '#193b22' : 'transparent'};`;
    if (s.imageUrl) {
      const img = document.createElement('img');
      img.src = s.imageUrl;
      img.style.cssText = 'width:28px; height:28px; object-fit:contain;';
      b.appendChild(img);
    } else {
      b.textContent = s.name;
      b.style.lineHeight = '';
    }
    b.addEventListener('click', () => {
      if (on) scCargoSel.delete(s.shipDefId); else scCargoSel.add(s.shipDefId);
      rememberSelection('sc-cargo-ships', [...scCargoSel]);
      renderCargoToggles();
      computeDebrisFuel();
      computeSalvageFuel();
    });
    box.appendChild(b);
  }
}

// Selected haulers as [{ shipDefId, cap }].
function selectedCargo() {
  return scCargoShips.filter(s => scCargoSel.has(s.shipDefId));
}

// Ships stationed on the selected planet, shown above both tables (one fetch):
// cargo-only above the debris table, every type above the investigation table.
async function updateAvail() {
  const debrisBox = document.getElementById('sc-debris-avail');
  const invBox = document.getElementById('sc-inv-avail');
  const planetId = Number(document.getElementById('sc-planet').value);
  if (!planetId || !scAllShips.length) { clearAvailStrip(debrisBox); clearAvailStrip(invBox); return; }
  const av = await browser.runtime.sendMessage({ type: 'GET_PLANET_SHIPS', planetId });
  if (av.error) { clearAvailStrip(debrisBox, av.error); clearAvailStrip(invBox, av.error); return; }
  renderAvailStrip(debrisBox, scCargoShips, av.available, 'No cargo ships on this planet.');
  renderAvailStrip(invBox, scAllShips, av.available, 'No ships on this planet.');
}

// Fewest selected haulers (largest-first, smallest fills the tail) to carry
// `total` cargo. Returns [{ shipDefId, quantity }].
function planFleet(total, ships) {
  const sorted = ships.filter(s => s.cap > 0).sort((a, b) => b.cap - a.cap);
  if (!sorted.length || total <= 0) return [];
  let rem = total;
  const out = [];
  for (let i = 0; i < sorted.length && rem > 0; i++) {
    const { shipDefId, cap } = sorted[i];
    const n = i === sorted.length - 1 ? Math.ceil(rem / cap) : Math.floor(rem / cap);
    if (n > 0) { out.push({ shipDefId, quantity: n }); rem -= n * cap; }
  }
  return out;
}

async function loadDebris() {
  const { debris_fields, debris_last_check } = await browser.storage.local.get(['debris_fields', 'debris_last_check']);
  scDebris = (debris_fields || []).map(f => ({ ...f, total: (f.ore || 0) + (f.silicates || 0) + (f.alloys || 0) }));
  document.getElementById('sc-debris-last').textContent = debris_last_check
    ? `Last check: ${new Date(debris_last_check).toLocaleString()}`
    : 'Not checked yet.';
  renderDebris();
}

function renderDebris() {
  const tbody = document.getElementById('sc-debris-tbody');
  tbody.textContent = '';

  if (pruneInvHistory()) saveInvHistory();   // expire stale history between polls

  // Header "show hidden" toggle reflects how many rows are hidden.
  const toggle = document.getElementById('sc-debris-hidden');
  toggle.style.display = scHiddenDebris.size ? '' : 'none';
  toggle.textContent = scShowHidden ? `Hide hidden (${scHiddenDebris.size})` : `Show hidden (${scHiddenDebris.size})`;

  // Systems with a collect fleet already in flight (persisted across reloads),
  // so a field isn't offered for collection twice.
  const collectingSystems = new Set((store.debris_active_runs || []).map(r => r.system_id).filter(v => v != null));

  // Keep just-launched fields on screen through the window where the game has
  // dropped them from debris_fields but the collect run hasn't shown up yet.
  // Drop a kept field once its run has been seen and then finished.
  const present = new Set(scDebris.map(f => f.systemId).filter(v => v != null));
  const kept = [];
  for (const [sys, ent] of scCollecting) {
    if (collectingSystems.has(sys)) ent.seenRun = true;
    else if (ent.seenRun) { scCollecting.delete(sys); continue; }   // run finished → field collected
    if (!present.has(sys)) kept.push(ent.field);
  }
  const source = kept.length ? scDebris.concat(kept) : scDebris;

  // Independent debris zone filter (empty = all zones) and the
  // investigation-history-only switch.
  const sorted = applySort('sc-debris-head', source, scDebrisSort, 'system')
    .filter(f => !scDebrisZoneFilter.size || scDebrisZoneFilter.has(f.zone))
    .filter(f => !scInvestigatedOnly || (f.systemId != null && scInvHistory.has(f.systemId)));
  const rows = scShowHidden ? sorted : sorted.filter(f => !scHiddenDebris.has(f.id));
  if (!rows.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 11; td.style.color = '#484f58';
    td.textContent = !scDebris.length ? 'No debris fields currently visible.'
      : (scDebrisZoneFilter.size || scInvestigatedOnly) ? 'No debris matches the current filter.'
      : 'All debris fields hidden.';
    tr.appendChild(td); tbody.appendChild(tr);
    return;
  }
  for (const f of rows) {
    const tr = document.createElement('tr');
    if (f.systemId != null) tr.dataset.system = f.systemId;
    tr.dataset.total = f.total || 0;
    const hidden = scHiddenDebris.has(f.id);
    if (hidden) tr.style.opacity = '0.45';

    const btnTd = document.createElement('td');
    const btn = document.createElement('button');
    const busy = f.debrisId != null && (scJustCollected.has(f.debrisId) || (f.systemId != null && collectingSystems.has(f.systemId)));
    const ok = f.debrisId != null && !busy;
    btn.textContent = busy ? 'Collecting…' : ok ? 'Collect' : '—';
    btn.disabled = !ok;
    btn.style.cssText = ok
      ? 'background:#238636; border:1px solid #2ea043; color:#fff; padding:6px 16px; border-radius:6px; cursor:pointer; font-size:0.85rem;'
      : 'background:#30363d; border:1px solid #30363d; color:#8b949e; padding:6px 16px; border-radius:6px; cursor:not-allowed; font-size:0.85rem;';
    if (ok) btn.addEventListener('click', () => collectDebris(f));
    btnTd.appendChild(btn);
    tr.appendChild(btnTd);

    const cells = [
      f.system,
      f.zone || '—',
      (f.ore || 0).toLocaleString(),
      (f.silicates || 0).toLocaleString(),
      (f.alloys || 0).toLocaleString(),
      (f.total || 0).toLocaleString(),
      '…',   // ship count, filled by computeDebrisFuel
      '…',   // fuel cost, filled async
      '…',   // travel time, filled async
    ];
    cells.forEach((v, i) => {
      const td = document.createElement('td');
      td.textContent = v;
      if (i === 1) td.style.color = ZONE_COLOR[f.zone] || '#8b949e';
      if (i === 6) td.className = 'sc-debris-shipn';
      if (i === 7) td.className = 'sc-debris-fuel';
      if (i === 8) td.className = 'sc-debris-time';
      tr.appendChild(td);
    });

    const hideTd = document.createElement('td');
    const hideBtn = document.createElement('button');
    hideBtn.textContent = hidden ? '↩' : '✕';
    hideBtn.title = hidden ? 'Unhide row' : 'Hide row';
    hideBtn.style.cssText = 'background:transparent; border:none; color:#8b949e; cursor:pointer; font-size:0.9rem;';
    hideBtn.addEventListener('click', () => {
      if (hidden) scHiddenDebris.delete(f.id); else scHiddenDebris.add(f.id);
      renderDebris();
    });
    hideTd.appendChild(hideBtn);
    tr.appendChild(hideTd);

    tbody.appendChild(tr);
  }
  computeDebrisFuel();
}

// Fill the debris Fuel Cost column for the auto-planned fleet (selected haulers
// sized to carry the whole field) from the selected planet.
let debrisFuelGen = 0;
async function computeDebrisFuel() {
  const gen = ++debrisFuelGen;
  const planetId = Number(document.getElementById('sc-planet').value);
  const sel = q => () => document.querySelectorAll(`#sc-debris-tbody td.${q}`);
  const fuelCells = sel('sc-debris-fuel');
  const shipCells = sel('sc-debris-shipn');
  const timeCells = sel('sc-debris-time');
  const cargo = selectedCargo();
  if (!cargo.length) {
    fuelCells().forEach(c => { c.textContent = '—'; c.title = 'Select cargo ships above'; });
    shipCells().forEach(c => { c.textContent = '—'; c.title = ''; });
    timeCells().forEach(c => { c.textContent = '—'; });
    return;
  }
  const nameOf = id => (scCargoShips.find(c => c.shipDefId === id) || {}).name || '#' + id;
  for (const tr of document.querySelectorAll('#sc-debris-tbody tr')) {
    if (gen !== debrisFuelGen) return;
    const ships = planFleet(Number(tr.dataset.total) || 0, cargo);
    const named = ships.map(s => `${s.quantity}× ${nameOf(s.shipDefId)}`).join(', ');
    const nCell = tr.querySelector('.sc-debris-shipn');
    if (nCell) nCell.textContent = ships.length ? named : '—';

    const cell = tr.querySelector('.sc-debris-fuel');
    const timeCell = tr.querySelector('.sc-debris-time');
    const sysId = Number(tr.dataset.system);
    if (!cell || !sysId) continue;
    if (!ships.length) { cell.textContent = '—'; if (timeCell) timeCell.textContent = '—'; continue; }
    const est = await fuelEstimate(planetId, sysId, ships);
    if (gen !== debrisFuelGen) return;
    if (est.error) { cell.textContent = '—'; cell.title = est.error; if (timeCell) timeCell.textContent = '—'; continue; }
    cell.textContent = `${est.fuelCost}`;
    cell.style.color = est.inRange === false ? '#ff7b72' : '';
    cell.title = est.inRange === false ? 'Out of range' : `distance ${est.distance.toFixed(1)} ly`;
    if (timeCell) timeCell.textContent = est.travelTime != null ? fmtCountdown(est.travelTime * 1000) : '—';
  }
}

async function collectDebris(field) {
  const status = document.getElementById('sc-progress');
  const planetId = Number(document.getElementById('sc-planet').value);
  const planet = scPlanets.find(p => p.id === planetId);

  const cargo = selectedCargo();
  const plan = planFleet(field.total, cargo);
  if (!plan.length) { status.textContent = 'Select cargo ships above first.'; return; }

  // Cap to what the source planet actually has; warn if that can't carry it all.
  const av = await browser.runtime.sendMessage({ type: 'GET_PLANET_SHIPS', planetId });
  if (av.error) { status.textContent = `Error: ${av.error}`; return; }
  const capOf = id => (scCargoShips.find(s => s.shipDefId === id) || {}).cap || 0;
  const ships = plan
    .map(s => ({ shipDefId: s.shipDefId, quantity: Math.min(s.quantity, av.available[s.shipDefId] || 0) }))
    .filter(s => s.quantity > 0);
  if (!ships.length) { status.textContent = 'None of the selected cargo ships are on this planet.'; return; }
  const carried = ships.reduce((sum, s) => sum + s.quantity * capOf(s.shipDefId), 0);
  const short = carried < field.total;

  if (!await confirmDialog(`Collect debris at ${field.system} (${field.total.toLocaleString()} cargo)?\n\n` +
    `From: ${planet ? planet.name : planetId}` +
    (short ? `\n\n⚠ Selected ships on this planet only carry ${carried.toLocaleString()} — collecting what fits.` : ''), ships)) return;

  status.textContent = `Collecting at ${field.system}…`;
  const res = await browser.runtime.sendMessage({
    type: 'COLLECT_DEBRIS', sourcePlanetId: planetId, debrisId: field.debrisId, ships,
  });
  if (res.error) { status.textContent = `Collect failed: ${res.error}`; return; }
  scJustCollected.add(field.debrisId);
  if (field.systemId != null) scCollecting.set(field.systemId, { field: { ...field }, seenRun: false });
  // Loot claimed — drop this system from the investigation history.
  if (field.systemId != null && scInvHistory.delete(field.systemId)) saveInvHistory();
  status.textContent = `Fleet sent to ${field.system} ✓`;
  renderDebris();
  updateAvail();
}

// ── Uncollected salvage ─────────────────────────────────────────────────────

const RES_LABEL = { ore: 'Ore', silicates: 'Sil', hydrogen: 'Hyd', alloys: 'Alloy',
  ice: 'Ice', quantum_dust: 'Q.Dust', plasma_core: 'Plasma', dark_matter: 'D.Matter', antimatter: 'Antim' };

function renderSalvage() {
  const tbody = document.getElementById('sc-salvage-tbody');
  tbody.textContent = '';
  document.getElementById('sc-salvage-count').textContent = `${scSalvage.length} awaiting collection`;
  const now = Date.now();

  const sorted = applySort('sc-salvage-head', scSalvage, scSalvageSort, 'system');
  if (!sorted.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 9; td.style.color = '#484f58';
    td.textContent = 'No uncollected salvage.';
    tr.appendChild(td); tbody.appendChild(tr);
    return;
  }

  for (const s of sorted) {
    const tr = document.createElement('tr');
    if (s.systemId != null) tr.dataset.system = s.systemId;
    tr.dataset.total = s.total || 0;
    if (s.expires) tr.dataset.expires = s.expires;

    const btnTd = document.createElement('td');
    const btn = document.createElement('button');
    const busy = scJustSalvaged.has(s.reportId);
    btn.textContent = busy ? 'Collecting…' : 'Collect';
    btn.disabled = busy;
    btn.style.cssText = busy
      ? 'background:#30363d; border:1px solid #30363d; color:#8b949e; padding:6px 16px; border-radius:6px; cursor:not-allowed; font-size:0.85rem;'
      : 'background:#238636; border:1px solid #2ea043; color:#fff; padding:6px 16px; border-radius:6px; cursor:pointer; font-size:0.85rem;';
    if (!busy) btn.addEventListener('click', () => collectSalvage(s));
    btnTd.appendChild(btn);
    tr.appendChild(btnTd);

    const breakdown = Object.entries(s.res)
      .map(([k, v]) => `${RES_LABEL[k] || k} ${v.toLocaleString()}`).join(', ');
    const cells = [
      s.system,
      s.zone || '—',
      breakdown,
      (s.total || 0).toLocaleString(),
      '…',   // ship count, filled by computeSalvageFuel
      '…',   // fuel cost, filled async
      '…',   // travel time, filled async
      s.expires ? fmtCountdown(new Date(s.expires) - now) : '—',
    ];
    cells.forEach((v, i) => {
      const td = document.createElement('td');
      td.textContent = v;
      if (i === 1) td.style.color = ZONE_COLOR[s.zone] || '#8b949e';
      if (i === 4) td.className = 'sc-salvage-shipn';
      if (i === 5) td.className = 'sc-salvage-fuel';
      if (i === 6) td.className = 'sc-salvage-time';
      if (i === 7) td.className = 'sc-salvage-timer';
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  }
  computeSalvageFuel();
}

// Mirror computeDebrisFuel: plan the selected haulers to carry the whole salvage
// and estimate fuel/time from the source planet.
let salvageFuelGen = 0;
async function computeSalvageFuel() {
  const gen = ++salvageFuelGen;
  const planetId = Number(document.getElementById('sc-planet').value);
  const sel = q => () => document.querySelectorAll(`#sc-salvage-tbody td.${q}`);
  const fuelCells = sel('sc-salvage-fuel');
  const shipCells = sel('sc-salvage-shipn');
  const timeCells = sel('sc-salvage-time');
  const cargo = selectedCargo();
  if (!cargo.length) {
    fuelCells().forEach(c => { c.textContent = '—'; c.title = 'Select cargo ships above'; });
    shipCells().forEach(c => { c.textContent = '—'; c.title = ''; });
    timeCells().forEach(c => { c.textContent = '—'; });
    return;
  }
  const nameOf = id => (scCargoShips.find(c => c.shipDefId === id) || {}).name || '#' + id;
  for (const tr of document.querySelectorAll('#sc-salvage-tbody tr')) {
    if (gen !== salvageFuelGen) return;
    const ships = planFleet(Number(tr.dataset.total) || 0, cargo);
    const named = ships.map(s => `${s.quantity}× ${nameOf(s.shipDefId)}`).join(', ');
    const nCell = tr.querySelector('.sc-salvage-shipn');
    if (nCell) nCell.textContent = ships.length ? named : '—';

    const cell = tr.querySelector('.sc-salvage-fuel');
    const timeCell = tr.querySelector('.sc-salvage-time');
    const sysId = Number(tr.dataset.system);
    if (!cell || !sysId) continue;
    if (!ships.length) { cell.textContent = '—'; if (timeCell) timeCell.textContent = '—'; continue; }
    const est = await fuelEstimate(planetId, sysId, ships);
    if (gen !== salvageFuelGen) return;
    if (est.error) { cell.textContent = '—'; cell.title = est.error; if (timeCell) timeCell.textContent = '—'; continue; }
    cell.textContent = `${est.fuelCost}`;
    cell.style.color = est.inRange === false ? '#ff7b72' : '';
    cell.title = est.inRange === false ? 'Out of range' : `distance ${est.distance.toFixed(1)} ly`;
    if (timeCell) timeCell.textContent = est.travelTime != null ? fmtCountdown(est.travelTime * 1000) : '—';
  }
}

async function collectSalvage(salvage) {
  const status = document.getElementById('sc-progress');
  const planetId = Number(document.getElementById('sc-planet').value);
  const planet = scPlanets.find(p => p.id === planetId);

  const cargo = selectedCargo();
  const plan = planFleet(salvage.total, cargo);
  if (!plan.length) { status.textContent = 'Select cargo ships above first.'; return; }

  // Cap to what the source planet has; warn if that can't carry it all.
  const av = await browser.runtime.sendMessage({ type: 'GET_PLANET_SHIPS', planetId });
  if (av.error) { status.textContent = `Error: ${av.error}`; return; }
  const capOf = id => (scCargoShips.find(s => s.shipDefId === id) || {}).cap || 0;
  const ships = plan
    .map(s => ({ shipDefId: s.shipDefId, quantity: Math.min(s.quantity, av.available[s.shipDefId] || 0) }))
    .filter(s => s.quantity > 0);
  if (!ships.length) { status.textContent = 'None of the selected cargo ships are on this planet.'; return; }
  const carried = ships.reduce((sum, s) => sum + s.quantity * capOf(s.shipDefId), 0);
  const short = carried < salvage.total;

  if (!await confirmDialog(`Collect salvage at ${salvage.system} (${salvage.total.toLocaleString()} cargo)?\n\n` +
    `From: ${planet ? planet.name : planetId}` +
    (short ? `\n\n⚠ Selected ships on this planet only carry ${carried.toLocaleString()} — collecting what fits.` : ''), ships)) return;

  status.textContent = `Collecting salvage at ${salvage.system}…`;
  const res = await browser.runtime.sendMessage({
    type: 'COLLECT_SALVAGE', sourcePlanetId: planetId, reportId: salvage.reportId, ships,
  });
  if (res.error) { status.textContent = `Collect failed: ${res.error}`; return; }
  scJustSalvaged.add(salvage.reportId);
  status.textContent = `Fleet sent to ${salvage.system} ✓`;
  renderSalvage();
  updateAvail();
}
