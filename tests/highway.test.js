import { test } from 'node:test';
import assert from 'node:assert';
import { makeBrowserStub, loadBackground } from './helpers.js';

test('noHighway: fleet sends fly normally unless the caller asks for the highway', async () => {
  makeBrowserStub();
  const { noHighway } = await loadBackground();
  const ships = [{ shipDefId: 1, quantity: 1 }];
  for (const path of ['/api/fleet/mine', '/api/fleet/collect-debris', '/api/stations/7/send', '/api/moons/3/dispatch', '/api/fleet/fuel-estimate']) {
    assert.deepStrictEqual(noHighway(path, { ships }), { ships, useHighway: false }, path);
  }
  assert.deepStrictEqual(noHighway('/api/moons/3/dispatch', { ships, useHighway: true }), { ships, useHighway: true });
  // Endpoints the game never sends it on are left alone.
  assert.deepStrictEqual(noHighway('/api/fleet/survey', { ships }), { ships });
  assert.deepStrictEqual(noHighway('/api/fleet/expedition', { ships }), { ships });
});
