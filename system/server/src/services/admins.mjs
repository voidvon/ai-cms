import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { execute, queryAll, queryOne } from '../db.mjs';

const LOGIN_FAILURE_WINDOW_MS = 30 * 60 * 1000;
const LOGIN_LOCKOUT_MS = 30 * 60 * 1000;
const LOGIN_MAX_FAILURES = 5;

let loginAttemptSchemaEnsured = false;

export function authenticateAdmin(username, password, clientIp) {
  ensureAdminLoginAttemptSchema();
  purgeExpiredLoginAttempts();

  const normalizedUsername = normalizeLoginAttemptField(username, { fallback: '__EMPTY_USERNAME__' });
  const normalizedClientIp = normalizeLoginAttemptField(clientIp, { fallback: 'unknown' });
  const activeLock = getActiveLoginLock(normalizedUsername, normalizedClientIp);
  if (activeLock) {
    return buildLockedAuthResult(activeLock.locked_until);
  }

  const admin = queryOne(
    `
      SELECT id, username, password_hash, password_scheme, permission_flags
      FROM admins
      WHERE username = ?
    `,
    [String(username ?? '').trim()]
  );

  if (!admin) {
    return registerFailedLoginAttempt(normalizedUsername, normalizedClientIp);
  }

  const verified = verifyPassword(password, admin.password_hash, admin.password_scheme);
  if (!verified.valid) {
    return registerFailedLoginAttempt(normalizedUsername, normalizedClientIp);
  }

  if (verified.upgradedHash) {
    execute(
      `
        UPDATE admins
        SET password_hash = ?, password_scheme = 'scrypt'
        WHERE id = ?
      `,
      [verified.upgradedHash, admin.id]
    );
  }

  clearLoginAttemptState(normalizedUsername, normalizedClientIp);
  execute(
    `
      UPDATE admins
      SET last_login_at = datetime('now'), last_login_ip = ?
      WHERE id = ?
    `,
    [clientIp, admin.id]
  );

  return {
    ok: true,
    admin: {
      id: admin.id,
      username: admin.username,
      permissionFlags: admin.permission_flags
    }
  };
}

export function listAdminsAdmin() {
  return queryAll(
    `
      SELECT
        id,
        username,
        permission_flags,
        last_login_at,
        last_login_ip
      FROM admins
      ORDER BY id ASC
    `
  );
}

export function getAdminById(id) {
  return queryOne(
    `
      SELECT
        id,
        username,
        permission_flags,
        last_login_at,
        last_login_ip
      FROM admins
      WHERE id = ?
    `,
    [id]
  );
}

export function createAdmin(input) {
  const payload = normalizeAdminInput(input, { requirePassword: true });
  const result = execute(
    `
      INSERT INTO admins (
        username,
        password_hash,
        password_scheme,
        permission_flags
      ) VALUES (?, ?, 'legacy-md5-16', ?)
    `,
    [
      payload.username,
      createLegacyMd5Hash(payload.password),
      payload.permission_flags
    ]
  );

  return getAdminById(result.lastInsertRowid);
}

export function updateAdmin(id, input) {
  const existing = queryOne(
    `
      SELECT
        id,
        username,
        password_hash,
        password_scheme,
        permission_flags
      FROM admins
      WHERE id = ?
    `,
    [id]
  );
  if (!existing) {
    return null;
  }

  const payload = normalizeAdminInput({ ...existing, ...input }, { requirePassword: false });
  const password = String(input.password ?? '').trim();

  execute(
    `
      UPDATE admins
      SET
        username = ?,
        password_hash = ?,
        password_scheme = ?,
        permission_flags = ?
      WHERE id = ?
    `,
    [
      payload.username,
      password ? createLegacyMd5Hash(password) : existing.password_hash,
      password ? 'legacy-md5-16' : existing.password_scheme,
      payload.permission_flags,
      id
    ]
  );

  return getAdminById(id);
}

export function updateAdminPassword(id, password) {
  const existing = getAdminById(id);
  if (!existing) {
    return null;
  }

  const normalized = String(password ?? '').trim();
  if (!normalized) {
    throw new Error('password is required');
  }

  execute(
    `
      UPDATE admins
      SET
        password_hash = ?,
        password_scheme = 'legacy-md5-16'
      WHERE id = ?
    `,
    [createLegacyMd5Hash(normalized), id]
  );

  return getAdminById(id);
}

export function deleteAdmin(id) {
  const existing = getAdminById(id);
  if (!existing) {
    return null;
  }

  execute('DELETE FROM admins WHERE id = ?', [id]);
  return existing;
}

function ensureAdminLoginAttemptSchema() {
  if (loginAttemptSchemaEnsured) {
    return;
  }

  execute(`
    CREATE TABLE IF NOT EXISTS admin_login_attempts (
      id INTEGER PRIMARY KEY,
      username TEXT NOT NULL,
      client_ip TEXT NOT NULL,
      failed_count INTEGER NOT NULL DEFAULT 0,
      first_failed_at TEXT,
      last_failed_at TEXT,
      locked_until TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (username, client_ip)
    )
  `);
  execute(`
    CREATE INDEX IF NOT EXISTS idx_admin_login_attempts_locked_until
    ON admin_login_attempts(locked_until)
  `);
  loginAttemptSchemaEnsured = true;
}

function purgeExpiredLoginAttempts() {
  const now = Date.now();
  const cutoff = new Date(now - (LOGIN_FAILURE_WINDOW_MS + LOGIN_LOCKOUT_MS)).toISOString();
  execute(
    `
      DELETE FROM admin_login_attempts
      WHERE (locked_until IS NULL OR locked_until <= ?)
        AND (last_failed_at IS NULL OR last_failed_at <= ?)
    `,
    [new Date(now).toISOString(), cutoff]
  );
}

function getActiveLoginLock(username, clientIp) {
  const record = queryOne(
    `
      SELECT locked_until
      FROM admin_login_attempts
      WHERE username = ?
        AND client_ip = ?
      LIMIT 1
    `,
    [username, clientIp]
  );

  if (!record?.locked_until) {
    return null;
  }

  const lockedUntilTime = Date.parse(record.locked_until);
  if (!Number.isFinite(lockedUntilTime) || lockedUntilTime <= Date.now()) {
    execute(
      `
        UPDATE admin_login_attempts
        SET locked_until = NULL, failed_count = 0, first_failed_at = NULL, last_failed_at = NULL, updated_at = ?
        WHERE username = ?
          AND client_ip = ?
      `,
      [new Date().toISOString(), username, clientIp]
    );
    return null;
  }

  return { locked_until: new Date(lockedUntilTime).toISOString() };
}

function registerFailedLoginAttempt(username, clientIp) {
  const now = new Date();
  const nowIso = now.toISOString();
  const existing = queryOne(
    `
      SELECT id, failed_count, first_failed_at, last_failed_at
      FROM admin_login_attempts
      WHERE username = ?
        AND client_ip = ?
      LIMIT 1
    `,
    [username, clientIp]
  );

  const firstFailedAt = Date.parse(existing?.first_failed_at || '');
  const withinWindow = Number.isFinite(firstFailedAt) && now.getTime() - firstFailedAt < LOGIN_FAILURE_WINDOW_MS;
  const nextFailedCount = withinWindow ? Number(existing?.failed_count || 0) + 1 : 1;
  const nextFirstFailedAt = withinWindow ? existing.first_failed_at : nowIso;
  const lockedUntilIso = nextFailedCount >= LOGIN_MAX_FAILURES
    ? new Date(now.getTime() + LOGIN_LOCKOUT_MS).toISOString()
    : null;

  if (existing?.id) {
    execute(
      `
        UPDATE admin_login_attempts
        SET
          failed_count = ?,
          first_failed_at = ?,
          last_failed_at = ?,
          locked_until = ?,
          updated_at = ?
        WHERE id = ?
      `,
      [nextFailedCount, nextFirstFailedAt, nowIso, lockedUntilIso, nowIso, existing.id]
    );
  } else {
    execute(
      `
        INSERT INTO admin_login_attempts (
          username,
          client_ip,
          failed_count,
          first_failed_at,
          last_failed_at,
          locked_until,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [username, clientIp, nextFailedCount, nextFirstFailedAt, nowIso, lockedUntilIso, nowIso, nowIso]
    );
  }

  if (lockedUntilIso) {
    return buildLockedAuthResult(lockedUntilIso);
  }

  return {
    ok: false,
    code: 'INVALID_CREDENTIALS',
    message: '用户名或密码不正确'
  };
}

function clearLoginAttemptState(username, clientIp) {
  execute(
    `
      DELETE FROM admin_login_attempts
      WHERE username = ?
        AND client_ip = ?
    `,
    [username, clientIp]
  );
}

function buildLockedAuthResult(lockedUntilIso) {
  const lockedUntilTime = Date.parse(lockedUntilIso);
  const retryAfterSeconds = Math.max(1, Math.ceil((lockedUntilTime - Date.now()) / 1000));

  return {
    ok: false,
    code: 'LOGIN_LOCKED',
    lockedUntil: lockedUntilIso,
    retryAfterSeconds,
    message: '密码错误次数过多，请稍候再试'
  };
}

function normalizeLoginAttemptField(value, { fallback = '' } = {}) {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

function verifyPassword(password, hash, scheme) {
  if (scheme === 'legacy-md5-16') {
    const legacyHash = createHash('md5').update(password, 'utf8').digest('hex').slice(8, 24);
    if (legacyHash !== hash) {
      return { valid: false };
    }
    return { valid: true, upgradedHash: createScryptHash(password) };
  }

  if (scheme === 'scrypt') {
    const [saltPart, hashPart] = String(hash).split(':');
    if (!saltPart || !hashPart) {
      return { valid: false };
    }

    const salt = Buffer.from(saltPart, 'base64url');
    const expected = Buffer.from(hashPart, 'base64url');
    const actual = scryptSync(password, salt, expected.length);

    return {
      valid: timingSafeEqual(actual, expected)
    };
  }

  return { valid: false };
}

function createScryptHash(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `${salt.toString('base64url')}:${hash.toString('base64url')}`;
}

function createLegacyMd5Hash(password) {
  return createHash('md5').update(password, 'utf8').digest('hex').slice(8, 24);
}

function normalizeAdminInput(input, options = {}) {
  const username = String(input.username ?? '').trim();
  if (!username) {
    throw new Error('username is required');
  }

  const password = String(input.password ?? '').trim();
  if (options.requirePassword && !password) {
    throw new Error('password is required');
  }

  return {
    username,
    password,
    permission_flags: normalizePermissionFlags(input.permission_flags ?? input.flag)
  };
}

function normalizePermissionFlags(value) {
  const source = Array.isArray(value) ? value : String(value ?? '').split(',');
  const flags = [];
  for (const entry of source) {
    const normalized = String(entry ?? '').trim();
    if (!normalized) {
      continue;
    }
    const parsed = Number.parseInt(normalized, 10);
    if (Number.isNaN(parsed) || parsed <= 0) {
      continue;
    }
    const flag = String(parsed).padStart(2, '0');
    if (!flags.includes(flag)) {
      flags.push(flag);
    }
  }
  return flags.join(',');
}
