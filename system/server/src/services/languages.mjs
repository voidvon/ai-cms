import { HOST, PORT } from '../config.mjs';
import { execute, getDb, queryAll, queryOne } from '../db.mjs';

const SITE_MODE_SUBDIR = 'subdir';
const SITE_MODE_STANDALONE = 'standalone';
const SITE_MODE_VALUES = new Set([SITE_MODE_SUBDIR, SITE_MODE_STANDALONE]);

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
      site_mode TEXT NOT NULL DEFAULT 'subdir',
      access_port INTEGER,
      bind_host TEXT,
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

  addColumnIfMissing('language_sites', 'site_mode', "TEXT NOT NULL DEFAULT 'subdir'");
  addColumnIfMissing('language_sites', 'access_port', 'INTEGER');
  addColumnIfMissing('language_sites', 'bind_host', 'TEXT');
  execute("UPDATE language_sites SET site_mode = 'subdir' WHERE site_mode IS NULL OR TRIM(site_mode) = ''");

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
        ls.site_mode,
        ls.access_port,
        ls.bind_host,
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
        ls.site_mode,
        ls.access_port,
        ls.bind_host,
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
        ls.site_mode,
        ls.access_port,
        ls.bind_host,
        ls.is_primary
      FROM languages l
      LEFT JOIN language_sites ls ON ls.language_id = l.id
      WHERE l.is_default = 1
      LIMIT 1
    `
  );

  return row ? mapLanguageRow(row) : null;
}

export function hasMultipleEnabledLanguages() {
  return listLanguages().filter((language) => Number(language.is_enabled || 0) === 1).length > 1;
}

export function listStandaloneLanguageSites() {
  return listLanguages().filter((language) => (
    Number(language.is_enabled || 0) === 1
    && language?.site?.site_mode === SITE_MODE_STANDALONE
    && Number(language?.site?.access_port || 0) > 0
  ));
}

export function createLanguage(input) {
  ensureLanguagesSchema();
  const payload = normalizeLanguageInput(input, { isCreate: true });
  validateLanguageSiteConfig(payload);
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

  const payload = normalizeLanguageInput(
    { ...existing, ...input, site: { ...existing.site, ...(input?.site || {}) } },
    { isCreate: false }
  );
  validateLanguageSiteConfig(payload, { currentLanguageId: id });
  const now = new Date().toISOString();

  if (payload.is_default) {
    execute('UPDATE languages SET is_default = 0 WHERE id <> ?', [id]);
  } else if (existing.is_default && !payload.is_default) {
    throw new Error('必须保留一个默认语言');
  }

  if (!payload.is_enabled) {
    if (Number(existing.is_default || 0) === 1) {
      throw new Error('默认语言不能停用');
    }
    ensureAtLeastOneEnabledLanguage(id);
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

export function deriveLanguageSiteOutputDir({ siteMode = SITE_MODE_SUBDIR, pathPrefix = '/', languageCode = '' } = {}) {
  const normalizedPathPrefix = normalizePathPrefix(pathPrefix);
  if (siteMode === SITE_MODE_STANDALONE) {
    return `html_${buildStandaloneOutputSuffix(languageCode)}`;
  }

  if (normalizedPathPrefix === '/') {
    return 'html';
  }

  return `html${normalizedPathPrefix}`;
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
        site_mode,
        access_port,
        bind_host,
        is_primary,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `,
    [result.lastInsertRowid, null, '/', 'html', SITE_MODE_SUBDIR, null, null, now, now]
  );
}

function upsertLanguageSite(languageId, site, now = new Date().toISOString()) {
  const normalizedSite = normalizeSiteInput(site, { languageCode: site?.language_code || '', isDefault: site?.is_default === 1 });
  const existing = queryOne('SELECT id FROM language_sites WHERE language_id = ? LIMIT 1', [languageId]);

  if (!existing) {
    execute(
      `
        INSERT INTO language_sites (
          language_id,
          host,
          path_prefix,
          output_dir,
          site_mode,
          access_port,
          bind_host,
          is_primary,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        languageId,
        normalizedSite.host,
        normalizedSite.path_prefix,
        normalizedSite.output_dir,
        normalizedSite.site_mode,
        normalizedSite.access_port,
        normalizedSite.bind_host,
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
        site_mode = ?,
        access_port = ?,
        bind_host = ?,
        is_primary = ?,
        updated_at = ?
      WHERE language_id = ?
    `,
    [
      normalizedSite.host,
      normalizedSite.path_prefix,
      normalizedSite.output_dir,
      normalizedSite.site_mode,
      normalizedSite.access_port,
      normalizedSite.bind_host,
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

  const isDefault = toBooleanInt(input?.is_default);

  return {
    code,
    name,
    native_name: toNullableString(input?.native_name),
    is_default: isDefault,
    is_enabled: isCreate && input?.is_enabled === undefined ? 1 : toBooleanInt(input?.is_enabled),
    sort_order: toInteger(input?.sort_order, 0),
    site: normalizeSiteInput(input?.site || {}, { languageCode: code, isDefault })
  };
}

function normalizeSiteInput(input, { languageCode = '', isDefault = 0 } = {}) {
  const explicitSiteMode = normalizeSiteMode(input?.site_mode);
  const siteMode = resolveEffectiveSiteMode(input, explicitSiteMode);
  const pathPrefix = siteMode === SITE_MODE_STANDALONE ? '/' : normalizePathPrefix(input?.path_prefix);
  const accessPort = siteMode === SITE_MODE_STANDALONE ? normalizePort(input?.access_port) : null;
  const bindHost = siteMode === SITE_MODE_STANDALONE ? normalizeBindHost(input?.bind_host) : null;

  return {
    host: toNullableString(input?.host),
    path_prefix: pathPrefix,
    output_dir: normalizeOutputDir(input?.output_dir) || deriveLanguageSiteOutputDir({ siteMode, pathPrefix, languageCode }),
    site_mode: siteMode,
    access_port: accessPort,
    bind_host: bindHost,
    is_primary: toBooleanInt(input?.is_primary ?? 1),
    language_code: languageCode,
    is_default: isDefault
  };
}

function validateLanguageSiteConfig(payload, { currentLanguageId = null } = {}) {
  const site = payload.site || {};
  if (site.site_mode === SITE_MODE_STANDALONE) {
    if (isRootStandaloneSite(site)) {
      return;
    }
    if (!String(site.host || '').trim()) {
      throw new Error('独立站点必须配置正式域名');
    }
    if (!site.access_port) {
      throw new Error('独立站点必须配置访问端口');
    }
    if (site.access_port === PORT) {
      throw new Error(`独立站点端口不能与主站端口 ${PORT} 冲突`);
    }

    const conflict = queryOne(
      `
        SELECT l.code
        FROM language_sites ls
        INNER JOIN languages l ON l.id = ls.language_id
        WHERE ls.site_mode = ?
          AND ls.access_port = ?
          AND l.id <> ?
        LIMIT 1
      `,
      [SITE_MODE_STANDALONE, site.access_port, currentLanguageId || 0]
    );

    if (conflict) {
      throw new Error(`端口 ${site.access_port} 已被语言 ${conflict.code} 使用`);
    }
  }
}

function isRootStandaloneSite(site) {
  return normalizeOutputDir(site?.output_dir) === 'html'
    && normalizePathPrefix(site?.path_prefix) === '/';
}

function ensureAtLeastOneEnabledLanguage(currentLanguageId) {
  const anotherEnabled = queryOne(
    `
      SELECT id
      FROM languages
      WHERE id <> ?
        AND is_enabled = 1
      LIMIT 1
    `,
    [currentLanguageId]
  );

  if (!anotherEnabled) {
    throw new Error('至少需要保留一个启用语言');
  }
}

function normalizeSiteMode(value) {
  const normalized = String(value || SITE_MODE_SUBDIR).trim().toLowerCase();
  if (!SITE_MODE_VALUES.has(normalized)) {
    throw new Error('站点模式不正确');
  }
  return normalized;
}

function resolveEffectiveSiteMode(input, fallbackMode = SITE_MODE_SUBDIR) {
  const outputDir = String(input?.output_dir || '').trim().replace(/\\/g, '/').replace(/\/+$/g, '');
  const pathPrefix = normalizePathPrefix(input?.path_prefix);
  if (fallbackMode === SITE_MODE_SUBDIR && outputDir === 'html' && pathPrefix === '/') {
    return SITE_MODE_STANDALONE;
  }
  return fallbackMode;
}

function normalizePathPrefix(value) {
  const normalized = String(value ?? '').trim();
  if (normalized === '' || normalized === '/') {
    return '/';
  }
  const withSlash = normalized.startsWith('/') ? normalized : `/${normalized}`;
  return withSlash.replace(/\/+$/, '');
}

function normalizeOutputDir(value) {
  const normalized = String(value || '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (!normalized || normalized.includes('..')) {
    return '';
  }
  return normalized;
}

function normalizePort(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return null;
  }

  const parsed = Number.parseInt(String(value).trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error('站点访问端口必须是 1-65535 之间的整数');
  }
  return parsed;
}

function normalizeBindHost(value) {
  return toNullableString(value) || HOST;
}

function buildStandaloneOutputSuffix(languageCode) {
  const normalized = String(languageCode || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return normalized || 'site';
}

function mapLanguageRow(row) {
  const pathPrefix = row.path_prefix || '/';
  const siteMode = resolveEffectiveSiteMode(
    {
      site_mode: row.site_mode,
      output_dir: row.output_dir,
      path_prefix: pathPrefix
    },
    normalizeSiteMode(row.site_mode || SITE_MODE_SUBDIR)
  );
  const outputDir = row.output_dir || deriveLanguageSiteOutputDir({
    siteMode,
    pathPrefix,
    languageCode: row.code
  });

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
      path_prefix: pathPrefix,
      output_dir: outputDir,
      site_mode: siteMode,
      access_port: row.access_port ? Number(row.access_port) : null,
      bind_host: row.bind_host || '',
      is_primary: Number(row.is_primary || 0)
    }
  };
}

function addColumnIfMissing(tableName, columnName, definition) {
  const columns = new Set(queryAll(`PRAGMA table_info(${tableName})`).map((column) => String(column.name || '')));
  if (columns.has(columnName)) {
    return;
  }
  getDb().exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
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
