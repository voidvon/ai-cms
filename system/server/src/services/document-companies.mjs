import { execute, getDb, queryAll, queryOne } from '../db.mjs';
import { getSelectedTemplateVariant } from './template-variants.mjs';

let schemaEnsured = false;

export function ensureDocumentCompaniesSchema() {
  if (schemaEnsured) {
    return;
  }

  getDb().exec(`
    CREATE TABLE IF NOT EXISTS document_companies (
      id INTEGER PRIMARY KEY,
      theme_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      contact TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (theme_id, name)
    );

    CREATE INDEX IF NOT EXISTS idx_document_companies_theme_updated
      ON document_companies(theme_id, updated_at DESC, id DESC);
  `);

  schemaEnsured = true;
}

export function listDocumentCompanies({ themeId, search } = {}) {
  ensureDocumentCompaniesSchema();
  const normalizedThemeId = resolveThemeId(themeId);
  const normalizedSearch = String(search || '').trim();
  const params = [normalizedThemeId];
  let where = 'WHERE theme_id = ?';

  if (normalizedSearch) {
    where += ' AND (name LIKE ? OR contact LIKE ? OR phone LIKE ? OR email LIKE ? OR address LIKE ?)';
    const likeValue = `%${normalizedSearch}%`;
    params.push(likeValue, likeValue, likeValue, likeValue, likeValue);
  }

  return queryAll(
    `
      SELECT
        id,
        theme_id,
        name,
        contact,
        phone,
        email,
        address,
        notes,
        created_at,
        updated_at
      FROM document_companies
      ${where}
      ORDER BY updated_at DESC, id DESC
    `,
    params
  ).map(hydrateDocumentCompanyRecord);
}

export function getDocumentCompanyById(id, { themeId } = {}) {
  ensureDocumentCompaniesSchema();
  const normalizedThemeId = resolveThemeId(themeId);
  const row = queryOne(
    `
      SELECT
        id,
        theme_id,
        name,
        contact,
        phone,
        email,
        address,
        notes,
        created_at,
        updated_at
      FROM document_companies
      WHERE id = ? AND theme_id = ?
      LIMIT 1
    `,
    [toInteger(id, 0), normalizedThemeId]
  );
  return hydrateDocumentCompanyRecord(row);
}

export function getDocumentCompanyByName(name, { themeId } = {}) {
  ensureDocumentCompaniesSchema();
  const normalizedThemeId = resolveThemeId(themeId);
  const normalizedName = normalizeCompanyName(name);
  if (!normalizedName) {
    return null;
  }

  const row = queryOne(
    `
      SELECT
        id,
        theme_id,
        name,
        contact,
        phone,
        email,
        address,
        notes,
        created_at,
        updated_at
      FROM document_companies
      WHERE theme_id = ? AND lower(name) = lower(?)
      LIMIT 1
    `,
    [normalizedThemeId, normalizedName]
  );
  return hydrateDocumentCompanyRecord(row);
}

export function createDocumentCompany(input = {}, { themeId } = {}) {
  ensureDocumentCompaniesSchema();
  const normalizedThemeId = resolveThemeId(themeId);
  const payload = normalizeDocumentCompanyInput(input);
  const existing = getDocumentCompanyByName(payload.name, { themeId: normalizedThemeId });
  if (existing) {
    const error = new Error('公司名称已存在');
    error.statusCode = 409;
    throw error;
  }

  const now = new Date().toISOString();
  const result = execute(
    `
      INSERT INTO document_companies (
        theme_id,
        name,
        contact,
        phone,
        email,
        address,
        notes,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      normalizedThemeId,
      payload.name,
      payload.contact,
      payload.phone,
      payload.email,
      payload.address,
      payload.notes,
      now,
      now,
    ]
  );

  return getDocumentCompanyById(result.lastInsertRowid, { themeId: normalizedThemeId });
}

export function updateDocumentCompany(id, input = {}, { themeId } = {}) {
  ensureDocumentCompaniesSchema();
  const normalizedThemeId = resolveThemeId(themeId);
  const existing = getDocumentCompanyById(id, { themeId: normalizedThemeId });
  if (!existing) {
    return null;
  }

  const payload = normalizeDocumentCompanyInput(input, { existing });
  const duplicate = getDocumentCompanyByName(payload.name, { themeId: normalizedThemeId });
  if (duplicate && duplicate.id !== existing.id) {
    const error = new Error('公司名称已存在');
    error.statusCode = 409;
    throw error;
  }

  const now = new Date().toISOString();
  execute(
    `
      UPDATE document_companies
      SET
        name = ?,
        contact = ?,
        phone = ?,
        email = ?,
        address = ?,
        notes = ?,
        updated_at = ?
      WHERE id = ? AND theme_id = ?
    `,
    [
      payload.name,
      payload.contact,
      payload.phone,
      payload.email,
      payload.address,
      payload.notes,
      now,
      existing.id,
      normalizedThemeId,
    ]
  );

  return getDocumentCompanyById(existing.id, { themeId: normalizedThemeId });
}

export function deleteDocumentCompany(id, { themeId } = {}) {
  ensureDocumentCompaniesSchema();
  const normalizedThemeId = resolveThemeId(themeId);
  const existing = getDocumentCompanyById(id, { themeId: normalizedThemeId });
  if (!existing) {
    return false;
  }

  execute('DELETE FROM document_companies WHERE id = ? AND theme_id = ?', [existing.id, normalizedThemeId]);
  return true;
}

export function upsertDocumentCompanyFromParty(party, { themeId } = {}) {
  ensureDocumentCompaniesSchema();
  const normalizedThemeId = resolveThemeId(themeId);
  const payload = normalizeCompanyPartyInput(party);
  if (!payload.name) {
    return null;
  }

  const existing = getDocumentCompanyByName(payload.name, { themeId: normalizedThemeId });
  if (!existing) {
    return createDocumentCompany(payload, { themeId: normalizedThemeId });
  }

  const nextPayload = {
    name: existing.name,
    contact: payload.contact || existing.contact,
    phone: payload.phone || existing.phone,
    email: payload.email || existing.email,
    address: payload.address || existing.address,
    notes: payload.notes || existing.notes,
  };

  const hasChanges = (
    nextPayload.contact !== existing.contact
    || nextPayload.phone !== existing.phone
    || nextPayload.email !== existing.email
    || nextPayload.address !== existing.address
    || nextPayload.notes !== existing.notes
  );

  return hasChanges
    ? updateDocumentCompany(existing.id, nextPayload, { themeId: normalizedThemeId })
    : existing;
}

function normalizeDocumentCompanyInput(input = {}, options = {}) {
  const existing = options.existing || null;
  const normalizedName = normalizeCompanyName(input.name ?? existing?.name);
  if (!normalizedName) {
    throw new Error('公司名称不能为空');
  }

  return {
    name: normalizedName,
    contact: normalizeText(input.contact ?? existing?.contact),
    phone: normalizeText(input.phone ?? existing?.phone),
    email: normalizeText(input.email ?? existing?.email),
    address: normalizeText(input.address ?? existing?.address),
    notes: normalizeText(input.notes ?? existing?.notes),
  };
}

function normalizeCompanyPartyInput(party = {}) {
  return {
    name: normalizeCompanyName(party.company || party.name),
    contact: normalizeText(party.contact || party.name),
    phone: normalizeText(party.phone),
    email: normalizeText(party.email),
    address: normalizeText(party.address),
    notes: '',
  };
}

function hydrateDocumentCompanyRecord(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    id: toInteger(row.id, 0),
    theme_id: toInteger(row.theme_id, 0),
    name: normalizeText(row.name),
    contact: normalizeText(row.contact),
    phone: normalizeText(row.phone),
    email: normalizeText(row.email),
    address: normalizeText(row.address),
    notes: normalizeText(row.notes),
  };
}

function resolveThemeId(themeId) {
  const normalizedThemeId = toInteger(themeId, null);
  if (normalizedThemeId) {
    return normalizedThemeId;
  }

  const selectedTheme = getSelectedTemplateVariant();
  const fallbackThemeId = toInteger(selectedTheme?.id, null);
  if (!fallbackThemeId) {
    throw new Error('未找到已选主题，无法管理公司');
  }
  return fallbackThemeId;
}

function normalizeCompanyName(value) {
  return normalizeText(value);
}

function normalizeText(value) {
  return String(value || '').trim();
}

function toInteger(value, fallbackValue = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallbackValue;
}
