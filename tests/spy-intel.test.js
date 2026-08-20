import test from 'node:test';
import assert from 'node:assert';
import { makeBrowserStub, loadBackground } from './helpers.js';

makeBrowserStub(); // background.js touches `browser` at import time
const { mergeSpyReports } = await loadBackground();

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
