import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// dynamic-transport.js is a classic content script; run it in a sandbox with a
// fake game server behind fetch().
const SRC = readFileSync(new URL('../nexus-addon/dynamic-transport.js', import.meta.url), 'utf8');
const ID = 'a'.repeat(36);
const SEED = [...Array(16).keys()].map(i => i * 7 + 3);
const OPS = Array.from({ length: 40 }, (_, i) => i.toString(16).padStart(24, '0'));
// Shaped like the served module: an IIFE called with the seed, metadata in Object.assign.
const moduleFor = OPS => `(function(s){window.dispatchEvent(new CustomEvent("x",{detail:Object.assign({"version":2,"id":"${ID}","operations":${JSON.stringify(OPS)},"ttlMs":600000},{})}))})(${JSON.stringify(SEED)})`;

function load(ops = OPS) {
  const calls = [];
  const sandbox = {
    location: { origin: 'https://nf2.nexuslegacy.space' },
    URL, Date,
    fetch: async (url, opts = {}) => {
      calls.push({ url, opts });
      const json = (body, headers = {}) => ({
        ok: true, status: 200, headers: new Headers(headers),
        json: async () => body, text: async () => JSON.stringify(body),
      });
      if (url === '/api/transport/bootstrap') return json({ id: ID, moduleUrl: `/api/transport/module/${ID}.js` });
      if (url.startsWith('/api/transport/module/')) return { ok: true, text: async () => moduleFor(ops) };
      if (!url.startsWith('/api/transport/')) return { ...json({ code: 'DYNAMIC_API_REQUIRED' }), ok: false, status: 403 };
      const { codec } = sandbox.NexusTransport;
      const c = codec(SEED);
      // The server answers with the request it decoded, encoded back.
      const req = url.includes('?d=')
        ? JSON.parse(decodeURIComponent(url.split('?d=')[1]))
        : JSON.parse(opts.body);
      return json(c.encode({ echo: c.decode(req), op: url.split('/')[5].split('?')[0] }), { 'X-Dynamic-Context': ID });
    },
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(SRC, sandbox);
  return { T: sandbox.NexusTransport, calls };
}

test('a module whose operation count differs from the table is refused', async () => {
  const { T } = load([...OPS, 'f'.repeat(24)]);
  await assert.rejects(T.request('GET', '/api/galaxy/arms'), /out of date/);
});

test('route maps paths to the client operation index', async () => {
  const { T } = load();
  assert.deepEqual({ ...await T.route('GET', '/api/galaxy/arms') }, { index: 12, id: null, tableSize: 40 });
  assert.deepEqual({ ...await T.route('GET', '/api/galaxy/arms/3/sectors') }, { index: 13, id: '3', tableSize: 40 });
  assert.equal((await T.route('POST', '/api/fleet/mine')).index, 32);
  assert.equal(await T.route('GET', '/api/fleet/mine'), null, 'method matters');
  assert.equal(await T.route('GET', '/api/auth/me'), null, 'uncovered path');
});

test('parseRoutes reads the table out of minified bundle source', () => {
  const { T } = load();
  const js = 'x=1;Ab=[["POST","/fleet/mine","planet_mining"],["POST","/fleet/survey","survey"]];' +
    'Ab.map(([e,t,n])=>({method:e}));const Zq=[["GET","/galaxy/systems/:id/planets"],["GET","/galaxy/map"],' +
    '...Ab.map(([e,t])=>[e,t]),["GET","/galaxy/colony-index"]],no=Zq.map(f);';
  assert.deepEqual(JSON.parse(JSON.stringify(T.parseRoutes(js))), [
    ['GET', '/galaxy/systems/:id/planets'], ['GET', '/galaxy/map'],
    ['POST', '/fleet/mine'], ['POST', '/fleet/survey'], ['GET', '/galaxy/colony-index'],
  ]);
  assert.equal(T.parseRoutes('no table here'), null);
  assert.equal(T.parseRoutes('[["GET","/galaxy/systems/:id/planets"],...Missing.map(([e,t])=>[e,t])]'), null,
    'an unresolvable spread is a parse failure, not a shorter table');
});

test('codec round-trips keys and leaves values alone', () => {
  const { T } = load();
  const c = T.codec(SEED);
  const v = { a: 1, nested: [{ name: 'x' }], s: 'keep' };
  const enc = c.encode(v);
  assert.ok(Object.keys(enc).every(k => /^k(?:[0-9a-f]{4})+$/.test(k)));
  assert.deepEqual(JSON.parse(JSON.stringify(c.decode(enc))), v);
});

test('GET goes out encoded on the right operation and comes back decoded', async () => {
  const { T, calls } = load();
  const res = await T.request('GET', '/api/galaxy/arms/5/sectors?include=fields');
  assert.equal(res.status, 200);
  assert.equal(res.data.op, OPS[13]);
  assert.deepEqual(JSON.parse(JSON.stringify(res.data.echo)), { id: '5', query: { include: 'fields' } });
  assert.equal(calls.filter(c => c.url === '/api/transport/bootstrap').length, 1);
  await T.request('GET', '/api/galaxy/arms');
  assert.equal(calls.filter(c => c.url === '/api/transport/bootstrap').length, 1, 'module reused within its ttl');
});

test('POST carries the body inside the encoded payload', async () => {
  const { T, calls } = load();
  const res = await T.request('POST', '/api/fleet/mine', { sourcePlanetId: 1 });
  assert.equal(calls.at(-1).opts.method, 'POST');
  assert.deepEqual(JSON.parse(JSON.stringify(res.data.echo)), { id: null, query: {}, body: { sourcePlanetId: 1 } });
});

test('call retries a DYNAMIC_API_REQUIRED path encoded, then goes straight there', async () => {
  const { T, calls } = load();
  const r = await T.call('GET', '/api/galaxy/systems/9/planets?x=1');
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.echo, { id: '9', query: { x: '1' } });
  const plainCalls = () => calls.filter(c => !c.url.startsWith('/api/transport/')).length;
  assert.equal(plainCalls(), 1, 'one plain try');
  await T.call('POST', '/api/fleet/fuel-estimate', { ships: 1 });
  assert.equal(plainCalls(), 1, 'no plain try once the universe asked for the transport');
});
