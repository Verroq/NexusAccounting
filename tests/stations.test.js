import test from 'node:test';
import assert from 'node:assert';
import {
  ALL_ROLES, DEPOSITABLE, aggregateMembers, buildAlerts, fillStats, filterStations,
  ledgerCsv, ledgerRows, moveLimit, overLimit, parsedAmounts, planHaulers, roleOptions, sectorCode,
  sortStations, stationResources, stationState, stationValue, totalAmount,
} from '../nexus-addon/tabs/stations.js';
import { makeBrowserStub, loadBackground } from './helpers.js';

makeBrowserStub();
const { stationTransferBody } = await loadBackground();

// Shaped like /api/alliances/station-storage: ABSOLUTE amounts plus the two caps.
const station = (over = {}) => ({
  id: 1, name: 'Aegis Depot', systemName: 'G21-15', systemX: 0, systemY: 0,
  ore: 0, silicates: 0, hydrogen: 0, alloys: 0,
  cryoIce: 0, quantumDust: 0, plasmaCore: 0, bioExtract: 0, darkMatter: 0, antimatter: 0,
  basicStorage: 100000, rareStorage: 10000, withdrawAccessRole: 'member',
  ...over,
});

test('sectorCode takes the sector off a station coordinate', () => {
  assert.equal(sectorCode('G21-15'), 'G21');
  assert.equal(sectorCode('B47-5'), 'B47');
  assert.equal(sectorCode('nonsense'), '');
  assert.equal(sectorCode(undefined), '');
});

test('stationResources turns amounts into fills against the right cap', () => {
  const rows = stationResources(station({ ore: 50000, cryoIce: 5000 }));
  const ore = rows.find(r => r.key === 'ore');
  const ice = rows.find(r => r.key === 'cryo_ice');
  assert.equal(ore.fill, 0.5, 'basic resources measure against basicStorage');
  assert.equal(ice.fill, 0.5, 'rares measure against rareStorage, not the basic cap');
  assert.equal(ice.amount, 5000);
});

test('fillStats separates the mean from the peak', () => {
  const s = fillStats(station({ ore: 99000, silicates: 1000 }));
  assert.equal(Math.round(s.peak * 100), 99);
  assert.equal(s.peakLabel, 'Ore');
  // 10 resources, only two carry anything: the mean stays far below the peak.
  assert.ok(s.mean < 0.11, `mean ${s.mean} should stay low`);
});

test('stationValue weights rares above basics', () => {
  const basic = stationValue(station({ ore: 1000 }));
  const rare = stationValue(station({ quantumDust: 1000 }));
  assert.equal(basic, 1000, 'ore is weight 1');
  assert.ok(rare > basic, 'exotics use the rare weight');
});

test('stationState reads capture first, then a downed shield', () => {
  assert.equal(stationState(station()), 'Secure');
  assert.equal(stationState(station({ shieldHp: 0 })), 'Vulnerable');
  assert.equal(stationState(station({ shieldHp: 0, capturingAllianceTag: 'SWORD' })), 'Under capture');
});

test('filterStations composes sector, search, state and near-full', () => {
  const list = [
    station({ id: 1, name: 'Aegis Depot', systemName: 'G21-15', ore: 95000 }),
    station({ id: 2, name: 'Far Post', systemName: 'B47-5', ore: 1000 }),
    station({ id: 3, name: 'Contested', systemName: 'G21-25', capturingAllianceTag: 'SWORD' }),
  ];
  assert.deepEqual(filterStations(list, { sector: 'G21' }).map(s => s.id), [1, 3]);
  assert.deepEqual(filterStations(list, { query: 'far' }).map(s => s.id), [2]);
  assert.deepEqual(filterStations(list, { query: 'B47' }).map(s => s.id), [2], 'search also matches coordinates');
  assert.deepEqual(filterStations(list, { state: 'Under capture' }).map(s => s.id), [3]);
  assert.deepEqual(filterStations(list, { nearFull: true }).map(s => s.id), [1]);
  assert.deepEqual(filterStations(list, { sector: 'G21', nearFull: true }).map(s => s.id), [1]);
  assert.equal(filterStations(list, {}).length, 3, 'no filters keeps everything');
});

test('roleOptions lists the withdraw rights in use, least privileged first', () => {
  const list = [
    station({ id: 1, withdrawAccessRole: 'leader' }),
    station({ id: 2, withdrawAccessRole: 'member' }),
    station({ id: 3, withdrawAccessRole: 'officer' }),
    station({ id: 4, withdrawAccessRole: 'member' }),
    station({ id: 5, withdrawAccessRole: 'archon' }),   // a rank the game adds later
    station({ id: 6, withdrawAccessRole: null }),
  ];
  assert.deepEqual(roleOptions(list), ['member', 'officer', 'leader', 'archon', 'unknown'],
    'known ranks in game order, anything unrecognised appended');
  assert.deepEqual(roleOptions([]), []);
});

test('filterStations narrows by withdraw rights', () => {
  const list = [
    station({ id: 1, withdrawAccessRole: 'leader' }),
    station({ id: 2, withdrawAccessRole: 'member' }),
    station({ id: 3, withdrawAccessRole: null }),
  ];
  assert.deepEqual(filterStations(list, { role: 'leader' }).map(s => s.id), [1]);
  assert.deepEqual(filterStations(list, { role: 'unknown' }).map(s => s.id), [3],
    'a station with no stated rank is filterable as unknown');
  assert.equal(filterStations(list, { role: ALL_ROLES }).length, 3);
  assert.equal(filterStations(list, {}).length, 3, 'the rights filter defaults to off');
  // composes with the rest
  const mixed = [
    station({ id: 1, systemName: 'G21-15', withdrawAccessRole: 'leader', ore: 95000 }),
    station({ id: 2, systemName: 'G21-25', withdrawAccessRole: 'leader', ore: 1000 }),
  ];
  assert.deepEqual(filterStations(mixed, { role: 'leader', nearFull: true }).map(s => s.id), [1]);
});

test('sortStations orders by fill, value, coordinates and distance', () => {
  const list = [
    station({ id: 1, systemName: 'G21-25', ore: 10000 }),
    station({ id: 2, systemName: 'G21-5', ore: 90000 }),
    station({ id: 3, systemName: 'G21-15', quantumDust: 9500 }),
  ];
  assert.deepEqual(sortStations(list, 'Fullest first').map(s => s.id), [3, 2, 1]);
  assert.deepEqual(sortStations(list, 'Emptiest first').map(s => s.id), [1, 2, 3]);
  assert.deepEqual(sortStations(list, 'Highest value').map(s => s.id), [3, 2, 1], 'rares outweigh a fuller ore hold');
  assert.deepEqual(sortStations(list, 'Coordinates').map(s => s.id), [2, 3, 1], 'slot 5 before 15 before 25');
  const dist = { 1: 5, 2: null, 3: 1 };
  assert.deepEqual(sortStations(list, 'Nearest', s => dist[s.id]).map(s => s.id), [3, 1, 2],
    'stations with no computable distance sort last');
});

test('buildAlerts names the resource and the station, capture first', () => {
  const alerts = buildAlerts([
    station({ id: 1, name: 'Aegis Depot', ore: 99000 }),
    station({ id: 2, name: 'Contested', capturingAllianceTag: 'SWORD', captureEndsAt: '2026-09-10T12:00:00Z' }),
  ]);
  assert.equal(alerts[0].kind, 'capture');
  assert.match(alerts[0].title, /Contested/);
  assert.match(alerts[0].body, /SWORD/);
  assert.equal(alerts[1].kind, 'full');
  assert.match(alerts[1].title, /Aegis Depot — ore at 99% of its cap/);
  assert.match(alerts[1].body, /storage overall sits at 10%/, 'the body must not claim the station is full');
  assert.deepEqual(buildAlerts([station()]), [], 'a quiet station raises nothing');
});

const logs = [
  { action: 'mining_income', resource: 'ore', amount: 1000, createdAt: '2026-09-09T10:00:00Z', username: null, stationId: 1 },
  { action: 'withdraw', resource: 'ore', amount: 4000, createdAt: '2026-09-09T11:00:00Z', username: 'Verrok', stationId: 1 },
  { action: 'withdraw', resource: 'quantum_dust', amount: 100, createdAt: '2026-09-09T12:00:00Z', username: 'Ketch', stationId: 2 },
  { action: 'deposit', resource: 'alloys', amount: 200, createdAt: '2026-09-09T09:00:00Z', username: 'Verrok', stationId: 1 },
];

test('aggregateMembers ranks by withdrawn weighted value and ignores station income', () => {
  const rows = aggregateMembers(logs);
  assert.deepEqual(rows.map(r => r.name), ['Verrok', 'Ketch']);
  assert.equal(rows[0].withdrawn, 4000, 'ore weight 1');
  assert.equal(rows[0].deposited, 1000, 'alloys weight 5');
  assert.equal(rows[0].entries, 2);
  assert.equal(rows[1].withdrawn, 1000, 'quantum dust uses the rare weight');
  assert.ok(rows.every(r => r.entries > 0));
});

test('ledgerRows signs by action, newest first, and drops mining income', () => {
  const rows = ledgerRows(logs, id => (id === 1 ? 'Aegis Depot' : 'Far Post'));
  assert.equal(rows.length, 3, 'mining_income is the station producing for itself, not a member move');
  assert.deepEqual(rows.map(r => r.resource), ['quantum_dust', 'ore', 'alloys']);
  assert.equal(rows[1].amount, -4000, 'a withdrawal is negative');
  assert.equal(rows[2].amount, 200, 'a deposit is positive');
  assert.equal(rows[0].station, 'Far Post');
});

test('ledgerCsv quotes every field and keeps the header', () => {
  const csv = ledgerCsv(ledgerRows(logs, () => 'Aegis "Depot"'));
  const lines = csv.split('\n');
  assert.equal(lines[0], 'time,member,station,direction,resource,amount');
  assert.equal(lines.length, 4);
  assert.match(lines[1], /"Aegis ""Depot"""/, 'embedded quotes are doubled');
});

test('moveLimit is the stock when withdrawing and the free space when depositing', () => {
  const st = station({ ore: 60000, cryoIce: 4000 });
  assert.equal(moveLimit(st, 'withdraw', 'ore'), 60000);
  assert.equal(moveLimit(st, 'deposit', 'ore'), 40000);
  assert.equal(moveLimit(st, 'withdraw', 'cryo_ice'), 4000);
  assert.equal(moveLimit(st, 'deposit', 'cryo_ice'), 6000, 'rares measure against the rare cap');
  assert.equal(moveLimit(null, 'withdraw', 'ore'), 0);
  assert.ok(!DEPOSITABLE.has('cryo_ice'), 'a supply mission carries basics only');
});

const haulers = [
  { shipDefId: 1, name: 'Ore Freighter', cap: 100000 },
  { shipDefId: 2, name: 'Freighter', cap: 25000 },
];

test('planHaulers plans the fewest picked haulers and trims to what is parked', () => {
  const all = new Set([1, 2]);
  const stocked = { 1: 10, 2: 10 };

  const full = planHaulers(240000, haulers, all, stocked);
  assert.deepEqual(full.plan, [{ shipDefId: 1, quantity: 2 }, { shipDefId: 2, quantity: 2 }],
    'big haulers first, the small one fills the tail');
  assert.equal(full.carried, 250000);
  assert.equal(full.short, false);

  // Only one Ore Freighter on the planet: the plan is trimmed and falls short.
  const thin = planHaulers(240000, haulers, all, { 1: 1, 2: 1 });
  assert.deepEqual(thin.ships, [{ shipDefId: 1, quantity: 1 }, { shipDefId: 2, quantity: 1 }]);
  assert.equal(thin.carried, 125000);
  assert.equal(thin.short, true, 'a short fleet must be flagged, not silently sent');

  // Unpicked types are never planned, even when they are sitting there.
  const oneType = planHaulers(240000, haulers, new Set([2]), stocked);
  assert.deepEqual(oneType.plan, [{ shipDefId: 2, quantity: 10 }]);

  assert.deepEqual(planHaulers(0, haulers, all, stocked).ships, [], 'nothing to carry, nothing to send');
  assert.deepEqual(planHaulers(240000, haulers, new Set(), stocked).ships, [], 'no hauler type picked');
  assert.deepEqual(planHaulers(240000, haulers, all, {}).ships, [], 'none parked on this planet');
});

test('parsedAmounts keeps whole units and drops blanks and zeroes', () => {
  assert.deepEqual(parsedAmounts({ ore: '4200', alloys: '', hydrogen: '0', cryo_ice: '1 200' }),
    { ore: 4200, cryo_ice: 1200 }, 'digits only, and a resource with no amount is not shipped');
  assert.deepEqual(parsedAmounts({}), {});
  assert.equal(totalAmount({ ore: '4200', alloys: '800' }), 5000, 'one cargo hold, so amounts add up');
});

test('overLimit names every resource asked for beyond its limit', () => {
  const st = station({ ore: 60000, cryoIce: 4000 });
  assert.deepEqual(overLimit(st, 'withdraw', { ore: '60000', cryo_ice: '4000' }), []);
  assert.deepEqual(overLimit(st, 'withdraw', { ore: '60001', cryo_ice: '9999' }), ['ore', 'cryo_ice']);
  // depositing is bounded by free space, not by what is already there
  assert.deepEqual(overLimit(st, 'deposit', { ore: '40000' }), []);
  assert.deepEqual(overLimit(st, 'deposit', { ore: '40001' }), ['ore']);
});

test('stationTransferBody carries several resources in one mission', () => {
  const ships = [{ shipDefId: 7, quantity: 12 }];
  assert.deepEqual(stationTransferBody('withdraw', 4021, ships, { ore: 40000, plasma_core: '500', alloys: 0 }), {
    sourcePlanetId: 4021,
    missionType: 'collect_station',
    ships,
    collectCargo: { ore: 40000, plasma_core: 500 },
  }, 'a collect takes any resource, and empty entries are left out');

  assert.deepEqual(stationTransferBody('deposit', 4021, ships, { ore: 21000, silicates: 5000 }), {
    sourcePlanetId: 4021,
    missionType: 'supply_station',
    ships,
    cargo: { ore: 21000, silicates: 5000 },
  });

  assert.match(stationTransferBody('deposit', 4021, ships, { cryo_ice: 100 }).error, /Only ore/,
    'a supply mission has no rare slots');
  assert.match(stationTransferBody('withdraw', 4021, ships, { ore: 0 }).error, /above zero/);
  assert.match(stationTransferBody('withdraw', 4021, ships, {}).error, /above zero/);
});
