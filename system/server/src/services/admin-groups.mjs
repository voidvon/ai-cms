import { execute, getDb, queryAll, queryOne } from '../db.mjs';
import { ALL_ADMIN_PERMISSION_FLAGS, normalizePermissionFlags } from './admin-permissions.mjs';

const DEFAULT_ADMIN_GROUP = {
  id: 1,
  code: 'super_admin',
  name: '超级管理员',
  permission_flags: ALL_ADMIN_PERMISSION_FLAGS
};

let adminGroupSchemaEnsured = false;

export function ensureAdminGroupSchema() {
  if (adminGroupSchemaEnsured) {
    return;
  }

  execute(`
    CREATE TABLE IF NOT EXISTS admin_groups (
      id INTEGER PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL UNIQUE,
      permission_flags TEXT NOT NULL DEFAULT '',
      is_system INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  ensureAdminGroupsPermissionFlagsColumn();

  seedDefaultAdminGroup();

  if (tableExists('admins')) {
    ensureAdminsGroupColumn();
    execute('UPDATE admins SET group_id = ? WHERE group_id IS NULL OR group_id <= 0', [DEFAULT_ADMIN_GROUP.id]);
    execute('CREATE INDEX IF NOT EXISTS idx_admins_group_id ON admins(group_id)');
  }

  adminGroupSchemaEnsured = true;
}

export function listAdminGroups() {
  ensureAdminGroupSchema();
  return queryAll(
    `
      SELECT
        g.id,
        g.code,
        g.name,
        g.permission_flags,
        g.is_system,
        g.created_at,
        g.updated_at,
        COUNT(a.id) AS member_count
      FROM admin_groups g
      LEFT JOIN admins a ON a.group_id = g.id
      GROUP BY g.id, g.code, g.name, g.permission_flags, g.is_system, g.created_at, g.updated_at
      ORDER BY g.id ASC
    `
  );
}

export function getAdminGroupById(id) {
  ensureAdminGroupSchema();
  return queryOne(
    `
      SELECT
        g.id,
        g.code,
        g.name,
        g.permission_flags,
        g.is_system,
        g.created_at,
        g.updated_at,
        COUNT(a.id) AS member_count
      FROM admin_groups g
      LEFT JOIN admins a ON a.group_id = g.id
      WHERE g.id = ?
      GROUP BY g.id, g.code, g.name, g.permission_flags, g.is_system, g.created_at, g.updated_at
    `,
    [id]
  );
}

export function getDefaultAdminGroupId() {
  ensureAdminGroupSchema();
  return DEFAULT_ADMIN_GROUP.id;
}

export function createAdminGroup(input) {
  ensureAdminGroupSchema();
  const payload = normalizeAdminGroupInput(input, { requireCode: true });
  const result = execute(
    `
      INSERT INTO admin_groups (
        code,
        name,
        permission_flags,
        is_system
      ) VALUES (?, ?, ?, 0)
    `,
    [payload.code, payload.name, payload.permission_flags]
  );

  return getAdminGroupById(result.lastInsertRowid);
}

export function updateAdminGroup(id, input) {
  ensureAdminGroupSchema();
  const existing = getAdminGroupById(id);
  if (!existing) {
    return null;
  }

  const payload = normalizeAdminGroupInput({ ...existing, ...input }, { requireCode: true });
  execute(
    `
      UPDATE admin_groups
      SET
        code = ?,
        name = ?,
        permission_flags = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [payload.code, payload.name, payload.permission_flags, id]
  );

  return getAdminGroupById(id);
}

export function deleteAdminGroup(id) {
  ensureAdminGroupSchema();
  const existing = getAdminGroupById(id);
  if (!existing) {
    return null;
  }

  if (existing.is_system) {
    const error = new Error('系统默认用户组不允许删除');
    error.code = 'SYSTEM_GROUP_DELETE_FORBIDDEN';
    throw error;
  }

  const memberCount = Number.parseInt(String(existing.member_count ?? 0), 10) || 0;
  if (memberCount > 0) {
    const error = new Error('该用户组下仍有管理员，无法删除');
    error.code = 'GROUP_HAS_MEMBERS';
    throw error;
  }

  execute('DELETE FROM admin_groups WHERE id = ?', [id]);
  return existing;
}

function seedDefaultAdminGroup() {
  execute(
    `
      INSERT INTO admin_groups (id, code, name, permission_flags, is_system)
      VALUES (?, ?, ?, ?, 1)
      ON CONFLICT(id) DO UPDATE SET
        code = excluded.code,
        name = excluded.name,
        permission_flags = excluded.permission_flags,
        is_system = 1,
        updated_at = CURRENT_TIMESTAMP
    `,
    [
      DEFAULT_ADMIN_GROUP.id,
      DEFAULT_ADMIN_GROUP.code,
      DEFAULT_ADMIN_GROUP.name,
      DEFAULT_ADMIN_GROUP.permission_flags
    ]
  );
}

function ensureAdminsGroupColumn() {
  if (!columnExists('admins', 'group_id')) {
    execute('ALTER TABLE admins ADD COLUMN group_id INTEGER NOT NULL DEFAULT 1');
  }
}

function ensureAdminGroupsPermissionFlagsColumn() {
  if (!columnExists('admin_groups', 'permission_flags')) {
    execute("ALTER TABLE admin_groups ADD COLUMN permission_flags TEXT NOT NULL DEFAULT ''");
  }
}

function normalizeAdminGroupInput(input, options = {}) {
  const code = String(input.code ?? '').trim();
  const name = String(input.name ?? '').trim();

  if (options.requireCode && !code) {
    throw new Error('code is required');
  }

  if (!name) {
    throw new Error('name is required');
  }

  return {
    code,
    name,
    permission_flags: normalizePermissionFlags(input.permission_flags, { fallbackToAll: false })
  };
}

function tableExists(tableName) {
  return Boolean(
    queryOne(
      `
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name = ?
      `,
      [tableName]
    )
  );
}

function columnExists(tableName, columnName) {
  const columns = getDb().prepare(`PRAGMA table_info(${tableName})`).all();
  return columns.some((column) => column.name === columnName);
}
