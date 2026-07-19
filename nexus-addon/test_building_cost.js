// Calibration guard for building-upgrade.js upgradeCost().
// Anchors the cost formula to two real in-game costs. If the exponent split or
// factors in building-upgrade.js drift, update both — and re-verify in game.
//   node test_building_cost.js
import assert from 'assert';

// Mirror of upgradeCost() in building-upgrade.js (kept in sync by hand — this
// file's whole job is to fail if the shipped formula stops matching reality).
function upgradeCost(def, fromLevel, toLevel) {
  const tot = { ore: 0, silicates: 0, hydrogen: 0, alloys: 0 };
  const bases = { ore: 'baseCostOre', silicates: 'baseCostSilicates', hydrogen: 'baseCostHydrogen', alloys: 'baseCostAlloys' };
  for (let L = fromLevel; L < toLevel; L++) {
    let m = Math.pow(def.costFactor || 1.4, Math.min(L, 9)) *
            Math.pow(def.highLevelFactor || 1.5, Math.max(0, L - 9));
    if (def.costDoubleAfter && L > def.costDoubleAfter) m *= 2;
    for (const k of Object.keys(tot)) {
      if (k === 'alloys' && (L + 1) < (def.alloysFromLevel || 0)) continue;
      tot[k] += Math.round((def[bases[k]] || 0) * m);
    }
  }
  return tot;
}

// Ore Mine (real 18→19: ore 47,656 / sil 11,914 / alloys 3,971; hyd 0)
const oreMine = { costFactor: 1.4, highLevelFactor: 1.5, alloysFromLevel: 16,
  baseCostOre: 60, baseCostSilicates: 15, baseCostHydrogen: 0, baseCostAlloys: 5 };
const om = upgradeCost(oreMine, 18, 19);
assert(Math.abs(om.ore - 47656) <= 1, `ore ${om.ore}`);
assert(Math.abs(om.silicates - 11914) <= 1, `sil ${om.silicates}`);
assert(Math.abs(om.alloys - 3971) <= 1, `alloys ${om.alloys}`);
assert.strictEqual(om.hydrogen, 0);

// Alloy Foundry (real 12→13: ore 27,892; maxLevel 25, alloys from level 1)
const alloyFoundry = { costFactor: 1.4, highLevelFactor: 1.5, alloysFromLevel: 1,
  baseCostOre: 400, baseCostSilicates: 200, baseCostHydrogen: 100, baseCostAlloys: 0 };
const af = upgradeCost(alloyFoundry, 12, 13);
assert(Math.abs(af.ore - 27892) <= 1, `foundry ore ${af.ore}`);

// Research Lab (real 10→11: ore/hyd 368,640; sil 737,280 — costDoubleAfter=7
// flat-doubles the cost past that level; caught a bug where it was ignored)
const researchLab = { costFactor: 2, highLevelFactor: 1.8, costDoubleAfter: 7, alloysFromLevel: 1,
  baseCostOre: 200, baseCostSilicates: 400, baseCostHydrogen: 200, baseCostAlloys: 0 };
const rl = upgradeCost(researchLab, 10, 11);
assert(Math.abs(rl.ore - 368640) <= 1, `lab ore ${rl.ore}`);
assert(Math.abs(rl.silicates - 737280) <= 1, `lab sil ${rl.silicates}`);

console.log('building cost calibration OK', om, af.ore, rl.ore);
