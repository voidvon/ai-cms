import { randomUUID } from 'node:crypto';
import { execute, queryOne } from '../db.mjs';
import { ensureAdminGroupSchema, getDefaultAdminGroupId } from './admin-groups.mjs';

export const ADMIN_SESSION_IDLE_TTL_DAYS = 1;
export const ADMIN_SESSION_IDLE_TTL_SECONDS = ADMIN_SESSION_IDLE_TTL_DAYS * 24 * 60 * 60;
export const ADMIN_SESSION_MAX_TTL_DAYS = 7;
export const ADMIN_SESSION_MAX_TTL_SECONDS = ADMIN_SESSION_MAX_TTL_DAYS * 24 * 60 * 60;
export const ADMIN_SESSION_RENEW_INTERVAL_SECONDS = 5 * 60;

// 保留旧导出名，避免其它启动脚本或外部集成依赖固定会话时长常量。
export const ADMIN_SESSION_TTL_DAYS = ADMIN_SESSION_MAX_TTL_DAYS;
export const ADMIN_SESSION_TTL_SECONDS = ADMIN_SESSION_MAX_TTL_SECONDS;

export function createAdminSession(adminId, ttlDays = ADMIN_SESSION_MAX_TTL_DAYS) {
  ensureAdminGroupSchema();
  const now = new Date();
  const maxExpiresAt = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);
  const idleExpiresAt = new Date(now.getTime() + ADMIN_SESSION_IDLE_TTL_SECONDS * 1000);
  const expiresAt = new Date(Math.min(maxExpiresAt.getTime(), idleExpiresAt.getTime()));
  const token = randomUUID();

  execute(
    `
      INSERT INTO admin_sessions (token, admin_id, created_at, last_seen_at, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `,
    [token, adminId, toIso(now), toIso(now), toIso(expiresAt)]
  );

  return {
    token,
    expires_at: toIso(expiresAt)
  };
}

export function getAdminSession(token, now = new Date()) {
  ensureAdminGroupSchema();
  if (!token) {
    return null;
  }

  purgeExpiredAdminSessions(now);
  const session = queryOne(
    `
      SELECT
        s.token,
        s.admin_id,
        s.created_at,
        s.last_seen_at,
        s.expires_at,
        a.username,
        COALESCE(g.permission_flags, a.permission_flags, '') AS permission_flags,
        a.group_id,
        g.code AS group_code,
        g.name AS group_name
      FROM admin_sessions s
      JOIN admins a ON a.id = s.admin_id
      LEFT JOIN admin_groups g ON g.id = a.group_id
      WHERE s.token = ?
    `,
    [token]
  );

  if (!session) {
    return null;
  }

  const nowMs = now.getTime();
  const createdAtMs = parseTimestamp(session.created_at);
  const lastSeenAtMs = parseTimestamp(session.last_seen_at);
  const storedExpiresAtMs = parseTimestamp(session.expires_at);

  if (![createdAtMs, lastSeenAtMs, storedExpiresAtMs].every(Number.isFinite)) {
    return null;
  }

  const absoluteExpiresAtMs = createdAtMs + ADMIN_SESSION_MAX_TTL_SECONDS * 1000;
  const idleExpiresAtMs = lastSeenAtMs + ADMIN_SESSION_IDLE_TTL_SECONDS * 1000;
  const effectiveExpiresAtMs = Math.min(storedExpiresAtMs, absoluteExpiresAtMs, idleExpiresAtMs);

  if (effectiveExpiresAtMs <= nowMs) {
    execute('DELETE FROM admin_sessions WHERE token = ?', [token]);
    return null;
  }

  const nextExpiresAtMs = Math.min(
    absoluteExpiresAtMs,
    nowMs + ADMIN_SESSION_IDLE_TTL_SECONDS * 1000
  );
  const shouldRenew = (
    storedExpiresAtMs > nextExpiresAtMs
    || (
      nowMs - lastSeenAtMs >= ADMIN_SESSION_RENEW_INTERVAL_SECONDS * 1000
      && nextExpiresAtMs > storedExpiresAtMs
    )
  );

  if (shouldRenew) {
    const lastSeenAt = toIso(now);
    const expiresAt = toIso(new Date(nextExpiresAtMs));
    execute(
      `
        UPDATE admin_sessions
        SET last_seen_at = ?, expires_at = ?
        WHERE token = ?
      `,
      [lastSeenAt, expiresAt, token]
    );
    session.last_seen_at = lastSeenAt;
    session.expires_at = expiresAt;
  }

  session.group_id = session.group_id || getDefaultAdminGroupId();
  session.group_code = session.group_code || 'super_admin';
  session.group_name = session.group_name || '超级管理员';

  return session;
}

export function deleteAdminSession(token) {
  ensureAdminGroupSchema();
  execute('DELETE FROM admin_sessions WHERE token = ?', [token]);
}

export function purgeExpiredAdminSessions(now = new Date()) {
  ensureAdminGroupSchema();
  execute(
    `
      DELETE FROM admin_sessions
      WHERE julianday(expires_at) <= julianday(?)
    `,
    [toIso(now)]
  );
}

function parseTimestamp(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return NaN;
  }

  // SQLite's CURRENT_TIMESTAMP is UTC without a timezone marker.
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw);
  const normalized = hasTimezone ? raw : `${raw.replace(' ', 'T')}Z`;
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? timestamp : NaN;
}

function toIso(date) {
  return date.toISOString();
}
