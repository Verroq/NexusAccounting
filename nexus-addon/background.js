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
// Bump this when stored data shape changes — forces a full re-scrape.
const SCHEMA_VERSION = 3;

// ── Setup ──────────────────────────────────────────────────────────────────

browser.runtime.onInstalled.addListener(async () => {
  browser.alarms.create(ALARM, { periodInMinutes: INTERVAL_MIN });
  await scrape();
});

browser.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === ALARM) scrape();
});

browser.browserAction.onClicked.addListener(() => {
  browser.tabs.create({ url: browser.runtime.getURL('dashboard.html') });
});

browser.runtime.onMessage.addListener(msg => {
  if (msg.type === 'SCRAPE_NOW') return scrape().then(() => ({ ok: true }));
  if (msg.type === 'GET_STATUS') return getStatus();
  if (msg.type === 'GET_FLEET') return getFleet();
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

// ── Processors ─────────────────────────────────────────────────────────────

function parseShipsLost(shipsLost) {
  const counts = {};
  for (const item of (shipsLost || [])) {
    const id = item.shipDefId;
    if (id != null) counts[id] = (counts[id] || 0) + (item.quantity || 1);
  }
  return counts;
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
    const nDamaged = (r.shipsDamaged || []).length;
    const lostDetail = parseShipsLost(r.shipsLost);

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

    for (const [defId, qty] of Object.entries(lostDetail)) {
      const ship = ships[defId];
      if (ship) {
        resourcesLost.ore += qty * ship.costOre;
        resourcesLost.silicates += qty * ship.costSilicates;
        resourcesLost.hydrogen += qty * ship.costHydrogen;
        resourcesLost.alloys += qty * ship.costAlloys;
        for (const [k, v] of Object.entries(ship.rareCosts)) {
          resourcesLost.rare[k] = (resourcesLost.rare[k] || 0) + qty * v;
        }
      }
    }

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
    });
  }

  const timestamps = reports.map(r => r.createdAt).sort();
  if (timestamps.length) {
    totals.first_report = timestamps[0];
    totals.last_report = timestamps[timestamps.length - 1];
  }

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
    let nDestroyed = 0, nDamaged = 0;
    for (const item of (r.attackerLosses || [])) {
      const destroyed = item.destroyed ?? item.lost ?? 0;
      nDestroyed += destroyed;
      nDamaged += item.damaged || 0;
      if (item.shipDefId != null && destroyed) {
        destroyedDetail[item.shipDefId] = (destroyedDetail[item.shipDefId] || 0) + destroyed;
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

    for (const [defId, qty] of Object.entries(destroyedDetail)) {
      const ship = ships[defId];
      if (ship) {
        pirateLost.ore += qty * ship.costOre;
        pirateLost.silicates += qty * ship.costSilicates;
        pirateLost.hydrogen += qty * ship.costHydrogen;
        pirateLost.alloys += qty * ship.costAlloys;
        for (const [k, v] of Object.entries(ship.rareCosts)) {
          pirateLost.rare[k] = (pirateLost.rare[k] || 0) + qty * v;
        }
      }
    }

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

// ── Full scrape (15-min alarm fallback + manual button) ────────────────────

async function scrape() {
  const token = await getToken();
  if (!token) {
    console.warn('[NexusAccounting] No token — log in to the game first.');
    await browser.storage.local.set({ last_error: 'Not logged in to Nexus Legacy.' });
    return;
  }

  // Wipe stored data when schema changes so everything is recomputed cleanly.
  const { schema_version } = await browser.storage.local.get('schema_version');
  if (schema_version !== SCHEMA_VERSION) {
    console.log(`[NexusAccounting] Schema ${schema_version} → ${SCHEMA_VERSION}, resetting storage.`);
    await browser.storage.local.clear();
  }

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
      console.log(`[NexusAccounting] Scraped ${nSurveys} surveys, ${nPirates} pirate, ${nMining} mining reports.`);
    });
  } catch (err) {
    console.error('[NexusAccounting] Scrape failed:', err);
    // Cached planet may be gone (recolonized) — rediscover on next scrape.
    if (err.message.includes('→ 404')) await browser.storage.local.remove('planet_id');
    await browser.storage.local.set({ last_error: err.message });
  }
}

// ── Realtime intercept (StreamFilter) ──────────────────────────────────────
// Reads the game's own API responses as the page loads them, so the dashboard
// updates seconds after you open a report in game — no waiting for the next
// scheduled scrape. The response is passed through untouched.

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

browser.webRequest.onBeforeRequest.addListener(
  details => {
    // tabId -1 = our own background fetches — don't re-process those.
    if (details.tabId === -1) return {};

    const filter = browser.webRequest.filterResponseData(details.requestId);
    const chunks = [];
    filter.ondata = e => {
      chunks.push(e.data);
      filter.write(e.data);
    };
    filter.onerror = () => {};
    filter.onstop = () => {
      filter.close();
      let json;
      try {
        json = JSON.parse(decodeChunks(chunks));
      } catch {
        return; // not JSON (error page etc.) — game got its data, we skip
      }
      routeIntercepted(details.url, json);
    };
    return {};
  },
  { urls: WATCHED_URLS },
  ['blocking']
);

function decodeChunks(chunks) {
  const total = chunks.reduce((sum, c) => sum + c.byteLength, 0);
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    buf.set(new Uint8Array(c), offset);
    offset += c.byteLength;
  }
  return new TextDecoder('utf-8').decode(buf);
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
