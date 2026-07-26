import { normalizeDocumentDraftPayload } from './document-draft-patch.mjs';
import { getDocumentDraftById, updateDocumentDraft } from './document-drafts.mjs';

const MAX_FIELD_CHANGES = 50;
const MAX_TEXT_LENGTH = 20000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const STRING_FIELDS = new Set([
  'title',
  'quoteNumber',
  'contractNumber',
  'customer.name',
  'customer.company',
  'customer.contact',
  'customer.address',
  'customer.email',
  'customer.phone',
  'seller.name',
  'seller.company',
  'seller.contact',
  'seller.address',
  'seller.email',
  'seller.phone',
  'pricing.currency',
  'terms.validity',
  'terms.delivery',
  'terms.payment',
  'terms.warranty',
  'terms.disputeResolution',
  'terms.breachLiability',
  'terms.remarks',
  'signatures.sellerSigner',
  'signatures.buyerSigner',
]);

const NUMBER_FIELDS = new Set([
  'pricing.taxRate',
  'pricing.shippingFee',
]);

const ITEM_STRING_FIELDS = new Set([
  'sku',
  'model',
  'description',
  'unit',
  'notes',
]);

const ITEM_NUMBER_FIELDS = new Set([
  'qty',
  'unitPrice',
]);

export function updateDocumentDraftFields(draftId, input = {}) {
  const draft = getDocumentDraftById(draftId);
  if (!draft) {
    return null;
  }

  const result = applyDocumentFieldChangesToPayload(draft.draft_payload, input.changes);
  const changes = result.changes;
  const normalizedPayload = normalizeDocumentDraftPayload(result.payload, draft.document_type);
  const titleChange = changes.findLast((change) => change.path === 'title');

  return updateDocumentDraft(draft.id, {
    ...(titleChange ? { title: titleChange.value } : {}),
    draft_payload: normalizedPayload,
    replace_payload: true,
  });
}

export function deleteDocumentDraftItem(draftId, itemIdValue, options = {}) {
  const draft = getDocumentDraftById(draftId);
  if (!draft) {
    return null;
  }

  const itemId = String(itemIdValue || '').trim();
  if (!itemId) {
    throw createInputError('产品明细缺少 itemId');
  }

  const payload = structuredClone(draft.draft_payload && typeof draft.draft_payload === 'object'
    ? draft.draft_payload
    : {});
  const items = Array.isArray(payload.items) ? payload.items : [];
  const deletingPlaceholder = options.placeholder === true;
  const nextItems = deletingPlaceholder
    ? items
    : items.filter((item) => String(item?.id || '') !== itemId);
  if (!deletingPlaceholder && nextItems.length === items.length) {
    throw createInputError(`产品明细不存在: ${itemId}`);
  }

  payload.items = nextItems;
  if (draft.document_type === 'quote') {
    const meta = payload.meta && typeof payload.meta === 'object' && !Array.isArray(payload.meta)
      ? payload.meta
      : {};
    const configuredRowCount = Number(meta.quoteTableRowCount);
    const currentRowCount = Number.isFinite(configuredRowCount) && configuredRowCount >= 0
      ? Math.floor(configuredRowCount)
      : Math.max(8, items.length);
    payload.meta = {
      ...meta,
      quoteTableRowCount: Math.max(nextItems.length, currentRowCount - 1),
    };
  }
  const normalizedPayload = normalizeDocumentDraftPayload(payload, draft.document_type);
  return updateDocumentDraft(draft.id, {
    draft_payload: normalizedPayload,
    replace_payload: true,
  });
}

export function applyDocumentFieldChangesToPayload(payload, inputChanges) {
  const changes = normalizeFieldChanges(inputChanges);
  const nextPayload = structuredClone(payload && typeof payload === 'object' ? payload : {});

  for (const change of changes) {
    if (change.path.startsWith('items.')) {
      applyItemFieldChange(nextPayload, change);
      continue;
    }
    applyScalarFieldChange(nextPayload, change);
  }

  return { payload: nextPayload, changes };
}

export function normalizeFieldChanges(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw createInputError('至少需要一个字段变更');
  }
  if (value.length > MAX_FIELD_CHANGES) {
    throw createInputError(`单次最多更新 ${MAX_FIELD_CHANGES} 个字段`);
  }

  return value.map((entry) => normalizeFieldChange(entry));
}

function normalizeFieldChange(entry) {
  const source = entry && typeof entry === 'object' && !Array.isArray(entry) ? entry : {};
  const path = String(source.path || '').trim();
  const itemId = String(source.itemId || source.item_id || '').trim();
  const createItem = source.createItem === true || source.create_item === true;

  if (STRING_FIELDS.has(path)) {
    return { path, value: normalizeTextValue(source.value), itemId: '' };
  }
  if (NUMBER_FIELDS.has(path)) {
    return { path, value: normalizeNumberValue(source.value, path), itemId: '' };
  }

  const itemField = path.startsWith('items.') ? path.slice('items.'.length) : '';
  const isQuantityField = itemField === 'quantity';
  if (!itemField || (!isQuantityField && !ITEM_STRING_FIELDS.has(itemField) && !ITEM_NUMBER_FIELDS.has(itemField))) {
    throw createInputError(`字段不允许直接编辑: ${path || '(empty)'}`);
  }
  if (!itemId) {
    throw createInputError(`产品字段 ${path} 缺少 itemId`);
  }
  if (createItem && !UUID_PATTERN.test(itemId)) {
    throw createInputError(`新增产品字段 ${path} 的 itemId 无效`);
  }

  return {
    path,
    itemId,
    createItem,
    value: isQuantityField
      ? normalizeItemQuantity(source.value)
      : ITEM_NUMBER_FIELDS.has(itemField)
      ? normalizeNumberValue(source.value, path)
      : normalizeTextValue(source.value),
  };
}

function applyScalarFieldChange(payload, change) {
  const segments = change.path.split('.');
  let target = payload;
  for (const segment of segments.slice(0, -1)) {
    if (!target[segment] || typeof target[segment] !== 'object' || Array.isArray(target[segment])) {
      target[segment] = {};
    }
    target = target[segment];
  }
  target[segments.at(-1)] = change.value;
}

function applyItemFieldChange(payload, change) {
  const items = Array.isArray(payload.items) ? payload.items : [];
  let item = items.find((entry) => String(entry?.id || '') === change.itemId);
  if (!item && change.createItem) {
    item = { id: change.itemId };
    items.push(item);
  }
  if (!item) {
    throw createInputError(`产品明细不存在: ${change.itemId}`);
  }

  const field = change.path.slice('items.'.length);
  if (field === 'quantity') {
    item.qty = change.value.qty;
    item.unit = change.value.unit;
    item.amount = null;
    payload.items = items;
    return;
  }
  item[field] = change.value;
  if (field === 'qty' || field === 'unitPrice') {
    item.amount = null;
  }
  payload.items = items;
}

function normalizeTextValue(value) {
  const normalized = String(value ?? '').replaceAll('\r\n', '\n').trim();
  if (normalized.length > MAX_TEXT_LENGTH) {
    throw createInputError(`文本长度不能超过 ${MAX_TEXT_LENGTH} 个字符`);
  }
  return normalized;
}

function normalizeNumberValue(value, path) {
  const normalized = normalizeNumericEditingText(value);
  if (!normalized) {
    return null;
  }
  const number = Number(normalized.replaceAll(',', ''));
  if (!Number.isFinite(number)) {
    throw createInputError(`${path} 必须是有效数字`);
  }
  return number;
}

function normalizeItemQuantity(value) {
  const normalized = normalizeNumericEditingText(value);
  if (!normalized) {
    return { qty: null, unit: '' };
  }
  const match = normalized.match(/^([+-]?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d*)?|\.\d+))\s*(.*)$/);
  if (!match) {
    throw createInputError('items.quantity 必须是有效数量，例如 1');
  }
  return {
    qty: normalizeNumberValue(match[1].replaceAll(',', ''), 'items.quantity'),
    unit: '',
  };
}

function normalizeNumericEditingText(value) {
  return normalizeTextValue(value)
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[０-９]/g, (digit) => String(digit.charCodeAt(0) - 0xFF10))
    .replaceAll('．', '.')
    .replaceAll('，', ',')
    .trim();
}

function createInputError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}
