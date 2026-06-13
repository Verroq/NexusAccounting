'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { makeBrowserStub, loadBackground } = require('./helpers.js');

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
  const bg = loadBackground();

  await bg.processSurveyReports([surveyReport(1, '2026-06-10')], SHIPS);
  await bg.processSurveyReports([surveyReport(1, '2026-06-10'), surveyReport(2, '2026-06-11')], SHIPS);

  assert.equal(store.totals.missions, 2, 'report 1 must not double-count');
  assert.equal(store.totals.ore, 200);
  assert.equal(store.resources_lost.ore, 200);          // 2 × scout-ish cost
  assert.equal(store.resources_lost.rare.cryo_ice, 10);
  assert.equal(store['survey_archive_2026-06'].length, 2);
  assert.equal(store.archive_index.survey.count, 2);
});

test('damaged ships add 50% repair cost to losses', async () => {
  const store = makeBrowserStub({ ships: SHIPS });   // rebuild reads the catalog from storage
  const bg = loadBackground();

  // 1 destroyed scout (full cost) + 2 damaged scouts (half cost each).
  const rep = {
    id: 1, createdAt: '2026-06-10T10:00:00.000Z', investigated: true, uncollectedLoot: null,
    loot: { ore: 0 }, eventType: 'rogue_drone', systemName: 'X',
    shipsLost: [{ shipDefId: 21, quantity: 1 }],
    shipsDamaged: [{ shipDefId: 21, quantity: 2 }],
  };
  await bg.processSurveyReports([rep], SHIPS);

  // scout-ish costOre 100 → 1 destroyed (100) + 2 damaged ×0.5 (100) = 200
  assert.equal(store.resources_lost.ore, 200);
  assert.equal(store.totals.ships_lost, 1);
  assert.equal(store.recent_reports[0].ships_damaged, 2);

  // rebuild from archive must reproduce the same repair-inclusive cost
  store.totals.ore = 1; // corrupt something to prove rebuild recomputes
  await bg.rebuildAggregates();
  assert.equal(store.resources_lost.ore, 200, 'rebuild keeps repair cost');
});

test('security zone resolution', () => {
  const bg = loadBackground();
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
  const bg = loadBackground();
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
  const bg = loadBackground();
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

test('wormhole runs: totalLoot parsed, in-progress runs skipped', async () => {
  const store = makeBrowserStub();
  const bg = loadBackground();

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
  const bg = loadBackground();

  const pending = { ...surveyReport(1, '2026-06-10'), investigated: false };
  await bg.processSurveyReports([pending], SHIPS);
  assert.equal(store.totals.missions, 0);

  await bg.processSurveyReports([surveyReport(1, '2026-06-10')], SHIPS);
  assert.equal(store.totals.missions, 1, 'resolved report counts on a later scrape');
});

test('archive shards: only the report month is touched', async () => {
  const store = makeBrowserStub();
  const bg = loadBackground();

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
  const bg = loadBackground();

  await bg.ensureSchema();
  assert.equal(store.survey_archive, undefined, 'legacy key removed');
  assert.equal(store.archive_index.survey.count, 2);
  assert.equal((await bg.loadArchive('survey')).length, 2);
  assert.ok(store.schema_version >= 4);
});

test('drift detection flags corruption; rebuild repairs and clears it', async () => {
  const store = makeBrowserStub({ ships: SHIPS });
  const bg = loadBackground();

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

test('debris snapshots: decreases count as collected', async () => {
  const store = makeBrowserStub();
  const bg = loadBackground();

  await bg.processSystemDebris([{ id: 5, systemName: 'A1', ore: 1000, silicates: 500, alloys: 100 }]);
  await bg.processSystemDebris([{ id: 5, systemName: 'A1', ore: 400, silicates: 600, alloys: 0 }]);

  assert.equal(store.debris_collected_est.ore, 600);
  assert.equal(store.debris_collected_est.silicates, 0, 'growth is not collection');
  assert.equal(store.debris_collected_est.alloys, 100);
});
