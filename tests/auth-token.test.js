import test from 'node:test';
import assert from 'node:assert';
import { makeBrowserStub, loadBackground } from './helpers.js';

makeBrowserStub(); // background.js touches `browser` at import time
const { freshestToken } = await loadBackground();

// Build a JWT-shaped token whose payload carries the given exp (and kind).
function tok(exp, kind) {
  const payload = Buffer.from(JSON.stringify({ exp, ...(kind ? { kind } : {}) })).toString('base64url');
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
