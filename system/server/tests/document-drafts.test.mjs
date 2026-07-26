import assert from 'node:assert/strict';
import test from 'node:test';

import { pickDocumentDraftUpdates } from '../src/routes/api/document-workspaces.mjs';
import {
  createDocumentDraft,
  deleteDocumentDraft,
  hasDocumentDraftPayloadUpdate,
  mergeDraftPayload,
  resolveDocumentDraftTitle,
} from '../src/services/document-drafts.mjs';
import {
  applyDocumentFieldChangesToPayload,
  deleteDocumentDraftItem,
  normalizeFieldChanges,
  updateDocumentDraftFields,
} from '../src/services/document-field-updates.mjs';
import { resolveDocumentFieldEditingValue } from '../src/services/document-preview.mjs';

test('title-only draft updates do not become payload updates', () => {
  const updates = pickDocumentDraftUpdates({
    title: 'Renamed quote',
    draft_payload: undefined,
    payload: undefined,
    replace_payload: undefined,
  });

  assert.deepEqual(updates, { title: 'Renamed quote' });
  assert.equal(hasDocumentDraftPayloadUpdate(updates), false);
});

test('defined draft payloads remain payload updates', () => {
  const updates = pickDocumentDraftUpdates({
    title: 'Updated quote',
    draft_payload: {
      items: [{ id: 'item-1', model: 'BTS7' }],
      stamps: [{ id: 'stamp-1', stampId: 1 }],
    },
  });

  assert.equal(hasDocumentDraftPayloadUpdate(updates), true);
  assert.deepEqual(updates.draft_payload, {
    items: [{ id: 'item-1', model: 'BTS7' }],
    stamps: [{ id: 'stamp-1', stampId: 1 }],
  });
});

test('payload updates cannot overwrite a manually renamed draft title', () => {
  const existing = {
    title: 'BTS7 Lebanon quote',
    document_type: 'quote',
  };

  assert.equal(resolveDocumentDraftTitle(existing, {
    draft_payload: { title: 'Spirax Sarco Quotation' },
  }), 'BTS7 Lebanon quote');
  assert.equal(resolveDocumentDraftTitle(existing, {
    title: 'Explicit new filename',
  }), 'Explicit new filename');
});

test('stamp-only payload patches preserve product items', () => {
  const merged = mergeDraftPayload({
    title: 'Spirax Sarco Quotation',
    items: [{ id: 'item-1', model: 'BTS7', qty: 2 }],
    stamps: [],
  }, {
    stamps: [{ id: 'stamp-1', stampId: 1, x: 120, y: 240 }],
  });

  assert.equal(merged.items.length, 1);
  assert.equal(merged.items[0].model, 'BTS7');
  assert.equal(merged.stamps.length, 1);
  assert.equal(merged.stamps[0].stampId, 1);
});

test('document field changes update whitelisted scalar fields', () => {
  const result = applyDocumentFieldChangesToPayload({
    title: 'Old title',
    customer: { company: 'Old company' },
    items: [],
  }, [
    { path: 'title', value: 'New title' },
    { path: 'customer.company', value: 'New company' },
  ]);

  assert.equal(result.payload.title, 'New title');
  assert.equal(result.payload.customer.company, 'New company');
});

test('document item field changes use stable item ids', () => {
  const result = applyDocumentFieldChangesToPayload({
    items: [
      { id: 'item-a', model: 'A', qty: 1, unitPrice: 10, amount: 10 },
      { id: 'item-b', model: 'B', qty: 2, unitPrice: 20, amount: 40 },
    ],
  }, [
    { path: 'items.qty', itemId: 'item-b', value: '3' },
  ]);

  assert.equal(result.payload.items[0].qty, 1);
  assert.equal(result.payload.items[1].qty, 3);
  assert.equal(result.payload.items[1].amount, null);
});

test('document item field changes can create a new item from an editable blank row', () => {
  const itemId = '72baeb49-73f1-4165-b8b7-e7bd67a8405e';
  const result = applyDocumentFieldChangesToPayload({ items: [] }, [
    { path: 'items.model', itemId, createItem: true, value: 'BSA3BD' },
    { path: 'items.quantity', itemId, createItem: true, value: '2' },
    { path: 'items.unitPrice', itemId, createItem: true, value: '100' },
  ]);

  assert.deepEqual(result.payload.items, [{
    id: itemId,
    model: 'BSA3BD',
    qty: 2,
    unit: '',
    unitPrice: 100,
    amount: null,
  }]);
});

test('document quantity cells update quantity without requiring a unit', () => {
  const result = applyDocumentFieldChangesToPayload({
    items: [{ id: 'item-a', qty: 1, unit: 'EA', unitPrice: 10, amount: 10 }],
  }, [{ path: 'items.quantity', itemId: 'item-a', value: '2' }]);

  assert.equal(result.payload.items[0].qty, 2);
  assert.equal(result.payload.items[0].unit, '');
  assert.equal(result.payload.items[0].amount, null);
});

test('document quantity cells ignore legacy unit text when saving quantity', () => {
  const result = applyDocumentFieldChangesToPayload({
    items: [{ id: 'item-a', qty: 1, unit: 'EA', unitPrice: 10, amount: 10 }],
  }, [{ path: 'items.quantity', itemId: 'item-a', value: '2 PCS' }]);

  assert.equal(result.payload.items[0].qty, 2);
  assert.equal(result.payload.items[0].unit, '');
  assert.equal(result.payload.items[0].amount, null);
});

test('document quantity cells accept grouped and full-width numeric input', () => {
  const grouped = normalizeFieldChanges([{ path: 'items.quantity', itemId: 'item-a', value: '1,200' }]);
  const fullWidth = normalizeFieldChanges([{ path: 'items.quantity', itemId: 'item-a', value: '１' }]);

  assert.equal(grouped[0].value.qty, 1200);
  assert.equal(fullWidth[0].value.qty, 1);
});

test('document draft field save normalizes quantity exactly once', () => {
  const draft = createDocumentDraft({
    document_type: 'quote',
    title: 'Quantity save regression',
    draft_payload: {
      items: [{ id: 'item-1', model: 'TEST', qty: 1, unitPrice: 25 }],
    },
  });

  try {
    const updated = updateDocumentDraftFields(draft.id, {
      changes: [{ path: 'items.quantity', itemId: 'item-1', createItem: false, value: '2' }],
    });

    assert.equal(updated.draft_payload.items[0].qty, 2);
    assert.equal(updated.draft_payload.items[0].amount, 50);
    assert.equal(updated.draft_payload.pricing.subtotal, 50);
    assert.equal(updated.draft_payload.pricing.total, 50);
  } finally {
    deleteDocumentDraft(draft.id);
  }
});

test('deleting a document item recalculates subtotal and total', () => {
  const draft = createDocumentDraft({
    document_type: 'quote',
    title: 'Delete item regression',
    draft_payload: {
      items: [
        { id: 'item-1', model: 'A', qty: 2, unitPrice: 25 },
        { id: 'item-2', model: 'B', qty: 3, unitPrice: 10 },
      ],
    },
  });

  try {
    updateDocumentDraftFields(draft.id, {
      changes: [{ path: 'items.quantity', itemId: 'item-1', value: '2' }],
    });
    const updated = deleteDocumentDraftItem(draft.id, 'item-1');

    assert.equal(updated.draft_payload.items.length, 1);
    assert.equal(updated.draft_payload.items[0].id, 'item-2');
    assert.equal(updated.draft_payload.pricing.subtotal, 30);
    assert.equal(updated.draft_payload.pricing.total, 30);
    assert.equal(updated.draft_payload.meta.quoteTableRowCount, 7);
  } finally {
    deleteDocumentDraft(draft.id);
  }
});

test('deleting a blank quote row persists the reduced visible row count', () => {
  const draft = createDocumentDraft({
    document_type: 'quote',
    title: 'Delete placeholder row regression',
    draft_payload: { items: [] },
  });

  try {
    const updated = deleteDocumentDraftItem(draft.id, 'placeholder-row', { placeholder: true });

    assert.equal(updated.draft_payload.items.length, 0);
    assert.equal(updated.draft_payload.meta.quoteTableRowCount, 7);
  } finally {
    deleteDocumentDraft(draft.id);
  }
});

test('document quantity cells reject values without a numeric quantity', () => {
  assert.throws(
    () => normalizeFieldChanges([{ path: 'items.quantity', itemId: 'item-a', value: 'EA' }]),
    /必须是有效数量/,
  );
});

test('document item field changes reject invalid ids for new blank rows', () => {
  assert.throws(
    () => normalizeFieldChanges([{
      path: 'items.model',
      itemId: 'new-item-1',
      createItem: true,
      value: 'BSA3BD',
    }]),
    /itemId 无效/,
  );
});

test('document field changes reject arbitrary object paths', () => {
  assert.throws(
    () => normalizeFieldChanges([{ path: '__proto__.polluted', value: 'yes' }]),
    /字段不允许直接编辑/,
  );
});

test('document preview editing preserves rendered fallback text for empty fields', () => {
  assert.equal(resolveDocumentFieldEditingValue('', 'Default remarks'), 'Default remarks');
  assert.equal(resolveDocumentFieldEditingValue(null, 'Default title'), 'Default title');
  assert.equal(resolveDocumentFieldEditingValue('12.3', '12.30'), '12.3');
});
