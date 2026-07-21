import assert from 'node:assert/strict';
import test from 'node:test';

import { isDataTableRecordValid, remapDataTableRecordFields } from '../src/services/data-tables.mjs';

test('accepts a data-table record when any field has a meaningful value', () => {
  assert.equal(isDataTableRecordValid({ name: '', price: 0 }), true);
  assert.equal(isDataTableRecordValid({ name: '  valve  ', price: '' }), true);
  assert.equal(isDataTableRecordValid({ tags: ['', 'steam'] }), true);
});

test('rejects a data-table record when every field is empty', () => {
  assert.equal(isDataTableRecordValid({}), false);
  assert.equal(isDataTableRecordValid({ name: '  ', price: '', note: null }), false);
  assert.equal(isDataTableRecordValid({ tags: ['', '  '] }), false);
});

test('remaps persisted record keys without changing field values', () => {
  const fields = { fld_model: 'BSA2T', fld_price: 1280, untouched: 'value' };
  const remapped = remapDataTableRecordFields(fields, new Map([
    ['fld_model', 'fld_11111111111111111111111111111111'],
    ['fld_price', 'fld_22222222222222222222222222222222'],
  ]));

  assert.deepEqual(remapped, {
    fld_11111111111111111111111111111111: 'BSA2T',
    fld_22222222222222222222222222222222: 1280,
    untouched: 'value',
  });
  assert.deepEqual(fields, { fld_model: 'BSA2T', fld_price: 1280, untouched: 'value' });
});
