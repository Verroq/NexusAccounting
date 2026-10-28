import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

// Messages sent from inside a game tab (the in-game panels, and common.js when
// they load it) must act on that tab's universe, not the dashboard's pick. The
// background listener hands each handler `u` (the sender tab's universe); a
// handler that drops it silently answers from the other universe, as the
// leader check once did.
const read = f => readFileSync(new URL(`../nexus-addon/${f}`, import.meta.url), 'utf8');
const bg = read('background.js');

test('every message a game tab sends is handled on that tab\'s universe', () => {
  const sent = new Set();
  for (const f of ['sidebar-inject.js', 'logistics-view.js', 'common.js']) {
    for (const m of read(f).matchAll(/type: ?'([A-Z_]+)'/g)) sent.add(m[1]);
  }
  const missing = [];
  for (const type of sent) {
    const at = bg.indexOf(`if (msg.type === '${type}')`);
    if (at < 0) continue;   // handled elsewhere (content-side messages)
    const handler = bg.slice(at, bg.indexOf('\n  if (msg.type', at + 1));
    if (!/\bu\)/.test(handler)) missing.push(type);
  }
  assert.deepEqual(missing, []);
});
