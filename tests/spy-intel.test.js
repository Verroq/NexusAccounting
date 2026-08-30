import test from 'node:test';
import assert from 'node:assert';
import { makeBrowserStub, loadBackground } from './helpers.js';

makeBrowserStub(); // background.js touches `browser` at import time
const { mergeSpyReports, selectReportsToShare, WEBHOOK_RE, formatIntelIndex, parseIntelIndex, INTEL_INDEX_MAX } =
  await loadBackground();

test('mergeSpyReports dedups by id, newest created_at wins', () => {
  const base = [{ id: 1, created_at: '2026-06-01' }];
  const incoming = [
    { id: 1, created_at: '2026-06-10' }, // newer → replaces
    { id: 2, created_at: '2026-06-05' }, // new
  ];
  const { merged, added } = mergeSpyReports(base, incoming);
  assert.equal(added, 1, 'only id 2 is newly added');
  assert.equal(merged.length, 2);
  assert.equal(merged.find(r => r.id === 1).created_at, '2026-06-10', 'newer report kept');
  assert.equal(merged[0].id, 1, 'sorted newest-first');
});

test('mergeSpyReports keeps existing when incoming is older, skips bad rows', () => {
  const base = [{ id: 1, created_at: '2026-06-10' }];
  const { merged, added } = mergeSpyReports(base, [
    { id: 1, created_at: '2026-06-01' }, // older → ignored
    null,                                 // skipped
    { created_at: '2026-06-09' },         // no id → skipped
  ]);
  assert.equal(added, 0);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].created_at, '2026-06-10');
});

test('mergeSpyReports tags imports with sharedBy without overwriting an existing tag', () => {
  const { merged } = mergeSpyReports(
    [],
    [{ id: 1, created_at: '2026-06-01' }, { id: 2, created_at: '2026-06-02', shared_by: 'Alice' }],
    'Bob',
  );
  assert.equal(merged.find(r => r.id === 1).shared_by, 'Bob', 'untagged gets sharedBy');
  assert.equal(merged.find(r => r.id === 2).shared_by, 'Alice', 'existing tag preserved');
});

const pool = [
  { id: 1, target_name: 'Terra' },
  { id: 2, target_name: 'Silly Cat' },
  { id: 3, target_name: 'Outpost G45' },
];

test('selectReportsToShare posts the whole pool when no ids are named', () => {
  assert.deepEqual(selectReportsToShare(pool).map(r => r.id), [1, 2, 3]);
  assert.deepEqual(selectReportsToShare(pool, []).map(r => r.id), [1, 2, 3], 'empty list is not a filter');
  assert.deepEqual(selectReportsToShare(null), [], 'no stored reports, nothing to post');
});

test('selectReportsToShare narrows to the named report', () => {
  assert.deepEqual(selectReportsToShare(pool, [2]).map(r => r.id), [2]);
  assert.deepEqual(selectReportsToShare(pool, [3, 1]).map(r => r.id), [1, 3], 'stored order kept');
});

test('selectReportsToShare returns nothing for an id that is gone', () => {
  assert.deepEqual(selectReportsToShare(pool, [999]), [],
    'caller turns this into "no longer in local storage" rather than posting the pool');
});

test('WEBHOOK_RE accepts real webhook URLs and rejects anything else', () => {
  for (const ok of [
    'https://discord.com/api/webhooks/123456789/abcDEF-_token',
    'https://discord.com/api/v10/webhooks/123/tok',
    'https://discordapp.com/api/webhooks/1/t',
  ]) assert.ok(WEBHOOK_RE.test(ok), ok);

  for (const bad of [
    'https://discord.com/api/v10/channels/123/messages',   // the bot endpoint
    'http://discord.com/api/webhooks/1/t',                 // not https
    'https://evil.example/api/webhooks/1/t',               // wrong host
    'https://discord.com/api/webhooks/1/t?wait=true',      // trailing query
    'not a url',
  ]) assert.ok(!WEBHOOK_RE.test(bad), bad);
});

const ID_A = '1234567890123456789';
const ID_B = '9876543210987654321';

test('index round-trips through format/parse', () => {
  assert.deepEqual(parseIntelIndex(formatIntelIndex([ID_A, ID_B])), [ID_A, ID_B]);
  assert.deepEqual(parseIntelIndex(formatIntelIndex([])), [], 'an empty index is valid, not corrupt');
});

test('index parsing ignores anything that is not a snowflake', () => {
  // A member may edit the message by hand; junk must not wipe the alliance index.
  const content = `NEXUS-INTEL-INDEX v1\nplease do not edit ${ID_A} 42 <@1234> ${ID_B} 123456789012345678901234`;
  assert.deepEqual(parseIntelIndex(content), [ID_A, ID_B]);
  assert.deepEqual(parseIntelIndex(null), [], 'a message with no content is an empty index');
  assert.deepEqual(parseIntelIndex(undefined), []);
});

test('index dedups and drops the oldest ids past the cap', () => {
  assert.deepEqual(parseIntelIndex(formatIntelIndex([ID_A, ID_A, ID_B])), [ID_A, ID_B], 'no duplicate ids');

  const many = Array.from({ length: INTEL_INDEX_MAX + 10 }, (_, i) => String(1000000000000000000n + BigInt(i)));
  const kept = parseIntelIndex(formatIntelIndex(many));
  assert.equal(kept.length, INTEL_INDEX_MAX, 'capped');
  assert.equal(kept.at(-1), many.at(-1), 'newest id survives');
  assert.ok(!kept.includes(many[0]), 'oldest id fell off');
});

test('a formatted index stays under Discord\'s 2000-char message limit', () => {
  const many = Array.from({ length: INTEL_INDEX_MAX + 50 }, (_, i) => String(1000000000000000000n + BigInt(i)));
  assert.ok(formatIntelIndex(many).length < 2000, `was ${formatIntelIndex(many).length}`);
});
