import test from 'node:test';
import assert from 'node:assert';
import { isNewer } from '../nexus-desktop/version.mjs';

test('isNewer compares release versions field by field', () => {
  assert.equal(isNewer('2.3.0', '2.2.0'), true);
  assert.equal(isNewer('v2.3.0', '2.3.0'), false, 'same version is not an update');
  assert.equal(isNewer('2.10.0', '2.9.0'), true, 'numeric, not alphabetical');
  assert.equal(isNewer('2.2.1', '2.2'), true, 'a missing field counts as 0');
  assert.equal(isNewer('2.1.9', '2.2.0'), false, 'an older release is not offered');
});
