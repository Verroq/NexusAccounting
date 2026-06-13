// Chrome's service worker exposes `chrome.*` (callback APIs) but not `browser.*`.
// Load Mozilla's polyfill so the rest of the file uses the promise-based
// `browser.*` namespace on both browsers. Firefox already provides `browser`
// natively, so it skips this.
if (typeof browser === 'undefined' && typeof importScripts === 'function') {
  importScripts('browser-polyfill.js');
}

const GAME_URL = 'https://s0.nexuslegacy.space';
const REPORTS_PATH = '/api/fleet/survey-reports';
const PIRATES_PATH = '/api/fleet/pirate-reports';
const SPY_PATH = '/api/fleet/spy-reports';
const CAMP_SCOUT_PATH = '/api/fleet/camp-scout-reports';
const MINING_PATH = '/api/fleet/mining-reports';
const EXPEDITION_PATH = '/api/fleet/expedition-reports';
const WORMHOLE_PATH = '/api/fleet/wormhole-runs';
const SYSTEM_DEBRIS_PATH = '/api/fleet/system-debris';
const INTEL_KEEP = 200;
const ALARM = 'nexus-scrape';
const INTERVAL_MIN = 15;
// Bump this when stored data shape changes; add a MIGRATIONS entry for it.
const SCHEMA_VERSION = 4;

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
  if (msg.type === 'GET_STATUS') return getStatus();
  if (msg.type === 'GET_FLEET') return getFleet();
  if (msg.type === 'REBUILD_AGGREGATES') return enqueue(rebuildAggregates).then(() => ({ ok: true }));
  if (msg.type === 'BACKUP_NOW') return backupToDownloads(msg.reason || 'manual').then(() => ({ ok: true })).catch(e => ({ error: e.message }));
  if (msg.type === 'GET_ARMS') return apiGet('/api/galaxy/arms');
  if (msg.type === 'GET_GALAXY_MAP') return apiGet('/api/galaxy/map');
  if (msg.type === 'GET_SYSTEM_PLANETS') return apiGet(`/api/galaxy/systems/${msg.systemId}/planets`);
});

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

async function getToken() {
  for (const url of [GAME_URL, 'https://nexuslegacy.space']) {
    const c = await browser.cookies.get({ url, name: 'nexus_token' });
    if (c?.value) return c.value;
  }
  return null;
}

// ── API ────────────────────────────────────────────────────────────────────

async function apiFetch(path, token) {
  const r = await fetch(`${GAME_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
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

// Current stationed fleet as { shipKey: usableQuantity } — for the simulator.
async function getFleet() {
  const token = await getToken();
  if (!token) return { error: 'Not logged in to Nexus Legacy.' };
  try {
    const planetId = await getHomePlanetId(token);
    const data = await apiFetch(`/api/planets/${planetId}/fleet`, token);
    const fleet = {};
    for (const f of (data.fleet || [])) {
      const key = f.definition?.key;
      const qty = (f.quantity || 0) - (f.damagedQuantity || 0);
      if (key && qty > 0) fleet[key] = (fleet[key] || 0) + qty;
    }
    return { fleet };
  } catch (err) {
    return { error: err.message };
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
      armorType: s.armorType || 'light',
      shipClass: s.shipClass || 'utility',
      shipSize: s.shipSize || 'small',
      sortOrder: s.sortOrder || 0,
    };
  }
  return ships;
}

async function processSurveyReports(reports, ships) {
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

  const resourcesLost = stored.resources_lost || {
    ore: 0, silicates: 0, hydrogen: 0, alloys: 0, rare: {},
  };

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

    const day = r.createdAt.slice(0, 10);
    if (!dailyMap[day]) dailyMap[day] = { day, ore: 0, hydrogen: 0, silicates: 0, missions: 0, ships_lost: 0 };
    dailyMap[day].ore += ore;
    dailyMap[day].hydrogen += hydrogen;
    dailyMap[day].silicates += silicates;
    dailyMap[day].missions += 1;
    dailyMap[day].ships_lost += nLost;

    const hour = r.createdAt.slice(0, 13) + ':00';
    if (!hourlyMap[hour]) hourlyMap[hour] = { hour, ore: 0, hydrogen: 0, silicates: 0, missions: 0, ships_lost: 0 };
    hourlyMap[hour].ore += ore;
    hourlyMap[hour].hydrogen += hydrogen;
    hourlyMap[hour].silicates += silicates;
    hourlyMap[hour].missions += 1;
    hourlyMap[hour].ships_lost += nLost;

    const et = r.eventType || 'unknown';
    if (!eventMap[et]) eventMap[et] = { event_type: et, count: 0, ore: 0, hydrogen: 0, silicates: 0 };
    eventMap[et].count += 1;
    eventMap[et].ore += ore;
    eventMap[et].hydrogen += hydrogen;
    eventMap[et].silicates += silicates;

    addShipCost(lostDetail, ships, resourcesLost, 1);
    addShipCost(damagedDetail, ships, resourcesLost, REPAIR_FACTOR);

    recentReports.unshift({
      id: r.id,
      created_at: r.createdAt,
      system_name: r.systemName,
      event_type: r.eventType,
      ore, hydrogen, silicates,
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

async function processPirateReports(pirateReports, ships) {
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

  const pirateLost = pstored.pirate_resources_lost || {
    ore: 0, silicates: 0, hydrogen: 0, alloys: 0, rare: {},
  };

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

    const day = r.createdAt.slice(0, 10);
    if (!pirateDailyMap[day]) pirateDailyMap[day] = { day, ore: 0, hydrogen: 0, silicates: 0, raids: 0, ships_destroyed: 0 };
    pirateDailyMap[day].ore += ore;
    pirateDailyMap[day].hydrogen += hydrogen;
    pirateDailyMap[day].silicates += silicates;
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

    addShipCost(destroyedDetail, ships, pirateLost, 1);
    addShipCost(damagedDetail, ships, pirateLost, REPAIR_FACTOR);

    pirateRecent.unshift({
      id: r.id,
      created_at: r.createdAt,
      camp_id: r.campId,
      outcome,
      ore, hydrogen, silicates,
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

async function processMiningReports(reports, ships) {
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
  const lost = stored.mining_resources_lost || { ore: 0, silicates: 0, hydrogen: 0, alloys: 0, rare: {} };
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

    for (const [defId, qty] of Object.entries(lostDetail)) {
      const ship = ships[defId];
      if (ship) {
        lost.ore += qty * ship.costOre;
        lost.silicates += qty * ship.costSilicates;
        lost.hydrogen += qty * ship.costHydrogen;
        lost.alloys += qty * ship.costAlloys;
        for (const [k, v] of Object.entries(ship.rareCosts)) {
          lost.rare[k] = (lost.rare[k] || 0) + qty * v;
        }
      }
    }

    recent.unshift({
      id: r.id,
      created_at: r.createdAt,
      location: r.locationName || '—',
      planet: r.planetName || '—',
      report_type: r.reportType || 'delivery',
      ore: delivered.ore || 0,
      silicates: delivered.silicates || 0,
      hydrogen: delivered.hydrogen || 0,
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

// Expedition reports + wormhole runs share one tab. Their shapes have never
// been observed (endpoints empty so far) — loot is extracted tolerantly.
function extractLoot(r) {
  const src = r.loot || r.resourcesGained || r.resources || r.reward || r.rewards || {};
  return numericResources(src);
}

async function processExpeditionReports(reports, runs, ships) {
  const items = [
    ...(reports || []).map(r => ({ r, kind: 'expedition', uid: `exp-${r.id}` })),
    ...(runs || []).map(r => ({ r, kind: 'wormhole', uid: `wh-${r.id}` })),
  ];
  if (!items.length) return 0;

  const stored = await browser.storage.local.get([
    'exp_seen_ids', 'exp_totals', 'exp_daily', 'exp_recent_reports', 'records_cap',
  ]);
  const recordsCap = stored.records_cap ?? 500;

  const seen = new Set(stored.exp_seen_ids || []);
  const totals = stored.exp_totals || {
    ore: 0, silicates: 0, hydrogen: 0, alloys: 0, rare: {}, missions: 0, ships_lost: 0,
  };
  const dailyMap = {};
  for (const d of (stored.exp_daily || [])) dailyMap[d.day] = { ...d };
  const recent = [...(stored.exp_recent_reports || [])];

  let added = 0;
  for (const { r, kind, uid } of items) {
    if (seen.has(uid) || !r.createdAt) continue;
    seen.add(uid);
    added++;
    const loot = extractLoot(r);
    const nLost = (r.shipsLost || []).reduce((sum, i) => sum + (i.quantity || 1), 0);

    addResources(totals, loot);
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
      event: r.eventType || r.outcome || r.result || null,
      location: r.systemName || r.locationName || r.targetName || '—',
      loot,
      ships_lost: nLost,
    });
  }

  if (added) {
    await appendToArchive('exp', recent.slice(0, recent.length - (stored.exp_recent_reports || []).length));
    await browser.storage.local.set({
      exp_seen_ids: [...seen],
      exp_totals: totals,
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
async function processSystemDebris(debrisArr) {
  const stored = await browser.storage.local.get(['debris_fields', 'debris_collected_est']);
  const prev = {};
  for (const f of (stored.debris_fields || [])) prev[f.id] = f;
  const collected = stored.debris_collected_est || { ore: 0, silicates: 0, alloys: 0, hydrogen: 0 };

  const now = new Date().toISOString();
  const next = {};
  for (const d of (debrisArr || [])) {
    const id = String(d.id ?? `${d.systemId ?? '?'}-${d.position ?? ''}`);
    const res = numericResources(d);
    delete res.id;
    next[id] = {
      id,
      system: d.systemName || d.locationName || (d.systemId != null ? `System #${d.systemId}` : 'unknown'),
      ore: res.ore || 0,
      silicates: res.silicates || 0,
      alloys: res.alloys || 0,
      hydrogen: res.hydrogen || 0,
      first_seen: prev[id]?.first_seen || now,
      updated_at: now,
    };
  }

  for (const [id, old] of Object.entries(prev)) {
    const cur = next[id];
    for (const k of ['ore', 'silicates', 'alloys', 'hydrogen']) {
      const dec = (old[k] || 0) - (cur ? (cur[k] || 0) : 0);
      if (dec > 0) collected[k] += dec;
    }
  }

  await browser.storage.local.set({
    debris_fields: Object.values(next),
    debris_collected_est: collected,
    debris_last_check: now,
  });
}

// ── Aggregate rebuild ──────────────────────────────────────────────────────
// Recomputes every aggregate from the stored per-report records, repairing
// drift after partial failures. Limits: history beyond the records cap is
// lost from totals, and mining alloys/rares/stolen-breakdown and mining loss
// valuation cannot be reconstructed (per-report records lack the detail).

// Destroyed ships at full cost + damaged ships at the repair factor.
function costFromDetail(record, ships, into) {
  addShipCost(record.ships_lost_detail, ships, into, 1);
  addShipCost(record.ships_damaged_detail, ships, into, REPAIR_FACTOR);
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
    const lost = { ore: 0, silicates: 0, hydrogen: 0, alloys: 0, rare: {} };
    for (const r of surveyRecords) {
      totals.ore += r.ore || 0;
      totals.hydrogen += r.hydrogen || 0;
      totals.silicates += r.silicates || 0;
      totals.missions += 1;
      totals.ships_lost += r.ships_lost || 0;
      if (!totals.first_report || r.created_at < totals.first_report) totals.first_report = r.created_at;
      if (!totals.last_report || r.created_at > totals.last_report) totals.last_report = r.created_at;

      const day = r.created_at.slice(0, 10);
      if (!daily[day]) daily[day] = { day, ore: 0, hydrogen: 0, silicates: 0, missions: 0, ships_lost: 0 };
      daily[day].ore += r.ore || 0;
      daily[day].hydrogen += r.hydrogen || 0;
      daily[day].silicates += r.silicates || 0;
      daily[day].missions += 1;
      daily[day].ships_lost += r.ships_lost || 0;

      const hour = r.created_at.slice(0, 13) + ':00';
      if (!hourly[hour]) hourly[hour] = { hour, ore: 0, hydrogen: 0, silicates: 0, missions: 0, ships_lost: 0 };
      hourly[hour].ore += r.ore || 0;
      hourly[hour].hydrogen += r.hydrogen || 0;
      hourly[hour].silicates += r.silicates || 0;
      hourly[hour].missions += 1;
      hourly[hour].ships_lost += r.ships_lost || 0;

      const et = r.event_type || 'unknown';
      if (!events[et]) events[et] = { event_type: et, count: 0, ore: 0, hydrogen: 0, silicates: 0 };
      events[et].count += 1;
      events[et].ore += r.ore || 0;
      events[et].hydrogen += r.hydrogen || 0;
      events[et].silicates += r.silicates || 0;

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
    const lost = { ore: 0, silicates: 0, hydrogen: 0, alloys: 0, rare: {} };
    const debris = { ore: 0, alloys: 0, silicates: 0 };
    for (const r of pirateRecords) {
      totals.ore += r.ore || 0;
      totals.hydrogen += r.hydrogen || 0;
      totals.silicates += r.silicates || 0;
      totals.raids += 1;
      totals.ships_destroyed += r.ships_lost || 0;
      totals.ships_damaged += r.ships_damaged || 0;
      totals.pirates_destroyed += r.pirates_destroyed || 0;
      if (!totals.first_report || r.created_at < totals.first_report) totals.first_report = r.created_at;
      if (!totals.last_report || r.created_at > totals.last_report) totals.last_report = r.created_at;

      const day = r.created_at.slice(0, 10);
      if (!daily[day]) daily[day] = { day, ore: 0, hydrogen: 0, silicates: 0, raids: 0, ships_destroyed: 0 };
      daily[day].ore += r.ore || 0;
      daily[day].hydrogen += r.hydrogen || 0;
      daily[day].silicates += r.silicates || 0;
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
      totals.stolen.ore += r.stolen_total || 0; // breakdown unknown — lump into ore

      const day = r.created_at.slice(0, 10);
      if (!daily[day]) daily[day] = { day, ore: 0, silicates: 0, hydrogen: 0, deliveries: 0, ships_lost: 0 };
      daily[day].ore += r.ore || 0;
      daily[day].silicates += r.silicates || 0;
      daily[day].hydrogen += r.hydrogen || 0;
      daily[day].deliveries += 1;
      daily[day].ships_lost += r.ships_lost || 0;
    }
    out.mining_totals = totals;
    out.mining_daily = Object.values(daily).sort((a, b) => a.day.localeCompare(b.day));
    out.mining_resources_lost = { ore: 0, silicates: 0, hydrogen: 0, alloys: 0, rare: {} };
  }

  // Expeditions (full loot map per record — fully rebuildable)
  {
    const totals = { ore: 0, silicates: 0, hydrogen: 0, alloys: 0, rare: {}, missions: 0, ships_lost: 0 };
    const daily = {};
    for (const r of expRecords) {
      addResources(totals, r.loot || {});
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
           miningData, expeditionData, wormholeData, systemDebrisData] = await Promise.all([
      apiFetch(`/api/planets/${planetId}/shipyard`, token),
      apiFetch(REPORTS_PATH, token),
      apiFetch(PIRATES_PATH, token),
      apiFetch(SPY_PATH, token),
      apiFetch(CAMP_SCOUT_PATH, token),
      apiFetch(MINING_PATH, token).catch(() => ({ reports: [] })),
      apiFetch(EXPEDITION_PATH, token).catch(() => ({ reports: [] })),
      apiFetch(WORMHOLE_PATH, token).catch(() => ({ runs: [] })),
      apiFetch(SYSTEM_DEBRIS_PATH, token).catch(() => ({ debris: [] })),
    ]);

    await enqueue(async () => {
      const ships = buildShipCatalog(shipyardData);
      await browser.storage.local.set({ ships });
      const nSurveys = await processSurveyReports(reportData.reports || [], ships);
      const nPirates = await processPirateReports(pirateData.reports || [], ships);
      const nMining = await processMiningReports(miningData.reports || [], ships);
      await processExpeditionReports(expeditionData.reports || [], wormholeData.runs || [], ships);
      await processSystemDebris(systemDebrisData.debris || []);
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
      await processSystemDebris(json.debris || []);
      return;
    }
    const { ships } = await browser.storage.local.get('ships');
    if (!ships) return; // no catalog yet — the next full scrape bootstraps it
    let n = 0;
    if (url.includes('/survey-reports')) n = await processSurveyReports(json.reports || [], ships);
    else if (url.includes('/pirate-reports')) n = await processPirateReports(json.reports || [], ships);
    else if (url.includes('/mining-reports')) n = await processMiningReports(json.reports || [], ships);
    else if (url.includes('/expedition-reports')) n = await processExpeditionReports(json.reports || [], [], ships);
    else if (url.includes('/wormhole-runs')) n = await processExpeditionReports([], json.runs || [], ships);
    if (n) console.log(`[NexusAccounting] Realtime: ${n} new reports from ${url}`);
  });
}

// ── Status ─────────────────────────────────────────────────────────────────

async function getStatus() {
  const data = await browser.storage.local.get(['last_scrape', 'last_error', 'totals']);
  return data;
}
