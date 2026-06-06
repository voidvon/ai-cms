import { randomUUID } from 'node:crypto';
import { execute, queryOne } from '../db.mjs';

const DEFAULT_TTL_DAYS = 7;

export function createAdminSession(adminId, ttlDays = DEFAULT_TTL_DAYS) {
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
        a.permission_flags
      FROM admin_sessions s
      JOIN admins a ON a.id = s.admin_id
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

  return session;
}

export function deleteAdminSession(token) {
  execute('DELETE FROM admin_sessions WHERE token = ?', [token]);
}

export function purgeExpiredAdminSessions() {
  execute(`DELETE FROM admin_sessions WHERE expires_at <= datetime('now')`);
}

function toIso(date) {
  return date.toISOString();
}
