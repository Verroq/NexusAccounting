import test from 'node:test';
import assert from 'node:assert';
import { makeBrowserStub } from './helpers.js';

makeBrowserStub();
const { templatesFor, templatesToStore } = await import('../nexus-addon/common.js');

// Same ships, different ids per universe (Second Dawn renumbers them).
const s0 = { 10: { key: 'ore_harvester' }, 11: { key: 'gas_collector' }, 12: { key: 'titan' } };
const nf = { 20: { key: 'gas_collector' }, 21: { key: 'ore_harvester' } };   // no titan here

test('templates map to each universe\'s ship ids; legacy ones are read as Season 0 ids', async () => {
  await browser.storage.local.set({ s0__ships: s0, nf2__ships: nf });
  const legacy = [{ id: 1, name: 'Ore', ships: { 10: 5, 12: 1 } }];
  assert.deepEqual((await templatesFor(legacy, 'nf2'))[0].ships, { 21: 5 });
  assert.deepEqual((await templatesFor(legacy, 's0'))[0].ships, { 10: 5, 12: 1 });
});

test('saving in one universe keeps the ships that universe does not have', async () => {
  await browser.storage.local.set({ s0__ships: s0, nf2__ships: nf,
    fleet_templates: [{ id: 1, name: 'Ore', shipKeys: { ore_harvester: 5, titan: 1 } }] });
  const edited = [{ id: 1, name: 'Ore', ships: { 21: 7, 20: 2 } }];   // edited on nf2
  const [t] = await templatesToStore(edited, 'nf2');
  assert.deepEqual(t.shipKeys, { titan: 1, ore_harvester: 7, gas_collector: 2 });
  assert.equal(t.ships, undefined);
  assert.deepEqual((await templatesFor([t], 's0'))[0].ships, { 10: 7, 11: 2, 12: 1 });
});
