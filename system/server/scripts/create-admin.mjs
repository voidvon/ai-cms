import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync } from 'node:crypto';
import { DATABASE_PATH } from '../src/config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const [, , username, password, permissionFlags = '01,02,03,04,06,09,010'] = process.argv;

if (!username || !password) {
  console.error('Usage: node scripts/create-admin.mjs <username> <password> [permissionFlags]');
  process.exit(1);
}

const salt = randomBytes(16);
const hash = scryptSync(password, salt, 64);
const encodedHash = `${salt.toString('base64url')}:${hash.toString('base64url')}`;

const db = new DatabaseSync(DATABASE_PATH);
db.exec('PRAGMA foreign_keys = ON;');

db.prepare(`
  INSERT INTO admins (username, password_hash, password_scheme, permission_flags)
  VALUES (?, ?, 'scrypt', ?)
  ON CONFLICT(username) DO UPDATE SET
    password_hash = excluded.password_hash,
    password_scheme = excluded.password_scheme,
    permission_flags = excluded.permission_flags
`).run(username, encodedHash, permissionFlags);

db.close();
console.log(`Admin upserted: ${username}`);
