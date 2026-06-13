import { execute, getDb, queryAll, queryOne } from '../db.mjs';

let schemaEnsured = false;

export function ensureLanguagesSchema() {
  if (schemaEnsured) {
    return;
  }

  getDb().exec(`
    CREATE TABLE IF NOT EXISTS languages (
      id INTEGER PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      native_name TEXT,
      is_default INTEGER NOT NULL DEFAULT 0,
      is_enabled INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS language_sites (
      id INTEGER PRIMARY KEY,
      language_id INTEGER NOT NULL,
      host TEXT,
      path_prefix TEXT,
      output_dir TEXT,
      is_primary INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (language_id) REFERENCES languages(id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_languages_default
    ON languages(is_default)
    WHERE is_default = 1;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_language_sites_language_id
    ON language_sites(language_id);
  `);

  ensureDefaultLanguage();
  schemaEnsured = true;
}

export function listLanguages() {
  ensureLanguagesSchema();
  return queryAll(
    `
      SELECT
        l.id,
        l.code,
        l.name,
        l.native_name,
        l.is_default,
        l.is_enabled,
        l.sort_order,
        l.created_at,
        l.updated_at,
        ls.id AS site_id,
        ls.host,
        ls.path_prefix,
        ls.output_dir,
        ls.is_primary
      FROM languages l
      LEFT JOIN language_sites ls ON ls.language_id = l.id
      ORDER BY l.is_default DESC, l.sort_order ASC, l.id ASC
    `
  ).map(mapLanguageRow);
}

export function getLanguageById(id) {
  ensureLanguagesSchema();
  const row = queryOne(
    `
      SELECT
        l.id,
        l.code,
        l.name,
        l.native_name,
        l.is_default,
        l.is_enabled,
        l.sort_order,
        l.created_at,
        l.updated_at,
        ls.id AS site_id,
        ls.host,
        ls.path_prefix,
        ls.output_dir,
        ls.is_primary
      FROM languages l
      LEFT JOIN language_sites ls ON ls.language_id = l.id
      WHERE l.id = ?
    `,
    [id]
  );

  return row ? mapLanguageRow(row) : null;
}

export function getDefaultLanguage() {
  ensureLanguagesSchema();
  const row = queryOne(
    `
      SELECT
        l.id,
        l.code,
        l.name,
        l.native_name,
        l.is_default,
        l.is_enabled,
        l.sort_order,
        l.created_at,
        l.updated_at,
        ls.id AS site_id,
        ls.host,
        ls.path_prefix,
        ls.output_dir,
        ls.is_primary
      FROM languages l
      LEFT JOIN language_sites ls ON ls.language_id = l.id
      WHERE l.is_default = 1
      LIMIT 1
    `
  );

  return row ? mapLanguageRow(row) : null;
}

export function createLanguage(input) {
  ensureLanguagesSchema();
  const payload = normalizeLanguageInput(input, { isCreate: true });
  const now = new Date().toISOString();

  if (payload.is_default) {
    execute('UPDATE languages SET is_default = 0');
  }

  const result = execute(
    `
      INSERT INTO languages (
        code,
        name,
        native_name,
        is_default,
        is_enabled,
        sort_order,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      payload.code,
      payload.name,
      payload.native_name,
      payload.is_default,
      payload.is_enabled,
      payload.sort_order,
      now,
      now
    ]
  );

  upsertLanguageSite(result.lastInsertRowid, payload.site, now);
  return getLanguageById(result.lastInsertRowid);
}

export function updateLanguage(id, input) {
  ensureLanguagesSchema();
  const existing = getLanguageById(id);
  if (!existing) {
    return null;
  }

  const payload = normalizeLanguageInput({ ...existing, ...input, site: { ...existing.site, ...(input?.site || {}) } });
  const now = new Date().toISOString();

  if (payload.is_default) {
    execute('UPDATE languages SET is_default = 0 WHERE id <> ?', [id]);
  } else if (existing.is_default && !payload.is_default) {
    throw new Error('必须保留一个默认语言');
  }

  execute(
    `
      UPDATE languages
      SET
        code = ?,
        name = ?,
        native_name = ?,
        is_default = ?,
        is_enabled = ?,
        sort_order = ?,
        updated_at = ?
      WHERE id = ?
    `,
    [
      payload.code,
      payload.name,
      payload.native_name,
      payload.is_default,
      payload.is_enabled,
      payload.sort_order,
      now,
      id
    ]
  );

  upsertLanguageSite(id, payload.site, now);
  return getLanguageById(id);
}

export function deleteLanguage(id) {
  ensureLanguagesSchema();
  const existing = getLanguageById(id);
  if (!existing) {
    return null;
  }
  if (Number(existing.is_default || 0) === 1) {
    throw new Error('默认语言不能删除');
  }

  execute('DELETE FROM languages WHERE id = ?', [id]);
  return existing;
}

function ensureDefaultLanguage() {
  const existingDefault = queryOne('SELECT id FROM languages WHERE is_default = 1 LIMIT 1');
  if (existingDefault) {
    return;
  }

  const now = new Date().toISOString();
  const result = execute(
    `
      INSERT INTO languages (
        code,
        name,
        native_name,
        is_default,
        is_enabled,
        sort_order,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, 1, 1, 0, ?, ?)
    `,
    ['zh-CN', '简体中文', '简体中文', now, now]
  );

  execute(
    `
      INSERT INTO language_sites (
        language_id,
        host,
        path_prefix,
        output_dir,
        is_primary,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, 1, ?, ?)
    `,
    [result.lastInsertRowid, null, '/', 'html', now, now]
  );
}

function upsertLanguageSite(languageId, site, now = new Date().toISOString()) {
  const normalizedSite = normalizeSiteInput(site);
  const existing = queryOne('SELECT id FROM language_sites WHERE language_id = ? LIMIT 1', [languageId]);

  if (!existing) {
    execute(
      `
        INSERT INTO language_sites (
          language_id,
          host,
          path_prefix,
          output_dir,
          is_primary,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        languageId,
        normalizedSite.host,
        normalizedSite.path_prefix,
        normalizedSite.output_dir,
        normalizedSite.is_primary,
        now,
        now
      ]
    );
    return;
  }

  execute(
    `
      UPDATE language_sites
      SET
        host = ?,
        path_prefix = ?,
        output_dir = ?,
        is_primary = ?,
        updated_at = ?
      WHERE language_id = ?
    `,
    [
      normalizedSite.host,
      normalizedSite.path_prefix,
      normalizedSite.output_dir,
      normalizedSite.is_primary,
      now,
      languageId
    ]
  );
}

function normalizeLanguageInput(input, { isCreate = false } = {}) {
  const code = String(input?.code ?? '').trim();
  const name = String(input?.name ?? '').trim();
  if (!code) {
    throw new Error('语言代码不能为空');
  }
  if (!/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(code)) {
    throw new Error('语言代码格式不正确');
  }
  if (!name) {
    throw new Error('语言名称不能为空');
  }

  return {
    code,
    name,
    native_name: toNullableString(input?.native_name),
    is_default: toBooleanInt(input?.is_default),
    is_enabled: isCreate && input?.is_enabled === undefined ? 1 : toBooleanInt(input?.is_enabled),
    sort_order: toInteger(input?.sort_order, 0),
    site: input?.site || {}
  };
}

function normalizeSiteInput(input) {
  const pathPrefix = normalizePathPrefix(input?.path_prefix);
  const outputDir = toNullableString(input?.output_dir) || deriveOutputDir(pathPrefix);

  return {
    host: toNullableString(input?.host),
    path_prefix: pathPrefix,
    output_dir: outputDir,
    is_primary: toBooleanInt(input?.is_primary ?? 1)
  };
}

function normalizePathPrefix(value) {
  const normalized = String(value ?? '').trim();
  if (normalized === '' || normalized === '/') {
    return '/';
  }
  const withSlash = normalized.startsWith('/') ? normalized : `/${normalized}`;
  return withSlash.replace(/\/+$/, '');
}

function deriveOutputDir(pathPrefix) {
  if (pathPrefix === '/') {
    return 'html';
  }
  return `html${pathPrefix}`;
}

function mapLanguageRow(row) {
  return {
    id: Number(row.id),
    code: row.code,
    name: row.name,
    native_name: row.native_name || '',
    is_default: Number(row.is_default || 0),
    is_enabled: Number(row.is_enabled || 0),
    sort_order: Number(row.sort_order || 0),
    created_at: row.created_at,
    updated_at: row.updated_at,
    site: {
      id: row.site_id ? Number(row.site_id) : null,
      host: row.host || '',
      path_prefix: row.path_prefix || '/',
      output_dir: row.output_dir || '',
      is_primary: Number(row.is_primary || 0)
    }
  };
}

function toNullableString(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const normalized = String(value).trim();
  return normalized === '' ? null : normalized;
}

function toBooleanInt(value) {
  if (value === true || value === 'true' || value === '1' || value === 1) {
    return 1;
  }
  return 0;
}

function toInteger(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}
