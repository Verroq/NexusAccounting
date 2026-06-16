'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const engine = require('../nexus-addon/engine.js');
const { SHIP_DEFS } = require('./helpers.js');

engine.setShipDefs(SHIP_DEFS);

const BASE_OPTS = { sims: 2000, maxRounds: 10, variance: 0.1, debrisRate: 0.3, shieldRegen: false };

test('rapid fire table', () => {
  assert.equal(engine.rapidFireShots('titan', 'scout'), 20);
  assert.equal(engine.rapidFireShots('titan', 'dreadnought'), 3);
  assert.equal(engine.rapidFireShots('dreadnought', 'cruiser'), 5);
  assert.equal(engine.rapidFireShots('bomber', 'defense_turret'), 5);
  assert.equal(engine.rapidFireShots('fighter', 'scout'), 1);     // no entry → 1
  assert.equal(engine.rapidFireShots('titan', 'probe'), 1);       // unlisted target → 1
});

test('rapid fire matches faction-prefixed enemy ships (report #881)', () => {
  // Interceptor's ×4 vs fighters (exact) must apply to wormhole_pirate_fighter.
  assert.equal(engine.rapidFireShots('interceptor', 'wormhole_pirate_fighter'), 4);
  assert.equal(engine.rapidFireShots('wormhole_pirate_interceptor', 'pirate_fighter'), 4);
  assert.equal(engine.normalizeShipKey('wormhole_pirate_fighter'), 'fighter');
  assert.equal(engine.normalizeShipKey('spy_probe'), 'spy_probe');   // not over-stripped
});

test('research modifiers compute exact in-game rates', () => {
  const m = engine.computeMods({
    laser_weapons: 5, fighter_doctrine: 5, weapons_overcharge: 2,
    basic_armor: 5, composite_armor: 5, heavy_armor: 5, ship_mastery: 5,
    shield_theory: 5, advanced_shielding: 5, adaptive_shields: 5,
    missile_systems: 5, torpedo_systems: 5, bomber_wing: 5,
  });
  assert.equal(m.weapon.laser, 0.25);            // 5×3% + 5×2%
  assert.equal(m.weapon.missile, 0.2);           // 5×2% + 5×2%
  assert.equal(m.weaponAll, 0.06);               // 2×3%
  assert.equal(m.hull, 0.5);                     // 5×(2+3+3+2)%
  assert.equal(m.shield, 0.5);                   // 5×10%
  assert.equal(m.damageReduction, 0.35);         // 5×(2+2+3)%
  assert.equal(m.ship.bomber, 0.1);              // 5×2%
});

// Real battle: 10 interceptors vs 8 scouts + 4 fighters → won round 2, 0 losses.
test('calibration: interceptor raid (reference A)', () => {
  const r = engine.runSimulations({ interceptor: 10 }, { scout: 8, fighter: 4 }, BASE_OPTS);
  assert.equal(r.outcomes.attacker_won, BASE_OPTS.sims, 'attacker must always win');
  assert.ok(r.attackerLosses.interceptor.lost < 0.5,
    `expected ~0 losses, got ${r.attackerLosses.interceptor.lost}`);
});

// Real battle: 22 scouts vs 5 fighters + 4 scouts, no tech → won with ~2 losses.
// The corrected rapid-fire/overkill model made single-shot swarms more
// efficient, so the engine now lands ~1.1 here; bound kept loose around it.
test('calibration: scout fight (reference B)', () => {
  const r = engine.runSimulations({ scout: 22 }, { fighter: 5, scout: 4 }, BASE_OPTS);
  assert.ok(r.outcomes.attacker_won / BASE_OPTS.sims > 0.99, 'attacker must virtually always win');
  const lost = r.attackerLosses.scout.lost;
  assert.ok(lost > 0.5 && lost < 2.7, `expected ~1-2 losses, got ${lost}`);
});

// Real battle: 19 interceptors (basic armor 1, fighter doctrine 1, laser 1,
// weapons overcharge 1) vs 10 scouts + 19 fighters + 8 interceptors (no tech)
// → attacker won, defender fleet destroyed, ~4 interceptors destroyed.
// Validates that rapid fire spreads across the fleet instead of overkilling.
test('calibration: interceptor swarm vs mixed fleet (reference C)', () => {
  const atkMods = engine.computeMods({ basic_armor: 1, fighter_doctrine: 1, laser_weapons: 1, weapons_overcharge: 1 });
  const r = engine.runSimulations({ interceptor: 19 }, { scout: 10, fighter: 19, interceptor: 8 },
    { ...BASE_OPTS, attackerMods: atkMods, defenderMods: engine.computeMods({}) });
  assert.ok(r.outcomes.attacker_won / BASE_OPTS.sims > 0.99, 'attacker must virtually always win');
  const lost = r.attackerLosses.interceptor.lost;
  assert.ok(lost > 2.5 && lost < 6, `expected ~4 interceptors destroyed, got ${lost}`);
  const defenderLeft = Object.values(r.defenderLosses).reduce((s, l) => s + (l.sent - l.lost), 0);
  assert.ok(defenderLeft < 0.5, `defender fleet must be wiped, ${defenderLeft} left`);
});

test('research bonuses tilt otherwise-even fights', () => {
  // Fighter mirrors stall at the round cap (low damage), so dominance shows
  // in the loss exchange rather than outright wins.
  const boosted = engine.computeMods({ laser_weapons: 5, basic_armor: 5, composite_armor: 5, advanced_shielding: 5 });
  const r = engine.runSimulations({ fighter: 20 }, { fighter: 20 },
    { ...BASE_OPTS, attackerMods: boosted, defenderMods: engine.computeMods({}) });
  const atk = r.attackerLosses.fighter.lost;
  const def = r.defenderLosses.fighter.lost;
  assert.ok(def > atk * 2,
    `boosted side must lose far less (attacker ${atk.toFixed(2)} vs defender ${def.toFixed(2)})`);
  assert.equal(r.outcomes.defender_won, 0, 'unboosted side must never win outright');
});

test('damage reduction protects the defender asymmetrically', () => {
  const opts = { ...BASE_OPTS, defense: { turret: 0, shieldGen: 0, ew: 5 } };
  const withEw = engine.runSimulations({ fighter: 15 }, { fighter: 15 }, opts);
  const without = engine.runSimulations({ fighter: 15 }, { fighter: 15 }, BASE_OPTS);
  assert.ok(withEw.defenderLosses.fighter.lost < without.defenderLosses.fighter.lost - 1,
    'EW must reduce defender losses');
});

test('planetary defenses: bombers crack turrets, fighters do not', () => {
  const defense = { turret: 5, shieldGen: 3, ew: 0 };
  const fighters = engine.runSimulations({ fighter: 30 }, {}, { ...BASE_OPTS, sims: 500, defense });
  const bombers = engine.runSimulations({ bomber: 10 }, {}, { ...BASE_OPTS, sims: 500, defense });
  assert.equal(fighters.outcomes.attacker_won, 0, 'fighters must not crack a lvl-5 turret');
  assert.ok(bombers.outcomes.attacker_won / 500 > 0.8,
    `bombers should win most runs, won ${bombers.outcomes.attacker_won}`);
});

test('losses valued at build cost', () => {
  const v = engine.lossesToResources({ scout: { sent: 10, lost: 4 } });
  assert.equal(v.ore, 800);
  assert.equal(v.silicates, 400);
  assert.equal(v.alloys, 80);
});
