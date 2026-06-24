// Scouting tab: launch probe surveys at the nearest un-surveyed system, and
// list anomalies awaiting investigation with a one-click investigate fleet.
//
// Survey:      POST /api/fleet/survey      { sourcePlanetId, targetSystemId, ships }
// Investigate: POST /api/fleet/investigate { sourcePlanetId, reportId, ships }
// Both routed through the game tab (same-origin) like the asteroid mine call.

import { loadFleetTemplates } from './fleets.js';

let inited = false;
let scPlanets = [];          // [{ id, name, systemId, systemName }]
let scSystems = {};          // systemId → { x, y, name, zone }
let scTemplates = [];

const ZONES = ['sentinel', 'open', 'dead', 'rift'];
const ZONE_COLOR = { sentinel: '#56d364', open: '#f0883e', dead: '#ff7b72', rift: '#bc8cff' };
const scZoneFilter = new Set();   // empty = any zone
let scPending = [];               // anomalies awaiting investigation
let scInvestigating = new Set();  // systemIds with an investigate mission in flight
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

  drawZoneToggles();
  await refreshTemplates();
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.fleet_templates) refreshTemplates();
  });

  document.getElementById('sc-scan').addEventListener('click', launchScan);
  document.getElementById('sc-refresh').addEventListener('click', loadActiveSurveys);
  document.getElementById('sc-planet').addEventListener('change', renderSurveys);
  document.getElementById('sc-inv-template').addEventListener('change', computeFuel);

  // Tick the countdowns every second; refetch the list every 30s. Both only
  // while the tab is visible.
  setInterval(() => {
    if (document.getElementById('scouting-content').style.display === 'none') return;
    tickTimers();
    if (++scTick % 30 === 0) loadActiveSurveys();
  }, 1000);

  status.textContent = '';
  loadActiveSurveys();
}

async function refreshTemplates() {
  scTemplates = await loadFleetTemplates();
  for (const id of ['sc-scan-template', 'sc-inv-template']) {
    const sel = document.getElementById(id);
    const cur = sel.value;
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
    if (cur && scTemplates.some(t => String(t.id) === cur)) sel.value = cur;
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
// Empty selection means any zone.
function drawZoneToggles() {
  const box = document.getElementById('sc-zone');
  box.textContent = '';
  for (const z of ZONES) {
    const b = document.createElement('button');
    const on = scZoneFilter.has(z);
    b.type = 'button';
    b.textContent = z;
    b.style.cssText = `padding:4px 10px; border-radius:6px; cursor:pointer; font-size:0.8rem;
      border:1px solid ${ZONE_COLOR[z]}; text-transform:capitalize;
      color:${on ? '#0d1117' : ZONE_COLOR[z]}; background:${on ? ZONE_COLOR[z] : 'transparent'};`;
    b.addEventListener('click', () => {
      if (on) scZoneFilter.delete(z); else scZoneFilter.add(z);
      drawZoneToggles();
    });
    box.appendChild(b);
  }
}

// Nearest system to the source planet that isn't on survey cooldown and, if any
// zones are selected, sits in one of them.
function nearestTarget(srcSystemId, onCooldown) {
  const src = scSystems[srcSystemId];
  if (!src) return null;
  let best = null, bestD = Infinity;
  for (const [id, s] of Object.entries(scSystems)) {
    const sid = Number(id);
    if (sid === srcSystemId || onCooldown.has(sid)) continue;
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

  const target = nearestTarget(planet ? planet.systemId : null, onCooldown);
  if (!target) {
    const zs = scZoneFilter.size ? [...scZoneFilter].join('/') + ' ' : '';
    status.textContent = `No available ${zs}system to survey.`;
    return;
  }

  const r = await templateShips(document.getElementById('sc-scan-template').value, planetId);
  if (r.error) { status.textContent = r.error; return; }
  const summary = r.ships.map(s => `${s.quantity}× #${s.shipDefId}`).join(', ');
  if (!confirm(`Survey ${target.name} (${target.dist} away)?\n\n` +
    `From: ${planet ? planet.name : planetId}\nTemplate: ${r.name}\nShips: ${summary}` +
    (r.short ? '\n\n⚠ Some template ships are short; sending what is available.' : ''))) return;

  status.textContent = `Surveying ${target.name}…`;
  const res = await browser.runtime.sendMessage({
    type: 'SEND_SURVEY', sourcePlanetId: planetId, targetSystemId: target.id, ships: r.ships,
  });
  status.textContent = res.error ? `Survey failed: ${res.error}` : `Probe sent to ${target.name} ✓`;
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
  scInvestigating = new Set((mi.missions || [])
    .filter(m => m.missionType === 'investigate' && m.targetSystemId != null)
    .map(m => m.targetSystemId));
  const now = Date.now();
  const exp = r => (r.anomalyExpiresAt ? new Date(r.anomalyExpiresAt).getTime() : Infinity);
  scPending = (res.reports || [])
    .filter(r => !r.investigated && (!r.anomalyExpiresAt || new Date(r.anomalyExpiresAt) > now))
    .sort((a, b) => exp(a) - exp(b));   // soonest expiry first
  renderSurveys();
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
      r.anomalyExpiresAt ? fmtCountdown(new Date(r.anomalyExpiresAt) - now) : '—',
    ];
    cells.forEach((v, i) => {
      const td = document.createElement('td');
      td.textContent = v;
      if (i === 2) td.style.color = ZONE_COLOR[r.securityZone] || '#8b949e';
      if (i === 3) td.className = 'sc-fuel';
      if (i === 4) td.className = 'sc-timer';
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
  const cells = () => document.querySelectorAll('#sc-surveys-tbody td.sc-fuel');
  // Estimate uses the template as designed (not capped to the planet's stock).
  const tpl = scTemplates.find(t => String(t.id) === document.getElementById('sc-inv-template').value);
  const ships = Object.entries(tpl ? tpl.ships : {})
    .map(([shipDefId, quantity]) => ({ shipDefId: Number(shipDefId), quantity }))
    .filter(s => s.quantity > 0);
  if (!ships.length) {
    cells().forEach(c => { c.textContent = '—'; c.title = tpl ? 'Template has no ships' : 'No template selected'; });
    return;
  }

  for (const tr of document.querySelectorAll('#sc-surveys-tbody tr')) {
    if (gen !== fuelGen) return;
    const cell = tr.querySelector('.sc-fuel');
    const sysId = Number(tr.dataset.system);
    if (!cell || !sysId) continue;
    const est = await browser.runtime.sendMessage({
      type: 'GET_FUEL_ESTIMATE',
      body: { sourcePlanetId: planetId, targetSystemId: sysId, ships },
    });
    if (gen !== fuelGen) return;
    if (est.error) { cell.textContent = '—'; cell.title = est.error; continue; }
    cell.textContent = `${est.fuelCost}`;
    cell.style.color = est.inRange === false ? '#ff7b72' : '';
    cell.title = est.inRange === false ? 'Out of range' : `distance ${est.distance.toFixed(1)} ly`;
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
}

async function investigate(report) {
  const status = document.getElementById('sc-progress');
  const planetId = Number(document.getElementById('sc-planet').value);
  const planet = scPlanets.find(p => p.id === planetId);

  const r = await templateShips(document.getElementById('sc-inv-template').value, planetId);
  if (r.error) { status.textContent = r.error; return; }
  const summary = r.ships.map(s => `${s.quantity}× #${s.shipDefId}`).join(', ');
  if (!confirm(`Investigate ${report.systemName} (${report.eventTitle || report.eventType})?\n\n` +
    `From: ${planet ? planet.name : planetId}\nTemplate: ${r.name}\nShips: ${summary}` +
    (r.short ? '\n\n⚠ Some template ships are short; sending what is available.' : ''))) return;

  status.textContent = `Investigating ${report.systemName}…`;
  const res = await browser.runtime.sendMessage({
    type: 'SEND_INVESTIGATE', sourcePlanetId: planetId, reportId: report.id, ships: r.ships,
  });
  if (res.error) { status.textContent = `Investigate failed: ${res.error}`; return; }
  status.textContent = `Fleet sent to ${report.systemName} ✓`;
  loadActiveSurveys();
}
