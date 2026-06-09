const GAME_URL = 'https://s0.nexuslegacy.space';
const SHIPYARD_PATH = '/api/planets/29925/shipyard';
const REPORTS_PATH = '/api/fleet/survey-reports';
const ALARM = 'nexus-scrape';
const INTERVAL_MIN = 15;
// Bump this when stored data shape changes — forces a full re-scrape.
const SCHEMA_VERSION = 2;

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
    const [shipyardData, reportData] = await Promise.all([
      apiFetch(SHIPYARD_PATH, token),
      apiFetch(REPORTS_PATH, token),
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
      ships,
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

    console.log(`[NexusAccounting] Scraped ${newReports.length} new reports (${reports.length} total).`);
  } catch (err) {
    console.error('[NexusAccounting] Scrape failed:', err);
    await browser.storage.local.set({ last_error: err.message });
  }
}

async function getStatus() {
  const data = await browser.storage.local.get(['last_scrape', 'last_error', 'totals']);
  return data;
}
