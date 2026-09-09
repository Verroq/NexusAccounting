import test from 'node:test';
import assert from 'node:assert';
import { makeBrowserStub, loadBackground } from './helpers.js';

makeBrowserStub(); // background.js touches `browser` at import time
const { freshestToken, hostUniverse, getTokens, getToken } = await loadBackground();

// Build a JWT-shaped token whose payload carries the given exp (and kind).
function tok(exp, kind, universeKey) {
  const payload = Buffer.from(JSON.stringify({
    exp, ...(kind ? { kind } : {}), ...(universeKey ? { universeKey } : {}),
  })).toString('base64url');
  return `h.${payload}.s`;
}

test('freshestToken picks the token with the latest exp', () => {
  const stale = tok(1000);
  const fresh = tok(2000);
  assert.equal(freshestToken([stale, fresh]), fresh);
  assert.equal(freshestToken([fresh, stale]), fresh, 'order does not matter');
});

test('freshestToken ignores falsy entries and returns null when empty', () => {
  assert.equal(freshestToken([]), null);
  assert.equal(freshestToken([null, undefined, '']), null);
  const t = tok(1234);
  assert.equal(freshestToken([null, t]), t);
});

test('a readable token beats an opaque/unparseable one (exp 0)', () => {
  const opaque = 'not-a-jwt';
  const real = tok(500);
  assert.equal(freshestToken([opaque, real]), real);
});

test('an account/lobby-kind token is excluded even if fresher', () => {
  const lobby = tok(2000, 'lobby');
  const game = tok(1000, 'game');
  assert.equal(freshestToken([lobby, game]), game);
  assert.equal(freshestToken([lobby]), null, 'lobby-only candidates yield no usable token');
});

test('tokens without a kind claim are still accepted (no false rejection)', () => {
  const noKind = tok(1000);
  const game = tok(2000, 'game');
  assert.equal(freshestToken([noKind, game]), game, 'game kind wins on exp when both are usable');
  assert.equal(freshestToken([noKind]), noKind, 'missing kind is not disqualifying');
});

test('hostUniverse reads the universe key off a cookie host', () => {
  assert.equal(hostUniverse('s0.nexuslegacy.space'), 's0');
  assert.equal(hostUniverse('beta.nexuslegacy.space'), 'beta');
  assert.equal(hostUniverse('.beta.nexuslegacy.space'), 'beta', 'domain cookies come with a leading dot');
  assert.equal(hostUniverse('nexuslegacy.space'), null, 'bare lobby domain names no universe');
  assert.equal(hostUniverse('evil.example.com'), null);
  assert.equal(hostUniverse(undefined), null);
});

// One cookie per universe, as a browser with several game sessions open holds
// them. makeBrowserStub()'s cookie stub is a no-op, so drive the real jar here.
function seedCookies(jar) {
  browser.cookies = {
    get: async () => null,
    getAll: async ({ name }) => jar.filter(c => c.name === name),
    getAllCookieStores: async () => [],
  };
}

test('getTokens returns one session per universe, freshest token each', async () => {
  const s0 = tok(2000, 'game', 's0');
  const betaFresh = tok(3000, 'game', 'beta');
  const betaStale = tok(1000, 'game', 'beta');
  seedCookies([
    { name: '__Host-nexus-game', domain: 's0.nexuslegacy.space', value: s0 },
    { name: '__Host-nexus-game', domain: 'beta.nexuslegacy.space', value: betaStale },
    { name: '__Host-nexus-game', domain: 'beta.nexuslegacy.space', value: betaFresh },
    { name: 'nexus_token', domain: 'nexuslegacy.space', value: tok(9000, 'lobby') },
  ]);

  assert.deepEqual(await getTokens(), [
    { token: betaFresh, universeKey: 'beta' },
    { token: s0, universeKey: 's0' },
  ], 'lobby token dropped, stale beta duplicate dropped, ordered by universe key');
  // The single active session still follows the freshest token overall.
  assert.deepEqual(await getToken(), { token: betaFresh, universeKey: 'beta' });
});

test('a token with no universeKey claim is placed by the host its cookie came from', async () => {
  const claimless = tok(2000, 'game');
  seedCookies([{ name: '__Host-nexus-game', domain: '.nf.nexuslegacy.space', value: claimless }]);
  assert.deepEqual(await getTokens(), [{ token: claimless, universeKey: 'nf' }]);
});

test('getTokens is empty with no cookies at all', async () => {
  seedCookies([]);
  assert.deepEqual(await getTokens(), []);
  assert.equal(await getToken(), null);
});
