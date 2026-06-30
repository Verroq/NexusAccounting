import { test } from 'node:test';
import assert from 'node:assert';
import { makeBrowserStub, loadBackground } from './helpers.js';

const SHIPS = { 21: { costOre: 100, costSilicates: 50, costHydrogen: 0, costAlloys: 10, rareCosts: { cryo_ice: 5 } } };

function surveyReport(id, day, ore = 100) {
  return {
    id, createdAt: `${day}T10:00:00.000Z`, investigated: true, uncollectedLoot: null,
    loot: { ore, hydrogen: 10, silicates: 20 }, eventType: 'resource_cache',
    systemName: 'X', shipsLost: [{ shipDefId: 21, quantity: 1 }], shipsDamaged: [],
  };
}

test('survey processor: dedupe, totals, loss valuation, archive shard', async () => {
  const store = makeBrowserStub();
  const bg = await loadBackground();

  await bg.processSurveyReports([surveyReport(1, '2026-06-10')], SHIPS);
  await bg.processSurveyReports([surveyReport(1, '2026-06-10'), surveyReport(2, '2026-06-11')], SHIPS);

  assert.equal(store.totals.missions, 2, 'report 1 must not double-count');
  assert.equal(store.totals.ore, 200);
  assert.equal(store.resources_lost.destroyed.ore, 200);   // 2 × scout-ish cost
  assert.equal(store.resources_lost.destroyed.rare.cryo_ice, 10);
  assert.equal(store['survey_archive_2026-06'].length, 2);
  assert.equal(store.archive_index.survey.count, 2);
});

test('damaged ships add 50% repair cost to losses', async () => {
  const store = makeBrowserStub({ ships: SHIPS });   // rebuild reads the catalog from storage
  const bg = await loadBackground();

  // 1 destroyed scout (full cost) + 2 damaged scouts (half cost each).
  const rep = {
    id: 1, createdAt: '2026-06-10T10:00:00.000Z', investigated: true, uncollectedLoot: null,
    loot: { ore: 0 }, eventType: 'rogue_drone', systemName: 'X',
    shipsLost: [{ shipDefId: 21, quantity: 1 }],
    shipsDamaged: [{ shipDefId: 21, quantity: 2 }],
  };
  await bg.processSurveyReports([rep], SHIPS);

  // costOre 100 → destroyed 1×100, repair 2×0.5×100 = 100, kept separate
  assert.equal(store.resources_lost.destroyed.ore, 100);
  assert.equal(store.resources_lost.repair.ore, 100);
  assert.equal(store.totals.ships_lost, 1);
  assert.equal(store.recent_reports[0].ships_damaged, 2);

  // rebuild from archive reproduces both split values
  store.totals.ore = 1; // corrupt something to prove rebuild recomputes
  await bg.rebuildAggregates();
  assert.equal(store.resources_lost.destroyed.ore, 100, 'rebuild keeps destruction');
  assert.equal(store.resources_lost.repair.ore, 100, 'rebuild keeps repair');
});

test('security zone resolution', async () => {
  const bg = await loadBackground();
  assert.equal(bg.systemFromLocation('A12-27 / A12-27-AF1'), 'A12-27');
  assert.equal(bg.systemFromLocation('B3-9-XY2'), 'B3-9');
  assert.equal(bg.systemFromLocation(''), null);
  const zones = { 'A12-27': 'sentinel' };
  assert.equal(bg.resolveZone('A12-27', zones), 'sentinel');
  assert.equal(bg.resolveZone('Z9-9', zones), 'unknown');
  assert.equal(bg.resolveZone(null, zones), 'unknown');
});

test('survey zone from securityZone, mining zone from locationName', async () => {
  const store = makeBrowserStub({ ships: {} });
  const bg = await loadBackground();
  const zones = { 'A12-27': 'sentinel' };

  await bg.processSurveyReports([{
    id: 1, createdAt: '2026-06-10T10:00:00Z', investigated: true, uncollectedLoot: null,
    loot: { ore: 5 }, eventType: 'x', systemName: 'A12-27', securityZone: 'open',
    shipsLost: [], shipsDamaged: [],
  }], {}, zones);
  assert.equal(store.recent_reports[0].zone, 'open', 'survey uses securityZone directly');

  await bg.processMiningReports([{
    id: 1, createdAt: '2026-06-10T08:00:00Z', resourcesDelivered: { ore: 10 },
    locationName: 'A12-27 / A12-27-AF1', shipsLost: [],
  }], {}, zones);
  assert.equal(store.mining_recent_reports[0].zone, 'sentinel', 'mining resolves zone from location');
});

test('combat losses valued by ship key (shipsDestroyed) or defId', async () => {
  const ships = {
    21: { key: 'freighter', costOre: 100, costSilicates: 50, costHydrogen: 0, costAlloys: 10, rareCosts: {} },
    4: { key: 'scout', costOre: 200, costSilicates: 100, costHydrogen: 0, costAlloys: 20, rareCosts: {} },
  };

  // debris mission ambushed: shipsDestroyed by key { key, lost }
  const store = makeBrowserStub({});
  let bg = await loadBackground();
  await bg.processMissions([{
    id: 1, missionType: 'collect_debris', status: 'returning', returnDepartsAt: 'y',
    targetSystemId: 5, cargo: { ore: 100 }, shipsDestroyed: [{ key: 'scout', lost: 2 }],
  }], { 5: 'open' }, ships);
  assert.equal(store.debris_resources_lost.destroyed.ore, 400);   // scout 200 × 2

  // expedition run: totalShipsLost by shipDefId { shipDefId, quantity }
  const s2 = makeBrowserStub({ ships });
  bg = await loadBackground();
  await bg.processExpeditionReports([], [{
    id: 9, createdAt: '2026-06-14T10:00:00Z', status: 'completed', wormholeId: 1,
    totalLoot: { ore: 5 }, totalShipsLost: [{ shipDefId: 21, quantity: 3 }],
  }], ships, {}, {}, {});
  assert.equal(s2.exp_resources_lost.destroyed.ore, 300);          // freighter 100 × 3
});

test('debris collection: returning collect_debris cargo recorded once', async () => {
  const store = makeBrowserStub({});
  const bg = await loadBackground();
  const zoneById = { 568: 'sentinel' };

  // outbound: live run, nothing committed
  await bg.processMissions([{ id: 1, missionType: 'collect_debris', status: 'outbound', targetSystemId: 568, cargo: {} }], zoneById);
  assert.equal(store.debris_collected.ore, 0);
  assert.equal(store.debris_active_runs.length, 1);
  assert.equal(store.debris_collection_log.length, 0);

  // returning with cargo: committed exactly
  await bg.processMissions([{ id: 1, missionType: 'collect_debris', status: 'returning', returnDepartsAt: 'y', targetSystemId: 568, cargo: { ore: 480, alloys: 78 } }], zoneById);
  assert.equal(store.debris_collected.ore, 480);
  assert.equal(store.debris_collected.alloys, 78);
  assert.equal(store.debris_collection_log[0].zone, 'sentinel');

  // seen again: not double-counted
  await bg.processMissions([{ id: 1, missionType: 'collect_debris', status: 'returning', returnDepartsAt: 'y', targetSystemId: 568, cargo: { ore: 480, alloys: 78 } }], zoneById);
  assert.equal(store.debris_collected.ore, 480);
  assert.equal(store.debris_collection_log.length, 1);

  // non-debris missions ignored
  await bg.processMissions([{ id: 2, missionType: 'collect_salvage', status: 'returning', cargo: { ore: 99 } }], zoneById);
  assert.equal(store.debris_collected.ore, 480);
});

test('zone back-fill stamps existing records once', async () => {
  const store = makeBrowserStub({
    recent_reports: [{ id: 1, system_name: 'A12-27' }, { id: 2, system_name: 'Z9-9' }],
    mining_recent_reports: [{ id: 1, location: 'A12-27 / A12-27-AF1' }],
    archive_index: {
      survey: { months: ['2026-06'], count: 1 }, pirate: { months: [], count: 0 },
      mining: { months: [], count: 0 }, exp: { months: [], count: 0 },
    },
    'survey_archive_2026-06': [{ id: 1, system_name: 'A12-27' }],
  });
  const bg = await loadBackground();
  await bg.backfillZones({ 'A12-27': 'sentinel' });

  assert.deepEqual(store.recent_reports.map(r => r.zone), ['sentinel', 'unknown']);
  assert.equal(store.mining_recent_reports[0].zone, 'sentinel');
  assert.equal(store['survey_archive_2026-06'][0].zone, 'sentinel');
  assert.equal(store.zones_backfilled, true);

  // second run is a no-op (does not overwrite)
  store.recent_reports[0].zone = 'open';
  await bg.backfillZones({ 'A12-27': 'sentinel' });
  assert.equal(store.recent_reports[0].zone, 'open');
});

test('pirate zone resolved from campId via camp→zone map', async () => {
  const store = makeBrowserStub({ ships: {} });
  const bg = await loadBackground();
  const raid = (id, campId) => ({
    id, createdAt: '2026-06-13T10:00:00Z', campId,
    attackerFleet: [], pirateFleet: [], attackerLosses: [], pirateLosses: [],
    loot: { ore: 5 }, debris: {}, outcome: 'attacker_won',
  });
  await bg.processPirateReports([raid(1, 1448), raid(2, 9999)], {}, { 1448: 'open' });
  const byId = Object.fromEntries(store.pirate_recent_reports.map(r => [r.id, r.zone]));
  assert.equal(byId[1], 'open', 'known camp resolves');
  assert.equal(byId[2], 'unknown', 'unknown camp falls back');
});

test('wormhole zone from wormholeId, back-fill from location string', async () => {
  const store = makeBrowserStub({ ships: {} });
  const bg = await loadBackground();
  await bg.processExpeditionReports([], [{
    id: 540, createdAt: '2026-06-14T10:00:00Z', status: 'completed',
    wormholeId: 65656, totalLoot: { ore: 10 }, totalShipsLost: [],
  }], {}, {}, { 65656: 'dead' });
  assert.equal(store.exp_recent_reports[0].zone, 'dead');
  assert.equal(store.exp_recent_reports[0].wormhole_id, 65656);

  // back-fill an old record that only has the "Wormhole #id" location string
  const s2 = makeBrowserStub({
    exp_recent_reports: [{ id: 'wh-1', location: 'Wormhole #65656' }],
    archive_index: { survey: { months: [], count: 0 }, pirate: { months: [], count: 0 }, mining: { months: [], count: 0 }, exp: { months: [], count: 0 } },
  });
  const bg2 = await loadBackground();
  await bg2.backfillZones({}, {}, { 65656: 'dead' });
  assert.equal(s2.exp_recent_reports[0].zone, 'dead');
});

test('wormhole runs: totalLoot parsed, in-progress runs skipped', async () => {
  const store = makeBrowserStub();
  const bg = await loadBackground();

  const completed = {
    id: 540, createdAt: '2026-06-13T12:41:16.733Z', status: 'completed', wormholeId: 64185,
    totalLoot: { ore: 1250, alloys: 612, hydrogen: 242, silicates: 945 }, totalShipsLost: [],
  };
  const inProgress = {
    id: 600, createdAt: '2026-06-13T13:00:00Z', status: 'in_progress', wormholeId: 7,
    totalLoot: { ore: 50 },
  };
  const added = await bg.processExpeditionReports([], [completed, inProgress], {});

  assert.equal(added, 1, 'only the completed run is counted');
  assert.equal(store.exp_totals.ore, 1250);
  assert.equal(store.exp_totals.alloys, 612);
  assert.equal(store.exp_totals.missions, 1);
  assert.equal(store.exp_recent_reports[0].location, 'Wormhole #64185');
});

test('uninvestigated and uncollected reports are deferred, not lost', async () => {
  const store = makeBrowserStub();
  const bg = await loadBackground();

  const pending = { ...surveyReport(1, '2026-06-10'), investigated: false };
  await bg.processSurveyReports([pending], SHIPS);
  assert.equal(store.totals.missions, 0);

  await bg.processSurveyReports([surveyReport(1, '2026-06-10')], SHIPS);
  assert.equal(store.totals.missions, 1, 'resolved report counts on a later scrape');
});

test('archive shards: only the report month is touched', async () => {
  const store = makeBrowserStub();
  const bg = await loadBackground();

  await bg.appendToArchive('survey', [
    { id: 1, created_at: '2026-05-20T10:00:00Z' },
    { id: 2, created_at: '2026-06-10T10:00:00Z' },
  ]);
  const may = store['survey_archive_2026-05'];
  await bg.appendToArchive('survey', [{ id: 3, created_at: '2026-06-13T10:00:00Z' }]);

  assert.equal(store['survey_archive_2026-05'], may, 'may shard object untouched');
  assert.equal(store['survey_archive_2026-06'].length, 2);
  assert.deepEqual(store.archive_index.survey.months, ['2026-05', '2026-06']);
  assert.equal((await bg.loadArchive('survey')).length, 3);
});

test('migration v4 moves legacy archives into shards', async () => {
  const store = makeBrowserStub({
    schema_version: 3,
    survey_archive: [
      { id: 1, created_at: '2026-05-20T10:00:00Z', ore: 10 },
      { id: 2, created_at: '2026-06-10T10:00:00Z', ore: 20 },
    ],
  });
  const bg = await loadBackground();

  await bg.ensureSchema();
  assert.equal(store.survey_archive, undefined, 'legacy key removed');
  assert.equal(store.archive_index.survey.count, 2);
  assert.equal((await bg.loadArchive('survey')).length, 2);
  assert.ok(store.schema_version >= 4);
});

test('drift detection flags corruption; rebuild repairs and clears it', async () => {
  const store = makeBrowserStub({ ships: SHIPS });
  const bg = await loadBackground();

  await bg.processSurveyReports([surveyReport(1, '2026-06-10'), surveyReport(2, '2026-06-11')], SHIPS);
  await bg.checkDrift();
  assert.equal(store.stats_drift, undefined, 'fresh data must be consistent');

  store.totals.ore = 9999;
  await bg.checkDrift();
  assert.deepEqual(store.stats_drift.fields, ['surveys.ore']);

  await bg.rebuildAggregates();
  assert.equal(store.totals.ore, 200, 'rebuild restores archive-derived value');
  assert.equal(store.stats_drift, undefined, 'rebuild clears the flag');
});

test('debris snapshot: live fields recorded with first-seen', async () => {
  const store = makeBrowserStub();
  const bg = await loadBackground();

  await bg.processSystemDebris([{ id: 5, systemName: 'A1', ore: 1000, silicates: 500, alloys: 100 }], { A1: 'open' });
  const f = store.debris_fields[0];
  assert.equal(f.ore, 1000);
  assert.equal(f.zone, 'open');
  assert.ok(f.first_seen && f.updated_at);
});

test('live search fieldMatches: type/zone/mult/qty/left filters + null handling', async () => {
  makeBrowserStub();
  const { fieldMatches } = await loadBackground();

  // total 1000 / remaining 500 → 50% left.
  const field = (over = {}) => ({
    fieldType: 'ore', zone: 'sentinel', richness: 2,
    remainingResources: 500, totalResources: 1000, ...over,
  });

  // No filters → matches anything.
  assert.equal(fieldMatches(field(), {}), true);

  // Type filter.
  assert.equal(fieldMatches(field(), { types: ['ore'] }), true);
  assert.equal(fieldMatches(field(), { types: ['gas'] }), false);
  assert.equal(fieldMatches(field({ fieldType: 'gas' }), { types: ['ore', 'gas'] }), true);

  // Zone filter.
  assert.equal(fieldMatches(field(), { zones: ['sentinel'] }), true);
  assert.equal(fieldMatches(field(), { zones: ['rift'] }), false);

  // Mult ≥ (inclusive boundary; missing richness fails when a min is set).
  assert.equal(fieldMatches(field({ richness: 2 }), { multMin: 2 }), true);
  assert.equal(fieldMatches(field({ richness: 2 }), { multMin: 2.1 }), false);
  assert.equal(fieldMatches(field({ richness: null }), { multMin: 1 }), false);

  // Qty ≥ (remaining resources).
  assert.equal(fieldMatches(field({ remainingResources: 1000 }), { qtyMin: 1000 }), true);
  assert.equal(fieldMatches(field({ remainingResources: 999 }), { qtyMin: 1000 }), false);
  assert.equal(fieldMatches(field({ remainingResources: null }), { qtyMin: 1 }), false);

  // Left % ≥ (remaining/total); total 0 → unknown → fails when a min is set.
  assert.equal(fieldMatches(field(), { leftMin: 50 }), true);
  assert.equal(fieldMatches(field(), { leftMin: 51 }), false);
  assert.equal(fieldMatches(field({ totalResources: 0 }), { leftMin: 10 }), false);

  // All filters together.
  assert.equal(fieldMatches(field(), {
    types: ['ore'], zones: ['sentinel'], multMin: 2, qtyMin: 500, leftMin: 50,
  }), true);
  assert.equal(fieldMatches(field(), {
    types: ['ore'], zones: ['sentinel'], multMin: 2, qtyMin: 501, leftMin: 50,
  }), false);
});
