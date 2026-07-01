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

test('mining drill maintenance valued per drill type from damagedQuantity', async () => {
  const store = makeBrowserStub({ ships: {} });
  const bg = await loadBackground();

  await bg.processMiningReports([
    { id: 1, createdAt: '2026-07-01T01:00:00Z', resourcesDelivered: { cryo_ice: 100 }, drillBreakdowns: 4,
      locationName: 'X', shipsLost: [],
      fleetComposition: [{ shipKey: 'interceptor', quantity: 30 }, { shipKey: 'ice_drill', quantity: 6, damagedQuantity: 4 }] },
    { id: 2, createdAt: '2026-07-01T00:00:00Z', resourcesDelivered: { plasma_core: 100 }, drillBreakdowns: 8,
      locationName: 'X', shipsLost: [],
      fleetComposition: [{ shipKey: 'miner', quantity: 92, damagedQuantity: 8 }] },
  ], {}, {});

  assert.equal(store.mining_recent_reports.find(r => r.id === 1).maintenance_alloys, 100); // ice_drill 4 × 25
  assert.equal(store.mining_recent_reports.find(r => r.id === 2).maintenance_alloys, 120); // miner 8 × 15
  assert.equal(store.mining_totals.maintenance_alloys, 220);
});

test('combat debris stored from combatLog on raided mining/survey reports', async () => {
  const bg = await loadBackground();
  const mstore = makeBrowserStub({ ships: {} });
  await bg.processMiningReports([
    { id: 10, createdAt: '2026-07-01T02:00:00Z', resourcesDelivered: {}, locationName: 'X', shipsLost: [],
      combatOutcome: 'defender_won',
      attackerFleet: [{ key: 'scout', name: 'Scout', quantity: 50 }],
      defenderFleet: [{ key: 'miner', name: 'Mining Vessel', quantity: 90 }],
      combatLog: { debris: { ore: 100, alloys: 20, silicates: 30 }, rounds: [
        { round: 1, attackerHpPercent: 90, defenderHpPercent: 40, events: [
          { side: 'attacker', totalDamage: 500, shipsDestroyed: [{ key: 'scout', name: 'Scout', lost: 3 }] },
          { side: 'defender', totalDamage: 120, shipsDestroyed: [] },
        ] },
      ] } },
    { id: 11, createdAt: '2026-07-01T01:00:00Z', resourcesDelivered: { ore: 5 }, locationName: 'X', shipsLost: [] },
  ], {}, {});
  const raided = mstore.mining_recent_reports.find(r => r.id === 10);
  assert.equal(raided.debris_ore, 100);
  assert.equal(raided.debris_alloys, 20);
  assert.equal(raided.rounds.length, 1);
  assert.equal(raided.rounds[0].atk_dmg, 500);
  assert.deepEqual(raided.rounds[0].atk_killed, [{ name: 'Scout', qty: 3 }]);
  assert.equal(raided.rounds[0].def_hp, 40);
  // a raid: you defend, pirates attack
  assert.deepEqual(raided.your_fleet, [{ key: 'miner', name: 'Mining Vessel', quantity: 90 }]);
  assert.deepEqual(raided.enemy_fleet, [{ key: 'scout', name: 'Scout', quantity: 50 }]);
  // no combat → no debris fields
  assert.equal(mstore.mining_recent_reports.find(r => r.id === 11).debris_ore, undefined);

  const sstore = makeBrowserStub({ ships: {} });
  await bg.processSurveyReports([
    // Clean win: fought and won with zero losses — still a battle, must keep debris + outcome.
    { id: 20, createdAt: '2026-07-01T02:00:00Z', investigated: true, uncollectedLoot: null,
      loot: {}, eventType: 'pirate_base', systemName: 'A12-27', securityZone: 'open',
      shipsLost: [], shipsDamaged: [],
      // Survey combat outcome is nested in combatLog, not top-level.
      combatLog: { outcome: 'attacker_won', debris: { ore: 9360, alloys: 1440, silicates: 5100 } } },
  ], {}, {});
  assert.equal(sstore.recent_reports[0].debris_ore, 9360);
  assert.equal(sstore.recent_reports[0].debris_silicates, 5100);
  assert.equal(sstore.recent_reports[0].combat_outcome, 'attacker_won');
});

test('survey backfill enriches already-seen clean-win records without double-counting', async () => {
  const bg = await loadBackground();
  // A clean-win survey already stored the old way: seen, counted, but no combat fields.
  const store = makeBrowserStub({
    ships: {},
    seen_ids: [30],
    totals: { ore: 5, silicates: 0, hydrogen: 0, missions: 1, ships_lost: 0, rare: {} },
    // Simulates a record a buggy earlier build left with an EMPTY fleet (read
    // from the wrong top-level path). Backfill must re-patch it, not skip it.
    recent_reports: [{ id: 30, created_at: '2026-07-01T05:00:00Z', system_name: 'G1', zone: 'open',
      event_type: 'pirate_base', ore: 5, ships_lost: 0, ships_damaged: 0,
      combat_outcome: 'attacker_won', your_fleet: [], enemy_fleet: [] }],
  });
  // Same report comes back from the API (already seen) with full combatLog.
  await bg.processSurveyReports([
    { id: 30, createdAt: '2026-07-01T05:00:00Z', investigated: true, uncollectedLoot: null,
      loot: { ore: 5 }, eventType: 'pirate_base', systemName: 'G1', securityZone: 'open',
      shipsLost: [], shipsDamaged: [],
      attackerFleet: [{ key: 'cruiser', name: 'Cruiser', quantity: 40 }],
      defenderFleet: [{ key: 'fighter', name: 'Fighter', quantity: 20 }],
      combatLog: { outcome: 'attacker_won', debris: { ore: 700, alloys: 100, silicates: 200 },
        rounds: [{ round: 1, attackerHpPercent: 88, defenderHpPercent: 0, events: [
          { side: 'attacker', totalDamage: 300, shipsDestroyed: [{ name: 'Fighter', lost: 2 }] },
          { side: 'defender', totalDamage: 40, shipsDestroyed: [] }] }] } },
  ], {}, {});

  const rec = store.recent_reports.find(r => r.id === 30);
  assert.equal(rec.combat_outcome, 'attacker_won');   // backfilled
  assert.equal(rec.debris_ore, 700);
  assert.equal(rec.rounds[0].atk_dmg, 300);
  assert.deepEqual(rec.your_fleet, [{ key: 'cruiser', name: 'Cruiser', quantity: 40 }]);
  assert.deepEqual(rec.enemy_fleet, [{ key: 'fighter', name: 'Fighter', quantity: 20 }]);
  assert.equal(store.totals.ore, 5);                  // NOT double-counted
  assert.equal(store.totals.missions, 1);
});

test('mining-raid backfill enriches already-seen records without double-counting', async () => {
  const bg = await loadBackground();
  // A raid already stored the old way: seen, counted, no combat detail.
  const store = makeBrowserStub({
    ships: {},
    mining_seen_ids: [40],
    mining_totals: { ore: 0, silicates: 0, hydrogen: 0, alloys: 0, deliveries: 1, cycles: 0,
      drill_breakdowns: 0, maintenance_alloys: 0, ships_lost: 0, rare: {}, stolen: {} },
    mining_recent_reports: [{ id: 40, created_at: '2026-07-01T06:00:00Z', location: 'Y', zone: 'open',
      ships_lost: 0, combat_outcome: 'attacker_won' }],   // prior build: outcome only
  });
  await bg.processMiningReports([
    { id: 40, createdAt: '2026-07-01T06:00:00Z', resourcesDelivered: {}, locationName: 'Y', shipsLost: [],
      combatOutcome: 'attacker_won', combatLog: { debris: { ore: 50, alloys: 8, silicates: 12 },
        attackerFleet: [{ key: 'scout', name: 'Scout', quantity: 30 }],
        defenderFleet: [{ key: 'miner', name: 'Mining Vessel', quantity: 80 }],
        rounds: [{ round: 1, attackerHpPercent: 20, defenderHpPercent: 95, events: [] }] } },
  ], {}, {});
  const rec = store.mining_recent_reports.find(r => r.id === 40);
  assert.equal(rec.debris_ore, 50);
  assert.deepEqual(rec.your_fleet, [{ key: 'miner', name: 'Mining Vessel', quantity: 80 }]);
  assert.deepEqual(rec.enemy_fleet, [{ key: 'scout', name: 'Scout', quantity: 30 }]);
  assert.equal(store.mining_totals.deliveries, 1);   // NOT re-counted
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
