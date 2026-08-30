import test from 'node:test';
import assert from 'node:assert';
import { setupDomStub } from './helpers.js';

// simulator.js wires DOM listeners at import (run button, reset); stub first.
setupDomStub();
const { lossEntries, fleetRows, simPayload } = await import('../nexus-addon/tabs/simulator.js');

// Trimmed from a real POST /api/combat-simulator/simulate response (s0,
// 2026-08-30) — see docs/api/post/combat_simulator_simulate.md. The shapes that
// matter here are the ones the docs previously only inferred.
const REPORT = {
  outcome: 'attacker_won',
  attackerSurvivors: [
    { shipDefId: 5, key: 'fighter', quantity: 1462 },
    { shipDefId: 13, key: 'dreadnought', quantity: 1 },
    { shipDefId: -9000432, key: 'leader_command_vessel', quantity: 1 },
  ],
  defenderSurvivors: [],
  attackerLosses: [
    { shipDefId: 16, key: 'hacker_ship', name: 'Hacker Ship', lost: 20, destroyed: 14, damaged: 6 },
    { shipDefId: 5, key: 'fighter', name: 'Fighter', lost: 338, destroyed: 237, damaged: 101 },
  ],
  defenderLosses: [
    { shipDefId: -2100001, key: 'missile_defense', name: 'Missile Defense System', lost: 10, destroyed: 7, damaged: 3 },
    { shipDefId: 6, key: 'interceptor', name: 'Interceptor', lost: 1000, destroyed: 700, damaged: 300 },
  ],
};

test('lossEntries reads the array shape the live report returns', () => {
  assert.deepEqual(lossEntries(REPORT.attackerLosses), REPORT.attackerLosses);
  assert.equal(lossEntries(REPORT.attackerLosses)[0].destroyed, 14,
    'the destroyed/damaged split survives — lost is their sum');
});

test('lossEntries still reads the object shape the docs showed', () => {
  // docs/api marked the response shape inferred, so both are accepted rather
  // than blanking the whole result panel if the live shape ever differs.
  assert.deepEqual(lossEntries({ cruiser: { shipDefId: 4, lost: 12 } }),
    [{ key: 'cruiser', shipDefId: 4, lost: 12 }]);
  assert.deepEqual(lossEntries({ cruiser: 12 }), [{ key: 'cruiser', lost: 12 }]);
  assert.deepEqual(lossEntries(undefined), []);
});

test('fleetRows trusts the server survivor count over sent minus lost', () => {
  const sent = { 5: 1800, 13: 1, 16: 20 };
  const rows = fleetRows(sent, REPORT.attackerSurvivors, REPORT.attackerLosses);
  const byId = Object.fromEntries(rows.map(r => [r.shipDefId, r]));
  assert.equal(byId[5].remain, 1462, '1800 sent - 338 lost, as the server reports');
  assert.equal(byId[16].remain, 0, 'absent from survivors means none left');
  assert.equal(byId[16].lost, 20);
});

test('fleetRows includes units we never sent', () => {
  // The leadership vessel joins the fight on its own; planetary defence only
  // ever appears in the defender's losses. Both carry negative shipDefIds.
  const rows = fleetRows({ 5: 1800 }, REPORT.attackerSurvivors, REPORT.attackerLosses);
  const leader = rows.find(r => r.shipDefId === -9000432);
  assert.ok(leader, 'leadership vessel is listed');
  assert.equal(leader.remain, 1);
  assert.equal(leader.sent, 1, 'inferred from survivors + losses');

  const defence = fleetRows({}, REPORT.defenderSurvivors, REPORT.defenderLosses)
    .find(r => r.shipDefId === -2100001);
  assert.ok(defence, 'planetary defence is listed');
  assert.equal(defence.lost, 10);
  assert.equal(defence.remain, 0);
});

// The transport wraps a success as { ok: true, data }. Reading `report` off the
// wrapper gives an empty report, which renders as a battle where every ship on
// both sides survived — a wrong answer that looks like a real one.
test('simPayload unwraps the transport envelope', () => {
  const sim = { report: REPORT, exact: { outcome: 'attacker_won' } };
  assert.equal(simPayload({ ok: true, data: sim }), sim, 'unwrapped');
  assert.equal(simPayload(sim), sim, 'already unwrapped stays as it is');
});

test('simPayload refuses a reply with no report rather than rendering an empty battle', () => {
  assert.equal(simPayload({ ok: true, data: {} }), null);
  assert.equal(simPayload({ ok: true }), null);
  assert.equal(simPayload(undefined), null);
});

test('an empty report is what made every ship look alive', () => {
  // The regression this guards: with no losses and no survivors, every row fell
  // back to sent - 0.
  const rows = fleetRows({ 5: 1800, 16: 20 }, undefined, undefined);
  assert.deepEqual(rows.map(r => r.remain), [1800, 20],
    'sent - nothing lost — which is why the guard above must reject that payload');
});
