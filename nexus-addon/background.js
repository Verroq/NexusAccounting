const GAME_URL = 'https://s0.nexuslegacy.space';
const SHIPYARD_PATH = '/api/planets/29925/shipyard';
const REPORTS_PATH = '/api/fleet/survey-reports';
const PIRATES_PATH = '/api/fleet/pirate-reports';
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
});

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

// ── Processing ─────────────────────────────────────────────────────────────

function parseShipsLost(shipsLost) {
  const counts = {};
  for (const item of (shipsLost || [])) {
    const id = item.shipDefId;
    if (id != null) counts[id] = (counts[id] || 0) + (item.quantity || 1);
  }
  return counts;
}

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
    const [shipyardData, reportData, pirateData] = await Promise.all([
      apiFetch(SHIPYARD_PATH, token),
      apiFetch(REPORTS_PATH, token),
      apiFetch(PIRATES_PATH, token),
    ]);

    // Build ship catalog keyed by shipDefId
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
      };
    }

    const reports = reportData.reports || [];

    // Load existing aggregated state
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

    // ── Pirate raids ─────────────────────────────────────────────────────────

    const pirateReports = pirateData.reports || [];

    const pstored = await browser.storage.local.get([
      'pirate_seen_ids', 'pirate_totals', 'pirate_daily', 'pirate_resources_lost',
      'pirate_outcomes', 'pirate_debris_total', 'pirate_recent_reports',
    ]);

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
      });
    }

    const pirateTimestamps = pirateReports.map(r => r.createdAt).sort();
    if (pirateTimestamps.length) {
      pirateTotals.first_report = pirateTimestamps[0];
      pirateTotals.last_report = pirateTimestamps[pirateTimestamps.length - 1];
    }

    await browser.storage.local.set({
      ships,
      seen_ids: [...seenIds],
      totals,
      daily: Object.values(dailyMap).sort((a, b) => a.day.localeCompare(b.day)),
      hourly: Object.values(hourlyMap).sort((a, b) => a.hour.localeCompare(b.hour)),
      resources_lost: resourcesLost,
      event_breakdown: Object.values(eventMap).sort((a, b) => b.count - a.count),
      recent_reports: recentReports.slice(0, recordsCap),
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

    console.log(`[NexusAccounting] Scraped ${newReports.length} new survey reports (${reports.length} total), ${newPirateReports.length} new pirate reports (${pirateReports.length} total).`);
  } catch (err) {
    console.error('[NexusAccounting] Scrape failed:', err);
    await browser.storage.local.set({ last_error: err.message });
  }
}

async function getStatus() {
  const data = await browser.storage.local.get(['last_scrape', 'last_error', 'totals']);
  return data;
}
