import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// galaxy-survey.js is a classic content script; with no document it only
// registers its pure part.
const sandbox = { Date, Math, Number, Set, Infinity };
sandbox.globalThis = sandbox;
vm.runInNewContext(readFileSync(new URL('../nexus-addon/galaxy-survey.js', import.meta.url), 'utf8'), sandbox);
const { nearestSurveyable } = sandbox.NexusGalaxySurvey;

const sys = (id, x, zone = 'sentinel') => ({ id, x, y: 0, name: `A1-${id}`, securityZone: zone });
const systems = [sys(1, 0), sys(2, 5), sys(3, 10, 'dead'), sys(4, 20, 'open'), { id: 5, x: null, y: null }];
const now = Date.parse('2026-10-28T12:00:00Z');

test('picks the nearest system, the current one included', () => {
  assert.equal(nearestSurveyable({ systems, from: systems[0], now }).id, 1);
});

test('skips systems on cooldown and those a survey is flying to or scanning', () => {
  const r = nearestSurveyable({
    systems, from: systems[0], now,
    cooldowns: [{ systemId: 1, cooldownEndsAt: '2026-10-28T13:00:00Z' },
                { systemId: 3, cooldownEndsAt: '2026-10-28T11:00:00Z' }],   // expired
    missions: [{ missionType: 'survey', status: 'outbound', targetSystemId: 2 },
               { missionType: 'survey', status: 'returning', targetSystemId: 3 },
               { missionType: 'deliver', status: 'outbound', targetSystemId: 3 }],
  });
  assert.equal(r.id, 3);
  assert.equal(r.distance, 10);
});

test('zone filter, and null when nothing qualifies', () => {
  assert.equal(nearestSurveyable({ systems, from: systems[0], now, allowed: new Set(['open']) }).id, 4);
  assert.equal(nearestSurveyable({ systems, from: systems[0], now, allowed: new Set() }), null);
});
