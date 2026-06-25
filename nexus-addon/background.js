// The `browser.*` polyfill is loaded by the service-worker entry
// (background-sw.js) via a static import before this module runs, so `browser`
// is defined here on both Chrome (polyfilled) and Firefox (native). Tests import
// this file directly with a stubbed `browser`, skipping the polyfill entirely.

const GAME_URL = 'https://s0.nexuslegacy.space';
const REPORTS_PATH = '/api/fleet/survey-reports';
const PIRATES_PATH = '/api/fleet/pirate-reports';
const SPY_PATH = '/api/fleet/spy-reports';
const CAMP_SCOUT_PATH = '/api/fleet/camp-scout-reports';
const PIRATE_CAMPS_PATH = '/api/fleet/pirate-camps';
const WORMHOLES_PATH = '/api/fleet/wormholes';
const MISSIONS_PATH = '/api/fleet/missions';
const RESEARCH_PATH = '/api/research';
const MINING_PATH = '/api/fleet/mining-reports';
const EXPEDITION_PATH = '/api/fleet/expedition-reports';
const WORMHOLE_PATH = '/api/fleet/wormhole-runs';
const SYSTEM_DEBRIS_PATH = '/api/fleet/system-debris';
const INTEL_KEEP = 200;
const ALARM = 'nexus-scrape';
const INTERVAL_MIN = 15;
// Bump this when stored data shape changes; add a MIGRATIONS entry for it.
const SCHEMA_VERSION = 7;

// ── Setup ──────────────────────────────────────────────────────────────────

browser.runtime.onInstalled.addListener(async details => {
  browser.alarms.create(ALARM, { periodInMinutes: INTERVAL_MIN });
  // Snapshot existing data before the new version touches it.
  if (details.reason === 'update') {
    try {
      await backupToDownloads(`pre-update-${details.previousVersion || 'unknown'}`);
    } catch (err) {
      console.warn('[NexusAccounting] Pre-update backup failed:', err);
    }
  }
  await scrape();
});

browser.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === ALARM) scrape();
});

browser.action.onClicked.addListener(() => {
  browser.tabs.create({ url: browser.runtime.getURL('dashboard.html') });
});

browser.runtime.onMessage.addListener(msg => {
  if (msg.type === 'SCRAPE_NOW') return scrape().then(() => ({ ok: true }));
  if (msg.type === 'GET_FLEET') return getFleet(msg.planetId);
  if (msg.type === 'GET_SHIP_DEFS') return getShipDefs();
  if (msg.type === 'GET_PLANET_SHIPS') return getPlanetShips(msg.planetId);
  if (msg.type === 'GET_MISSIONS') return apiGet('/api/fleet/missions');
  if (msg.type === 'GET_FUEL_ESTIMATE') {
    // POST: routed through the game tab (same-origin) — a Bearer POST from the
    // extension carries an Origin header the server 500s on.
    return gamePost('/api/fleet/fuel-estimate', msg.body).then(r => (r && r.ok) ? r.data : r);
  }
  if (msg.type === 'GET_SURVEY_COOLDOWNS') return apiGet('/api/fleet/survey-cooldowns');
  if (msg.type === 'GET_SURVEY_REPORTS') return apiGet('/api/fleet/survey-reports');
  if (msg.type === 'SEND_MINE') {
    return gamePost('/api/fleet/mine', {
      sourcePlanetId: msg.sourcePlanetId, targetFieldId: msg.targetFieldId,
      ships: msg.ships, miningDuration: msg.miningDuration,
    });
  }
  if (msg.type === 'SEND_SURVEY') {
    return gamePost('/api/fleet/survey', {
      sourcePlanetId: msg.sourcePlanetId, targetSystemId: msg.targetSystemId, ships: msg.ships,
    });
  }
  if (msg.type === 'SEND_INVESTIGATE') {
    return gamePost('/api/fleet/investigate', {
      sourcePlanetId: msg.sourcePlanetId, reportId: msg.reportId, ships: msg.ships,
    });
  }
  if (msg.type === 'GET_PLANETS') return getPlanets();
  if (msg.type === 'REBUILD_AGGREGATES') return enqueue(rebuildAggregates).then(() => ({ ok: true }));
  if (msg.type === 'BACKUP_NOW') return backupToDownloads(msg.reason || 'manual').then(() => ({ ok: true })).catch(e => ({ error: e.message }));
  if (msg.type === 'GET_ARMS') return apiGet('/api/galaxy/arms');
  if (msg.type === 'GET_GALAXY_MAP') return apiGet('/api/galaxy/map');
  if (msg.type === 'GET_SYSTEM_PLANETS') return apiGet(`/api/galaxy/systems/${msg.systemId}/planets`);
  if (msg.type === 'GET_ARM_SECTORS') return apiGet(`/api/galaxy/arms/${msg.armId}/sectors`);
  if (msg.type === 'GET_SECTOR_SYSTEMS') return apiGet(`/api/galaxy/sectors/${msg.sectorId}/systems`);
  if (msg.type === 'GET_HOME') return getHome();
  if (msg.type === 'GET_SYSTEM_COORDS') return getSystemCoords(msg.names || [], msg.ids || []);
  if (msg.type === 'GET_ALLIANCE') return getAlliance();
  if (msg.type === 'GET_RESOURCES') return getResources();
  if (msg.type === 'GET_HUBS') return apiGet('/api/market/hubs');
  if (msg.type === 'GET_MARKET_ORDERS') return getOrders('/api/market/orders');
  if (msg.type === 'GET_ALLIANCE_ORDERS') return getOrders('/api/alliance-trade/orders');
  if (msg.type === 'START_RESEARCH') return startResearch(msg.researchId, msg.planetId, msg.useFragments);
});

// Launch a research on a planet: POST /api/research/{id}/start { planetId }.
// (Endpoint mirrors the game client.) Refreshes stored state on success so the
// dashboard reflects the new active research.
async function startResearch(researchId, planetId, useFragments = false) {
  const token = await getToken();
  if (!token) return { error: 'Not logged in to Nexus Legacy.' };
  if (researchId == null || planetId == null) return { error: 'Missing research or planet id.' };
  try {
    const body = { planetId };
    if (useFragments) body.useFragments = true;
    const r = await fetch(`${GAME_URL}/api/research/${researchId}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      let m = `${r.status}`;
      try { const j = await r.json(); m = j.message || j.error || m; } catch { /* non-JSON */ }
      return { error: `Start failed: ${m}` };
    }
    const data = await r.json().catch(() => ({}));
    await scrape();   // pick up the new active research
    return { ok: true, data };
  } catch (e) {
    return { error: e.message };
  }
}

// The highest-level Research Lab building in a planet response, or null.
// `buildings` sits at the response wrapper level (a sibling of `planet`), so
// pass the whole response; scan every array field for the research_lab entry.
function findResearchLab(resp) {
  let best = null;
  for (const v of Object.values(resp || {})) {
    if (!Array.isArray(v)) continue;
    for (const b of v) {
      if (b?.definition?.key === 'research_lab' || b?.key === 'research_lab') {
        if (!best || (b.level || 0) > (best.level || 0)) best = b;
      }
    }
  }
  return best;
}

// Total stored resources + production rates across all your planets, plus
// research-planner inputs: highest research-lab level (+ its definition and the
// host planet's build-speed), the count of planets (= parallel research slots),
// and any in-progress lab upgrade end time.
async function getResources() {
  const token = await getToken();
  if (!token) return { error: 'Not logged in to Nexus Legacy.' };
  try {
    const data = await apiFetch('/api/planets', token);
    const planets = data.planets || [];
    const keys = ['ore', 'silicates', 'hydrogen', 'alloys',
      'oreRate', 'silicatesRate', 'hydrogenRate', 'alloysRate'];
    const tot = Object.fromEntries(keys.map(k => [k, 0]));
    let labLevel = 0, labDef = null, buildSpeedMult = 1, labUpgradeEndsAt = null;
    const researchPlanets = [];   // { id, name, mult } — one research slot each
    for (const p of planets) {
      const d = await apiFetch(`/api/planets/${p.id}`, token);
      const pl = d.planet || d;
      for (const k of keys) tot[k] += pl[k] || 0;
      const lab = findResearchLab(d);
      if (lab && (lab.level || 0) > labLevel) {
        labLevel = lab.level || 0;
        labDef = lab.definition || null;
        buildSpeedMult = d.buildSpeedMult || 1;
        labUpgradeEndsAt = lab.isUpgrading ? (lab.upgradeEndsAt || null) : null;
      }
      // Research speed is per-planet; actual time = nextResearchTime × this mult.
      try {
        const r = await apiFetch(`/api/research?planetId=${p.id}`, token);
        researchPlanets.push({ id: p.id, name: p.name || `Planet #${p.id}`, mult: r.researchSpeedMult || 1 });
      } catch { /* skip this planet's slot */ }
    }
    tot.labLevel = labLevel;
    tot.labDef = labDef;
    tot.buildSpeedMult = buildSpeedMult;
    tot.labUpgradeEndsAt = labUpgradeEndsAt;
    tot.planetCount = planets.length;
    tot.researchPlanets = researchPlanets;
    tot.planetSpeeds = researchPlanets.map(rp => rp.mult);
    return tot;
  } catch (err) {
    return { error: err.message };
  }
}

// Your alliance tag + member ids, so the finder can flag alliance-owned
// planets it scans.
async function getAlliance() {
  const token = await getToken();
  if (!token) return { error: 'Not logged in to Nexus Legacy.' };
  try {
    const data = await apiFetch('/api/alliances/my', token);
    const a = data.alliance || {};
    const members = a.members || [];
    return {
      tag: a.tag || null,
      name: a.name || null,
      memberIds: members.map(m => m.userId).filter(x => x != null),
    };
  } catch (err) {
    return { error: err.message };
  }
}

// Home reference for the planet finder: home system coords (for distance) and
// the player's user id (to flag/exclude own planets).
async function getHome() {
  const token = await getToken();
  if (!token) return { error: 'Not logged in to Nexus Legacy.' };
  try {
    const data = await apiFetch('/api/planets', token);
    const planets = data.planets || [];
    const home = planets.find(p => p.isHomeworld) || planets[0];
    if (!home) return { error: 'No planets found for this account' };
    const systemId = home.systemId ?? home.system?.id ?? null;
    // /api/planets carries no userId; read it from the JWT payload instead.
    const userId = home.userId ?? jwtUserId(token);
    const ownedSystemIds = planets.map(p => p.systemId ?? p.system?.id).filter(x => x != null);
    return { systemId, userId, name: home.name || null, ownedSystemIds };
  } catch (err) {
    return { error: err.message };
  }
}

// Decode the userId claim from the nexus_token JWT payload (best-effort).
function jwtUserId(token) {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(payload)).userId ?? null;
  } catch {
    return null;
  }
}

function jwtRace(token) {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(payload)).race ?? null;
  } catch {
    return null;
  }
}

// All open orders from a paginated orders endpoint (public market or alliance
// trade), across every page.
async function getOrders(path) {
  const token = await getToken();
  if (!token) return { error: 'Not logged in to Nexus Legacy.' };
  try {
    const first = await apiFetch(`${path}?page=1&limit=100`, token);
    const limit = first.pagination?.limit || 100;        // server may cap below 100
    const total = first.pagination?.total ?? (first.orders || []).length;
    const orders = [...(first.orders || [])];
    const pages = Math.ceil(total / limit);
    if (pages > 1) {
      const rest = await Promise.all(
        Array.from({ length: pages - 1 }, (_, i) =>
          apiFetch(`${path}?page=${i + 2}&limit=${limit}`, token)
            .then(d => d.orders || []).catch(() => [])));
      for (const o of rest) orders.push(...o);
    }
    return { orders };
  } catch (err) {
    return { error: err.message };
  }
}

// Authenticated GET for dashboard pages (they have no cookie access of their own).
async function apiGet(path) {
  const token = await getToken();
  if (!token) return { error: 'Not logged in to Nexus Legacy.' };
  try {
    return await apiFetch(path, token);
  } catch (err) {
    return { error: err.message };
  }
}

// ── Auth ───────────────────────────────────────────────────────────────────

// Find the nexus_token cookie. It can live outside the default store — a
// Firefox container tab, a private window, or as a partitioned (CHIPS)
// cookie — so fall back to searching every cookie store domain-wide.
async function getToken() {
  const NAME = 'nexus_token';
  const urls = [GAME_URL, 'https://nexuslegacy.space'];

  const lookup = async (storeId) => {
    const store = storeId ? { storeId } : {};
    for (const url of urls) {
      try {
        const c = await browser.cookies.get({ url, name: NAME, ...store });
        if (c?.value) return c.value;
      } catch { /* store may not support get */ }
    }
    try {
      const all = await browser.cookies.getAll({ domain: 'nexuslegacy.space', name: NAME, ...store });
      const hit = (all || []).find(c => c.value);
      if (hit) return hit.value;
    } catch { /* ignore */ }
    return null;
  };

  const direct = await lookup(null);
  if (direct) return direct;

  let storeIds = [];
  try {
    const stores = await browser.cookies.getAllCookieStores();
    storeIds = (stores || []).map(s => s.id);
    for (const s of (stores || [])) {
      const v = await lookup(s.id);
      if (v) return v;
    }
  } catch (e) {
    console.warn('[NexusAccounting] getAllCookieStores failed:', e.message);
  }

  console.warn(`[NexusAccounting] nexus_token not found. Checked default + stores: [${storeIds.join(', ')}]. ` +
    `Open the game (logged in) in a normal tab, or check the cookie exists on s0.nexuslegacy.space.`);
  return null;
}

// ── API ────────────────────────────────────────────────────────────────────

async function apiFetch(path, token) {
  let r;
  try {
    r = await fetch(`${GAME_URL}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (e) {
    throw new Error(`API ${path} → ${e.message}`, { cause: e });   // network/CORS/blocked
  }
  if (!r.ok) throw new Error(`API ${path} → ${r.status}`);
  return r.json();
}

// Home planet id, discovered once via /api/planets and cached.
async function getHomePlanetId(token) {
  const { planet_id } = await browser.storage.local.get('planet_id');
  if (planet_id) return planet_id;
  const data = await apiFetch('/api/planets', token);
  const planets = data.planets || [];
  const home = planets.find(p => p.isHomeworld) || planets[0];
  if (!home) throw new Error('No planets found for this account');
  await browser.storage.local.set({ planet_id: home.id });
  console.log(`[NexusAccounting] Home planet: ${home.name} (#${home.id})`);
  return home.id;
}

// ── Fuel ─────────────────────────────────────────────────────────────────────
// Hydrogen burned by a mission: fuel = Σ(fuelRate × qty) × (FUEL_K × distance + FUEL_BASE)
// Constants fitted to 14 real send-fleet costs spanning mixed fleets and
// distances (mean error ~6%). Verified accurate for survey missions.
// NOTE: m.distance from the API is NOT in the same units as galaxy-map
// coordinates — the simulator uses COORD_TO_FUEL_AU (1/57.4) to convert.
const FUEL_K    = 0.0496;
const FUEL_BASE = 3.48;

// Map a mission type to a dashboard tab key for fuel accounting.
function fuelMissionType(t) {
  const s = (t || '').toLowerCase();
  if (s.includes('debris')) return 'debris';
  if (s.includes('survey') || s.includes('investigate') || s.includes('anomaly')) return 'survey';
  if (s.includes('min')) return 'mining';
  if (s.includes('raid') || s.includes('pirate') || s.includes('attack')) return 'pirate';
  if (s.includes('expedition') || s.includes('wormhole')) return 'expedition';
  return 'other';
}

function fleetFuelRate(fleetMap, ships) {
  // `ships` is keyed by numeric id; build a key→def index (fleets use keys).
  const byKey = {};
  for (const d of Object.values(ships || {})) if (d && d.key) byKey[d.key] = d;
  let rate = 0;
  for (const [key, qty] of Object.entries(fleetMap || {})) {
    const def = ships[key] || byKey[key];
    if (def) rate += (def.fuelRate || 0) * qty;
  }
  return rate;
}

// Precise fuel from a captured mission: its real fleet + real distance.
function missionFuel(mo, ships) {
  if (!mo || mo.distance == null || !(mo.fleet && mo.fleet.length)) return null;
  const fleetMap = mo.fleet.reduce((m, i) => { m[i.key] = (m[i.key] || 0) + (i.quantity || 1); return m; }, {});
  const rate = fleetFuelRate(fleetMap, ships);
  if (!rate) return null;
  return Math.round(rate * (FUEL_K * mo.distance + FUEL_BASE));
}

// Current stationed fleet as { shipKey: usableQuantity } — for the simulator.
async function getPlanets() {
  const token = await getToken();
  if (!token) return { error: 'Not logged in to Nexus Legacy.' };
  try {
    const data = await apiFetch('/api/planets', token);
    const planets = (data.planets || []).map(p => ({
      id: p.id,
      name: p.name || `Planet ${p.id}`,
      isHomeworld: !!p.isHomeworld,
      systemId: p.systemId ?? p.system?.id ?? null,
      systemName: p.systemName || null,
    }));
    return { planets };
  } catch (err) {
    return { error: err.message };
  }
}

async function getFleet(planetId) {
  const token = await getToken();
  if (!token) return { error: 'Not logged in to Nexus Legacy.' };
  try {
    let targets;
    if (planetId === 'all') {
      const data = await apiFetch('/api/planets', token);
      targets = (data.planets || []).map(p => p.id);
    } else {
      targets = [planetId || await getHomePlanetId(token)];
    }
    const fleet = {};
    for (const id of targets) {
      const data = await apiFetch(`/api/planets/${id}/fleet`, token);
      for (const f of (data.fleet || [])) {
        const key = f.definition?.key;
        const qty = (f.quantity || 0) - (f.damagedQuantity || 0);
        if (key && qty > 0) fleet[key] = (fleet[key] || 0) + qty;
      }
    }
    return { fleet };
  } catch (err) {
    return { error: err.message };
  }
}

// Full ship catalog (all types, owned or not) from the shipyard, so templates
// can include combat escorts you don't currently field. Raw shipDefId (= the
// shipyard ship id) is what the mine endpoint needs.
async function getShipDefs() {
  const token = await getToken();
  if (!token) return { error: 'Not logged in to Nexus Legacy.' };
  try {
    const planetId = await getHomePlanetId(token);
    const data = await apiFetch(`/api/planets/${planetId}/shipyard`, token);
    const race = jwtRace(token);
    const ships = (data.ships || []).map(s => ({
      shipDefId: s.id,
      name: s.name || `#${s.id}`,
      imageUrl: (race && s.key) ? `https://s0.nexuslegacy.space/api/images/ships/${race}/${s.key}.webp` : null,
      shipClass: s.shipClass || '',
      miningCargo: s.miningCargoCapacity || 0,
      sortOrder: s.sortOrder || 0,
      attack: s.attack || 0,
      hp: s.hp || 0,
      shieldHp: s.shieldHp || 0,
      weaponType: s.weaponType || null,
      armorType: s.armorType || '',
    }));
    return { ships };
  } catch (err) {
    return { error: err.message };
  }
}

// Ships actually available on one planet, as { shipDefId: undamagedQuantity }.
async function getPlanetShips(planetId) {
  const token = await getToken();
  if (!token) return { error: 'Not logged in to Nexus Legacy.' };
  if (planetId == null) return { error: 'No planet selected.' };
  try {
    const data = await apiFetch(`/api/planets/${planetId}/fleet`, token);
    const available = {};
    for (const f of (data.fleet || [])) {
      const qty = (f.quantity || 0) - (f.damagedQuantity || 0);
      if (qty > 0) available[f.shipDefId] = qty;
    }
    return { available };
  } catch (err) {
    return { error: err.message };
  }
}

// POST a fleet action (mine / survey / investigate) through the game tab's
// content script, so the request is same-origin with the session cookie —
// identical to the game's own call. A Bearer request straight from the
// extension is rejected by the server (500).
async function gamePost(path, body) {
  if (!(body.ships || []).length) return { error: 'No ships selected.' };
  const token = await getToken();
  try {
    const tabs = await browser.tabs.query({ url: 'https://s0.nexuslegacy.space/*' });
    if (!tabs.length) return { error: 'Open the Nexus Legacy game in a tab first.' };
    return await browser.tabs.sendMessage(tabs[0].id, { type: 'GAME_FETCH', method: 'POST', path, token, body });
  } catch (e) {
    return { error: e.message };
  }
}

// ── Processing queue ───────────────────────────────────────────────────────
// All storage writes go through one chain so an intercepted game response
// and a scheduled scrape can never interleave their read-modify-write cycles.

let processing = Promise.resolve();

function enqueue(fn) {
  processing = processing.then(fn).catch(async err => {
    console.error('[NexusAccounting] Processing failed:', err);
    await browser.storage.local.set({ last_error: err.message });
  });
  return processing;
}

// ── Report archives ─────────────────────────────────────────────────────────
// Uncapped history, sharded by month (`survey_archive_2026-06`, …) so a scrape
// only rewrites the current month instead of the whole history. The index
// tracks shard months and counts per type.

const ARCHIVE_TYPES = ['survey', 'pirate', 'mining', 'exp'];

function emptyArchiveIndex() {
  const idx = {};
  for (const t of ARCHIVE_TYPES) idx[t] = { months: [], count: 0 };
  return idx;
}

async function getArchiveIndex() {
  const { archive_index } = await browser.storage.local.get('archive_index');
  return archive_index || emptyArchiveIndex();
}

async function appendToArchive(type, records) {
  if (!records.length) return;
  const index = await getArchiveIndex();
  const byMonth = {};
  for (const r of records) {
    const m = (r.created_at || '').slice(0, 7) || 'unknown';
    (byMonth[m] = byMonth[m] || []).push(r);
  }
  for (const [m, recs] of Object.entries(byMonth)) {
    const key = `${type}_archive_${m}`;
    const cur = (await browser.storage.local.get(key))[key] || [];
    await browser.storage.local.set({ [key]: [...recs, ...cur] });
    if (!index[type].months.includes(m)) index[type].months.push(m);
    index[type].count += recs.length;
  }
  index[type].months.sort();
  await browser.storage.local.set({ archive_index: index });
}

async function loadArchive(type) {
  const index = await getArchiveIndex();
  const keys = index[type].months.map(m => `${type}_archive_${m}`);
  if (!keys.length) return [];
  const got = await browser.storage.local.get(keys);
  const out = [];
  for (const k of keys) out.push(...(got[k] || []));
  return out;
}

// ── Processors ─────────────────────────────────────────────────────────────

function parseShipsLost(shipsLost) {
  const counts = {};
  for (const item of (shipsLost || [])) {
    const id = item.shipDefId;
    if (id != null) counts[id] = (counts[id] || 0) + (item.quantity || 1);
  }
  return counts;
}

// A damaged ship costs half its build cost to repair.
const REPAIR_FACTOR = 0.5;

function emptyResources() {
  return { ore: 0, silicates: 0, hydrogen: 0, alloys: 0, rare: {} };
}

// Value a tolerant ship-loss array into `into`. Items may be keyed by
// shipDefId ({ shipDefId, quantity }) or by ship key ({ key, lost }) — combat
// results (shipsDestroyed) use the latter. ships is the defId-keyed catalog.
function addLossCost(arr, ships, into, factor = 1) {
  if (!arr || !arr.length) return;
  let byKey = addLossCost._byKey;
  if (!byKey || byKey._for !== ships) {
    byKey = { _for: ships };
    for (const s of Object.values(ships)) if (s && s.key) byKey[s.key] = s;
    addLossCost._byKey = byKey;
  }
  for (const it of arr) {
    const ship = (it.shipDefId != null && ships[it.shipDefId]) || (it.key && byKey[it.key]);
    if (!ship) continue;
    const q = (it.quantity ?? it.lost ?? it.destroyed ?? 1) * factor;
    into.ore += q * (ship.costOre || 0);
    into.silicates += q * (ship.costSilicates || 0);
    into.hydrogen += q * (ship.costHydrogen || 0);
    into.alloys += q * (ship.costAlloys || 0);
    for (const [k, v] of Object.entries(ship.rareCosts || {})) {
      into.rare[k] = (into.rare[k] || 0) + q * v;
    }
  }
}
function emptyLost() {
  return { destroyed: emptyResources(), repair: emptyResources() };
}

// Add the build-cost value of a { shipDefId: qty } map into `into`, scaled by
// factor (1 for destroyed ships, REPAIR_FACTOR for damaged ones).
function addShipCost(detail, ships, into, factor) {
  for (const [defId, qty] of Object.entries(detail || {})) {
    const ship = ships[defId];
    if (!ship) continue;
    const q = qty * factor;
    into.ore += q * ship.costOre;
    into.silicates += q * ship.costSilicates;
    into.hydrogen += q * ship.costHydrogen;
    into.alloys += q * ship.costAlloys;
    for (const [k, v] of Object.entries(ship.rareCosts || {})) {
      into.rare[k] = (into.rare[k] || 0) + q * v;
    }
  }
}

// ── Security zones ──────────────────────────────────────────────────────────
// Only survey reports carry securityZone directly. For others we resolve the
// zone from the system in their location string via a cached system→zone map
// built from the galaxy map (refreshed at most once a day — it's large).

const ZONE_REFRESH_MS = 24 * 3600 * 1000;

async function getSystemZones(token) {
  const { system_zones, system_zones_at, system_coords_by_id } =
    await browser.storage.local.get(['system_zones', 'system_zones_at', 'system_coords_by_id']);
  if (system_zones && system_zones_at && system_coords_by_id && Date.now() - system_zones_at < ZONE_REFRESH_MS) {
    return system_zones;
  }
  try {
    const data = await apiFetch('/api/galaxy/map', token);
    const map = {};        // name → zone
    const byId = {};       // systemId → zone
    const coordsById = {}; // systemId → {x, y}  (AU — galaxy map units = AU, verified 2026-06-22)
    const coordsByName = {};
    for (const s of (data.systems || [])) {
      if (s.securityZone) {
        if (s.name) map[s.name] = s.securityZone;
        if (s.id != null) byId[s.id] = s.securityZone;
      }
      if (s.id != null && s.x != null) {
        coordsById[s.id] = { x: s.x, y: s.y, name: s.name || null };
        if (s.name) coordsByName[s.name] = { x: s.x, y: s.y };
      }
    }
    await browser.storage.local.set({
      system_zones: map, system_zone_by_id: byId, system_zones_at: Date.now(),
      system_coords_by_id: coordsById, system_coords_by_name: coordsByName,
    });
    return map;
  } catch {
    return system_zones || {};   // keep the stale map on failure
  }
}

async function getSystemCoords(names, ids) {
  const { system_coords_by_id, system_coords_by_name } =
    await browser.storage.local.get(['system_coords_by_id', 'system_coords_by_name']);
  const byId = system_coords_by_id || {};
  const byName = system_coords_by_name || {};
  const result = {};
  for (const n of names) result[n] = byName[n] || null;
  for (const id of ids) result[id] = byId[id] || null;
  return result;
}

// "A12-27 / A12-27-AF1" or "A12-27-AF1" → system "A12-27".
function systemFromLocation(loc) {
  if (!loc) return null;
  const dest = loc.includes('/') ? loc.split('/').pop().trim() : loc.trim();
  const m = dest.match(/^([A-Za-z]+\d+-\d+)/);
  return m ? m[1] : null;
}

function resolveZone(systemName, zones) {
  return (systemName && zones[systemName]) || 'unknown';
}

// Pirate reports reference only a campId; pirate-camps maps that to a system,
// which the galaxy map maps to a zone. Cached so completed-raid reports (and
// the back-fill) can resolve their zone.
async function getCampZones(token, zones) {
  let camps;
  try {
    camps = (await apiFetch(PIRATE_CAMPS_PATH, token)).camps || [];
  } catch {
    const { camp_zones } = await browser.storage.local.get('camp_zones');
    return camp_zones || {};
  }
  const { camp_zones } = await browser.storage.local.get('camp_zones');
  const map = { ...(camp_zones || {}) };   // keep camps that have since despawned
  for (const c of camps) {
    if (c.id != null) map[c.id] = resolveZone(c.systemName, zones);
  }
  await browser.storage.local.set({ camp_zones: map });
  return map;
}

// Wormhole runs reference only a wormholeId; the wormholes endpoint maps that
// to a system → zone. Cached so completed runs (and the back-fill) resolve.
async function getWormholeZones(token, zones) {
  let holes;
  try {
    holes = (await apiFetch(WORMHOLES_PATH, token)).wormholes || [];
  } catch {
    const { wormhole_zones } = await browser.storage.local.get('wormhole_zones');
    return wormhole_zones || {};
  }
  const got = await browser.storage.local.get(['wormhole_zones', 'wormhole_classes']);
  const map = { ...(got.wormhole_zones || {}) };       // keep wormholes that have closed
  const classes = { ...(got.wormhole_classes || {}) };
  for (const w of holes) {
    if (w.id == null) continue;
    map[w.id] = resolveZone(w.systemName, zones);
    if (w.wormholeClass) classes[w.id] = w.wormholeClass;
  }
  await browser.storage.local.set({ wormhole_zones: map, wormhole_classes: classes });
  return map;
}

// One-time back-fill of the `zone` field on records stored before zones were
// tracked, using the cached system→zone map. Without this, old records read
// as 'unknown' and zone filtering shows nothing for real zones. seen_ids
// blocks re-ingestion, so the records must be patched in place.
async function backfillZones(zones, campZones = {}, wormholeZones = {}) {
  const { zones_backfilled } = await browser.storage.local.get('zones_backfilled');
  if (zones_backfilled) return;

  const recentKey = {
    survey: 'recent_reports', pirate: 'pirate_recent_reports',
    mining: 'mining_recent_reports', exp: 'exp_recent_reports',
  };
  const whId = r => r.wormhole_id ?? (String(r.location || '').match(/Wormhole #(\d+)/) || [])[1];
  const stamp = (r, type) => {
    if (r.zone) return r;
    if (type === 'survey') r.zone = resolveZone(r.system_name, zones);
    else if (type === 'mining') r.zone = resolveZone(systemFromLocation(r.location), zones);
    else if (type === 'exp') r.zone = wormholeZones[whId(r)] || resolveZone(systemFromLocation(r.location), zones);
    else if (type === 'pirate') r.zone = campZones[r.camp_id] || 'unknown';
    else r.zone = 'unknown';
    return r;
  };

  const idx = await getArchiveIndex();
  for (const type of ARCHIVE_TYPES) {
    const keys = [recentKey[type], ...idx[type].months.map(m => `${type}_archive_${m}`)];
    for (const key of keys) {
      const got = await browser.storage.local.get(key);
      if (got[key]) await browser.storage.local.set({ [key]: got[key].map(r => stamp(r, type)) });
    }
  }
  await browser.storage.local.set({ zones_backfilled: true });
  console.log('[NexusAccounting] Zone back-fill complete.');
}

// Ship catalog keyed by shipDefId
function buildShipCatalog(shipyardData) {
  const ships = {};
  for (const s of (shipyardData.ships || [])) {
    ships[s.id] = {
      key: s.key,
      name: s.name,
      costOre: s.costOre || 0,
      costSilicates: s.costSilicates || 0,
      costHydrogen: s.costHydrogen || 0,
      costAlloys: s.costAlloys || 0,
      rareCosts: s.rareCosts || {},
      // Combat stats for the simulator
      hp: s.hp || 0,
      shieldHp: s.shieldHp || 0,
      attack: s.attack || 0,
      weaponType: s.weaponType || null,
      armorType: s.armorType || null,
      shipClass: s.shipClass || 'utility',
      shipSize: s.shipSize || 'small',
      sortOrder: s.sortOrder || 0,
      // Logistics
      fuelRate: s.fuelRate || 0,            // hydrogen per AU travelled
      cargoCapacity: s.cargoCapacity || 0,
    };
  }
  return ships;
}

// Alloys + exotic resources collected (beyond ore/silicates/hydrogen).
const EXTRA_RES_KEYS = ['alloys', 'ice', 'quantum_dust', 'plasma_core', 'dark_matter', 'antimatter'];
function addExtraRes(target, loot) {
  for (const k of EXTRA_RES_KEYS) { const v = loot[k] || 0; if (v) target[k] = (target[k] || 0) + v; }
}
function extrasOf(loot) {
  const o = {};
  for (const k of EXTRA_RES_KEYS) { const v = loot[k] || 0; if (v) o[k] = v; }
  return o;
}

async function processSurveyReports(reports, ships, zones = {}) {
  const stored = await browser.storage.local.get([
    'seen_ids', 'totals', 'daily', 'hourly', 'resources_lost',
    'event_breakdown', 'recent_reports', 'records_cap',
  ]);
  const recordsCap = stored.records_cap ?? 500;

  const seenIds = new Set(stored.seen_ids || []);
  const totals = stored.totals || {
    ore: 0, hydrogen: 0, silicates: 0, missions: 0, ships_lost: 0,
    first_report: null, last_report: null,
  };

  const dailyMap = {};
  for (const d of (stored.daily || [])) dailyMap[d.day] = { ...d };

  const hourlyMap = {};
  for (const h of (stored.hourly || [])) hourlyMap[h.hour] = { ...h };

  const resourcesLost = stored.resources_lost?.destroyed ? stored.resources_lost : emptyLost();

  const eventMap = {};
  for (const e of (stored.event_breakdown || [])) eventMap[e.event_type] = { ...e };

  const recentReports = [...(stored.recent_reports || [])];

  const newReports = reports.filter(r => !seenIds.has(r.id));

  for (const r of newReports) {
    // Not yet investigated — anomaly pending exploration, skip and retry next scrape.
    if (!r.investigated) continue;
    // Loot not yet collected — skip and retry next scrape.
    if (r.uncollectedLoot !== null) continue;

    seenIds.add(r.id);
    const loot = r.loot || {};
    const ore = loot.ore || 0;
    const hydrogen = loot.hydrogen || 0;
    const silicates = loot.silicates || 0;
    const nLost = (r.shipsLost || []).reduce((sum, item) => sum + (item.quantity || 1), 0);
    const lostDetail = parseShipsLost(r.shipsLost);
    const damagedDetail = parseShipsLost(r.shipsDamaged);
    const nDamaged = Object.values(damagedDetail).reduce((sum, q) => sum + q, 0);

    totals.ore += ore;
    totals.hydrogen += hydrogen;
    totals.silicates += silicates;
    totals.missions += 1;
    totals.ships_lost += nLost;
    addExtraRes(totals, loot);

    const day = r.createdAt.slice(0, 10);
    if (!dailyMap[day]) dailyMap[day] = { day, ore: 0, hydrogen: 0, silicates: 0, missions: 0, ships_lost: 0 };
    dailyMap[day].ore += ore;
    dailyMap[day].hydrogen += hydrogen;
    dailyMap[day].silicates += silicates;
    dailyMap[day].missions += 1;
    dailyMap[day].ships_lost += nLost;
    addExtraRes(dailyMap[day], loot);

    const hour = r.createdAt.slice(0, 13) + ':00';
    if (!hourlyMap[hour]) hourlyMap[hour] = { hour, ore: 0, hydrogen: 0, silicates: 0, missions: 0, ships_lost: 0 };
    hourlyMap[hour].ore += ore;
    hourlyMap[hour].hydrogen += hydrogen;
    hourlyMap[hour].silicates += silicates;
    hourlyMap[hour].missions += 1;
    hourlyMap[hour].ships_lost += nLost;
    addExtraRes(hourlyMap[hour], loot);

    const et = r.eventType || 'unknown';
    if (!eventMap[et]) eventMap[et] = { event_type: et, count: 0, ore: 0, hydrogen: 0, silicates: 0 };
    eventMap[et].count += 1;
    eventMap[et].ore += ore;
    eventMap[et].hydrogen += hydrogen;
    eventMap[et].silicates += silicates;
    addExtraRes(eventMap[et], loot);

    addShipCost(lostDetail, ships, resourcesLost.destroyed, 1);
    addShipCost(damagedDetail, ships, resourcesLost.repair, REPAIR_FACTOR);

    recentReports.unshift({
      id: r.id,
      created_at: r.createdAt,
      system_name: r.systemName,
      event_type: r.eventType,
      zone: r.securityZone || resolveZone(r.systemName, zones),
      ore, hydrogen, silicates, ...extrasOf(loot),
      ships_lost: nLost,
      ships_damaged: nDamaged,
      wormholes_detected: r.wormholesDetected || 0,
      ships_lost_detail: lostDetail,
      ships_damaged_detail: damagedDetail,
    });
  }

  const timestamps = reports.map(r => r.createdAt).sort();
  if (timestamps.length) {
    totals.first_report = timestamps[0];
    totals.last_report = timestamps[timestamps.length - 1];
  }

  const addedSurveys = recentReports.length - (stored.recent_reports || []).length;
  await appendToArchive('survey', recentReports.slice(0, addedSurveys));

  await browser.storage.local.set({
    seen_ids: [...seenIds],
    totals,
    daily: Object.values(dailyMap).sort((a, b) => a.day.localeCompare(b.day)),
    hourly: Object.values(hourlyMap).sort((a, b) => a.hour.localeCompare(b.hour)),
    resources_lost: resourcesLost,
    event_breakdown: Object.values(eventMap).sort((a, b) => b.count - a.count),
    recent_reports: recentReports.slice(0, recordsCap),
    last_scrape: new Date().toISOString(),
    last_error: null,
    schema_version: SCHEMA_VERSION,
  });

  return newReports.length;
}

async function processPirateReports(pirateReports, ships, campZones = {}) {
  const pstored = await browser.storage.local.get([
    'pirate_seen_ids', 'pirate_totals', 'pirate_daily', 'pirate_resources_lost',
    'pirate_outcomes', 'pirate_debris_total', 'pirate_recent_reports', 'records_cap',
  ]);
  const recordsCap = pstored.records_cap ?? 500;

  const pirateSeen = new Set(pstored.pirate_seen_ids || []);
  const pirateTotals = pstored.pirate_totals || {
    ore: 0, hydrogen: 0, silicates: 0, raids: 0,
    ships_destroyed: 0, ships_damaged: 0, pirates_destroyed: 0,
    first_report: null, last_report: null,
  };

  const pirateDailyMap = {};
  for (const d of (pstored.pirate_daily || [])) pirateDailyMap[d.day] = { ...d };

  const pirateLost = pstored.pirate_resources_lost?.destroyed ? pstored.pirate_resources_lost : emptyLost();

  const outcomeMap = {};
  for (const o of (pstored.pirate_outcomes || [])) outcomeMap[o.outcome] = { ...o };

  const pirateDebris = pstored.pirate_debris_total || { ore: 0, alloys: 0, silicates: 0 };
  const pirateRecent = [...(pstored.pirate_recent_reports || [])];

  const newPirateReports = pirateReports.filter(r => !pirateSeen.has(r.id));

  for (const r of newPirateReports) {
    pirateSeen.add(r.id);
    const loot = r.loot || {};
    const ore = loot.ore || 0;
    const hydrogen = loot.hydrogen || 0;
    const silicates = loot.silicates || 0;

    // attackerLosses items: { shipDefId, lost, damaged, destroyed } —
    // only destroyed ships are gone for good, damaged ones survive.
    const destroyedDetail = {};
    const damagedDetail = {};
    let nDestroyed = 0, nDamaged = 0;
    for (const item of (r.attackerLosses || [])) {
      const destroyed = item.destroyed ?? item.lost ?? 0;
      const damaged = item.damaged || 0;
      nDestroyed += destroyed;
      nDamaged += damaged;
      if (item.shipDefId != null && destroyed) {
        destroyedDetail[item.shipDefId] = (destroyedDetail[item.shipDefId] || 0) + destroyed;
      }
      if (item.shipDefId != null && damaged) {
        damagedDetail[item.shipDefId] = (damagedDetail[item.shipDefId] || 0) + damaged;
      }
    }
    const piratesDestroyed = (r.pirateLosses || [])
      .reduce((sum, i) => sum + (i.destroyed ?? i.lost ?? 0), 0);

    pirateTotals.ore += ore;
    pirateTotals.hydrogen += hydrogen;
    pirateTotals.silicates += silicates;
    pirateTotals.raids += 1;
    pirateTotals.ships_destroyed += nDestroyed;
    pirateTotals.ships_damaged += nDamaged;
    pirateTotals.pirates_destroyed += piratesDestroyed;
    addExtraRes(pirateTotals, loot);

    const day = r.createdAt.slice(0, 10);
    if (!pirateDailyMap[day]) pirateDailyMap[day] = { day, ore: 0, hydrogen: 0, silicates: 0, raids: 0, ships_destroyed: 0 };
    pirateDailyMap[day].ore += ore;
    pirateDailyMap[day].hydrogen += hydrogen;
    pirateDailyMap[day].silicates += silicates;
    addExtraRes(pirateDailyMap[day], loot);
    pirateDailyMap[day].raids += 1;
    pirateDailyMap[day].ships_destroyed += nDestroyed;

    const outcome = r.outcome || 'unknown';
    if (!outcomeMap[outcome]) outcomeMap[outcome] = { outcome, count: 0, ore: 0, hydrogen: 0, silicates: 0 };
    outcomeMap[outcome].count += 1;
    outcomeMap[outcome].ore += ore;
    outcomeMap[outcome].hydrogen += hydrogen;
    outcomeMap[outcome].silicates += silicates;

    const debris = r.debris || {};
    pirateDebris.ore += debris.ore || 0;
    pirateDebris.alloys += debris.alloys || 0;
    pirateDebris.silicates += debris.silicates || 0;

    addShipCost(destroyedDetail, ships, pirateLost.destroyed, 1);
    addShipCost(damagedDetail, ships, pirateLost.repair, REPAIR_FACTOR);

    pirateRecent.unshift({
      id: r.id,
      created_at: r.createdAt,
      camp_id: r.campId,
      zone: r.securityZone || campZones[r.campId] || 'unknown',
      outcome,
      ore, hydrogen, silicates, ...extrasOf(loot),
      ships_lost: nDestroyed,
      ships_damaged: nDamaged,
      pirates_destroyed: piratesDestroyed,
      debris_ore: debris.ore || 0,
      debris_alloys: debris.alloys || 0,
      debris_silicates: debris.silicates || 0,
      ships_lost_detail: destroyedDetail,
      ships_damaged_detail: damagedDetail,
      // Fleet compositions kept so the simulator can replay this battle
      // and measure engine accuracy against the real outcome.
      attacker_fleet: (r.attackerFleet || []).map(i => ({ key: i.key, quantity: i.quantity || 1 })),
      pirate_fleet: (r.pirateFleet || []).map(i => ({ key: i.key, quantity: i.quantity || 1 })),
    });
  }

  const pirateTimestamps = pirateReports.map(r => r.createdAt).sort();
  if (pirateTimestamps.length) {
    pirateTotals.first_report = pirateTimestamps[0];
    pirateTotals.last_report = pirateTimestamps[pirateTimestamps.length - 1];
  }

  await appendToArchive('pirate', pirateRecent.slice(0, pirateRecent.length - (pstored.pirate_recent_reports || []).length));

  await browser.storage.local.set({
    pirate_seen_ids: [...pirateSeen],
    pirate_totals: pirateTotals,
    pirate_daily: Object.values(pirateDailyMap).sort((a, b) => a.day.localeCompare(b.day)),
    pirate_resources_lost: pirateLost,
    pirate_outcomes: Object.values(outcomeMap).sort((a, b) => b.count - a.count),
    pirate_debris_total: pirateDebris,
    pirate_recent_reports: pirateRecent.slice(0, recordsCap),
    last_scrape: new Date().toISOString(),
    last_error: null,
    schema_version: SCHEMA_VERSION,
  });

  return newPirateReports.length;
}

// Tolerant fleet extraction: any array of { key, quantity } shaped items.
function extractFleet(arr) {
  const out = [];
  for (const i of (arr || [])) {
    if (i && typeof i.key === 'string' && (i.quantity || 0) > 0) {
      out.push({ key: i.key, quantity: i.quantity });
    }
  }
  return out;
}

// Spy reports → defender intel for the simulator (latest INTEL_KEEP kept).
async function processSpyReports(reports) {
  if (!reports.length) return 0;
  const { spy_reports } = await browser.storage.local.get('spy_reports');
  const byId = {};
  for (const r of (spy_reports || [])) byId[r.id] = r;
  for (const r of reports) {
    byId[r.id] = {
      id: r.id,
      created_at: r.createdAt,
      outcome: r.outcome,
      target_name: r.targetPlanetName || r.targetStationName || r.targetFieldName || 'unknown target',
      target_user: r.targetUsername || null,
      target_system_id:   r.targetSystemId   || null,
      target_system_name: r.targetSystemName || null,
      fleet: extractFleet(r.fleetData),
      buildings: r.buildingData || [],
      defense: r.defenseData || null,
      resources: r.resourceData || {},
    };
  }
  const merged = Object.values(byId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, INTEL_KEEP);
  await browser.storage.local.set({ spy_reports: merged });
  return merged.length;
}

// Camp scout reports → pirate camp intel (shape unseen so far — parsed tolerantly).
async function processCampScoutReports(reports) {
  if (!reports.length) return 0;
  const { camp_scout_reports } = await browser.storage.local.get('camp_scout_reports');
  const byId = {};
  for (const r of (camp_scout_reports || [])) byId[r.id] = r;
  for (const r of reports) {
    const fleet = extractFleet(r.pirateFleet) .length ? extractFleet(r.pirateFleet)
      : extractFleet(r.fleet).length ? extractFleet(r.fleet)
      : extractFleet(r.campFleet);
    byId[r.id] = {
      id: r.id,
      created_at: r.createdAt,
      camp_id: r.campId ?? null,
      fleet,
    };
  }
  const merged = Object.values(byId)
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
    .slice(0, INTEL_KEEP);
  await browser.storage.local.set({ camp_scout_reports: merged });
  return merged.length;
}

// Sum numeric resource entries, ignoring internal "_"-prefixed keys
// (mining resourcesDelivered carries _cyclesDone etc.).
function numericResources(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (!k.startsWith('_') && typeof v === 'number' && v > 0) out[k] = v;
  }
  return out;
}

const CORE_RESOURCES = ['ore', 'silicates', 'hydrogen', 'alloys'];

function addResources(target, res) {
  for (const [k, v] of Object.entries(res)) {
    if (CORE_RESOURCES.includes(k)) target[k] += v;
    else target.rare[k] = (target.rare[k] || 0) + v;
  }
}

async function processMiningReports(reports, ships, zones = {}) {
  const stored = await browser.storage.local.get([
    'mining_seen_ids', 'mining_totals', 'mining_daily', 'mining_resources_lost',
    'mining_recent_reports', 'records_cap',
  ]);
  const recordsCap = stored.records_cap ?? 500;

  const seen = new Set(stored.mining_seen_ids || []);
  const totals = stored.mining_totals || {
    ore: 0, silicates: 0, hydrogen: 0, alloys: 0, rare: {},
    deliveries: 0, cycles: 0, drill_breakdowns: 0, ships_lost: 0,
    stolen: { ore: 0, silicates: 0, hydrogen: 0, alloys: 0, rare: {} },
  };
  const dailyMap = {};
  for (const d of (stored.mining_daily || [])) dailyMap[d.day] = { ...d };
  const lost = stored.mining_resources_lost?.destroyed ? stored.mining_resources_lost : emptyLost();
  const recent = [...(stored.mining_recent_reports || [])];

  const fresh = reports.filter(r => !seen.has(r.id));

  for (const r of fresh) {
    if (seen.has(r.id)) continue; // duplicate id within one batch
    seen.add(r.id);
    const delivered = numericResources(r.resourcesDelivered);
    const stolen = numericResources(r.cargoStolen);
    const nLost = (r.shipsLost || []).reduce((sum, i) => sum + (i.quantity || 1), 0);
    const lostDetail = parseShipsLost(r.shipsLost);

    addResources(totals, delivered);
    addResources(totals.stolen, stolen);
    totals.deliveries += 1;
    totals.cycles += r.cycleCount || 0;
    totals.drill_breakdowns += r.drillBreakdowns || 0;
    totals.ships_lost += nLost;

    const day = r.createdAt.slice(0, 10);
    if (!dailyMap[day]) dailyMap[day] = { day, ore: 0, silicates: 0, hydrogen: 0, deliveries: 0, ships_lost: 0 };
    dailyMap[day].ore += delivered.ore || 0;
    dailyMap[day].silicates += delivered.silicates || 0;
    dailyMap[day].hydrogen += delivered.hydrogen || 0;
    dailyMap[day].deliveries += 1;
    dailyMap[day].ships_lost += nLost;
    addExtraRes(dailyMap[day], delivered);

    addShipCost(lostDetail, ships, lost.destroyed, 1);

    recent.unshift({
      id: r.id,
      created_at: r.createdAt,
      location: r.locationName || '—',
      planet: r.planetName || '—',
      zone: resolveZone(systemFromLocation(r.locationName), zones),
      report_type: r.reportType || 'delivery',
      ore: delivered.ore || 0,
      silicates: delivered.silicates || 0,
      hydrogen: delivered.hydrogen || 0,
      ...extrasOf(delivered),
      cycles: r.cycleCount || 0,
      drill_breakdowns: r.drillBreakdowns || 0,
      ships_lost: nLost,
      stolen_total: Object.values(stolen).reduce((s, v) => s + v, 0),
      combat_outcome: r.combatOutcome || null,
    });
  }

  await appendToArchive('mining', recent.slice(0, recent.length - (stored.mining_recent_reports || []).length));

  await browser.storage.local.set({
    mining_seen_ids: [...seen],
    mining_totals: totals,
    mining_daily: Object.values(dailyMap).sort((a, b) => a.day.localeCompare(b.day)),
    mining_resources_lost: lost,
    mining_recent_reports: recent.slice(0, recordsCap),
    last_scrape: new Date().toISOString(),
    last_error: null,
  });

  return fresh.length;
}

// Expedition reports + wormhole runs share one tab. Wormhole runs put their
// aggregate loot in `totalLoot`; expedition shape is still unobserved, so the
// other keys are kept as tolerant fallbacks.
function extractLoot(r) {
  const src = r.totalLoot || r.loot || r.resourcesGained || r.resources || r.reward || r.rewards || {};
  return numericResources(src);
}

// Ships lost count: wormhole runs use `totalShipsLost`, combat uses
// `shipsDestroyed` ({ lost }), others `shipsLost` ({ quantity }).
function extractShipsLost(r) {
  const arr = r.totalShipsLost || r.shipsDestroyed || r.shipsLost || [];
  return arr.reduce((sum, i) => sum + (i.quantity ?? i.lost ?? 1), 0);
}

async function processExpeditionReports(reports, runs, ships, zones = {}, wormholeZones = {}, wormholeClasses = {}) {
  const items = [
    ...(reports || []).map(r => ({ r, kind: 'expedition', uid: `exp-${r.id}` })),
    ...(runs || []).map(r => ({ r, kind: 'wormhole', uid: `wh-${r.id}` })),
  ];
  if (!items.length) return 0;

  const stored = await browser.storage.local.get([
    'exp_seen_ids', 'exp_totals', 'exp_daily', 'exp_recent_reports', 'exp_resources_lost', 'records_cap',
  ]);
  const recordsCap = stored.records_cap ?? 500;

  const seen = new Set(stored.exp_seen_ids || []);
  const totals = stored.exp_totals || {
    ore: 0, silicates: 0, hydrogen: 0, alloys: 0, rare: {}, missions: 0, ships_lost: 0,
  };
  const lost = stored.exp_resources_lost?.destroyed ? stored.exp_resources_lost : emptyLost();
  const dailyMap = {};
  for (const d of (stored.exp_daily || [])) dailyMap[d.day] = { ...d };
  const recent = [...(stored.exp_recent_reports || [])];

  let added = 0;
  for (const { r, kind, uid } of items) {
    if (seen.has(uid) || !r.createdAt) continue;
    // Skip runs still in progress — their totals are partial and `seen`
    // would lock the partial value in. Re-counted once completed.
    if (r.status && r.status !== 'completed') continue;
    seen.add(uid);
    added++;
    const loot = extractLoot(r);
    const destroyedArr = r.totalShipsLost || r.shipsDestroyed || r.shipsLost || [];
    const nLost = extractShipsLost(r);

    addResources(totals, loot);
    addLossCost(destroyedArr, ships, lost.destroyed, 1);   // encounters destroy ships outright
    totals.missions += 1;
    totals.ships_lost += nLost;

    const day = r.createdAt.slice(0, 10);
    if (!dailyMap[day]) dailyMap[day] = { day, ore: 0, silicates: 0, hydrogen: 0, missions: 0, ships_lost: 0 };
    dailyMap[day].ore += loot.ore || 0;
    dailyMap[day].silicates += loot.silicates || 0;
    dailyMap[day].hydrogen += loot.hydrogen || 0;
    dailyMap[day].missions += 1;
    dailyMap[day].ships_lost += nLost;

    recent.unshift({
      id: uid,
      created_at: r.createdAt,
      kind,
      wormhole_id: r.wormholeId ?? null,
      wclass: r.wormholeClass || wormholeClasses[r.wormholeId] || null,
      event: r.eventType || r.outcome || r.result || r.status || null,
      location: r.systemName || r.locationName || r.targetName ||
        (r.wormholeId != null ? `Wormhole #${r.wormholeId}` : '—'),
      zone: wormholeZones[r.wormholeId] || resolveZone(r.systemName || systemFromLocation(r.locationName), zones),
      loot,
      ships_lost: nLost,
      ships_destroyed_raw: destroyedArr,
    });
  }

  if (added) {
    await appendToArchive('exp', recent.slice(0, recent.length - (stored.exp_recent_reports || []).length));
    await browser.storage.local.set({
      exp_seen_ids: [...seen],
      exp_totals: totals,
      exp_resources_lost: lost,
      exp_daily: Object.values(dailyMap).sort((a, b) => a.day.localeCompare(b.day)),
      exp_recent_reports: recent.slice(0, recordsCap),
      last_scrape: new Date().toISOString(),
      last_error: null,
    });
  }
  return added;
}

// system-debris is live state, not history. Snapshot it and treat decreases
// between snapshots as "collected by someone" (us or another player).
// Snapshot the live debris fields (with first-seen timestamps) for the
// "Live debris fields" table. Precise collection is tracked separately from
// returning collect_debris missions (processMissions).
async function processSystemDebris(debrisArr, zones = {}) {
  const stored = await browser.storage.local.get('debris_fields');
  const prev = {};
  for (const f of (stored.debris_fields || [])) prev[f.id] = f;

  const now = new Date().toISOString();
  const next = {};
  for (const d of (debrisArr || [])) {
    const id = String(d.id ?? `${d.systemId ?? '?'}-${d.position ?? ''}`);
    next[id] = {
      id,
      system: d.systemName || d.locationName || (d.systemId != null ? `System #${d.systemId}` : 'unknown'),
      zone: resolveZone(d.systemName, zones),
      ore: d.ore || 0,
      silicates: d.silicates || 0,
      alloys: d.alloys || 0,
      hydrogen: d.hydrogen || 0,
      first_seen: prev[id]?.first_seen || now,
      updated_at: now,
    };
  }

  await browser.storage.local.set({
    debris_fields: Object.values(next),
    debris_last_check: now,
  });
}

// Active fleet missions → precise debris collection. A returning
// `collect_debris` fleet's cargo is exactly what it salvaged, so we record
// each such mission once (deduped by mission id) as a real collection, plus
// keep the in-flight runs for a live view. zoneById: systemId → zone.
async function processMissions(missions, zoneById = {}, ships = {}) {
  // Count each fleet's fuel once, when first seen in flight (a survey is two
  // missions — a scout then a heavy collection fleet — so per-report joins
  // miss the second; counting per mission catches every trip).
  if (missions && missions.length) {
    const { fuel_log, fuel_counted_ids } =
      await browser.storage.local.get(['fuel_log', 'fuel_counted_ids']);
    const counted = new Set(fuel_counted_ids || []);
    const flog = [...(fuel_log || [])];
    for (const m of missions) {
      if (m.id == null || counted.has(m.id)) continue;
      counted.add(m.id);
      const fuel = missionFuel({
        distance: m.distance,
        fleet: (m.fleetComposition || []).map(f => ({ key: f.shipKey || f.key, quantity: f.quantity || 1 })),
      }, ships) || 0;
      if (!fuel) continue;
      flog.unshift({
        created_at: m.departsAt || m.createdAt || new Date().toISOString(),
        type: fuelMissionType(m.missionType),
        zone: zoneById[m.targetSystemId] || 'unknown',
        fuel,
      });
    }
    const countedArr = [...counted];
    await browser.storage.local.set({
      fuel_log: flog.slice(0, 4000),
      fuel_counted_ids: countedArr.slice(Math.max(0, countedArr.length - 5000)),
    });
  }

  const runs = (missions || []).filter(m => m.missionType === 'collect_debris');

  const stored = await browser.storage.local.get([
    'debris_collected', 'debris_collection_log', 'debris_collection_ids',
    'debris_resources_lost', 'debris_loss_ids', 'records_cap',
  ]);
  const recordsCap = stored.records_cap ?? 500;
  const total = stored.debris_collected || { ore: 0, silicates: 0, alloys: 0, hydrogen: 0 };
  const log = [...(stored.debris_collection_log || [])];
  const seen = new Set(stored.debris_collection_ids || []);
  const lost = stored.debris_resources_lost?.destroyed ? stored.debris_resources_lost : emptyLost();
  const lossSeen = new Set(stored.debris_loss_ids || []);

  const active = [];
  for (const m of runs) {
    const cargo = m.cargo || {};
    const amount = (cargo.ore || 0) + (cargo.silicates || 0) + (cargo.alloys || 0) + (cargo.hydrogen || 0);
    const returning = m.status === 'returning' || m.returnDepartsAt != null;

    active.push({
      id: m.id,
      fleet: (m.fleetComposition || []).map(f => ({ key: f.shipKey || f.key, quantity: f.quantity || 1 })),
      system: m.targetSystemName || (m.targetSystemId != null ? `System #${m.targetSystemId}` : '—'),
      zone: zoneById[m.targetSystemId] || 'unknown',
      status: m.status || (returning ? 'returning' : 'outbound'),
      eta: m.returnArrivesAt || m.arrivesAt || null,
      ore: cargo.ore || 0, silicates: cargo.silicates || 0,
      alloys: cargo.alloys || 0, hydrogen: cargo.hydrogen || 0,
    });

    // Ships lost if the fleet was ambushed en route — valued once per mission.
    const destroyed = m.shipsDestroyed || m.shipsLost;
    if (destroyed?.length && !lossSeen.has(m.id)) {
      lossSeen.add(m.id);
      addLossCost(destroyed, ships, lost.destroyed, 1);
    }

    // Commit once the haul is known (returning with non-empty cargo).
    if (returning && amount > 0 && !seen.has(m.id)) {
      seen.add(m.id);
      total.ore += cargo.ore || 0;
      total.silicates += cargo.silicates || 0;
      total.hydrogen += cargo.hydrogen || 0;
      addExtraRes(total, cargo);   // alloys + rares
      log.unshift({
        id: m.id,
        collected_at: new Date().toISOString(),
        system: m.targetSystemName || (m.targetSystemId != null ? `System #${m.targetSystemId}` : '—'),
        zone: zoneById[m.targetSystemId] || 'unknown',
        ore: cargo.ore || 0, silicates: cargo.silicates || 0,
        alloys: cargo.alloys || 0, hydrogen: cargo.hydrogen || 0, ...extrasOf(cargo),
      });
    }
  }

  await browser.storage.local.set({
    debris_active_runs: active,
    debris_collected: total,
    debris_collection_log: log.slice(0, recordsCap),
    debris_collection_ids: [...seen].slice(-2000),   // bounded dedup window
    debris_resources_lost: lost,
    debris_loss_ids: [...lossSeen].slice(-2000),
  });
  return log.length;
}

// ── Aggregate rebuild ──────────────────────────────────────────────────────
// Recomputes every aggregate from the stored per-report records, repairing
// drift after partial failures. Limits: history beyond the records cap is
// lost from totals, and mining alloys/rares/stolen-breakdown and mining loss
// valuation cannot be reconstructed (per-report records lack the detail).

// Destroyed ships at full cost + damaged ships at the repair factor.
function costFromDetail(record, ships, into) {
  addShipCost(record.ships_lost_detail, ships, into.destroyed, 1);
  addShipCost(record.ships_damaged_detail, ships, into.repair, REPAIR_FACTOR);
}

async function rebuildAggregates() {
  const s = await browser.storage.local.get([
    'recent_reports', 'pirate_recent_reports', 'mining_recent_reports',
    'exp_recent_reports', 'ships',
  ]);
  const ships = s.ships || {};
  const out = {};
  // Archives hold every report ever seen; capped recents are the fallback
  // for data collected before archives existed.
  const archives = {};
  for (const t of ARCHIVE_TYPES) archives[t] = await loadArchive(t);
  const surveyRecords = archives.survey.length ? archives.survey : (s.recent_reports || []);
  const pirateRecords = archives.pirate.length ? archives.pirate : (s.pirate_recent_reports || []);
  const miningRecords = archives.mining.length ? archives.mining : (s.mining_recent_reports || []);
  const expRecords = archives.exp.length ? archives.exp : (s.exp_recent_reports || []);

  // Surveys
  {
    const totals = { ore: 0, hydrogen: 0, silicates: 0, missions: 0, ships_lost: 0, first_report: null, last_report: null };
    const daily = {}, hourly = {}, events = {};
    const lost = emptyLost();
    for (const r of surveyRecords) {
      totals.ore += r.ore || 0;
      totals.hydrogen += r.hydrogen || 0;
      totals.silicates += r.silicates || 0;
      totals.missions += 1;
      totals.ships_lost += r.ships_lost || 0;
      addExtraRes(totals, r);
      if (!totals.first_report || r.created_at < totals.first_report) totals.first_report = r.created_at;
      if (!totals.last_report || r.created_at > totals.last_report) totals.last_report = r.created_at;

      const day = r.created_at.slice(0, 10);
      if (!daily[day]) daily[day] = { day, ore: 0, hydrogen: 0, silicates: 0, missions: 0, ships_lost: 0 };
      daily[day].ore += r.ore || 0;
      daily[day].hydrogen += r.hydrogen || 0;
      daily[day].silicates += r.silicates || 0;
      daily[day].missions += 1;
      daily[day].ships_lost += r.ships_lost || 0;
      addExtraRes(daily[day], r);

      const hour = r.created_at.slice(0, 13) + ':00';
      if (!hourly[hour]) hourly[hour] = { hour, ore: 0, hydrogen: 0, silicates: 0, missions: 0, ships_lost: 0 };
      hourly[hour].ore += r.ore || 0;
      hourly[hour].hydrogen += r.hydrogen || 0;
      hourly[hour].silicates += r.silicates || 0;
      hourly[hour].missions += 1;
      hourly[hour].ships_lost += r.ships_lost || 0;
      addExtraRes(hourly[hour], r);

      const et = r.event_type || 'unknown';
      if (!events[et]) events[et] = { event_type: et, count: 0, ore: 0, hydrogen: 0, silicates: 0 };
      events[et].count += 1;
      events[et].ore += r.ore || 0;
      events[et].hydrogen += r.hydrogen || 0;
      events[et].silicates += r.silicates || 0;
      addExtraRes(events[et], r);

      costFromDetail(r, ships, lost);
    }
    out.totals = totals;
    out.daily = Object.values(daily).sort((a, b) => a.day.localeCompare(b.day));
    out.hourly = Object.values(hourly).sort((a, b) => a.hour.localeCompare(b.hour));
    out.event_breakdown = Object.values(events).sort((a, b) => b.count - a.count);
    out.resources_lost = lost;
  }

  // Pirates
  {
    const totals = {
      ore: 0, hydrogen: 0, silicates: 0, raids: 0,
      ships_destroyed: 0, ships_damaged: 0, pirates_destroyed: 0,
      first_report: null, last_report: null,
    };
    const daily = {}, outcomes = {};
    const lost = emptyLost();
    const debris = { ore: 0, alloys: 0, silicates: 0 };
    for (const r of pirateRecords) {
      totals.ore += r.ore || 0;
      totals.hydrogen += r.hydrogen || 0;
      totals.silicates += r.silicates || 0;
      totals.raids += 1;
      totals.ships_destroyed += r.ships_lost || 0;
      totals.ships_damaged += r.ships_damaged || 0;
      totals.pirates_destroyed += r.pirates_destroyed || 0;
      addExtraRes(totals, r);
      if (!totals.first_report || r.created_at < totals.first_report) totals.first_report = r.created_at;
      if (!totals.last_report || r.created_at > totals.last_report) totals.last_report = r.created_at;

      const day = r.created_at.slice(0, 10);
      if (!daily[day]) daily[day] = { day, ore: 0, hydrogen: 0, silicates: 0, raids: 0, ships_destroyed: 0 };
      daily[day].ore += r.ore || 0;
      daily[day].hydrogen += r.hydrogen || 0;
      daily[day].silicates += r.silicates || 0;
      addExtraRes(daily[day], r);
      daily[day].raids += 1;
      daily[day].ships_destroyed += r.ships_lost || 0;

      const o = r.outcome || 'unknown';
      if (!outcomes[o]) outcomes[o] = { outcome: o, count: 0, ore: 0, hydrogen: 0, silicates: 0 };
      outcomes[o].count += 1;
      outcomes[o].ore += r.ore || 0;
      outcomes[o].hydrogen += r.hydrogen || 0;
      outcomes[o].silicates += r.silicates || 0;

      debris.ore += r.debris_ore || 0;
      debris.alloys += r.debris_alloys || 0;
      debris.silicates += r.debris_silicates || 0;

      costFromDetail(r, ships, lost);
    }
    out.pirate_totals = totals;
    out.pirate_daily = Object.values(daily).sort((a, b) => a.day.localeCompare(b.day));
    out.pirate_outcomes = Object.values(outcomes).sort((a, b) => b.count - a.count);
    out.pirate_resources_lost = lost;
    out.pirate_debris_total = debris;
  }

  // Mining (alloys/rare/stolen breakdown and loss valuation are not rebuildable)
  {
    const totals = {
      ore: 0, silicates: 0, hydrogen: 0, alloys: 0, rare: {},
      deliveries: 0, cycles: 0, drill_breakdowns: 0, ships_lost: 0,
      stolen: { ore: 0, silicates: 0, hydrogen: 0, alloys: 0, rare: {} },
    };
    const daily = {};
    for (const r of miningRecords) {
      totals.ore += r.ore || 0;
      totals.silicates += r.silicates || 0;
      totals.hydrogen += r.hydrogen || 0;
      totals.deliveries += 1;
      totals.cycles += r.cycles || 0;
      totals.drill_breakdowns += r.drill_breakdowns || 0;
      totals.ships_lost += r.ships_lost || 0;
      addExtraRes(totals, r);
      totals.stolen.ore += r.stolen_total || 0; // breakdown unknown — lump into ore

      const day = r.created_at.slice(0, 10);
      if (!daily[day]) daily[day] = { day, ore: 0, silicates: 0, hydrogen: 0, deliveries: 0, ships_lost: 0 };
      daily[day].ore += r.ore || 0;
      daily[day].silicates += r.silicates || 0;
      daily[day].hydrogen += r.hydrogen || 0;
      addExtraRes(daily[day], r);
      daily[day].deliveries += 1;
      daily[day].ships_lost += r.ships_lost || 0;
    }
    out.mining_totals = totals;
    out.mining_daily = Object.values(daily).sort((a, b) => a.day.localeCompare(b.day));
    out.mining_resources_lost = emptyLost();   // not rebuildable — records lack ship detail
  }

  // Expeditions (full loot map per record — fully rebuildable)
  {
    const totals = { ore: 0, silicates: 0, hydrogen: 0, alloys: 0, rare: {}, missions: 0, ships_lost: 0, fuel: 0 };
    const lost = emptyLost();
    const daily = {};
    for (const r of expRecords) {
      addResources(totals, r.loot || {});
      addLossCost(r.ships_destroyed_raw, ships, lost.destroyed, 1);
      totals.missions += 1;
      totals.ships_lost += r.ships_lost || 0;

      const day = r.created_at.slice(0, 10);
      if (!daily[day]) daily[day] = { day, ore: 0, silicates: 0, hydrogen: 0, missions: 0, ships_lost: 0 };
      daily[day].ore += r.loot?.ore || 0;
      daily[day].silicates += r.loot?.silicates || 0;
      daily[day].hydrogen += r.loot?.hydrogen || 0;
      daily[day].missions += 1;
      daily[day].ships_lost += r.ships_lost || 0;
    }
    out.exp_totals = totals;
    out.exp_resources_lost = lost;
    out.exp_daily = Object.values(daily).sort((a, b) => a.day.localeCompare(b.day));
  }

  await browser.storage.local.set(out);
  await browser.storage.local.remove('stats_drift');
  console.log('[NexusAccounting] Aggregates rebuilt from stored records.');
}

// ── Backups ─────────────────────────────────────────────────────────────────
// Full storage snapshots written to Downloads/NexusAccounting/: weekly while
// scraping runs, and before every destructive operation (reset, import,
// schema-fallback wipe). Same format as the manual dashboard export.

const BACKUP_INTERVAL_MS = 7 * 24 * 3600 * 1000;

async function backupToDownloads(reason) {
  const data = await browser.storage.local.get(null);
  if (data.records_cap === Infinity) data.records_cap = 0;
  const payload = {
    nexus_accounting_backup: 1,
    exported_at: new Date().toISOString(),
    reason,
    data,
  };
  // MV3 service workers have no URL.createObjectURL, so download from a data
  // URL instead of a blob URL.
  const url = 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(payload));
  await browser.downloads.download({
    url,
    filename: `NexusAccounting/nexus-accounting-${reason}-${new Date().toISOString().slice(0, 10)}.json`,
    conflictAction: 'uniquify',
    saveAs: false,
  });
  await browser.storage.local.set({ last_backup: new Date().toISOString() });
  console.log(`[NexusAccounting] Backup written (${reason}).`);
}

async function maybeAutoBackup() {
  const { last_backup } = await browser.storage.local.get('last_backup');
  if (last_backup && Date.now() - new Date(last_backup).getTime() < BACKUP_INTERVAL_MS) return;
  try {
    await backupToDownloads('auto');
  } catch (err) {
    console.warn('[NexusAccounting] Auto-backup failed:', err);
  }
}

// ── Drift detection ─────────────────────────────────────────────────────────
// Recompute archive-derived sums and compare with the stored totals. Only
// fields that are fully reconstructible from archives are compared, so a
// legitimate rebuild never reports drift.

async function checkDrift() {
  const s = await browser.storage.local.get([
    'totals', 'pirate_totals', 'mining_totals', 'exp_totals',
  ]);
  const surveyArchive = await loadArchive('survey');
  const pirateArchive = await loadArchive('pirate');
  const miningArchive = await loadArchive('mining');
  const expArchive = await loadArchive('exp');

  const sum = (arr, field) => (arr || []).reduce((t, r) => t + (r[field] || 0), 0);
  const problems = [];

  if (s.totals && surveyArchive.length) {
    for (const f of ['ore', 'hydrogen', 'silicates', 'ships_lost']) {
      if (sum(surveyArchive, f) !== (s.totals[f] || 0)) problems.push(`surveys.${f}`);
    }
    if (surveyArchive.length !== (s.totals.missions || 0)) problems.push('surveys.missions');
  }
  if (s.pirate_totals && pirateArchive.length) {
    for (const f of ['ore', 'hydrogen', 'silicates']) {
      if (sum(pirateArchive, f) !== (s.pirate_totals[f] || 0)) problems.push(`pirates.${f}`);
    }
    if (pirateArchive.length !== (s.pirate_totals.raids || 0)) problems.push('pirates.raids');
  }
  if (s.mining_totals && miningArchive.length) {
    for (const f of ['ore', 'silicates', 'hydrogen']) {
      if (sum(miningArchive, f) !== (s.mining_totals[f] || 0)) problems.push(`mining.${f}`);
    }
    if (miningArchive.length !== (s.mining_totals.deliveries || 0)) problems.push('mining.deliveries');
  }
  if (s.exp_totals && expArchive.length) {
    if (expArchive.length !== (s.exp_totals.missions || 0)) problems.push('expeditions.missions');
  }

  if (problems.length) {
    await browser.storage.local.set({
      stats_drift: { detected_at: new Date().toISOString(), fields: problems },
    });
    console.warn('[NexusAccounting] Stats drift detected:', problems.join(', '));
  } else {
    await browser.storage.local.remove('stats_drift');
  }
}

// ── Schema migrations ───────────────────────────────────────────────────────
// When a stored data shape changes, bump SCHEMA_VERSION and add a migration
// keyed by the NEW version that transforms existing data in place. Purely
// additive changes (new keys with defaults) need no bump at all. Since report
// archives exist, a record-shape migration is usually just "transform the
// archives, then rebuildAggregates()". Data is only wiped as a last resort,
// when a migration step is missing — and the user's records cap survives even
// that.

const MIGRATIONS = {
  // v4: archives moved from one big array per type to monthly shards.
  4: async () => {
    const legacyKeys = {
      survey: ['survey_archive', 'recent_reports'],
      pirate: ['pirate_archive', 'pirate_recent_reports'],
      mining: ['mining_archive', 'mining_recent_reports'],
      exp: ['exp_archive', 'exp_recent_reports'],
    };
    for (const [type, [legacy, fallback]] of Object.entries(legacyKeys)) {
      const s = await browser.storage.local.get([legacy, fallback]);
      await appendToArchive(type, s[legacy] || s[fallback] || []);
      await browser.storage.local.remove(legacy);
    }
  },
  // v5: the wormhole/expedition parser was broken (loot lives in `totalLoot`,
  // not `loot`), so stored runs have empty loot and block re-ingest via
  // seen_ids. Drop the expedition data so it re-ingests with the fixed parser.
  5: async () => {
    const idx = await getArchiveIndex();
    const shardKeys = (idx.exp?.months || []).map(m => `exp_archive_${m}`);
    await browser.storage.local.remove([
      ...shardKeys, 'exp_seen_ids', 'exp_totals', 'exp_daily', 'exp_recent_reports',
    ]);
    if (idx.exp) {
      idx.exp = { months: [], count: 0 };
      await browser.storage.local.set({ archive_index: idx });
    }
  },
  // v6: resources_lost split into { destroyed, repair }. Rebuild recomputes the
  // new shape from the archives (mining loss stays empty — records lack detail).
  6: async () => {
    await rebuildAggregates();
  },
  // v7: fuel is now counted per launched mission into fuel_log. Clear the log
  // (early entries mis-tagged "investigate" survey fleets as "other") plus the
  // stale coords caches; system_coords_by_id/_by_name get re-populated by
  // getSystemZones() on the next galaxy map refresh, the rest rebuild from new launches.
  7: async () => {
    await browser.storage.local.remove([
      'fuel_log', 'fuel_counted_ids', 'mission_origins',
      'system_coords_by_id', 'system_coords_by_name', 'camp_coords',
      'home_system_id', 'owned_system_ids',
    ]);
  },
};

async function ensureSchema() {
  const { schema_version } = await browser.storage.local.get('schema_version');
  const from = schema_version ?? 0;
  if (from >= SCHEMA_VERSION) return;

  for (let v = from + 1; v <= SCHEMA_VERSION; v++) {
    if (MIGRATIONS[v]) {
      console.log(`[NexusAccounting] Migrating storage to schema ${v}.`);
      await MIGRATIONS[v]();
    } else if (from !== 0) {
      // No migration path from this version — snapshot, then wipe and re-scrape.
      console.log(`[NexusAccounting] No migration to schema ${v}, resetting storage.`);
      try {
        await backupToDownloads('pre-schema-wipe');
      } catch (err) {
        console.warn('[NexusAccounting] Pre-wipe backup failed:', err);
      }
      const { records_cap } = await browser.storage.local.get('records_cap');
      await browser.storage.local.clear();
      if (records_cap !== undefined) await browser.storage.local.set({ records_cap });
      break;
    }
  }
  await browser.storage.local.set({ schema_version: SCHEMA_VERSION });
}

// ── Full scrape (15-min alarm fallback + manual button) ────────────────────

async function scrape() {
  const token = await getToken();
  if (!token) {
    console.warn('[NexusAccounting] No token — log in to the game first.');
    await browser.storage.local.set({ last_error: 'Not logged in to Nexus Legacy.' });
    return;
  }

  await ensureSchema();

  try {
    const planetId = await getHomePlanetId(token);
    const [shipyardData, reportData, pirateData, spyData, campScoutData,
           miningData, expeditionData, wormholeData, systemDebrisData, missionsData, researchData, zones] = await Promise.all([
      apiFetch(`/api/planets/${planetId}/shipyard`, token),
      apiFetch(REPORTS_PATH, token),
      apiFetch(PIRATES_PATH, token),
      apiFetch(SPY_PATH, token),
      apiFetch(CAMP_SCOUT_PATH, token),
      apiFetch(MINING_PATH, token).catch(() => ({ reports: [] })),
      apiFetch(EXPEDITION_PATH, token).catch(() => ({ reports: [] })),
      apiFetch(WORMHOLE_PATH, token).catch(() => ({ runs: [] })),
      apiFetch(SYSTEM_DEBRIS_PATH, token).catch(() => ({ debris: [] })),
      apiFetch(MISSIONS_PATH, token).catch(() => ({ missions: [] })),
      apiFetch(RESEARCH_PATH, token).catch(() => ({ research: [] })),
      getSystemZones(token),
    ]);

    const [campZones, wormholeZones] = await Promise.all([
      getCampZones(token, zones),
      getWormholeZones(token, zones),
    ]);
    const { wormhole_classes: wormholeClasses, system_zone_by_id: zoneById } =
      await browser.storage.local.get(['wormhole_classes', 'system_zone_by_id']);

    await enqueue(async () => {
      const ships = buildShipCatalog(shipyardData);
      await browser.storage.local.set({ ships });
      await backfillZones(zones, campZones, wormholeZones);
      const nSurveys = await processSurveyReports(reportData.reports || [], ships, zones);
      const nPirates = await processPirateReports(pirateData.reports || [], ships, campZones);
      const nMining = await processMiningReports(miningData.reports || [], ships, zones);
      await processExpeditionReports(expeditionData.reports || [], wormholeData.runs || [], ships, zones, wormholeZones, wormholeClasses || {});
      await processSystemDebris(systemDebrisData.debris || [], zones);
      await processMissions(missionsData.missions || [], zoneById || {}, ships);
      await browser.storage.local.set({
        research: researchData.research || [],
        research_speed_mult: researchData.researchSpeedMult || 1,
        active_research: researchData.activeResearches || (researchData.activeResearch ? [researchData.activeResearch] : []),
      });
      await processSpyReports(spyData.reports || []);
      await processCampScoutReports(campScoutData.reports || []);
      await checkDrift();
      console.log(`[NexusAccounting] Scraped ${nSurveys} surveys, ${nPirates} pirate, ${nMining} mining reports.`);
    });
    await maybeAutoBackup();
  } catch (err) {
    console.error('[NexusAccounting] Scrape failed:', err);
    // Cached planet may be gone (recolonized) — rediscover on next scrape.
    if (err.message.includes('→ 404')) await browser.storage.local.remove('planet_id');
    await browser.storage.local.set({ last_error: err.message });
  }
}

// ── Realtime intercept (observe + re-fetch) ────────────────────────────────
// MV3 has no response-body reading (Chrome dropped blocking webRequest;
// Firefox's StreamFilter is MV2-only), so we OBSERVE when the game itself
// calls a report endpoint and then re-fetch that same endpoint to pick up the
// new data. Works identically on Chrome and Firefox; costs one extra request
// per change. Still near-realtime — the dashboard updates seconds after you
// open a report in game.

const WATCHED_URLS = [
  `${GAME_URL}/api/fleet/survey-reports*`,
  `${GAME_URL}/api/fleet/pirate-reports*`,
  `${GAME_URL}/api/fleet/spy-reports*`,
  `${GAME_URL}/api/fleet/camp-scout-reports*`,
  `${GAME_URL}/api/fleet/mining-reports*`,
  `${GAME_URL}/api/fleet/expedition-reports*`,
  `${GAME_URL}/api/fleet/wormhole-runs*`,
  `${GAME_URL}/api/fleet/system-debris*`,
  `${GAME_URL}/api/fleet/missions*`,
  `${GAME_URL}/api/research*`,
  `${GAME_URL}/api/planets/*/shipyard*`,
];

// Best-effort debounce so a burst of game calls to the same endpoint triggers
// one re-fetch. Module scope resets if the service worker sleeps, which only
// risks an extra (deduped) re-fetch — harmless.
const refetchPending = new Set();

browser.webRequest.onCompleted.addListener(
  details => {
    if (details.tabId === -1) return;                       // our own re-fetches
    if (details.statusCode < 200 || details.statusCode >= 300) return;
    const path = new URL(details.url).pathname;
    if (refetchPending.has(path)) return;
    refetchPending.add(path);
    setTimeout(() => refetchPending.delete(path), 3000);
    refetchEndpoint(path);
  },
  { urls: WATCHED_URLS }
);

async function refetchEndpoint(path) {
  const token = await getToken();
  if (!token) return;
  let json;
  try {
    json = await apiFetch(path, token);
  } catch {
    return;
  }
  routeIntercepted(GAME_URL + path, json);
}

function routeIntercepted(url, json) {
  enqueue(async () => {
    if (url.includes('/shipyard')) {
      await browser.storage.local.set({ ships: buildShipCatalog(json) });
      return;
    }
    if (url.includes('/spy-reports')) {
      await processSpyReports(json.reports || []);
      return;
    }
    if (url.includes('/camp-scout-reports')) {
      await processCampScoutReports(json.reports || []);
      return;
    }
    if (url.includes('/system-debris')) {
      const { system_zones } = await browser.storage.local.get('system_zones');
      await processSystemDebris(json.debris || [], system_zones || {});
      return;
    }
    if (url.includes('/missions')) {
      const { system_zone_by_id, ships } = await browser.storage.local.get(['system_zone_by_id', 'ships']);
      await processMissions(json.missions || [], system_zone_by_id || {}, ships || {});
      return;
    }
    if (url.includes('/api/research')) {
      await browser.storage.local.set({
        research: json.research || [],
        research_speed_mult: json.researchSpeedMult || 1,
        active_research: json.activeResearches || (json.activeResearch ? [json.activeResearch] : []),
      });
      return;
    }
    const { ships, system_zones, camp_zones, wormhole_zones, wormhole_classes } =
      await browser.storage.local.get(['ships', 'system_zones', 'camp_zones', 'wormhole_zones', 'wormhole_classes']);
    if (!ships) return; // no catalog yet — the next full scrape bootstraps it
    const zones = system_zones || {};
    const wz = wormhole_zones || {};
    const wc = wormhole_classes || {};
    let n = 0;
    if (url.includes('/survey-reports')) n = await processSurveyReports(json.reports || [], ships, zones);
    else if (url.includes('/pirate-reports')) n = await processPirateReports(json.reports || [], ships, camp_zones || {});
    else if (url.includes('/mining-reports')) n = await processMiningReports(json.reports || [], ships, zones);
    else if (url.includes('/expedition-reports')) n = await processExpeditionReports(json.reports || [], [], ships, zones, wz, wc);
    else if (url.includes('/wormhole-runs')) n = await processExpeditionReports([], json.runs || [], ships, zones, wz, wc);
    if (n) console.log(`[NexusAccounting] Realtime: ${n} new reports from ${url}`);
  });
}

// Exposed for the node test harness (tests/processors.test.js). The service
// worker itself drives everything through the listeners registered above.
export {
  processSurveyReports, processPirateReports, processMiningReports,
  processExpeditionReports, processSystemDebris, rebuildAggregates,
  checkDrift, ensureSchema, appendToArchive, loadArchive,
  systemFromLocation, resolveZone, backfillZones, processMissions,
};
