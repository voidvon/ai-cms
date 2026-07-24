import assert from 'node:assert/strict';
import test from 'node:test';

import { pickDocumentDraftUpdates } from '../src/routes/api/document-workspaces.mjs';
import {
  hasDocumentDraftPayloadUpdate,
  mergeDraftPayload,
  resolveDocumentDraftTitle,
} from '../src/services/document-drafts.mjs';

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
