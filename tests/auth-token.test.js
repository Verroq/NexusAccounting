import test from 'node:test';
import assert from 'node:assert';
import { makeBrowserStub, loadBackground } from './helpers.js';

makeBrowserStub(); // background.js touches `browser` at import time
const { freshestToken } = await loadBackground();

// Build a JWT-shaped token whose payload carries the given exp.
function tok(exp) {
  const payload = Buffer.from(JSON.stringify({ exp })).toString('base64url');
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
