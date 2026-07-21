import assert from 'node:assert/strict';
import test from 'node:test';
import { isDataTableRecordValid } from '../../src/services/data-tables.mjs';

test('data table rows require at least one meaningful field value', () => {
  assert.equal(isDataTableRecordValid({}), false);
  assert.equal(isDataTableRecordValid({ name: '', price: null }), false);
  assert.equal(isDataTableRecordValid({ name: '   ', tags: [] }), false);
  assert.equal(isDataTableRecordValid({ name: 'TVA' }), true);
  assert.equal(isDataTableRecordValid({ price: 0 }), true);
  assert.equal(isDataTableRecordValid({ enabled: false }), true);
  assert.equal(isDataTableRecordValid({ tags: ['', 'steam'] }), true);
});
