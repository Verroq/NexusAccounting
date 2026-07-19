// Xeno tab: scans outward from a source planet for the nearest system holding
// an unowned "Ancient" moon and launches a ruins survey there.
//
// Ruins survey: POST /api/fleet/xeno-survey { sourcePlanetId, targetMoonId, ships }
// (confirmed against a live send).
//
// Eligibility (the game exposes no moon cooldown/survey-state field anywhere,
// so this is a best-effort proxy): moonType 'ancient' AND unowned
// (userId == null), and not already targeted by an in-flight xeno_survey
// (checked via GET_MISSIONS' cargo._targetMoonId) so the scan doesn't
// re-target a moon already inbound.

import { SCAN_CACHE_MAX, getSystemPlanets } from './finder.js';
import { loadFleetTemplates } from './fleets.js';
import { clearAvailStrip, confirmDialog, fmtCountdown, makeMissionBar, rememberSelection, rememberedSelections, renderAvailStrip } from '../common.js';

const XENO_CACHE_TTL = 24 * 3600 * 1000;   // moon ownership rarely changes

let inited = false;
let xnPlanets = [];
let xnTemplates = [];
let xnMap = null;          // { systems, byId } from GET_GALAXY_MAP, cached
let xnRunning = false;
let xnMissions = [];       // in-flight xeno_survey missions
let xnTicks = [];

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
  }, 1000);

  status.textContent = '';
  updateAvail();
  refreshMissions();
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

// The nearest unowned Ancient moon not already targeted by an in-flight ruins
// survey, scanning outward system-by-system from `src` (reuses finder.js's
// shared per-system cache). Returns { moon, system, distance } or null.
async function findNearestAncientMoon(src, srcSystemId, targetedMoonIds, onProgress) {
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
        m.moonType === 'ancient' && m.userId == null && !targetedMoonIds.has(m.id));
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

  const mi = await browser.runtime.sendMessage({ type: 'GET_MISSIONS' });
  const targetedMoonIds = new Set((mi.missions || [])
    .filter(m => m.missionType === 'xeno_survey')
    .map(m => m.cargo && m.cargo._targetMoonId)
    .filter(id => id != null));

  xnRunning = true;
  btn.textContent = 'Stop';
  status.textContent = 'Scanning for the nearest Ancient moon…';
  let found;
  try {
    found = await findNearestAncientMoon(src, planet.systemId, targetedMoonIds,
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
  setTimeout(refreshMissions, 2000);   // retry for post-POST API lag
}
