// Guard for upgrade-queue.js chain(): from→target must derive from list order,
// so reordering recomputes labels. Mirror of the shipped chain().
//   node test_queue_chain.js
import assert from 'assert';

function chainId(it) {
  return it.kind + ':' + it.key + (it.kind === 'building' ? ':' + (it.planet || '') : '');
}
function chain(items) {
  const baseOf = new Map();
  for (const it of items) {
    const id = chainId(it);
    baseOf.set(id, Math.min(baseOf.has(id) ? baseOf.get(id) : Infinity, it.base));
  }
  const running = new Map();
  return items.map(it => {
    const id = chainId(it);
    const from = running.has(id) ? running.get(id) : baseOf.get(id);
    const target = from + it.steps;
    running.set(id, target);
    return { from, target };
  });
}

const om = k => ({ kind: 'building', key: 'ore_mine', base: 20, steps: 1, k });
const a = om('a'), b = om('b');
const tech = { kind: 'tech', key: 'x', base: 3, steps: 1 };

// Order: mine, tech, mine → 20→21, tech 3→4, 21→22.
let r = chain([a, tech, b]);
assert.deepStrictEqual([r[0].from, r[0].target], [20, 21]);
assert.deepStrictEqual([r[1].from, r[1].target], [3, 4]);
assert.deepStrictEqual([r[2].from, r[2].target], [21, 22]);

// Reorder the two mines: labels swap so the first is still 20→21.
r = chain([b, tech, a]);
assert.deepStrictEqual([r[0].from, r[0].target], [20, 21]);
assert.deepStrictEqual([r[2].from, r[2].target], [21, 22]);

// Regression: a migrated card carries a stale base (21, its old chained `from`).
// Dragging it first must NOT produce 21→22, 22→23 — min base (20) wins.
const stale = { kind: 'building', key: 'ore_mine', base: 21, steps: 1 };
r = chain([stale, a]);
assert.deepStrictEqual([r[0].from, r[0].target], [20, 21]);
assert.deepStrictEqual([r[1].from, r[1].target], [21, 22]);

// Same building on two planets = two independent chains (17→18 must not chain
// off the other planet's 20→21).
const pA = { kind: 'building', key: 'sil_mine', planet: 'Alpha', base: 20, steps: 1 };
const pB = { kind: 'building', key: 'sil_mine', planet: 'Beta', base: 17, steps: 1 };
r = chain([pA, pB]);
assert.deepStrictEqual([r[0].from, r[0].target], [20, 21]);
assert.deepStrictEqual([r[1].from, r[1].target], [17, 18]);

console.log('queue chain OK');
