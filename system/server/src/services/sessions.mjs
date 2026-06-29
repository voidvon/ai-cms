import { randomUUID } from 'node:crypto';
import { execute, queryOne } from '../db.mjs';
import { ensureAdminGroupSchema, getDefaultAdminGroupId } from './admin-groups.mjs';

const DEFAULT_TTL_DAYS = 7;

export function createAdminSession(adminId, ttlDays = DEFAULT_TTL_DAYS) {
  ensureAdminGroupSchema();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);
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

export function getAdminSession(token) {
  ensureAdminGroupSchema();
  if (!token) {
    return null;
  }

  purgeExpiredAdminSessions();
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

  execute(
    `
      UPDATE admin_sessions
      SET last_seen_at = datetime('now')
      WHERE token = ?
    `,
    [token]
  );

  session.group_id = session.group_id || getDefaultAdminGroupId();
  session.group_code = session.group_code || 'super_admin';
  session.group_name = session.group_name || '超级管理员';

  return session;
}

export function deleteAdminSession(token) {
  ensureAdminGroupSchema();
  execute('DELETE FROM admin_sessions WHERE token = ?', [token]);
}

export function purgeExpiredAdminSessions() {
  ensureAdminGroupSchema();
  execute(`DELETE FROM admin_sessions WHERE expires_at <= datetime('now')`);
}

function toIso(date) {
  return date.toISOString();
}
