import test from 'node:test';
import assert from 'node:assert';
import { setupDomStub } from './helpers.js';

// simulator-intel.js wires DOM listeners and pulls in the simulator chain at
// import; stub the DOM/browser globals first.
setupDomStub();
const { classifyDefenses, coordDistanceAU } = await import('../nexus-addon/simulator-intel.js');

test('classifyDefenses maps building keys to defense levels', () => {
  const d = classifyDefenses([
    { key: 'Missile Defense', level: 5 },
    { key: 'laser-defense', level: 3 },
    { key: 'Electronic Warfare System', level: 2 },
  ]);
  assert.equal(d.missile_defense, 5);
  assert.equal(d.laser_defense, 3);
  assert.equal(d.ew_system, 2);
  assert.equal(d.plasma_defense, 0);
});

test('classifyDefenses takes the highest level when a type repeats', () => {
  const d = classifyDefenses([
    { key: 'ion_defense', level: 2 },
    { key: 'Ion Defense', level: 7 },
  ]);
  assert.equal(d.ion_defense, 7);
});

test('classifyDefenses ignores unknown buildings (e.g. Shield Generator)', () => {
  const d = classifyDefenses([{ key: 'Shield Generator', level: 9 }]);
  assert.deepEqual(d, {
    missile_defense: 0, laser_defense: 0, railgun_defense: 0,
    plasma_defense: 0, ion_defense: 0, ew_system: 0,
  });
});

test('classifyDefenses handles empty/missing input', () => {
  assert.equal(classifyDefenses([]).laser_defense, 0);
  assert.equal(classifyDefenses(undefined).laser_defense, 0);
});

test('coordDistanceAU converts coordinate distance with the calibration scale', () => {
  // Calibration anchor: 595.3 coord units → ~10.37 fuel-AU.
  const au = coordDistanceAU({ x: 0, y: 0 }, { x: 595.3, y: 0 });
  assert.ok(Math.abs(au - 10.37) < 0.05, `expected ~10.37 AU, got ${au}`);
  assert.equal(coordDistanceAU({ x: 1, y: 1 }, { x: 1, y: 1 }), 0);
});
