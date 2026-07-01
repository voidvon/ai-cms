import { randomUUID } from 'node:crypto';
import { execute, getDb, queryAll, queryOne } from '../db.mjs';
import { getDocumentTemplateById, resolveDocumentTemplateForType } from './document-templates.mjs';

let schemaEnsured = false;

const DOCUMENT_TYPES = ['quote', 'contract'];

export function ensureDocumentDraftsSchema() {
  if (schemaEnsured) {
    return;
  }

  getDb().exec(`
    CREATE TABLE IF NOT EXISTS document_drafts (
      id TEXT PRIMARY KEY,
      theme_id INTEGER NOT NULL,
      document_type TEXT NOT NULL CHECK (document_type IN ('quote', 'contract')),
      document_template_id INTEGER NOT NULL,
      template_id INTEGER NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      language_code TEXT NOT NULL DEFAULT 'zh-CN',
      draft_payload_json TEXT NOT NULL DEFAULT '{}',
      messages_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (document_template_id) REFERENCES document_templates(id) ON DELETE RESTRICT,
      FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE RESTRICT
    );

    CREATE INDEX IF NOT EXISTS idx_document_drafts_theme_updated
      ON document_drafts(theme_id, updated_at DESC);
  `);

  schemaEnsured = true;
}

export function createDocumentDraft(input = {}) {
  ensureDocumentDraftsSchema();

  const documentTemplate = resolveDocumentTemplateInput(input);
  const id = String(input.id || '').trim() || randomUUID();
  const now = new Date().toISOString();
  const db = getDb();

  db.exec('BEGIN IMMEDIATE');
  try {
    const payload = assignDraftDocumentNumber(
      mergeDraftPayload(documentTemplate.default_payload, input.draft_payload || input.payload || {}),
      documentTemplate.document_type,
      db
    );
    const title = String(input.title || payload.title || documentTemplate.name || '').trim() || buildDefaultTitle(documentTemplate.document_type);
    const languageCode = String(input.language_code || payload.language || 'zh-CN').trim() || 'zh-CN';

    db.prepare(
      `
        INSERT INTO document_drafts (
          id,
          theme_id,
          document_type,
          document_template_id,
          template_id,
          title,
          language_code,
          draft_payload_json,
          messages_json,
          status,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, '[]', 'draft', ?, ?)
      `
    ).run(
      id,
      documentTemplate.theme_id,
      documentTemplate.document_type,
      documentTemplate.id,
      documentTemplate.template_id,
      title,
      languageCode,
      JSON.stringify(payload),
      now,
      now,
    );

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return getDocumentDraftById(id);
}

export function getDocumentDraftById(id) {
  ensureDocumentDraftsSchema();
  const row = queryOne(
    `
      SELECT
        dd.id,
        dd.theme_id,
        dd.document_type,
        dd.document_template_id,
        dd.template_id,
        dd.title,
        dd.language_code,
        dd.draft_payload_json,
        dd.messages_json,
        dd.status,
        dd.created_at,
        dd.updated_at,
        dt.key AS document_template_key,
        dt.name AS document_template_name,
        dt.description AS document_template_description,
        t.code AS template_code,
        t.name AS template_name
      FROM document_drafts dd
      INNER JOIN document_templates dt ON dt.id = dd.document_template_id
      INNER JOIN templates t ON t.id = dd.template_id
      WHERE dd.id = ?
      LIMIT 1
    `,
    [id]
  );

  return hydrateDocumentDraftRecord(row);
}

export function listDocumentDrafts({ limit = 20 } = {}) {
  ensureDocumentDraftsSchema();
  const normalizedLimit = toInteger(limit, 20);
  return queryAll(
    `
      SELECT
        dd.id,
        dd.theme_id,
        dd.document_type,
        dd.document_template_id,
        dd.template_id,
        dd.title,
        dd.language_code,
        dd.draft_payload_json,
        dd.messages_json,
        dd.status,
        dd.created_at,
        dd.updated_at,
        dt.key AS document_template_key,
        dt.name AS document_template_name,
        dt.description AS document_template_description,
        t.code AS template_code,
        t.name AS template_name
      FROM document_drafts dd
      INNER JOIN document_templates dt ON dt.id = dd.document_template_id
      INNER JOIN templates t ON t.id = dd.template_id
      ORDER BY dd.updated_at DESC, dd.id DESC
      LIMIT ?
    `,
    [normalizedLimit]
  ).map(hydrateDocumentDraftRecord);
}

export function updateDocumentDraft(id, updates = {}) {
  ensureDocumentDraftsSchema();
  const existing = getDocumentDraftById(id);
  if (!existing) {
    return null;
  }

  const hasPayloadUpdate = Object.prototype.hasOwnProperty.call(updates, 'draft_payload')
    || Object.prototype.hasOwnProperty.call(updates, 'payload');
  const nextPayload = hasPayloadUpdate
    ? (
      updates.replace_payload
        ? normalizeDraftPayload(updates.draft_payload || updates.payload || {})
        : mergeDraftPayload(existing.draft_payload, updates.draft_payload || updates.payload || {})
    )
    : existing.draft_payload;
  const nextMessages = Array.isArray(updates.messages)
    ? normalizeMessages(updates.messages)
    : existing.messages;
  const nextTitle = String(updates.title || nextPayload.title || existing.title || '').trim() || buildDefaultTitle(existing.document_type);
  const nextLanguageCode = String(updates.language_code || nextPayload.language || existing.language_code || 'zh-CN').trim() || 'zh-CN';
  const nextStatus = String(updates.status || existing.status || 'draft').trim() || 'draft';
  const now = new Date().toISOString();

  execute(
    `
      UPDATE document_drafts
      SET
        title = ?,
        language_code = ?,
        draft_payload_json = ?,
        messages_json = ?,
        status = ?,
        updated_at = ?
      WHERE id = ?
    `,
    [
      nextTitle,
      nextLanguageCode,
      JSON.stringify(nextPayload),
      JSON.stringify(nextMessages),
      nextStatus,
      now,
      id,
    ]
  );

  return getDocumentDraftById(id);
}

export function appendDocumentDraftMessages(id, ...entries) {
  const existing = getDocumentDraftById(id);
  if (!existing) {
    return null;
  }

  const nextMessages = [...existing.messages, ...normalizeMessages(entries)];
  return updateDocumentDraft(id, {
    messages: nextMessages,
  });
}

export function deleteDocumentDraft(id) {
  ensureDocumentDraftsSchema();
  const existing = getDocumentDraftById(id);
  if (!existing) {
    return false;
  }

  execute('DELETE FROM document_drafts WHERE id = ?', [id]);
  return true;
}

function hydrateDocumentDraftRecord(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    draft_payload_json: String(row.draft_payload_json || '{}'),
    draft_payload: normalizeDraftPayload(safeParseJson(row.draft_payload_json, {})),
    messages_json: String(row.messages_json || '[]'),
    messages: normalizeMessages(safeParseJson(row.messages_json, [])),
  };
}

function resolveDocumentTemplateInput(input) {
  const documentTemplateId = toInteger(input.document_template_id || input.documentTemplateId, null);
  if (documentTemplateId) {
    const byId = getDocumentTemplateById(documentTemplateId);
    if (!byId) {
      throw new Error('文档模板不存在');
    }
    return byId;
  }

  const documentType = normalizeDocumentType(input.document_type || input.documentType);
  const resolved = resolveDocumentTemplateForType(documentType);
  if (!resolved) {
    throw new Error('未找到可用文档模板');
  }
  return resolved;
}

function mergeDraftPayload(basePayload, overridePayload) {
  const base = normalizeDraftPayload(basePayload);
  const override = normalizeDraftPayload(overridePayload);
  return deepMerge(base, override);
}

function deepMerge(baseValue, overrideValue) {
  if (Array.isArray(baseValue) || Array.isArray(overrideValue)) {
    return Array.isArray(overrideValue) ? overrideValue : (Array.isArray(baseValue) ? baseValue : []);
  }

  if (!isPlainObject(baseValue) || !isPlainObject(overrideValue)) {
    return overrideValue == null ? baseValue : overrideValue;
  }

  const result = { ...baseValue };
  for (const key of Object.keys(overrideValue)) {
    const baseEntry = result[key];
    const overrideEntry = overrideValue[key];
    result[key] = deepMerge(baseEntry, overrideEntry);
  }
  return result;
}

function normalizeDraftPayload(value) {
  const source = isPlainObject(value) ? value : {};
  return {
    ...source,
    customer: isPlainObject(source.customer) ? source.customer : {},
    seller: isPlainObject(source.seller) ? source.seller : {},
    pricing: isPlainObject(source.pricing) ? source.pricing : {},
    terms: isPlainObject(source.terms) ? source.terms : {},
    signatures: isPlainObject(source.signatures) ? source.signatures : {},
    meta: isPlainObject(source.meta) ? source.meta : {},
    stamps: Array.isArray(source.stamps) ? source.stamps.map(normalizeDraftStamp) : [],
    items: Array.isArray(source.items)
      ? source.items.map((item, index) => normalizeDraftItem(item, index))
      : [],
  };
}

function normalizeDraftItem(item, index) {
  const source = isPlainObject(item) ? item : {};
  return {
    id: String(source.id || `item-${index + 1}`),
    sku: String(source.sku || '').trim(),
    model: String(source.model || '').trim(),
    description: String(source.description || '').trim(),
    qty: toNumber(source.qty, 0),
    unit: String(source.unit || '').trim(),
    unitPrice: toNumber(source.unitPrice, null),
    amount: toNumber(source.amount, null),
    notes: String(source.notes || '').trim(),
  };
}

function normalizeDraftStamp(item, index) {
  const source = isPlainObject(item) ? item : {};
  return {
    id: String(source.id || `stamp-${index + 1}`),
    stampId: toInteger(source.stampId ?? source.stamp_id, null),
    name: String(source.name || '').trim(),
    imagePath: String(source.imagePath || source.image_path || '').trim(),
    x: toNumber(source.x, 0),
    y: toNumber(source.y, 0),
    width: toNumber(source.width, 160),
    height: toNumber(source.height, 160),
    rotation: toNumber(source.rotation, 0),
  };
}

function normalizeMessages(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }
      const role = String(entry.role || '').trim() === 'assistant' ? 'assistant' : 'user';
      const text = String(entry.text || entry.content || '').trim();
      if (!text) {
        return null;
      }
      return {
        role,
        text,
        created_at: String(entry.created_at || entry.createdAt || new Date().toISOString()),
      };
    })
    .filter(Boolean);
}

function normalizeDocumentType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!DOCUMENT_TYPES.includes(normalized)) {
    throw new Error('invalid document type');
  }
  return normalized;
}

function safeParseJson(value, fallbackValue) {
  try {
    return JSON.parse(String(value || ''));
  } catch {
    return fallbackValue;
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function buildDefaultTitle(documentType) {
  return documentType === 'quote' ? '报价单' : '销售合同';
}

function assignDraftDocumentNumber(payload, documentType, db) {
  const nextPayload = normalizeDraftPayload(payload);
  const fieldName = documentType === 'contract' ? 'contractNumber' : 'quoteNumber';
  const existingNumber = String(nextPayload[fieldName] || '').trim();
  if (existingNumber) {
    return nextPayload;
  }

  return {
    ...nextPayload,
    [fieldName]: generateDailyDocumentNumber(
      db,
      resolveDocumentNumberPrefix(nextPayload),
    ),
  };
}

function generateDailyDocumentNumber(db, documentPrefix = '', now = new Date()) {
  const prefix = buildDocumentNumberBase(documentPrefix, now);
  const rows = db.prepare(
    `
      SELECT draft_payload_json
      FROM document_drafts
      WHERE draft_payload_json LIKE ?
         OR draft_payload_json LIKE ?
    `
  ).all(
    `%"quoteNumber":"${prefix}%`,
    `%"contractNumber":"${prefix}%`,
  );

  let maxSequence = 9;
  for (const row of rows) {
    const payload = safeParseJson(row?.draft_payload_json, {});
    const candidates = [payload?.quoteNumber, payload?.contractNumber];
    for (const candidate of candidates) {
      const sequence = extractDocumentNumberSequence(candidate, prefix);
      if (sequence != null && sequence > maxSequence) {
        maxSequence = sequence;
      }
    }
  }

  return `${prefix}${String(maxSequence + 1).padStart(2, '0')}`;
}

function resolveDocumentNumberPrefix(payload) {
  const normalizedMeta = isPlainObject(payload?.meta) ? payload.meta : {};
  return String(normalizedMeta.documentNumberPrefix || '').trim().toUpperCase();
}

function buildDocumentNumberBase(documentPrefix, value) {
  const normalizedPrefix = String(documentPrefix || '').trim().toUpperCase();
  const datePart = formatDocumentNumberDate(value);
  return normalizedPrefix ? `${normalizedPrefix}-${datePart}` : datePart;
}

function formatDocumentNumberDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function extractDocumentNumberSequence(value, prefix) {
  const normalized = String(value || '').trim();
  if (!normalized.startsWith(prefix)) {
    return null;
  }

  const sequencePart = normalized.slice(prefix.length);
  const sequence = Number.parseInt(sequencePart, 10);
  return Number.isFinite(sequence) ? sequence : null;
}

function toInteger(value, fallbackValue = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallbackValue;
}

function toNumber(value, fallbackValue = 0) {
  if (value == null || value === '') {
    return fallbackValue;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallbackValue;
}
