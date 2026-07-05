import { execute, getDb, queryAll, queryOne } from '../db.mjs';

let schemaEnsured = false;

export function ensureTopicProfilesSchema() {
  if (schemaEnsured) {
    return;
  }

  getDb().exec(`
    CREATE TABLE IF NOT EXISTS topic_profiles (
      id INTEGER PRIMARY KEY,
      column_id INTEGER NOT NULL UNIQUE,
      topic_type TEXT NOT NULL DEFAULT '',
      primary_keyword TEXT NOT NULL DEFAULT '',
      keyword_group TEXT NOT NULL DEFAULT '',
      related_columns_json TEXT NOT NULL DEFAULT '[]',
      related_products_json TEXT NOT NULL DEFAULT '[]',
      related_resources_json TEXT NOT NULL DEFAULT '[]',
      related_articles_json TEXT NOT NULL DEFAULT '[]',
      module_config_json TEXT NOT NULL DEFAULT '{}',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_topic_profiles_column_id ON topic_profiles(column_id);
    CREATE INDEX IF NOT EXISTS idx_topic_profiles_sort ON topic_profiles(sort_order, id);
  `);

  schemaEnsured = true;
}

export function listTopicProfiles({ languageCode = null } = {}) {
  ensureTopicProfilesSchema();
  const language = resolveLanguage(languageCode);
  return queryAll(`
    SELECT
      p.*,
      c.parent_id,
      c.dir_name,
      c.route_path,
      c.column_type,
      ct.name AS column_name
    FROM topic_profiles p
    JOIN columns c ON c.id = p.column_id
    LEFT JOIN column_translations ct
      ON ct.column_id = c.id AND ct.language_id = ?
    ORDER BY p.sort_order ASC, c.sort_order ASC, p.id ASC
  `, [language.id]).map(mapTopicProfileRow);
}

export function getTopicProfileByColumnId(columnId, { languageCode = null } = {}) {
  ensureTopicProfilesSchema();
  const normalizedColumnId = toInteger(columnId, 0);
  if (normalizedColumnId <= 0) {
    return null;
  }
  const language = resolveLanguage(languageCode);
  const row = queryOne(`
    SELECT
      p.*,
      c.parent_id,
      c.dir_name,
      c.route_path,
      c.column_type,
      ct.name AS column_name
    FROM topic_profiles p
    JOIN columns c ON c.id = p.column_id
    LEFT JOIN column_translations ct
      ON ct.column_id = c.id AND ct.language_id = ?
    WHERE p.column_id = ?
  `, [language.id, normalizedColumnId]);
  return row ? mapTopicProfileRow(row) : null;
}

export function saveTopicProfile(columnId, input = {}, { languageCode = null } = {}) {
  ensureTopicProfilesSchema();
  const normalizedColumnId = toInteger(columnId, 0);
  if (normalizedColumnId <= 0) {
    throw new Error('栏目 ID 无效');
  }

  const column = queryOne('SELECT id FROM columns WHERE id = ?', [normalizedColumnId]);
  if (!column) {
    throw new Error('栏目不存在');
  }

  const payload = normalizeTopicProfileInput(input);
  execute(`
    INSERT INTO topic_profiles (
      column_id,
      topic_type,
      primary_keyword,
      keyword_group,
      related_columns_json,
      related_products_json,
      related_resources_json,
      related_articles_json,
      module_config_json,
      sort_order,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(column_id) DO UPDATE SET
      topic_type = excluded.topic_type,
      primary_keyword = excluded.primary_keyword,
      keyword_group = excluded.keyword_group,
      related_columns_json = excluded.related_columns_json,
      related_products_json = excluded.related_products_json,
      related_resources_json = excluded.related_resources_json,
      related_articles_json = excluded.related_articles_json,
      module_config_json = excluded.module_config_json,
      sort_order = excluded.sort_order,
      updated_at = CURRENT_TIMESTAMP
  `, [
    normalizedColumnId,
    payload.topic_type,
    payload.primary_keyword,
    payload.keyword_group,
    payload.related_columns_json,
    payload.related_products_json,
    payload.related_resources_json,
    payload.related_articles_json,
    payload.module_config_json,
    payload.sort_order
  ]);

  return getTopicProfileByColumnId(normalizedColumnId, { languageCode });
}

export function deleteTopicProfile(columnId) {
  ensureTopicProfilesSchema();
  const normalizedColumnId = toInteger(columnId, 0);
  if (normalizedColumnId <= 0) {
    return false;
  }
  const result = execute('DELETE FROM topic_profiles WHERE column_id = ?', [normalizedColumnId]);
  return result.changes > 0;
}

function normalizeTopicProfileInput(input) {
  return {
    topic_type: normalizeText(input.topic_type),
    primary_keyword: normalizeText(input.primary_keyword),
    keyword_group: normalizeText(input.keyword_group),
    related_columns_json: normalizeJsonText(input.related_columns_json, '[]'),
    related_products_json: normalizeJsonText(input.related_products_json, '[]'),
    related_resources_json: normalizeJsonText(input.related_resources_json, '[]'),
    related_articles_json: normalizeJsonText(input.related_articles_json, '[]'),
    module_config_json: normalizeJsonText(input.module_config_json, '{}'),
    sort_order: toInteger(input.sort_order, 0)
  };
}

function mapTopicProfileRow(row) {
  return {
    id: toInteger(row.id, 0),
    column_id: toInteger(row.column_id, 0),
    column_name: String(row.column_name || ''),
    parent_id: row.parent_id == null ? null : toInteger(row.parent_id, 0),
    dir_name: row.dir_name || null,
    route_path: row.route_path || null,
    column_type: row.column_type || '',
    topic_type: row.topic_type || '',
    primary_keyword: row.primary_keyword || '',
    keyword_group: row.keyword_group || '',
    related_columns_json: row.related_columns_json || '[]',
    related_products_json: row.related_products_json || '[]',
    related_resources_json: row.related_resources_json || '[]',
    related_articles_json: row.related_articles_json || '[]',
    module_config_json: row.module_config_json || '{}',
    sort_order: toInteger(row.sort_order, 0),
    created_at: row.created_at || '',
    updated_at: row.updated_at || ''
  };
}

function resolveLanguage(languageCode) {
  const normalized = normalizeText(languageCode);
  if (normalized) {
    const exact = queryOne('SELECT id, code FROM languages WHERE code = ?', [normalized]);
    if (exact) {
      return exact;
    }
  }
  return queryOne('SELECT id, code FROM languages WHERE is_default = 1 ORDER BY id ASC LIMIT 1')
    || queryOne('SELECT id, code FROM languages ORDER BY id ASC LIMIT 1')
    || { id: 1, code: 'zh-CN' };
}

function normalizeJsonText(value, fallback) {
  const text = normalizeText(value);
  if (!text) {
    return fallback;
  }
  try {
    JSON.parse(text);
    return text;
  } catch {
    throw new Error('JSON 格式无效');
  }
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function toInteger(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}
