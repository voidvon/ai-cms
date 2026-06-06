import { execute, queryAll, queryOne } from '../db.mjs';

export function listMessages({ limit = 50, status } = {}) {
  const safeLimit = clampLimit(limit);
  const whereParts = [];
  const params = [];

  if (status !== undefined && status !== null && status !== '') {
    whereParts.push('status = ?');
    params.push(toInteger(status, 0));
  }

  const where = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';
  return queryAll(
    `
      SELECT
        id,
        contact_name,
        phone,
        title,
        content,
        product_id,
        address,
        mobile,
        fax,
        email,
        status,
        created_at,
        legacy_extra
      FROM messages
      ${where}
      ORDER BY coalesce(created_at, '') DESC, id DESC
      LIMIT ?
    `,
    [...params, safeLimit]
  ).map(normalizeMessageRecord);
}

export function listMessagesAdmin({ page = 1, limit = 10, status } = {}) {
  const safeLimit = Math.min(Math.max(Number.parseInt(String(limit), 10) || 10, 1), 200);
  const safePage = Math.max(Number.parseInt(String(page), 10) || 1, 1);
  const offset = (safePage - 1) * safeLimit;
  const whereParts = [];
  const params = [];

  if (status !== undefined && status !== null && status !== '') {
    whereParts.push('status = ?');
    params.push(toInteger(status, 0));
  }

  const where = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';
  const items = queryAll(
    `
      SELECT
        id,
        contact_name,
        phone,
        title,
        content,
        product_id,
        address,
        mobile,
        fax,
        email,
        status,
        created_at,
        legacy_extra
      FROM messages
      ${where}
      ORDER BY coalesce(created_at, '') DESC, id DESC
      LIMIT ?
      OFFSET ?
    `,
    [...params, safeLimit, offset]
  ).map(normalizeMessageRecord);

  const countRow = queryOne(
    `SELECT COUNT(*) AS count FROM messages ${where}`,
    params
  );

  const total = countRow?.count || 0;
  return {
    items,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.max(Math.ceil(total / safeLimit), 1)
    }
  };
}

export function getMessageById(id) {
  const row = queryOne(
    `
      SELECT
        id,
        contact_name,
        phone,
        title,
        content,
        product_id,
        address,
        mobile,
        fax,
        email,
        status,
        created_at,
        legacy_extra
      FROM messages
      WHERE id = ?
    `,
    [id]
  );
  return row ? normalizeMessageRecord(row) : null;
}

export function createMessage(input) {
  const payload = normalizeMessageInput(input);
  const result = execute(
    `
      INSERT INTO messages (
        contact_name,
        phone,
        title,
        content,
        product_id,
        address,
        mobile,
        fax,
        email,
        status,
        created_at,
        legacy_extra
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      payload.contact_name,
      payload.phone,
      payload.title,
      payload.content,
      payload.product_id,
      payload.address,
      payload.mobile,
      payload.fax,
      payload.email,
      payload.status,
      payload.created_at,
      payload.legacy_extra
    ]
  );

  return getMessageById(result.lastInsertRowid);
}

export function updateMessage(id, input) {
  const existing = getMessageById(id);
  if (!existing) {
    return null;
  }

  const payload = normalizeMessageInput({ ...existing, ...input }, { allowMissingRequired: true });
  execute(
    `
      UPDATE messages
      SET
        contact_name = ?,
        phone = ?,
        title = ?,
        content = ?,
        product_id = ?,
        address = ?,
        mobile = ?,
        fax = ?,
        email = ?,
        status = ?,
        created_at = ?,
        legacy_extra = ?
      WHERE id = ?
    `,
    [
      payload.contact_name,
      payload.phone,
      payload.title,
      payload.content,
      payload.product_id,
      payload.address,
      payload.mobile,
      payload.fax,
      payload.email,
      payload.status,
      payload.created_at,
      payload.legacy_extra,
      id
    ]
  );

  return getMessageById(id);
}

export function deleteMessage(id) {
  const existing = getMessageById(id);
  if (!existing) {
    return null;
  }

  execute('DELETE FROM messages WHERE id = ?', [id]);
  return existing;
}

export function normalizeMessageInput(input, options = {}) {
  const { allowMissingRequired = false } = options;
  const contactName = toNullableString(input.contact_name);
  const phone = toNullableString(input.phone);
  const title = toNullableString(input.title);

  if (!allowMissingRequired) {
    if (!contactName) {
      throw new Error('contact_name is required');
    }
    if (!phone) {
      throw new Error('phone is required');
    }
    if (!title) {
      throw new Error('title is required');
    }
  }

  return {
    contact_name: contactName,
    phone,
    title,
    content: toNullableString(input.content),
    product_id: toNullableInteger(input.product_id),
    address: toNullableString(input.address),
    mobile: toNullableString(input.mobile),
    fax: toNullableString(input.fax),
    email: toNullableString(input.email),
    status: toInteger(input.status, 0),
    created_at: toNullableString(input.created_at) || new Date().toISOString(),
    legacy_extra: normalizeLegacyExtra(input.legacy_extra)
  };
}

function clampLimit(limit) {
  return Math.min(Math.max(Number.parseInt(String(limit), 10) || 50, 1), 200);
}

function toNullableString(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const normalized = String(value).trim();
  return normalized === '' ? null : normalized;
}

function toNullableInteger(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return null;
  }
  const parsed = Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function toInteger(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function normalizeLegacyExtra(value) {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized === '' ? null : normalized;
  }
  return JSON.stringify(value);
}

function normalizeMessageRecord(row) {
  const legacyExtra = parseLegacyExtra(row.legacy_extra);
  return {
    ...row,
    legacy_extra: row.legacy_extra,
    handled_at: legacyExtra.handled_at || null
  };
}

function parseLegacyExtra(value) {
  if (!value) {
    return {};
  }
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}
