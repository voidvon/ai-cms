import { randomBytes, scryptSync } from 'node:crypto';
import { execute } from '../src/db.mjs';
import { ensureAdminGroupSchema, getDefaultAdminGroupId } from '../src/services/admin-groups.mjs';

const [, , username, password, permissionFlags = '01,02,03,04,06,09,010'] = process.argv;

if (!username || !password) {
  console.error('Usage: node scripts/create-admin.mjs <username> <password> [permissionFlags]');
  process.exit(1);
}

const salt = randomBytes(16);
const hash = scryptSync(password, salt, 64);
const encodedHash = `${salt.toString('base64url')}:${hash.toString('base64url')}`;
ensureAdminGroupSchema();
const defaultGroupId = getDefaultAdminGroupId();

execute(`
  INSERT INTO admins (username, password_hash, password_scheme, permission_flags, group_id)
  VALUES (?, ?, 'scrypt', ?, ?)
  ON CONFLICT(username) DO UPDATE SET
    password_hash = excluded.password_hash,
    password_scheme = excluded.password_scheme,
    permission_flags = excluded.permission_flags,
    group_id = excluded.group_id
`, [username, encodedHash, permissionFlags, defaultGroupId]);
console.log(`Admin upserted: ${username}`);
