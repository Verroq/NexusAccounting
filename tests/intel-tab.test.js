import test from 'node:test';
import assert from 'node:assert';
import {
  BAR_MIN_PCT, UNKNOWN_PLAYER, YOU, barPct, buildingColumns, categoryOf, contributorOf,
  defenseRows, fleetText, groupByTarget,
  intelSummary, lootEstimate, ownerOf, playerList, resourceEntries, resourceLabel,
  raceFromImageUrl, resourceIconUrl, resourceVar, splitDefenses, turretPct, buildingIconUrls,
} from '../nexus-addon/tabs/intel.js';

const reports = [
  // Same planet, two owners' worth of scans over time.
  { id: 1, created_at: '2026-08-01T10:00:00Z', target_name: 'Terra', target_user: 'foe',
    target_system_name: 'A12-27', fleet: [{ key: 'probe', name: 'Probe', quantity: 4 }] },
  { id: 2, created_at: '2026-08-20T10:00:00Z', target_name: 'Terra', target_user: 'foe',
    target_system_name: 'A12-27', shared_by: 'Palidors',
    fleet: [{ key: 'miner', name: 'Miner', quantity: 10 }] },
  { id: 3, created_at: '2026-08-10T10:00:00Z', target_name: 'Silly Cat', target_user: 'other',
    shared_by: 'Negi', fleet: [] },
  // Same planet name, different owner — must not merge with id 1/2.
  { id: 4, created_at: '2026-08-05T10:00:00Z', target_name: 'Terra', target_user: 'someone-else',
    fleet: [] },
];

test('contributorOf labels own scans and ally imports', () => {
  assert.equal(contributorOf(reports[0]), YOU);
  assert.equal(contributorOf(reports[1]), 'Palidors');
});

test('groupByTarget groups by owner+planet and orders scans newest first', () => {
  const groups = groupByTarget(reports);
  assert.deepEqual(groups.map(g => g.target_name), ['Terra', 'Silly Cat', 'Terra'],
    'groups ordered by their latest scan');
  const terra = groups[0];
  assert.equal(terra.target_user, 'foe');
  assert.deepEqual(terra.scans.map(s => s.id), [2, 1], 'newest scan first inside the group');
  assert.equal(terra.latest, '2026-08-20T10:00:00Z');
  assert.deepEqual(terra.contributors, ['Palidors', YOU]);
});

test('groupByTarget keeps same-named planets of different owners apart', () => {
  const terras = groupByTarget(reports).filter(g => g.target_name === 'Terra');
  assert.equal(terras.length, 2, 'foe and someone-else are separate targets');
});

test('groupByTarget sharedOnly keeps just ally imports', () => {
  const groups = groupByTarget(reports, true);
  assert.deepEqual(groups.flatMap(g => g.scans.map(s => s.id)), [2, 3]);
});

test('groupByTarget drops malformed entries', () => {
  const groups = groupByTarget([null, { created_at: 'x' }, reports[0]]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].scans.map(s => s.id), [1]);
});

test('intelSummary counts own vs shared, contributors and distinct targets', () => {
  const s = intelSummary(reports);
  assert.deepEqual(s, { total: 4, shared: 2, own: 2, contributors: 2, targets: 3 });
});

test('intelSummary handles an empty pool', () => {
  assert.deepEqual(intelSummary([]), { total: 0, shared: 0, own: 0, contributors: 0, targets: 0 });
});

test('resourceEntries sorts by amount and drops the tier marker and zeroes', () => {
  const rows = resourceEntries({ ore: 430716, tier: 'exact', alloys: 146124, hydrogen: 0, cryoIce: 12 });
  assert.deepEqual(rows.map(r => r.key), ['ore', 'alloys', 'cryoIce'], 'tier and zero values excluded');
  assert.equal(rows[0].label, 'Ore');
});

test('resourceLabel bridges camelCase API keys to the shared labels', () => {
  assert.equal(resourceLabel('cryoIce'), 'Cryo-Ice');
  assert.equal(resourceLabel('quantumDust'), 'Quantum Dust');
  assert.equal(resourceLabel('somethingNew'), 'Something New', 'unknown keys still get a label');
});

test('splitDefenses separates the shield from planetary defenses, strongest first', () => {
  const { shield, turrets } = splitDefenses([
    { key: 'shield_generator', name: 'Shield Generator', level: 6 },
    { key: 'railgun_defense', name: 'Railgun Defense System', level: 4 },
    { key: 'plasma_defense', name: 'Plasma Defense System', level: 1 },
  ]);
  assert.deepEqual(shield.map(d => d.key), ['shield_generator']);
  assert.deepEqual(turrets.map(d => d.key), ['railgun_defense', 'plasma_defense']);
});

test('splitDefenses tolerates a missing or non-array defense field', () => {
  assert.deepEqual(splitDefenses(null), { shield: [], turrets: [] });
  assert.deepEqual(splitDefenses({ key: 'railgun_defense', level: 2 }).turrets.length, 1);
});

test('fleetText shows the biggest stacks and rolls up the rest', () => {
  assert.equal(fleetText([]), '—');
  // A shared report from an older/edited build can carry `fleet: null`; a
  // throw here aborts renderGroup and blanks the whole tab.
  assert.equal(fleetText(null), '—');
  assert.equal(fleetText(undefined), '—');
  assert.equal(
    fleetText([
      { name: 'Probe', quantity: 2 },
      { name: 'Miner', quantity: 30 },
      { name: 'Interceptor', quantity: 7 },
      { name: 'Excavator', quantity: 1 },
    ]),
    '30× Miner, 7× Interceptor, 2× Probe +1 more',
  );
});

test('playerList counts planets and scans per owner, most-known first', () => {
  const players = playerList(reports);
  assert.deepEqual(players, [
    { name: 'foe', planets: 1, scans: 2 },
    { name: 'other', planets: 1, scans: 1 },
    { name: 'someone-else', planets: 1, scans: 1 },
  ], 'foe leads on scan count; ties break alphabetically');
});

test('playerList buckets owner-less targets under one entry', () => {
  const players = playerList([
    { id: 9, created_at: '2026-08-01', target_name: 'Outpost G45', target_user: null },
    { id: 10, created_at: '2026-08-02', target_name: 'Outpost G36', target_user: null },
  ]);
  assert.deepEqual(players, [{ name: UNKNOWN_PLAYER, planets: 2, scans: 2 }]);
});

test('playerList respects the shared-only filter', () => {
  assert.deepEqual(playerList(reports, true).map(p => p.name), ['foe', 'other']);
});

test('ownerOf falls back to the unknown bucket', () => {
  assert.equal(ownerOf({ target_user: 'foe' }), 'foe');
  assert.equal(ownerOf({ target_user: null }), UNKNOWN_PLAYER);
});

test('lootEstimate halves the numeric total and sizes the freighter run', () => {
  const est = lootEstimate({ ore: 400000, alloys: 100000, tier: 'exact' }, 25000);
  assert.equal(est.total, 500000);
  assert.equal(est.loot, 250000);
  assert.equal(est.freighters, 10, '250k lootable / 25k capacity');
  assert.equal(est.qualitative, false);
});

test('lootEstimate flags qualitative amounts and omits the freighter count', () => {
  const est = lootEstimate({ ore: 'plenty', tier: 'estimate' }, 25000);
  assert.equal(est.total, 0);
  assert.equal(est.qualitative, true, 'no total to halve');
  const noCap = lootEstimate({ ore: 100 }, null);
  assert.equal(noCap.freighters, null, 'no ship def yet → no freighter figure');
});

test('barPct floors tiny values and clamps to the max', () => {
  assert.equal(barPct(100, 100), 100);
  assert.equal(barPct(50, 100), 50);
  assert.equal(barPct(1, 1000000), BAR_MIN_PCT, 'a tiny share still shows a sliver');
  assert.equal(barPct(5, 0), 0, 'no max → no bar');
});

test('turretPct scales against L12 and clamps above it', () => {
  assert.equal(turretPct(12), 100);
  assert.equal(turretPct(6), 50);
  assert.equal(turretPct(20), 100, 'levels past the scale cap at full');
});

test('resourceVar maps named resources to tokens and the rest to rare', () => {
  assert.equal(resourceVar('ore'), 'var(--res-ore)');
  assert.equal(resourceVar('plasmaCore'), 'var(--res-plasma)');
  assert.equal(resourceVar('darkMatter'), 'var(--res-rare)');
});

test('resourceIconUrl uses the snake_case game asset name', () => {
  assert.match(resourceIconUrl('ore'), /\/images\/resources\/ore\.webp$/);
  assert.match(resourceIconUrl('plasmaCore'), /\/images\/resources\/plasma_core\.webp$/,
    'camelCase API key maps to the snake_case file');
});

test('buildingIconUrls offers the race path then the outpost fallback', () => {
  const urls = buildingIconUrls('shield_generator', 'terran');
  assert.equal(urls.length, 2);
  assert.match(urls[0], /\/buildings\/terran\/shield_generator\.webp$/);
  assert.match(urls[1], /\/buildings\/outpost\/shield_generator\.webp$/);
});

test('buildingIconUrls still offers outpost art when the race is unknown', () => {
  assert.deepEqual(buildingIconUrls('turret', null).length, 1);
  assert.deepEqual(buildingIconUrls(null, 'terran'), [], 'no key, no candidates');
});

test('raceFromImageUrl reads the race out of a ship art path', () => {
  assert.equal(raceFromImageUrl('https://s0.nexuslegacy.space/api/images/ships/terran/probe.webp'), 'terran');
  assert.equal(raceFromImageUrl(null), null);
  assert.equal(raceFromImageUrl('https://example.com/nope.png'), null);
});

test('buildingColumns groups into the four reader columns, level-descending', () => {
  const cols = buildingColumns([
    { key: 'ore_mine', name: 'Ore Mine', level: 23 },
    { key: 'solar_plant', name: 'Solar Plant', level: 20 },
    { key: 'research_lab', name: 'Research Lab', level: 9 },
    { key: 'p_shipyard', name: 'Shipyard', level: 12 },
    { key: 'alloy_foundry', name: 'Alloy Foundry', level: 18 },
    { key: 'residential', name: 'Residential', level: 10 },
  ]);
  assert.deepEqual(cols.map(c => c.label), ['Resources', 'Energy', 'Military', 'Utility'],
    'fixed column order, empty categories omitted');
  assert.deepEqual(cols[0].items.map(b => b.key), ['ore_mine', 'alloy_foundry'], 'highest level first');
});

test('buildingColumns keeps defense-category buildings out — they belong to Defenses', () => {
  const cols = buildingColumns([
    { key: 'ore_mine', level: 1 },
    { key: 'shield_generator', level: 6 },
    { key: 'aa_turret', level: 3 },
    { key: 'garrison', level: 2 },
  ]);
  assert.deepEqual(cols.map(c => c.label), ['Resources']);
});

test('buildingColumns routes unmapped keys to Other instead of dropping them', () => {
  const cols = buildingColumns([{ key: 'brand_new_thing', name: 'New', level: 1 }]);
  assert.deepEqual(cols.map(c => c.label), ['Other']);
  assert.equal(categoryOf('brand_new_thing'), 'other');
  assert.equal(categoryOf('ore_mine'), 'resource');
});

test('buildingColumns categorises outpost structures that carry no server category', () => {
  const cols = buildingColumns([
    { key: 'extractor', level: 4 }, { key: 'dock', level: 2 }, { key: 'storage', level: 3 },
  ]);
  assert.deepEqual(cols.map(c => c.label), ['Resources', 'Military', 'Utility']);
});

test('defenseRows merges defenseData with defense-category buildings, deduped', () => {
  const rows = defenseRows({
    defense: [{ key: 'railgun_defense', name: 'Railgun', level: 4 }],
    buildings: [
      { key: 'ore_mine', level: 20 },
      { key: 'aa_turret', name: 'AA Turret', level: 3 },
      { key: 'railgun_defense', name: 'Railgun', level: 2 },  // stale duplicate
    ],
  });
  assert.deepEqual(rows.map(r => r.key).sort(), ['aa_turret', 'railgun_defense']);
  assert.equal(rows.find(r => r.key === 'railgun_defense').level, 4, 'highest level wins');
});

test('defenseRows copes with a scan that has neither field', () => {
  assert.deepEqual(defenseRows({}), []);
});
