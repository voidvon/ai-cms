import { execute, queryAll, queryOne } from '../db.mjs';

export function listJobs({ limit = 20, activeOnly = true } = {}) {
  const safeLimit = clampLimit(limit, 20, 100);
  const conditions = [];
  const params = [];

  if (activeOnly) {
    conditions.push('is_active = 1');
  }

  let sql = `
    SELECT
      id,
      name,
      address,
      openings,
      contact_person,
      phone,
      is_active,
      requirements_html,
      created_at,
      legacy_extra
    FROM jobs
  `;

  if (conditions.length > 0) {
    sql += ` WHERE ${conditions.join(' AND ')}`;
  }

  sql += ' ORDER BY coalesce(created_at, \'\') DESC, id DESC LIMIT ?';
  params.push(safeLimit);
  return queryAll(sql, params);
}

export function listJobsAdmin({ page = 1, limit = 20 } = {}) {
  const safeLimit = clampLimit(limit, 20, 200);
  const safePage = Math.max(Number.parseInt(String(page), 10) || 1, 1);
  const offset = (safePage - 1) * safeLimit;

  const items = queryAll(
    `
      SELECT
        id,
        name,
        address,
        openings,
        contact_person,
        phone,
        is_active,
        requirements_html,
        created_at,
        legacy_extra
      FROM jobs
      ORDER BY coalesce(created_at, '') DESC, id DESC
      LIMIT ?
      OFFSET ?
    `,
    [safeLimit, offset]
  );

  const total = queryOne('SELECT COUNT(*) AS count FROM jobs')?.count || 0;
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

export function getJobById(id) {
  return queryOne(
    `
      SELECT
        id,
        name,
        address,
        openings,
        contact_person,
        phone,
        is_active,
        requirements_html,
        created_at,
        legacy_extra
      FROM jobs
      WHERE id = ?
    `,
    [id]
  );
}

export function createJob(input) {
  const payload = normalizeJobInput(input);
  const result = execute(
    `
      INSERT INTO jobs (
        name,
        address,
        openings,
        contact_person,
        phone,
        is_active,
        requirements_html,
        created_at,
        legacy_extra
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      payload.name,
      payload.address,
      payload.openings,
      payload.contact_person,
      payload.phone,
      payload.is_active,
      payload.requirements_html,
      payload.created_at,
      payload.legacy_extra
    ]
  );

  return getJobById(result.lastInsertRowid);
}

export function updateJob(id, input) {
  const existing = getJobById(id);
  if (!existing) {
    return null;
  }

  const payload = normalizeJobInput({ ...existing, ...input });
  execute(
    `
      UPDATE jobs
      SET
        name = ?,
        address = ?,
        openings = ?,
        contact_person = ?,
        phone = ?,
        is_active = ?,
        requirements_html = ?,
        created_at = ?,
        legacy_extra = ?
      WHERE id = ?
    `,
    [
      payload.name,
      payload.address,
      payload.openings,
      payload.contact_person,
      payload.phone,
      payload.is_active,
      payload.requirements_html,
      payload.created_at,
      payload.legacy_extra,
      id
    ]
  );

  return getJobById(id);
}

export function deleteJob(id) {
  const existing = getJobById(id);
  if (!existing) {
    return null;
  }

  execute('DELETE FROM jobs WHERE id = ?', [id]);
  return existing;
}

export function normalizeJobInput(input) {
  const name = String(input.name ?? '').trim();
  if (!name) {
    throw new Error('name is required');
  }

  return {
    name,
    address: toNullableString(input.address),
    openings: toNullableString(input.openings),
    contact_person: toNullableString(input.contact_person),
    phone: toNullableString(input.phone),
    is_active: toBooleanInt(input.is_active, 1),
    requirements_html: toNullableString(input.requirements_html),
    created_at: toNullableString(input.created_at) || new Date().toISOString(),
    legacy_extra: normalizeLegacyExtra(input.legacy_extra)
  };
}

function clampLimit(limit, fallback, max) {
  return Math.min(Math.max(Number.parseInt(String(limit), 10) || fallback, 1), max);
}

function toNullableString(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const normalized = String(value).trim();
  return normalized === '' ? null : normalized;
}

function toBooleanInt(value, fallback = 0) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return 1;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return 0;
  }
  return fallback;
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
