// Asteroids Fields tab: asteroid fields in the N nearest explored systems to a
// chosen planet (type, content, multiplier, security zone, distance, miner).
//
//   /api/galaxy/map                        → all systems with coords + sector id
//   /api/galaxy/sectors/{sectorId}/systems → name/zone/planetCount for a sector
//   /api/galaxy/systems/{id}/planets       → that system's asteroidFields
// Per-system scans reuse the finder's shared cache.

import { SCAN_CACHE_MAX, getSystemPlanets } from './finder.js';
import { loadFleetTemplates } from './fleets.js';
import { clearAvailStrip, editFleetDialog, fuelEstimate, rememberSelection, rememberedSelections, renderAvailStrip, effectiveFleetSpeed, missionTravelTime, fmt } from '../common.js';

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
const afExcavator = () => false;  // Excavator toggle moved to the fleet dialog
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
let afTemplates = [];        // fleet templates, managed in the Fleets tab
let afMap = null;            // { byId: {id→{x,y,sectorId,visibility}}, systems: [...] }, cached
const sectorSystems = {};   // sectorId → systems[] (name/zone/planetCount), cached
let afAllShips = [];        // every ship def: [{ shipDefId, name, imageUrl, fuelRate, speed }]
let afAvailTimer = null;    // periodic availability poll
let afMyUsername = null;    // this player's username, to spot fields already mined by us
let afMiningFieldIds = new Set();   // fieldIds with an in-flight/active mine mission
const allianceTagCache = {};   // player name → alliance tag (or null), session cache
let afEscortsByZone = {};   // { zone: [template1, template2, ...] } - escorts grouped by zone
let afEscortShipAvail = {};   // { planetId: { escortTemplateId: { withExcavator: bool, withoutExcavator: bool } } }
const afEscortStats = new Map();   // fieldId → { templateId: { fuel, time, statusCode } }, result cache
let afEscortGen = 0;   // generation counter for escort stats (like afFuelGen)
let afFilterOnlyAvailable = false;  // checkbox for "only possible escorts"
const afYieldCache = new Map();   // fieldId|escortId → yieldPerSec

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
  document.getElementById('af-calc-escorts').addEventListener('click', () => {
    _travelTimeCache.clear();
    computeEscortStats();
  });
  document.getElementById('af-only-available').addEventListener('change', (e) => {
    afFilterOnlyAvailable = e.target.checked;
    afPage = 1;
    renderAsteroids();
  });
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
  afAllShips = (defs.ships || []).map(s => ({
    shipDefId: s.shipDefId, name: s.name, imageUrl: s.imageUrl,
    fuelRate: s.fuelRate || 0, speed: s.speed || 1,
  }));
  updateAfAvail();
  if (!afAvailTimer) {
    afAvailTimer = setInterval(() => {
      if (document.getElementById('asteroids-content').style.display !== 'none') {
        updateAfAvail();
        refreshSlots();
      }
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

  // Use user-configured cache TTL for asteroid fields (in milliseconds)
  const cacheTtlMs = (parseInt(document.getElementById('af-cache-ttl').value, 10) || 30) * 60 * 1000;

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
        data = await getSystemPlanets(sys.id, cache, cacheTtlMs);
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
// With excavator: rate is boosted +20%, so fewer ships needed.
// Returns { count, name, shipDefId } or null when it can't be computed.
function recommend(f, withExcavatorBonus = false) {
  const spec = REC_SHIP[f.type];
  if (!spec || !f.remaining || !f.mult) return null;
  const [name, rate] = spec;
  const cap = rate * (withExcavatorBonus ? EXCAVATOR_BONUS : 1);
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
  // Escort-tagged templates are not mining templates — exclude from dropdown.
  const miningTemplates = afTemplates.filter(t => !(t.escortZones && t.escortZones.length));
  if (!miningTemplates.length) {
    const o = document.createElement('option');
    o.value = ''; o.textContent = '— none (create one in Fleets) —';
    sel.appendChild(o);
    return;
  }
  for (const t of miningTemplates) {
    const o = document.createElement('option');
    o.value = t.id; o.textContent = t.name;
    sel.appendChild(o);
  }
  if (want && miningTemplates.some(t => String(t.id) === want)) sel.value = want;

  // Build afEscortsByZone: group escort templates by zone (only escortPerMiner=true templates).
  afEscortsByZone = {};
  const escortTemplates = afTemplates.filter(t => t.escortZones && t.escortZones.length && t.escortPerMiner);
  console.log(`[AF] Found ${escortTemplates.length} escort templates (out of ${afTemplates.length} total)`, escortTemplates.map(t => ({ name: t.name, zones: t.escortZones })));
  for (const ezone of ['sentinel', 'open', 'dead', 'rift', 'unknown']) {
    afEscortsByZone[ezone] = escortTemplates.filter(t => (t.escortZones || []).includes(ezone));
  }
  console.log('[AF] afEscortsByZone:', afEscortsByZone);

  // Reset escort ship availability cache on template reload.
  afEscortShipAvail = {};
  _travelTimeCache.clear();
}

// Check which escort templates have available ships for a given planet (with/without Excavator).
// Returns { templateId: { withExcavator: bool, withoutExcavator: bool } } or caches from afEscortShipAvail.
async function checkEscortShipAvailability(planetId) {
  if (!planetId || !afEscortsByZone) return {};
  const cacheKey = String(planetId);
  if (afEscortShipAvail[cacheKey]) return afEscortShipAvail[cacheKey];

  const res = await browser.runtime.sendMessage({ type: 'GET_PLANET_SHIPS', planetId });
  const avail = res.available || {};
  const result = {};

  // Flatten all escorts from all zones
  const allEscorts = Object.values(afEscortsByZone).flat();
  for (const t of allEscorts) {
    result[t.id] = {};
    for (const withExc of [false, true]) {
      let canDo = true;
      
      // If escortPerMiner=true, assume at least 1 mining ship is needed
      // So scale escort ships by 1 to get minimum requirement
      const escortScaleFactor = t.escortPerMiner ? 1 : 1;
      
      // Check escort ships (scaled if escortPerMiner)
      for (const [shipDefId, qty] of Object.entries(t.ships || {})) {
        const needed = Number(qty) * escortScaleFactor;
        if (needed <= 0) continue;
        const have = (avail[shipDefId] || 0);
        if (have < needed) { 
          canDo = false; 
          break; 
        }
      }
      
      // Also check Excavator if requested
      if (withExc && canDo) {
        const excDef = afAllShips.find(d => d.name === 'Excavator');
        if (excDef && (avail[excDef.shipDefId] || 0) < 1) canDo = false;
      }
      
      result[t.id][withExc ? 'withExcavator' : 'withoutExcavator'] = canDo;
    }
  }

  afEscortShipAvail[cacheKey] = result;
  return result;
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
  const exc = afAllShips.find(d => d.name === 'Excavator');
  const miningShipIds = new Set(afAllShips.filter(d => MINING_SHIPS.has(d.name)).map(d => d.shipDefId));

  // Escort templates: fleet templates tagged for this field's zone.
  const fieldZone = f.zone && f.zone !== '—' ? f.zone : null;
  const escortTemplates = fieldZone
    ? afTemplates.filter(t => (t.escortZones || []).includes(fieldZone))
    : [];

  const ships = await editFleetDialog({
    title: `Mine ${f.name}`,
    subtitle: `To: ${f.name} (${f.system})\nFrom: ${planet ? planet.name : planetId}`,
    avail, seed, recShips, miningShipIds,
    excavatorShipDefId: exc ? exc.shipDefId : null,
    excavatorBonus: EXCAVATOR_BONUS,
    escortTemplates,
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
  if (!res.error) {
    afMiningFieldIds.add(f.fieldId);   // optimistic — GET_MISSIONS can lag right after the send
    renderAsteroids();
    refreshSlots(); updateAfAvail();
  }
}

// Auto-send: sends with escort if in expanded mode, without escort if in normal mode
async function sendMineMissionAutomatic(field, escortId, escortWithExcavator) {
  // In expanded mode: escortId is set - use escort send
  if (escortId != null) {
    const escortTemplate = afTemplates.find(t => t.id === escortId);
    if (!escortTemplate) {
      alert('Escort template not found.');
      return;
    }
    return sendMineMissionWithEscort(field, escortTemplate, escortWithExcavator);
  }
  
  // In normal mode: no escort - use regular send
  return sendMineMission(field);
}

// Send mining mission with escort template pre-selected. Combines mining ships (from selected template)
// + escort ships (from escort template) + optional excavator.
async function sendMineMissionWithEscort(field, escortTemplate, withExcavator = false) {
  const planetId = Number(document.getElementById('af-planet').value);
  const planet = afPlanets.find(p => p.id === planetId);
  const status = document.getElementById('af-progress');
  if (!planetId) { alert('Pick a source planet first.'); return; }

  status.textContent = 'Checking fleet…';
  const av = await browser.runtime.sendMessage({ type: 'GET_PLANET_SHIPS', planetId });
  if (av.error) { status.textContent = `Error: ${av.error}`; return; }
  const avail = av.available || {};

  // Use recommend() for mining ships with excavator bonus if requested
  const rec = recommend(field, withExcavator);  // Pass excavator bonus flag
  if (!rec || !rec.shipDefId) { status.textContent = 'No mining ship recommendation available.'; return; }
  
  // Limit to actually available ships (don't overcommit)
  const maxAvailMining = avail[rec.shipDefId] || 0;
  const actualMiningCount = Math.min(rec.count, maxAvailMining);
  if (actualMiningCount <= 0) { status.textContent = `No ${rec.name} available (need ${rec.count}).`; return; }
  
  const miningShipEntry = { [rec.shipDefId]: actualMiningCount };

  // Combine with escort ships (scale by actual mining count if escortPerMiner)
  // If using excavator with escortPerMiner, increase count for escort calculation
  let escortMinerCount = actualMiningCount;
  if (withExcavator && escortTemplate.escortPerMiner) {
    escortMinerCount += 1;
  }
  
  const combinedShips = { ...miningShipEntry };
  for (const [id, q] of Object.entries(escortTemplate.ships || {})) {
    const scaledQty = escortTemplate.escortPerMiner
      ? Math.max(1, Math.ceil(q * escortMinerCount))
      : Math.ceil(q);
    combinedShips[Number(id)] = (combinedShips[Number(id)] || 0) + scaledQty;
  }

  // Add excavator if requested
  if (withExcavator) {
    const exc = afAllShips.find(d => d.name === 'Excavator');
    if (exc) combinedShips[exc.shipDefId] = (combinedShips[exc.shipDefId] || 0) + 1;
  }

  // Convert to ships array for editFleetDialog
  const ships = Object.entries(combinedShips)
    .map(([shipDefId, quantity]) => ({ shipDefId: Number(shipDefId), quantity: Number(quantity) || 0 }))
    .filter(s => s.quantity > 0);

  if (!ships.length) { alert('No ships in combined fleet.'); return; }

  // Open dialog with this pre-seeded fleet
  const fieldZone = field.zone && field.zone !== '—' ? field.zone : null;
  const fieldEscorts = fieldZone ? afTemplates.filter(t => (t.escortZones || []).includes(fieldZone)) : [];

  const finalShips = await editFleetDialog({
    title: `Mine ${field.name} with Escort`,
    subtitle: `To: ${field.name} (${field.system})\nFrom: ${planet ? planet.name : planetId}\nEscort: ${escortTemplate.name}${withExcavator ? ' + 🔧' : ''}`,
    avail, 
    seed: combinedShips,
    miningShipIds: new Set([rec.shipDefId]),  // Tell dialog which ships are miners
    escortTemplates: fieldEscorts,
  });
  if (!finalShips || !finalShips.length) return;

  status.textContent = `Sending to ${field.name}…`;
  const res = await browser.runtime.sendMessage({
    type: 'SEND_MINE',
    sourcePlanetId: planetId,
    targetFieldId: field.fieldId,
    ships: finalShips,
    miningDuration: MINING_DURATION,
  });
  status.textContent = res.error ? `Send failed: ${res.error}` : `Fleet sent to ${field.name} ✓`;
  if (!res.error) {
    afMiningFieldIds.add(field.fieldId);
    renderAsteroids();
    refreshSlots(); updateAfAvail();
  }
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

// Format seconds as Xm Ys or Xh Ym
function fmtTime(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return s ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h}h ${rm}m` : `${h}h`;
}

// Fuel + travel time via local formula (avoids rate-limited API calls).
// fuel = Σ(fuelRate × qty) × (FUEL_K × distAU + FUEL_BASE)
// travelTime = distAU / min(speed) in seconds
const AF_FUEL_K    = 0.0496;
const AF_FUEL_BASE = 3.48;
const AF_COORD_TO_AU = 1 / 57.4;

function localFuelEstimate(ships, distCoords) {
  if (!ships.length || !distCoords) return { fuelCost: null };
  const distAU = distCoords * AF_COORD_TO_AU;
  let totalFuelRate = 0;
  for (const { shipDefId, quantity } of ships) {
    const def = afAllShips.find(d => d.shipDefId === shipDefId);
    if (!def) continue;
    totalFuelRate += def.fuelRate * quantity;
  }
  if (!totalFuelRate) return { fuelCost: null };
  const fuelCost = Math.round(totalFuelRate * (AF_FUEL_K * distAU + AF_FUEL_BASE));
  return { fuelCost };
}

// Cache travelTime per (planetId|systemId|escortId|withExcavator) — at most
// #escorts × 2 API calls per computeEscortStats run instead of one per row.
const _travelTimeCache = new Map();
async function cachedTravelTime(planetId, sysId, escortId, withExcavator, combinedShips) {
  const key = `${planetId}|${sysId}|${escortId}|${withExcavator}`;
  if (_travelTimeCache.has(key)) return _travelTimeCache.get(key);
  // Use one representative row's ships for speed (slowest ship determines time).
  const ships = combinedShips.map(s => ({ shipDefId: s.shipDefId, quantity: Math.ceil(s.quantity) }));
  const est = await fuelEstimate(planetId, sysId, ships);
  const t = est.error ? null : (est.travelTime ? Math.ceil(est.travelTime) : null);
  if (!est.error) _travelTimeCache.set(key, t);
  return t;
}

// Compute Escort stats: fuel + travel time for each visible field + each zone's escort templates.
// Uses Ships Recommendation for each field as the mining baseline. If not available, uses available ships.
let afEscortStatsGen = 0;
async function computeEscortStats() {
  const gen = ++afEscortStatsGen;
  const planetId = Number(document.getElementById('af-planet').value);
  if (!planetId) return;
  
  console.log(`[AF] computeEscortStats gen=${gen}, planetId=${planetId}, fields=${afFields.length}`);
  console.log(`[AF] afEscortsByZone keys:`, Object.keys(afEscortsByZone));

  // Load available ships once for this computation
  const res = await browser.runtime.sendMessage({ type: 'GET_PLANET_SHIPS', planetId });
  const avail = res.available || {};
  console.log(`[AF] Available ships on planet ${planetId}:`, Object.keys(avail).length, 'types');

  // For each field, compute stats for each zone's escorts
  let rowsProcessed = 0;
  let fieldsSkipped = 0;
  
  for (const field of afFields) {
    if (gen !== afEscortStatsGen) {
      console.log(`[AF] Cancelled: gen changed from ${gen}`);
      return;
    }

    const sysId = field.systemId;
    const fieldId = field.fieldId;

    // Get the field's zone and its escort options
    const zone = field.zone && field.zone !== '—' ? field.zone : null;
    const escortOptions = zone ? (afEscortsByZone[zone] || []) : [];
    
    if (!escortOptions.length) {
      if (rowsProcessed === 0) console.log(`[AF] Field ${fieldId}: zone="${zone}", escorts=${escortOptions.length}`);
      fieldsSkipped++;
      continue;
    }

    // Build mining ships array from recommend() result
    // If not available or not enough, use what we have (fallback)
    let rec = recommend(field);
    let miningShips = (rec && rec.shipDefId && rec.count > 0)
      ? [{ shipDefId: rec.shipDefId, quantity: rec.count }]
      : [];
    
    // Fallback: If no mining ships recommended, use first available ship with qty 1
    if (!miningShips.length && afAllShips.length > 0) {
      const firstShip = afAllShips[0];
      miningShips = [{ shipDefId: firstShip.shipDefId, quantity: 1 }];
      if (rowsProcessed === 0) console.log(`[AF] Field ${fieldId}: Using fallback ship:`, firstShip.name);
    }

    if (!miningShips.length) {
      if (rowsProcessed === 0) console.log(`[AF] Field ${fieldId}: No mining ships even with fallback`);
      continue;
    }

    if (rowsProcessed === 0) {
      console.log(`[AF] First field ${fieldId}: zone="${zone}", escorts=${escortOptions.length}, miningShips:`, miningShips);
    }

    rowsProcessed++;
    let escortsProcessed = 0;

    for (const escort of escortOptions) {
      if (gen !== afEscortStatsGen) return;

      const escortId = escort.id;
      
      for (const withExc of [false, true]) {
        if (gen !== afEscortStatsGen) {
          console.log(`[AF] Gen mismatch in withExc loop: gen=${gen}, current=${afEscortStatsGen}`);
          return;
        }

        // Combine mining + escort ships
        const combinedShips = miningShips.map(s => ({ ...s }));
        let miningCount = miningShips.reduce((s, x) => s + x.quantity, 0);
        
        // If using excavator with escortPerMiner, increase count for escort calculation
        if (withExc && escort.escortPerMiner) {
          miningCount += 1;
        }
        
        for (const [shipDefId, qty] of Object.entries(escort.ships || {})) {
          const scaledQty = escort.escortPerMiner
            ? Math.max(1, Math.ceil(qty * miningCount))
            : qty;
          const existing = combinedShips.find(s => s.shipDefId === Number(shipDefId));
          if (existing) existing.quantity = (existing.quantity || 0) + scaledQty;
          else combinedShips.push({ shipDefId: Number(shipDefId), quantity: scaledQty });
        }

        // Add excavator if needed
        if (withExc) {
          const excDef = afAllShips.find(d => d.name === 'Excavator');
          if (excDef) {
            const existing = combinedShips.find(s => s.shipDefId === excDef.shipDefId);
            if (existing) existing.quantity = (existing.quantity || 0) + 1;
            else combinedShips.push({ shipDefId: excDef.shipDefId, quantity: 1 });
          }
        }

        // Fuel via local formula; travelTime via API but cached per system+escort
        const distCoords = distance(field);
        const { fuelCost } = localFuelEstimate(combinedShips, distCoords);
        const travelTime = await cachedTravelTime(planetId, sysId, escortId, withExc, combinedShips);
        if (gen !== afEscortStatsGen) return;

        if (rowsProcessed === 1 && escortsProcessed === 0) {
          console.log(`[AF] Debug: distCoords=${distCoords}, combinedShips:`, combinedShips, `fuelCost=${fuelCost}, travelTime=${travelTime}`);
        }

        // Determine status by checking if all combined ships are available
        let allOk = true;
        for (const ship of combinedShips) {
          const need = Math.ceil(ship.quantity);
          const have = avail[ship.shipDefId] || 0;
          if (have < need) {
            allOk = false;
            break;
          }
        }

        // Store in cache for rerender - key matches renderAsteroids lookup
        const cacheKey = `${escortId}|${withExc}`;
        if (!afEscortStats.has(fieldId)) afEscortStats.set(fieldId, {});
        afEscortStats.get(fieldId)[cacheKey] = { 
          fuelCost: fuelCost != null ? fuelCost : null, 
          travelTime: travelTime != null ? travelTime : null,
          allOk 
        };

        if (rowsProcessed === 1 && withExc === false) {
          console.log(`[AF] First escort: ${escort.name || `T${escortId}`}, fuelCost=${fuelCost}, travelTime=${travelTime}, allOk=${allOk}`);
        }

        escortsProcessed++;
      }
    }
  }
  console.log(`[AF] Finished: ${rowsProcessed} fields processed, ${fieldsSkipped} skipped, total cache entries=${afEscortStats.size}`);
  
  // Log first field's cache for debugging
  if (afEscortStats.size > 0) {
    const firstFieldId = afFields[0]?.fieldId;
    const firstFieldCache = afEscortStats.get(firstFieldId);
    console.log(`[AF] First field ${firstFieldId} cache:`, firstFieldCache);
  }
  
  // Rerender to show expanded rows with calculated yields
  renderAsteroids();
}


// Expand each field into multiple rows (one per available escort).
// Calculates yield per escort and prepares for sorting.
function expandFieldsToEscortRows(fields) {
  const expanded = [];
  
  for (const field of fields) {
    const zone = field.zone && field.zone !== '—' ? field.zone : null;
    const escortTemplates = zone ? (afEscortsByZone[zone] || []) : [];
    
    if (!escortTemplates.length) {
      // No escorts for this field's zone - create single row with "—"
      expanded.push({
        fieldId: field.fieldId,
        field: field,
        escortId: null,
        escortName: '—',
        yieldPerSec: null,
        escortAllOk: null,
        isEscortRow: false,
      });
      continue;
    }
    
    // Create a row per escort option (escort template × 2 for with/without excavator)
    for (const escort of escortTemplates) {
      for (const withExc of [false, true]) {
        const cacheKey = `${escort.id}|${withExc}`;
        const cached = afEscortStats.get(field.fieldId)?.[cacheKey];
        
        if (!cached) {
          // No cached data for this combination yet
          continue;
        }
        
        // Calculate yield for this specific escort + excavator combo
        const totalTime = cached.travelTime + 10 * 600 + cached.travelTime;
        const yieldPerSec = field.remaining ? field.remaining / totalTime : null;
        
        const rowId = `${field.fieldId}|${escort.id}|${withExc}`;
        expanded.push({
          fieldId: field.fieldId,
          field: field,
          escortId: escort.id,
          escortName: (escort.name || `T${escort.id}`) + (withExc ? '🔧' : ''),
          escortWithExcavator: withExc,
          yieldPerSec: yieldPerSec,
          escortAllOk: cached.allOk,
          isEscortRow: true,
          rowId: rowId,
        });
        
        // Cache the yield
        afYieldCache.set(rowId, yieldPerSec);
      }
    }
  }
  
  console.log(`[AF] expandFieldsToEscortRows: ${expanded.length} rows created from ${fields.length} fields`);
  return expanded;
}

// Apply visual markers to rows for in-flight missions (stub - placeholder for future expansion)
function applyMissionMarkers() {
  // TODO: Could add additional visual markers, animations, etc. for in-flight missions
  // Currently handled via row background in renderAsteroids()
}

export function renderAsteroids() {
  const tbody = document.getElementById('af-results-tbody');
  tbody.textContent = '';

  // Update sort arrows
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

  // Determine render mode: use expanded rows only if escorts have been calculated
  const useExpandedMode = afEscortStats.size > 0;
  let rows;
  
  if (useExpandedMode) {
    // Step 1: Expand fields into (field + escort) combinations
    rows = expandFieldsToEscortRows(afFields);

    // Step 4: Apply "only available" filter
    if (afFilterOnlyAvailable) {
      rows = rows.filter(r => r.escortAllOk === true);
    }
  } else {
    // Fallback: Simple 1 field = 1 row mode
    rows = afFields.map(f => {
      const rec = recommend(f);
      const leftPct = f.total ? Math.round((f.remaining / f.total) * 100) : null;
      return {
        ...f,
        distance: distance(f),
        leftPct,
        rec, recShips: rec ? rec.count : null,
        isEscortRow: false,
        escortName: '—',
        yieldPerSec: null,
        escortAllOk: null,
      };
    });
  }

  // Step 2: Apply Type/Zone filters
  if (afTypeFilter.size) {
    rows = rows.filter(r => {
      const fieldType = useExpandedMode ? r.field.type : r.type;
      return afTypeFilter.has(fieldType);
    });
  }
  if (afZoneFilter.size) {
    rows = rows.filter(r => {
      const fieldZone = useExpandedMode ? r.field.zone : r.zone;
      return afZoneFilter.has(fieldZone);
    });
  }

  // Step 3: Apply numeric filters (Mult, Qty, Left%)
  const num = (id, dflt) => {
    const v = parseFloat(document.getElementById(id).value);
    return isNaN(v) ? dflt : v;
  };
  const multMin = num('af-mult-min', -Infinity);
  const qtyMin = num('af-qty-min', -Infinity);
  const leftMin = num('af-left-min', -Infinity);
  
  rows = rows.filter(r => {
    const f = useExpandedMode ? r.field : r;  // Handle both modes
    return (f.mult ?? -Infinity) >= multMin && 
           (f.remaining ?? -Infinity) >= qtyMin &&
           ((f.leftPct ?? r.leftPct) ?? -Infinity) >= leftMin;
  });

  // Step 5: Global sort by selected key
  const { key, dir } = afSort;
  rows.sort((a, b) => {
    let va, vb;
    if (useExpandedMode && key === 'yieldPerSec') {
      va = a.yieldPerSec ?? -Infinity;
      vb = b.yieldPerSec ?? -Infinity;
    } else {
      va = useExpandedMode ? a.field[key] : a[key];
      vb = useExpandedMode ? b.field[key] : b[key];
    }
    
    let cmp;
    if (va == null && vb == null) cmp = 0;
    else if (va == null) cmp = 1;
    else if (vb == null) cmp = -1;
    else if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb;
    else cmp = String(va).localeCompare(String(vb));
    return cmp * dir;
  });

  // Step 6: Pagination
  const totalPages = Math.max(1, Math.ceil(rows.length / AF_PER_PAGE));
  afPage = Math.min(Math.max(1, afPage), totalPages);
  document.getElementById('af-page-info').textContent = `Page ${afPage} / ${totalPages}`;
  document.getElementById('af-btn-prev').disabled = afPage <= 1;
  document.getElementById('af-btn-next').disabled = afPage >= totalPages;
  const pageRows = rows.slice((afPage - 1) * AF_PER_PAGE, afPage * AF_PER_PAGE);

  // Step 7: Render rows
  for (const row of pageRows) {
    const f = useExpandedMode ? row.field : row;
    const tr = document.createElement('tr');
    tr.setAttribute('data-system', String(f.systemId));
    tr.setAttribute('data-field-id', String(f.fieldId));
    
    if ((afMyUsername && f.minerPresent === afMyUsername) || afMiningFieldIds.has(f.fieldId)) {
      tr.style.background = 'rgba(63,185,80,0.15)';
    }

    // Send button
    const sendTd = document.createElement('td');
    const ship = document.createElement('span');
    ship.textContent = '🚀';
    ship.title = 'Send mining fleet here';
    ship.style.cssText = 'cursor:pointer;';
    ship.addEventListener('click', () => sendMineMissionAutomatic(f, row.escortId, row.escortWithExcavator));
    sendTd.appendChild(ship);
    tr.appendChild(sendTd);

    // Field columns
    const content = f.remaining == null ? '—' : `${f.remaining.toLocaleString()} / ${(f.total ?? 0).toLocaleString()}`;
    const tag = f.ownerName ? allianceTagCache[f.ownerName] : null;
    const owner = f.ownerName ? (tag ? `${f.ownerName} [${tag}]` : f.ownerName) : '—';
    const leftPct = useExpandedMode ? row.leftPct : row.leftPct;
    const dist = useExpandedMode ? distance(f) : row.distance;
    const rec = useExpandedMode ? recommend(f) : row.rec;

    // In expanded mode, fetch fuel cost from cache
    let fuelCostDisplay = '…';
    if (useExpandedMode && row.escortId != null) {
      const cacheKey = `${row.escortId}|${row.escortWithExcavator}`;
      const fieldCache = afEscortStats.get(f.fieldId);
      const cached = fieldCache?.[cacheKey];
      
      // Debug first 3 rows
      if (pageRows.indexOf(row) < 3) {
        console.log(`[AF] Render row: fieldId=${f.fieldId}, escortId=${row.escortId}, withExc=${row.escortWithExcavator}, key="${cacheKey}", cached=`, cached);
      }
      
      if (cached && cached.fuelCost != null) {
        fuelCostDisplay = `${cached.fuelCost}H₂`;
      }
    }

    const cells = [
      f.system,
      String(f.type).replace(/_/g, ' '),
      f.mult == null ? '—' : `×${f.mult}`,
      content,
      leftPct == null ? '—' : `${leftPct}%`,
      f.zone,
      owner,
      dist == null ? '—' : String(dist),
      fuelCostDisplay,  // fuel cost
      rec ? `${rec.count}× ${rec.name}` : '—',
      row.escortName || '—',
      row.yieldPerSec != null ? `${fmt(Number((row.yieldPerSec * 60).toFixed(1)))}/min` : '—',
    ];

    cells.forEach((v, i) => {
      const td = document.createElement('td');
      td.textContent = v;
      
      // Apply styling
      if (i === 1) td.style.color = TYPE_COLOR[f.type] || '#e6edf3';
      else if (i === 2 && f.mult != null) td.style.color = '#e3b341';
      else if (i === 5) td.style.color = ZONE_COLOR[f.zone] || '#8b949e';
      else if (i === 8) td.className = 'af-fuel';
      else if (i === 10) {  // escort name
        if (row.escortAllOk === true) td.style.color = '#2ea043';  // green
        else if (row.escortAllOk === false) td.style.color = '#f85149';  // red
      }
      else if (i === 11) {  // yield/s
        if (row.yieldPerSec != null) td.style.color = '#2ea043';  // green when available
      }
      
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  }

  document.getElementById('af-count').textContent = useExpandedMode ? `${rows.length} escort options` : `${rows.length} fields`;
  computeFuel();
  applyMissionMarkers();
}


// Fill the Fuel Cost column: one fuel-estimate per visible row for the selected
// template's ships, from the chosen planet. A generation guard discards results
// from a superseded render/selection.
let afFuelGen = 0;
async function computeFuel() {
  const gen = ++afFuelGen;
  const planetId = Number(document.getElementById('af-planet').value);
  
  // Skip fuel computation in expanded mode - fuel costs are per-escort and already calculated
  if (afEscortStats.size > 0) {
    console.log(`[AF] computeFuel skipped in expanded mode`);
    return;
  }
  
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
    const sysId = Number(tr.getAttribute('data-system'));
    if (!cell || !sysId) continue;
    const est = await fuelEstimate(planetId, sysId, ships);
    if (gen !== afFuelGen) return;
    if (est.error) { cell.textContent = '—'; cell.title = est.error; continue; }
    cell.textContent = `${est.fuelCost}`;
    cell.style.color = est.inRange === false ? '#ff7b72' : '';
    cell.title = est.inRange === false ? 'Out of range' : `distance ${est.distance.toFixed(1)} ly`;
  }
}
