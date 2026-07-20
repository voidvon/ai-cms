import assert from 'node:assert/strict';
import test from 'node:test';

import {
  incrementVersion,
  parseVersion,
  selectLatestTaggedVersion
} from './next-release-version.mjs';

test('increments the patch position', () => {
  assert.equal(incrementVersion('0.1.0'), '0.1.1');
  assert.equal(incrementVersion('0.1.98'), '0.1.99');
});

test('carries patch overflow into minor', () => {
  assert.equal(incrementVersion('0.1.99'), '0.2.0');
});

test('carries minor overflow into major', () => {
  assert.equal(incrementVersion('0.99.99'), '1.0.0');
});

test('rejects versions above the supported maximum', () => {
  assert.throws(() => incrementVersion('99.99.99'), /最高发布版本/);
});

test('rejects malformed and out-of-range versions', () => {
  for (const version of ['v0.1.0', '0.1', '0.1.100', '0.01.0', '-1.0.0']) {
    assert.throws(() => parseVersion(version), /发布版本号.*无效/);
  }
});

test('selects the numerically latest valid release tag', () => {
  assert.equal(
    selectLatestTaggedVersion(['v0.2.9', 'not-a-release', 'v0.10.0', 'v0.2.99', 'v100.0.0']),
    '0.10.0'
  );
  assert.equal(selectLatestTaggedVersion(['preview', 'v1.2']), null);
});
