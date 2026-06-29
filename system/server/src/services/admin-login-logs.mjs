import { execute, queryAll } from '../db.mjs';

let adminLoginLogSchemaEnsured = false;

export function ensureAdminLoginLogSchema() {
  if (adminLoginLogSchemaEnsured) {
    return;
  }

  execute(`
    CREATE TABLE IF NOT EXISTS admin_login_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id INTEGER,
      username TEXT NOT NULL DEFAULT '',
      client_ip TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      failure_code TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  execute(`
    CREATE INDEX IF NOT EXISTS idx_admin_login_logs_created_at
    ON admin_login_logs (created_at DESC, id DESC)
  `);

  execute(`
    CREATE INDEX IF NOT EXISTS idx_admin_login_logs_username
    ON admin_login_logs (username)
  `);

  execute(`
    CREATE INDEX IF NOT EXISTS idx_admin_login_logs_client_ip
    ON admin_login_logs (client_ip)
  `);

  execute(`
    CREATE INDEX IF NOT EXISTS idx_admin_login_logs_status
    ON admin_login_logs (status)
  `);

  adminLoginLogSchemaEnsured = true;
}

export function recordAdminLoginLog(input = {}) {
  ensureAdminLoginLogSchema();

  const status = normalizeStatus(input.status);
  if (!status) {
    return false;
  }

  execute(
    `
      INSERT INTO admin_login_logs (
        admin_id,
        username,
        client_ip,
        status,
        failure_code
      ) VALUES (?, ?, ?, ?, ?)
    `,
    [
      normalizeNullableInteger(input.adminId),
      normalizeText(input.username),
      normalizeText(input.clientIp),
      status,
      normalizeNullableText(input.failureCode)
    ]
  );

  return true;
}

export function listAdminLoginLogs(options = {}) {
  ensureAdminLoginLogSchema();

  const page = normalizePositiveInteger(options.page, 1);
  const limit = Math.min(normalizePositiveInteger(options.limit, 50), 200);
  const offset = (page - 1) * limit;
  const usernameKeyword = normalizeText(options.username);
  const ipKeyword = normalizeText(options.ip);
  const status = normalizeStatusFilter(options.status);
  const where = [];
  const params = [];

  if (usernameKeyword) {
    where.push('l.username LIKE ?');
    params.push(`%${usernameKeyword}%`);
  }

  if (ipKeyword) {
    where.push('l.client_ip LIKE ?');
    params.push(`%${ipKeyword}%`);
  }

  if (status !== 'all') {
    where.push('l.status = ?');
    params.push(status);
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const totalRow = queryAll(
    `SELECT COUNT(*) AS total FROM admin_login_logs l ${whereClause}`,
    params
  )[0] || { total: 0 };

  const items = queryAll(
    `
      SELECT
        l.id,
        l.admin_id,
        l.username,
        l.client_ip,
        l.status,
        l.failure_code,
        l.created_at
      FROM admin_login_logs l
      ${whereClause}
      ORDER BY datetime(l.created_at) DESC, l.id DESC
      LIMIT ? OFFSET ?
    `,
    [...params, limit, offset]
  ).map((item) => ({
    id: Number(item.id),
    admin_id: normalizeNullableInteger(item.admin_id),
    username: normalizeText(item.username),
    client_ip: normalizeText(item.client_ip),
    status: normalizeStatus(item.status),
    failure_code: normalizeNullableText(item.failure_code),
    created_at: normalizeText(item.created_at)
  }));

  return {
    items,
    pagination: {
      page,
      limit,
      total: Number(totalRow.total || 0)
    }
  };
}

function normalizeStatus(value) {
  return value === 'success' || value === 'failure' ? value : '';
}

function normalizeStatusFilter(value) {
  return value === 'success' || value === 'failure' ? value : 'all';
}

function normalizePositiveInteger(value, fallback) {
  const normalized = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(normalized) && normalized > 0 ? normalized : fallback;
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeNullableText(value) {
  const normalized = normalizeText(value);
  return normalized || null;
}

function normalizeNullableInteger(value) {
  const normalized = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(normalized) && normalized > 0 ? normalized : null;
}
