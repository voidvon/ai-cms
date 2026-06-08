import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { execute, queryAll, queryOne } from '../db.mjs';

export function authenticateAdmin(username, password, clientIp) {
  const admin = queryOne(
    `
      SELECT id, username, password_hash, password_scheme, permission_flags
      FROM admins
      WHERE username = ?
    `,
    [username]
  );

  if (!admin) {
    return null;
  }

  const verified = verifyPassword(password, admin.password_hash, admin.password_scheme);
  if (!verified.valid) {
    return null;
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

  execute(
    `
      UPDATE admins
      SET last_login_at = datetime('now'), last_login_ip = ?
      WHERE id = ?
    `,
    [clientIp, admin.id]
  );

  return {
    id: admin.id,
    username: admin.username,
    permissionFlags: admin.permission_flags
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
        last_login_ip,
        legacy_extra
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
        last_login_ip,
        legacy_extra
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
        permission_flags,
        legacy_extra
      ) VALUES (?, ?, 'legacy-md5-16', ?, ?)
    `,
    [
      payload.username,
      createLegacyMd5Hash(payload.password),
      payload.permission_flags,
      null
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
        permission_flags,
        legacy_extra
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
