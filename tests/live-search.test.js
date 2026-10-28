import test from 'node:test';
import assert from 'node:assert';
import { makeBrowserStub, loadBackground } from './helpers.js';

makeBrowserStub();
const { setLiveSearch, stopLiveSearch, liveSearchUniverses } = await loadBackground();
const get = async k => (await browser.storage.local.get(k))[k];

test('each universe keeps its own live search, running side by side', async () => {
  await browser.storage.local.set({ universes: [{ key: 's0' }, { key: 'nf2' }] });
  await setLiveSearch({ enabled: true, planetId: 1 }, 's0');
  await setLiveSearch({ enabled: true, planetId: 2 }, 'nf2');
  assert.deepEqual(await liveSearchUniverses(), ['s0', 'nf2']);
  assert.equal((await get('s0__live_search')).planetId, 1);
  assert.equal((await get('nf2__live_search')).planetId, 2);

  await stopLiveSearch('s0');
  assert.deepEqual(await liveSearchUniverses(), ['nf2'], 'stopping one leaves the other running');
  assert.equal((await get('s0__live_search')).planetId, 1, 'a stopped search keeps its config');
});

test('a pre-per-universe global config moves to its universe once', async () => {
  await browser.storage.local.set({ universes: [{ key: 's0' }, { key: 'nf2' }], live_search: { enabled: true, planetId: 7, universe: 'nf2' } });
  await browser.storage.local.remove('nf2__live_search');
  assert.ok((await liveSearchUniverses()).includes('nf2'));
  assert.equal((await get('nf2__live_search')).planetId, 7);
  assert.equal(await get('live_search'), undefined);
});

test('one universe running out of API budget does not stall another', async () => {
  const { updateRateLimit, rateLimitGate } = await loadBackground();
  updateRateLimit('nf2', '0', '60');   // nf2 exhausted for a minute
  const t = Date.now();
  await rateLimitGate(true, 's0');
  assert.ok(Date.now() - t < 500, 's0 call went straight through');
});
