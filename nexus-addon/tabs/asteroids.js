// Asteroids Fields tab: asteroid fields in the N nearest explored systems to a
// chosen planet (type, content, multiplier, security zone, distance, miner).
//
//   /api/galaxy/map                        → all systems with coords + sector id
//   /api/galaxy/sectors/{sectorId}/systems → name/zone/planetCount for a sector
//   /api/galaxy/systems/{id}/planets       → that system's asteroidFields
// Per-system scans reuse the finder's shared cache.

import { SCAN_CACHE_MAX, getSystemPlanets } from './finder.js';
import { loadFleetTemplates } from './fleets.js';
import { clearAvailStrip, editFleetDialog, fuelEstimate, rememberSelection, rememberedSelections, renderAvailStrip } from '../common.js';

const ICON_BASE = 'https://s0.nexuslegacy.space/images/resources/';
// asteroid fieldType → resource icon + label
const FIELD_TYPES = [
  { type: 'ore', res: 'ore', label: 'ore', color: '#f0883e' },
  { type: 'gas', res: 'hydrogen', label: 'gas (hydrogen)', color: '#a371f7' },
  { type: 'ice', res: 'cryo_ice', label: 'ice (cryo-ice)', color: '#a5d6ff' },
  { type: 'plasma', res: 'plasma_core', label: 'plasma (core)', color: '#ff7b72' },
  { type: 'quantum', res: 'quantum_dust', label: 'quantum (dust)', color: '#d2a8ff' },
  { type: 'dark', res: 'dark_matter', label: 'dark (matter)', color: '#6e40c9' },
];
const TYPE_COLOR = Object.fromEntries(FIELD_TYPES.map(t => [t.type, t.color]));
// Ship recommendation per asteroid field type: specialized ship + per-cycle
// extraction of that resource (Stats.txt "Mining extraction capacity").
const REC_SHIP = {
  ore: ['Mining Vessel', 50], plasma: ['Mining Vessel', 25],
  gas: ['Gas Collector', 17], quantum: ['Gas Collector', 3],
  ice: ['Ice Drill', 25], dark: ['Ice Drill', 3],
};
const REC_CYCLES = 10;   // ships to clear the field in this many mining cycles
const EXCAVATOR_BONUS = 1.2;   // +20% fleet extraction capacity when an Excavator is present
const afExcavator = () => document.getElementById('af-excavator').checked;
// Mining ships the recommendation manages; other template ships (escort/combat)
// are left untouched when seeding the launch fleet.
const MINING_SHIPS = new Set([...Object.values(REC_SHIP).map(s => s[0]), 'Excavator']);
// Security-zone colours: safe → hostile.
const ZONE_COLOR = {
  sentinel: '#56d364', open: '#f0883e', dead: '#ff7b72', rift: '#bc8cff', unknown: '#8b949e',
};
const ZONES = ['sentinel', 'open', 'dead', 'rift'];
const afTypeFilter = new Set();    // empty = any; multi-select like the market
const afZoneFilter = new Set();    // empty = any
const lsTypeFilter = new Set();    // live-search type filter (independent)
const lsZoneFilter = new Set();    // live-search zone filter (independent)

let afInited = false;
let afPlanets = [];                // [{ id, name, systemId, systemName, isHomeworld }]
let afRefMS = null;                // chosen reference planet system coords
let afFields = [];                 // scanned asteroid fields
let afRunning = false;
let afSort = { key: 'distance', dir: 1 };
let afPage = 1;
const AF_PER_PAGE = 25;
const MINING_DURATION = 600;   // seconds; fixed for asteroid mining missions
const ASTEROID_CACHE_TTL = 15 * 60 * 1000;   // fields drain fast — refetch after 15 min
let afTemplates = [];        // fleet templates, managed in the Fleets tab
let afMap = null;            // { byId: {id→{x,y,sectorId,visibility}}, systems: [...] }, cached
const sectorSystems = {};   // sectorId → systems[] (name/zone/planetCount), cached
let afAllShips = [];        // every ship def: [{ shipDefId, name, imageUrl }]
let afAvailTimer = null;    // periodic availability poll
let afMyUsername = null;    // this player's username, to spot fields already mined by us
let afMiningFieldIds = new Set();   // fieldIds with an in-flight/active mine mission
const allianceTagCache = {};   // player name → alliance tag (or null), session cache

// Resolve alliance tags for a set of player names not already cached.
async function resolveAllianceTags(names) {
  const need = [...new Set(names)].filter(n => n && !(n in allianceTagCache));
  await Promise.all(need.map(async name => {
    const res = await browser.runtime.sendMessage({ type: 'GET_PLAYER_ALLIANCE_TAG', name });
    allianceTagCache[name] = (res && res.tag) || null;
  }));
}

export async function initAsteroidsTab() {
  if (afInited) return;
  afInited = true;
  const status = document.getElementById('af-progress');
  status.textContent = 'Loading…';

  const planets = await browser.runtime.sendMessage({ type: 'GET_PLANETS' });
  if (planets.error) { status.textContent = `Error: ${planets.error}`; afInited = false; return; }
  afPlanets = (planets.planets || []).filter(p => p.systemId != null);

  const me = await browser.runtime.sendMessage({ type: 'GET_AUTH_ME' });
  afMyUsername = (me && !me.error && me.user) ? me.user.username : null;

  const pSel = document.getElementById('af-planet');
  const lsSel = document.getElementById('ls-planet');
  pSel.textContent = ''; lsSel.textContent = '';
  for (const p of afPlanets) {
    const label = p.systemName ? `${p.name} (${p.systemName})` : p.name;
    const o = document.createElement('option');
    o.value = p.id; o.textContent = label;
    if (p.isHomeworld) o.selected = true;
    pSel.appendChild(o);
    const o2 = document.createElement('option');
    o2.value = p.id; o2.textContent = label;
    if (p.isHomeworld) o2.selected = true;
    lsSel.appendChild(o2);
  }
  const savedSel = await rememberedSelections();
  if (savedSel['af-planet'] && afPlanets.some(p => String(p.id) === savedSel['af-planet'])) {
    pSel.value = savedSel['af-planet'];   // remembered planet survives tabs/sessions
  }

  drawTypeIcons();
  drawZoneToggles();
  await loadLiveSearch();   // populate ls-* fields + button from saved config
  refreshSlots();

  await refreshTemplates();
  // Keep the selector in sync with edits made in the Fleets tab.
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.fleet_templates) refreshTemplates();
    // Live search can be stopped from the game-page results window — reflect it.
    if (changes.live_search) {
      const en = !!(changes.live_search.newValue && changes.live_search.newValue.enabled);
      if (en !== lsRunning) { lsRunning = en; setLsButton(); }
    }
  });

  pSel.addEventListener('change', () => { rememberSelection('af-planet', pSel.value); setRefFromMap(pSel.value); renderAsteroids(); updateAfAvail(); });
  document.getElementById('af-scan').addEventListener('click', scan);
  document.getElementById('af-template-select').addEventListener('change', e => { rememberSelection('af-template-select', e.target.value); computeFuel(); });
  const excChk = document.getElementById('af-excavator');
  excChk.checked = localStorage.getItem('nx-af-excavator') === '1';
  excChk.addEventListener('change', () => { localStorage.setItem('nx-af-excavator', excChk.checked ? '1' : '0'); renderAsteroids(); });
  document.getElementById('af-results-head').addEventListener('click', e => {
    const th = e.target.closest('th.sortable');
    if (!th) return;
    afSort = { key: th.dataset.key, dir: afSort.key === th.dataset.key ? -afSort.dir : -1 };
    afPage = 1;
    renderAsteroids();
  });
  document.getElementById('af-btn-prev').addEventListener('click', () => { afPage--; renderAsteroids(); });
  document.getElementById('af-btn-next').addEventListener('click', () => { afPage++; renderAsteroids(); });
  for (const id of ['af-mult-min', 'af-qty-min', 'af-left-min']) {
    document.getElementById(id).addEventListener('input', e => {
      if (parseFloat(e.target.value) < 0) e.target.value = '';   // positive only
      afPage = 1;
      renderAsteroids();
    });
  }

  // Live-search controls.
  document.getElementById('ls-search').addEventListener('click', toggleLiveSearch);
  document.getElementById('ls-planet').addEventListener('change', saveLiveSearchIfOn);
  for (const id of ['ls-mult-min', 'ls-qty-min', 'ls-left-min', 'ls-near']) {
    document.getElementById(id).addEventListener('input', e => {
      if (parseFloat(e.target.value) < 0) e.target.value = '';   // positive only
      saveLiveSearchIfOn();
    });
  }

  // Ship catalog (names + icons) for the availability strip, then start it.
  const defs = await browser.runtime.sendMessage({ type: 'GET_SHIP_DEFS' });
  afAllShips = (defs.ships || []).map(s => ({ shipDefId: s.shipDefId, name: s.name, imageUrl: s.imageUrl }));
  updateAfAvail();
  if (!afAvailTimer) {
    afAvailTimer = setInterval(() => {
      if (document.getElementById('asteroids-content').style.display !== 'none') { updateAfAvail(); refreshSlots(); }
    }, 10000);   // catch returning mining fleets without a reload
  }

  status.textContent = 'Pick how many nearest systems to scan, then Scan.';
}

// Ships stationed on the selected mining planet, shown above the fields table.
async function updateAfAvail() {
  const box = document.getElementById('af-avail');
  const planetId = Number(document.getElementById('af-planet').value);
  if (!planetId || !afAllShips.length) { clearAvailStrip(box); return; }
  const av = await browser.runtime.sendMessage({ type: 'GET_PLANET_SHIPS', planetId });
  if (av.error) { clearAvailStrip(box, av.error); return; }
  renderAvailStrip(box, afAllShips, av.available, 'No ships on this planet.');
}

// Galaxy map (all systems with coords + sector id), fetched once and cached.
async function loadMap() {
  if (afMap) return afMap;
  const res = await browser.runtime.sendMessage({ type: 'GET_GALAXY_MAP' });
  if (res.error) throw new Error(res.error);
  const systems = res.systems || [];
  const byId = {};
  for (const s of systems) byId[s.id] = s;
  afMap = { systems, byId };
  return afMap;
}

// Systems of a sector (with name/zone/planetCount/visibility), cached.
async function sectorSystemsFor(sectorId) {
  if (sectorSystems[sectorId]) return sectorSystems[sectorId];
  const res = await browser.runtime.sendMessage({ type: 'GET_SECTOR_SYSTEMS', sectorId });
  if (res.error) throw new Error(res.error);
  sectorSystems[sectorId] = res.systems || [];
  return sectorSystems[sectorId];
}

// Set the distance reference from the cached map (no fetch if map isn't loaded).
function setRefFromMap(planetId) {
  afRefMS = null;
  const p = afPlanets.find(x => x.id === Number(planetId));
  const sys = p && afMap && afMap.byId[p.systemId];
  if (sys) afRefMS = { x: sys.x, y: sys.y };
}

// Clickable resource-icon type toggles (mirrors the market filter). Empty
// selection means all types. `redraw` re-renders the set; `after` runs side
// effects (re-render table for the main filter, save config for live search).
function drawTypeInto(boxId, filter, redraw, after) {
  const box = document.getElementById(boxId);
  box.textContent = '';
  for (const t of FIELD_TYPES) {
    const img = document.createElement('img');
    img.className = 'res-icon' + (filter.has(t.type) ? ' sel' : '');
    img.src = `${ICON_BASE}${t.res}.webp`;
    img.alt = t.label;
    img.title = t.label;
    img.addEventListener('click', () => {
      if (filter.has(t.type)) filter.delete(t.type); else filter.add(t.type);
      redraw();
      if (after) after();
    });
    box.appendChild(img);
  }
}

// Clickable zone toggles, coloured per zone. Empty selection means all zones.
function drawZoneInto(boxId, filter, redraw, after) {
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
      if (after) after();
    });
    box.appendChild(b);
  }
}

// Main fields filter: re-render the table on toggle.
function drawTypeIcons() { drawTypeInto('af-type', afTypeFilter, drawTypeIcons, () => { afPage = 1; renderAsteroids(); }); }
function drawZoneToggles() { drawZoneInto('af-zone', afZoneFilter, drawZoneToggles, () => { afPage = 1; renderAsteroids(); }); }
// Live-search filter: persist config on toggle (if currently running).
function drawLsTypeIcons() { drawTypeInto('ls-type', lsTypeFilter, drawLsTypeIcons, saveLiveSearchIfOn); }
function drawLsZoneToggles() { drawZoneInto('ls-zone', lsZoneFilter, drawLsZoneToggles, saveLiveSearchIfOn); }

// ── Live search (background, every 5 min) ──────────────────────────────────
let lsRunning = false;

function readLsConfig() {
  const num = id => { const v = parseFloat(document.getElementById(id).value); return isNaN(v) ? null : v; };
  return {
    enabled: lsRunning,
    planetId: Number(document.getElementById('ls-planet').value) || null,
    multMin: num('ls-mult-min'),
    qtyMin: num('ls-qty-min'),
    leftMin: num('ls-left-min'),
    near: Math.max(1, Math.min(500, parseInt(document.getElementById('ls-near').value, 10) || 25)),
    types: [...lsTypeFilter],
    zones: [...lsZoneFilter],
  };
}
function saveLiveSearch() { return browser.runtime.sendMessage({ type: 'SET_LIVE_SEARCH', config: readLsConfig() }); }
function saveLiveSearchIfOn() { if (lsRunning) saveLiveSearch(); }

function setLsButton() {
  const btn = document.getElementById('ls-search');
  const status = document.getElementById('ls-status');
  btn.textContent = lsRunning ? 'Stop Live Search' : 'Live Search';
  btn.style.cssText = lsRunning ? 'background:#da3633; border:1px solid #f85149; color:#fff;' : '';
  if (!lsRunning) { status.textContent = ''; status.style.color = '#8b949e'; return; }
  if (!lsTypeFilter.size) {
    status.textContent = '⚠ No resource type selected — every field type will match.';
    status.style.color = '#e3b341';
  } else {
    status.textContent = 'Scanning every 5 min in the background — notifies on new matches.';
    status.style.color = '#8b949e';
  }
}
async function toggleLiveSearch() {
  if (!lsRunning && !document.getElementById('ls-planet').value) return;   // need a planet
  lsRunning = !lsRunning;
  setLsButton();
  await saveLiveSearch();
}

// Restore the live-search controls from the persisted config.
async function loadLiveSearch() {
  const { live_search: cfg } = await browser.storage.local.get('live_search');
  if (cfg) {
    if (cfg.planetId != null) document.getElementById('ls-planet').value = cfg.planetId;
    document.getElementById('ls-mult-min').value = cfg.multMin ?? '';
    document.getElementById('ls-qty-min').value = cfg.qtyMin ?? '';
    document.getElementById('ls-left-min').value = cfg.leftMin ?? '';
    document.getElementById('ls-near').value = cfg.near ?? 25;
    lsTypeFilter.clear(); (cfg.types || []).forEach(t => lsTypeFilter.add(t));
    lsZoneFilter.clear(); (cfg.zones || []).forEach(z => lsZoneFilter.add(z));
    lsRunning = !!cfg.enabled;
  }
  drawLsTypeIcons();
  drawLsZoneToggles();
  setLsButton();
}

async function scan() {
  const btn = document.getElementById('af-scan');
  if (afRunning) { afRunning = false; return; }

  const status = document.getElementById('af-progress');
  const planetId = Number(document.getElementById('af-planet').value);
  const p = afPlanets.find(x => x.id === planetId);
  if (!p) return;
  const count = Math.max(1, Math.min(500, parseInt(document.getElementById('af-near').value, 10) || 25));

  status.textContent = 'Loading galaxy map…';
  let map;
  try { map = await loadMap(); } catch (e) { status.textContent = `Error: ${e.message}`; return; }
  const src = map.byId[p.systemId];
  if (!src) { status.textContent = 'Source system not on the map.'; return; }
  afRefMS = { x: src.x, y: src.y };

  // The N nearest explored systems (asteroid fields need at least partial vis).
  const targets = map.systems
    .filter(s => s.id !== p.systemId && (s.visibility === 'full' || s.visibility === 'partial'))
    .map(s => ({ s, d: Math.hypot(s.x - src.x, s.y - src.y) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, count)
    .map(o => o.s);
  if (!targets.length) { status.textContent = 'No explored systems nearby.'; return; }

  const { planet_scan_cache } = await browser.storage.local.get('planet_scan_cache');
  const cache = planet_scan_cache || {};

  afRunning = true;
  btn.textContent = 'Stop';
  afFields = [];
  afPage = 1;
  let scanned = 0, errors = 0;
  try {
    for (const sys of targets) {
      if (!afRunning) break;
      // name/zone/planetCount come from the system's sector (cached per sector).
      let meta;
      try {
        meta = (await sectorSystemsFor(sys.sectorId)).find(s => s.id === sys.id);
      } catch { errors++; continue; }
      if (!meta || !meta.planetCount) { scanned++; continue; }   // no bodies → no fields
      let data;
      try {
        data = await getSystemPlanets(sys.id, cache, ASTEROID_CACHE_TTL);
      } catch { errors++; scanned++; continue; }
      for (const f of (data.asteroidFields || [])) {
        afFields.push({
          fieldId: f.id,
          name: f.name || `#${f.id}`,
          system: meta.name || `#${sys.id}`,
          systemId: sys.id,
          type: f.fieldType || '—',
          mult: f.richness ?? null,
          remaining: f.remainingResources ?? null,
          total: f.totalResources ?? null,
          zone: meta.securityZone || '—',
          sx: sys.x, sy: sys.y,
          minerPresent: f.controllerName || null,
          ownerName: (f.outpostShieldMaxHp ?? 0) > 0 ? (f.controllerName || null) : null,
        });
      }
      scanned++;
      if (scanned % 10 === 0) {
        status.textContent = `Scanning… ${scanned}/${targets.length} systems, ${afFields.length} fields.`;
        renderAsteroids();
      }
      await new Promise(r => setTimeout(r, 80)); // be polite to the game API
    }
  } finally {
    afRunning = false;
    btn.textContent = 'Scan';
  }

  // Persist the shared scan cache, oldest entries dropped first.
  const ids = Object.keys(cache);
  if (ids.length > SCAN_CACHE_MAX) {
    ids.sort((a, b) => cache[a].at - cache[b].at)
      .slice(0, ids.length - SCAN_CACHE_MAX)
      .forEach(id => delete cache[id]);
  }
  await browser.storage.local.set({ planet_scan_cache: cache });

  await resolveAllianceTags(afFields.filter(f => f.ownerName).map(f => f.ownerName));

  status.textContent = `Done: ${afFields.length} fields in ${scanned} systems` +
    (errors ? ` · ${errors} skipped (errors)` : '') + '.';
  renderAsteroids();
}

function distance(f) {
  if (!afRefMS || f.sx == null) return null;
  return Math.round(Math.hypot(f.sx - afRefMS.x, f.sy - afRefMS.y));
}

// Recommended fleet to clear a field in REC_CYCLES cycles:
//   ships = ceil( remaining / (rate * cycles * richness) )
// Returns { count, name, shipDefId } or null when it can't be computed.
function recommend(f) {
  const spec = REC_SHIP[f.type];
  if (!spec || !f.remaining || !f.mult) return null;
  const [name, rate] = spec;
  const cap = rate * (afExcavator() ? EXCAVATOR_BONUS : 1);
  const count = Math.ceil(f.remaining / (cap * REC_CYCLES * f.mult));
  const def = afAllShips.find(d => d.name === name);
  return { count, name, shipDefId: def ? def.shipDefId : null };
}

async function refreshTemplates() {
  afTemplates = await loadFleetTemplates();
  afTemplates.sort((a, b) => (a.name || '').localeCompare(b.name || ''));   // alphabetical dropdown
  const sel = document.getElementById('af-template-select');
  const saved = await rememberedSelections();
  const want = saved['af-template-select'] || sel.value;   // survives tabs/sessions
  sel.textContent = '';
  if (!afTemplates.length) {
    const o = document.createElement('option');
    o.value = ''; o.textContent = '— none (create one in Fleets) —';
    sel.appendChild(o);
    return;
  }
  for (const t of afTemplates) {
    const o = document.createElement('option');
    o.value = t.id; o.textContent = t.name;
    sel.appendChild(o);
  }
  if (want && afTemplates.some(t => String(t.id) === want)) sel.value = want;
}

// Open the editable fleet dialog seeded from the ship recommendation (falling
// back to the selected template), then dispatch. Sends once — the saved
// template is left untouched.
async function sendMineMission(f) {
  const planetId = Number(document.getElementById('af-planet').value);
  const planet = afPlanets.find(p => p.id === planetId);
  const status = document.getElementById('af-progress');
  if (!planetId) { alert('Pick a source planet first.'); return; }

  status.textContent = 'Checking fleet…';
  const av = await browser.runtime.sendMessage({ type: 'GET_PLANET_SHIPS', planetId });
  if (av.error) { status.textContent = `Error: ${av.error}`; return; }
  const avail = av.available || {};

  // Seed the editor straight from the selected template — the "Optimise Mining
  // Fleet" button in the dialog is what swaps in the recommended mining ships.
  const tpl = afTemplates.find(t => String(t.id) === document.getElementById('af-template-select').value);
  const seed = {};
  for (const [id, q] of Object.entries((tpl && tpl.ships) || {})) seed[Number(id)] = q;

  const rec = recommend(f);
  const recShips = rec && rec.shipDefId != null ? [{ shipDefId: rec.shipDefId, quantity: rec.count }] : [];
  if (afExcavator()) {
    const exc = afAllShips.find(d => d.name === 'Excavator');
    if (exc && (avail[exc.shipDefId] || 0) > 0) recShips.push({ shipDefId: exc.shipDefId, quantity: 1 });
  }
  const miningShipIds = new Set(afAllShips.filter(d => MINING_SHIPS.has(d.name)).map(d => d.shipDefId));

  const ships = await editFleetDialog({
    title: `Mine ${f.name}`,
    subtitle: `To: ${f.name} (${f.system})\nFrom: ${planet ? planet.name : planetId}`,
    avail, seed, recShips, miningShipIds,
  });
  if (!ships || !ships.length) return;   // cancelled or emptied

  status.textContent = `Sending to ${f.name}…`;
  const res = await browser.runtime.sendMessage({
    type: 'SEND_MINE',
    sourcePlanetId: planetId,
    targetFieldId: f.fieldId,
    ships,
    miningDuration: MINING_DURATION,
  });
  status.textContent = res.error ? `Send failed: ${res.error}` : `Fleet sent to ${f.name} ✓`;
  if (!res.error) { refreshSlots(); updateAfAvail(); }
}

// "used/max fleet slots" and in-flight mine missions — both come from the
// missions endpoint. afMiningFieldIds drives the "already mining" row highlight.
async function refreshSlots() {
  const mi = await browser.runtime.sendMessage({ type: 'GET_MISSIONS' });
  if (mi.maxFleetSlots != null) {
    document.getElementById('af-slots').textContent = `${(mi.missions || []).length}/${mi.maxFleetSlots} fleet slots`;
  }
  afMiningFieldIds = new Set(
    (mi.missions || []).filter(m => m.missionType === 'mine' && m.targetFieldId != null).map(m => m.targetFieldId));
  renderAsteroids();
}

export function renderAsteroids() {
  const tbody = document.getElementById('af-results-tbody');
  tbody.textContent = '';

  document.querySelectorAll('#af-results-head th.sortable').forEach(th => {
    const old = th.querySelector('.arrow');
    if (old) old.remove();
    if (th.dataset.key === afSort.key) {
      const arrow = document.createElement('span');
      arrow.className = 'arrow';
      arrow.textContent = afSort.dir === -1 ? '▼' : '▲';
      th.appendChild(arrow);
    }
  });

  let rows = afFields.map(f => {
    const rec = recommend(f);
    return {
      ...f,
      distance: distance(f),
      leftPct: f.total ? Math.round((f.remaining / f.total) * 100) : null,
      rec, recShips: rec ? rec.count : null,
    };
  });
  if (afTypeFilter.size) rows = rows.filter(f => afTypeFilter.has(f.type));
  if (afZoneFilter.size) rows = rows.filter(f => afZoneFilter.has(f.zone));

  const num = (id, dflt) => {
    const v = parseFloat(document.getElementById(id).value);
    return isNaN(v) ? dflt : v;
  };
  const multMin = num('af-mult-min', -Infinity), qtyMin = num('af-qty-min', -Infinity);
  const leftMin = num('af-left-min', -Infinity);
  rows = rows.filter(f =>
    (f.mult ?? -Infinity) >= multMin && (f.remaining ?? -Infinity) >= qtyMin
    && (f.leftPct ?? -Infinity) >= leftMin);
  const { key, dir } = afSort;
  rows.sort((a, b) => {
    const va = a[key], vb = b[key];
    let cmp;
    if (va == null && vb == null) cmp = 0;
    else if (va == null) cmp = 1;
    else if (vb == null) cmp = -1;
    else if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb;
    else cmp = String(va).localeCompare(String(vb));
    return cmp * dir;
  });

  const totalPages = Math.max(1, Math.ceil(rows.length / AF_PER_PAGE));
  afPage = Math.min(Math.max(1, afPage), totalPages);
  document.getElementById('af-page-info').textContent = `Page ${afPage} / ${totalPages}`;
  document.getElementById('af-btn-prev').disabled = afPage <= 1;
  document.getElementById('af-btn-next').disabled = afPage >= totalPages;
  const pageRows = rows.slice((afPage - 1) * AF_PER_PAGE, afPage * AF_PER_PAGE);

  for (const f of pageRows) {
    const tr = document.createElement('tr');
    tr.dataset.system = f.systemId;
    if ((afMyUsername && f.minerPresent === afMyUsername) || afMiningFieldIds.has(f.fieldId)) {
      tr.style.background = 'rgba(63,185,80,0.15)';   // already mining / claimed by us
    }

    const sendTd = document.createElement('td');
    const ship = document.createElement('span');
    ship.textContent = '🚀';
    ship.title = 'Send mining fleet here';
    ship.style.cssText = 'cursor:pointer;';
    ship.addEventListener('click', () => sendMineMission(f));
    sendTd.appendChild(ship);
    tr.appendChild(sendTd);

    const content = f.remaining == null ? '—'
      : `${f.remaining.toLocaleString()} / ${(f.total ?? 0).toLocaleString()}`;
    const tag = f.ownerName ? allianceTagCache[f.ownerName] : null;
    const owner = f.ownerName ? (tag ? `${f.ownerName} [${tag}]` : f.ownerName) : '—';
    const cells = [
      f.system, String(f.type).replace(/_/g, ' '),
      f.mult == null ? '—' : `×${f.mult}`,
      content,
      f.leftPct == null ? '—' : `${f.leftPct}%`,
      f.zone,
      owner,
      f.distance == null ? '—' : String(f.distance),
      '…',   // fuel cost, filled async
      f.rec ? `${f.rec.count}× ${f.rec.name}` : '—',
    ];
    cells.forEach((v, i) => {
      const td = document.createElement('td');
      td.textContent = v;
      if (i === 1) td.style.color = TYPE_COLOR[f.type] || '#e6edf3';
      else if (i === 2 && f.mult != null) td.style.color = '#e3b341';
      else if (i === 5) td.style.color = ZONE_COLOR[f.zone] || '#8b949e';
      else if (i === 8) td.className = 'af-fuel';
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  }
  document.getElementById('af-count').textContent = `${rows.length} fields`;
  computeFuel();
}

// Fill the Fuel Cost column: one fuel-estimate per visible row for the selected
// template's ships, from the chosen planet. A generation guard discards results
// from a superseded render/selection.
let afFuelGen = 0;
async function computeFuel() {
  const gen = ++afFuelGen;
  const planetId = Number(document.getElementById('af-planet').value);
  const cells = () => document.querySelectorAll('#af-results-tbody td.af-fuel');
  const tpl = afTemplates.find(t => String(t.id) === document.getElementById('af-template-select').value);
  const ships = Object.entries(tpl ? tpl.ships : {})
    .map(([shipDefId, quantity]) => ({ shipDefId: Number(shipDefId), quantity }))
    .filter(s => s.quantity > 0);
  if (!ships.length) {
    cells().forEach(c => { c.textContent = '—'; c.title = tpl ? 'Template has no ships' : 'No template selected'; });
    return;
  }
  for (const tr of document.querySelectorAll('#af-results-tbody tr')) {
    if (gen !== afFuelGen) return;
    const cell = tr.querySelector('.af-fuel');
    const sysId = Number(tr.dataset.system);
    if (!cell || !sysId) continue;
    const est = await fuelEstimate(planetId, sysId, ships);
    if (gen !== afFuelGen) return;
    if (est.error) { cell.textContent = '—'; cell.title = est.error; continue; }
    cell.textContent = `${est.fuelCost}`;
    cell.style.color = est.inRange === false ? '#ff7b72' : '';
    cell.title = est.inRange === false ? 'Out of range' : `distance ${est.distance.toFixed(1)} ly`;
  }
}
