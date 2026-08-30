import test from 'node:test';
import assert from 'node:assert';
import { makeBrowserStub, loadBackground } from './helpers.js';
import { withoutSecrets } from '../nexus-addon/storage-keys.js';

makeBrowserStub(); // background.js touches `browser` at import time
const { mergeSpyReports, selectReportsToShare, WEBHOOK_RE, formatIntelIndex, parseIntelIndex, INTEL_INDEX_MAX, acceptSharedIntel, sharedIntelReject, discordFetch } =
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

test('a share leaves out intel a sync pulled in from allies', () => {
  // Otherwise every member re-posts the whole alliance's pool on every share.
  const mixed = [...pool, { id: 4, target_name: 'Ally scan', shared_by: 'Alice' }];
  assert.deepEqual(selectReportsToShare(mixed).map(r => r.id), [1, 2, 3]);
  assert.deepEqual(selectReportsToShare(mixed, [4]), [],
    'an ally report is already in the index it came from, naming it changes nothing');
});

test('a report already posted is not posted again, on either path', () => {
  // The mark rides on the report, so it survives export/import and retires
  // with the report when capIntel drops it.
  const marked = pool.map(r => (r.id === 2 ? { ...r, shared_at: '2026-08-30T10:00:00Z' } : r));
  assert.deepEqual(selectReportsToShare(marked).map(r => r.id), [1, 3]);
  assert.deepEqual(selectReportsToShare(marked, [2]), [],
    'the per-report button cannot double-post it either');
  assert.deepEqual(selectReportsToShare(marked, [2, 3]).map(r => r.id), [3],
    'the rest of the batch still goes out');
  assert.deepEqual(selectReportsToShare(marked.map(r => ({ ...r, shared_at: 'x' }))), [],
    'a fully shared pool has nothing left to post');
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

// The trust boundary for pulled intel. A mis-set (or hostile) channel must not
// inject another alliance's scans into the simulator.
const intel = (over = {}) => ({
  nexus_shared_spy_intel: 1,
  spy_reports: [{ id: 1 }],
  alliance: { tag: 'NEX' },
  universe_key: 's0',
  ...over,
});

test('acceptSharedIntel takes payloads stamped for our alliance and universe', () => {
  assert.equal(acceptSharedIntel(intel(), 'NEX', 's0'), true);
});

test('acceptSharedIntel rejects a foreign alliance or universe', () => {
  assert.equal(acceptSharedIntel(intel({ alliance: { tag: 'EVIL' } }), 'NEX', 's0'), false);
  assert.equal(acceptSharedIntel(intel({ universe_key: 'nf' }), 'NEX', 's0'), false,
    'same alliance tag in another universe is still foreign intel');
});

test('acceptSharedIntel rejects anything that is not a spy-intel payload', () => {
  assert.equal(acceptSharedIntel(intel({ nexus_shared_spy_intel: 2 }), 'NEX', 's0'), false, 'wrong version');
  assert.equal(acceptSharedIntel(intel({ spy_reports: 'nope' }), 'NEX', 's0'), false, 'reports not an array');
  assert.equal(acceptSharedIntel(null, 'NEX', 's0'), false);
  assert.equal(acceptSharedIntel({}, 'NEX', 's0'), false);
});

test('acceptSharedIntel rejects a payload that omits the alliance tag', () => {
  // The bypass: a guard of the form `p.tag && mine && differ` passes anything
  // that leaves the field out, which is exactly what a hostile payload does.
  assert.equal(acceptSharedIntel(intel({ alliance: {} }), 'NEX', 's0'), false, 'no tag is not our tag');
  assert.equal(acceptSharedIntel({ nexus_shared_spy_intel: 1, spy_reports: [{ id: 1 }] }, 'NEX', 's0'), false,
    'a payload carrying no stamps at all is foreign');
});

test('acceptSharedIntel takes an unstamped universe from an ally on an older build', () => {
  // Builds before the stamp was read off the session token post universe_key:
  // null on every share. The tag is the mandatory scope check — an alliance is
  // a per-universe entity — so an unstamped payload from our own tag is ours.
  assert.equal(acceptSharedIntel(intel({ universe_key: null }), 'NEX', 's0'), true);
  assert.equal(acceptSharedIntel(intel({ universe_key: 'nf' }), 'NEX', 's0'), false,
    'a stamp that contradicts us is still foreign');
});

test('acceptSharedIntel still accepts a stamp we have nothing to check against', () => {
  // Not knowing our own universe is our gap, not the payload's — dropping
  // everything would leave a member with no session unable to sync at all.
  assert.equal(acceptSharedIntel(intel(), 'NEX', null), true);
});

// A 429 is Discord saying "come back", not "that message is gone". Skipping it
// like a deleted message dropped most of an alliance's intel while Sync still
// reported success.
test('discordFetch retries a 429, and still answers 429 when it never clears', async () => {
  const saved = global.fetch;
  const reply = (status, body = {}) => ({
    status, ok: status < 400, json: async () => body, headers: { get: () => null },
  });
  try {
    let n = 0;
    global.fetch = async () => (++n < 3 ? reply(429, { retry_after: 0.01 }) : reply(200, { content: 'ok' }));
    assert.equal((await discordFetch('https://discord.test/m/1')).status, 200);
    assert.equal(n, 3, 'retried until Discord answered');

    n = 0;
    global.fetch = async () => { n++; return reply(429, { retry_after: 0.01 }); };
    assert.equal((await discordFetch('https://discord.test/m/1')).status, 429,
      'the caller counts this as missed rather than reporting a clean sync');
    assert.equal(n, 3, 'retries stay bounded');
  } finally {
    global.fetch = saved;
  }
});

test('backups leave the Discord webhook URL behind', () => {
  // It is a write token for the alliance channel: whoever holds the backup
  // could post to it and read the alliance's pooled intel.
  const out = withoutSecrets({ discord_webhook_url: 'https://discord.com/api/webhooks/1/tok', totals: { ore: 5 }, discord_index_message_id: '123' });
  assert.equal('discord_webhook_url' in out, false);
  assert.deepEqual(out, { totals: { ore: 5 }, discord_index_message_id: '123' }, 'nothing else is dropped');
});

test('mergeSpyReports counts only what survived the INTEL_KEEP cap', () => {
  // Syncing an alliance whose pooled intel is bigger than the cap used to
  // report "+N added" for reports capIntel had already thrown away.
  const day = i => `2026-06-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z`;
  const base = Array.from({ length: 200 }, (_, i) => ({ id: `b${i}`, created_at: '2026-07-01T00:00:00Z' }));
  const incoming = Array.from({ length: 50 }, (_, i) => ({ id: `i${i}`, created_at: day(i) }));
  const { merged, added } = mergeSpyReports(base, incoming);
  assert.equal(merged.length, 200, 'store stayed at the cap');
  assert.equal(added, 0, 'every incoming report was older than the cap line, so nothing was kept');

  const { merged: m2, added: a2 } = mergeSpyReports(base, [{ id: 'new', created_at: '2026-08-01T00:00:00Z' }]);
  assert.equal(a2, 1, 'a report newer than the cap line does count');
  assert.equal(m2.length, 200);
  assert.ok(m2.some(r => r.id === 'new'));
});

test('a rejected payload comes with the reason Sync shows the user', () => {
  // Without it, an ally on an older build is indistinguishable from an empty
  // channel: both render as "nothing shared yet".
  assert.equal(sharedIntelReject(intel(), 'NEX', 's0'), null, 'ours to merge');
  assert.equal(sharedIntelReject(intel({ universe_key: null }), 'NEX', 's0'), null, 'unstamped, but our tag');
  assert.match(sharedIntelReject(intel({ universe_key: 'nf' }), 'NEX', 's0'), /universe nf, we are s0/);
  assert.match(sharedIntelReject(intel({ alliance: { tag: 'EVIL' } }), 'NEX', 's0'), /alliance EVIL, we are NEX/);
  assert.match(sharedIntelReject({}, 'NEX', 's0'), /not a v1 intel payload \(got version none\)/);
});
