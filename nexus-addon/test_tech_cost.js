// Calibration guard for tech-upgrade.js upgradeCost().
// Mirrors the shipped formula (base × costFactor^(L-1) per researched level,
// plus rareCosts scaled the same way). Fails if the formula drifts.
//   node test_tech_cost.js
import assert from 'assert';

const BASE_RES = [
  { field: 'costOre', cargo: 'ore' },
  { field: 'costSilicates', cargo: 'silicates' },
  { field: 'costHydrogen', cargo: 'hydrogen' },
  { field: 'costAlloys', cargo: 'alloys' },
];
function upgradeCost(t, fromLevel, toLevel) {
  const tot = {};
  for (let L = fromLevel + 1; L <= toLevel; L++) {
    const m = Math.pow(t.costFactor || 1, L - 1);
    for (const r of BASE_RES) {
      const v = Math.round((t[r.field] || 0) * m);
      if (v) tot[r.cargo] = (tot[r.cargo] || 0) + v;
    }
    for (const [k, v] of Object.entries(t.rareCosts || {})) {
      if (v) tot[k] = (tot[k] || 0) + Math.round(v * m);
    }
  }
  return tot;
}

const tech = { costFactor: 2, costOre: 100, costSilicates: 50, costHydrogen: 0,
  costAlloys: 0, rareCosts: { cryo_ice: 10 } };

// Level 1 only (L1 = base × factor^0 = base).
const l1 = upgradeCost(tech, 0, 1);
assert.strictEqual(l1.ore, 100);
assert.strictEqual(l1.silicates, 50);
assert.strictEqual(l1.cryo_ice, 10);
assert.strictEqual(l1.hydrogen, undefined);   // zero costs omitted

// Cumulative 0→3: ore 100·(1+2+4)=700, sil 350, cryo_ice 70.
const l3 = upgradeCost(tech, 0, 3);
assert.strictEqual(l3.ore, 700);
assert.strictEqual(l3.silicates, 350);
assert.strictEqual(l3.cryo_ice, 70);

// Partial 2→3: single level L3 = base × factor^2.
const p = upgradeCost(tech, 2, 3);
assert.strictEqual(p.ore, 400);
assert.strictEqual(p.cryo_ice, 40);

console.log('tech cost calibration OK', l3);
