import { execute, getDb, queryAll, queryOne } from '../db.mjs';
import { getDefaultLanguage, listLanguages } from './languages.mjs';

let schemaEnsured = false;

export function ensureTopicProfilesSchema() {
  if (schemaEnsured) {
    return;
  }

  getDb().exec(`
    CREATE TABLE IF NOT EXISTS topic_profiles (
      id INTEGER PRIMARY KEY,
      column_id INTEGER NOT NULL,
      language_id INTEGER NOT NULL,
      seo_title TEXT NOT NULL DEFAULT '',
      intro_html TEXT NOT NULL DEFAULT '',
      topic_keyword TEXT NOT NULL DEFAULT '',
      related_content_json TEXT NOT NULL DEFAULT '[]',
      publish_status TEXT NOT NULL DEFAULT 'draft',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (language_id) REFERENCES languages(id) ON DELETE CASCADE,
      UNIQUE(column_id, language_id)
    );
    CREATE INDEX IF NOT EXISTS idx_topic_profiles_column_id ON topic_profiles(column_id);
    CREATE INDEX IF NOT EXISTS idx_topic_profiles_language_id ON topic_profiles(language_id);
    CREATE INDEX IF NOT EXISTS idx_topic_profiles_sort ON topic_profiles(sort_order, id);
  `);
  addColumnIfMissing('topic_profiles', 'publish_status', "TEXT NOT NULL DEFAULT 'draft'");
  getDb().exec(`
    UPDATE topic_profiles
    SET publish_status = 'draft'
    WHERE publish_status IS NULL OR trim(publish_status) = '';
  `);

  schemaEnsured = true;
}

export function listTopicProfiles({ languageCode = null } = {}) {
  ensureTopicProfilesSchema();
  const language = resolveLanguage(languageCode);
  const rows = queryAll(`
    SELECT
      p.*,
      l.code AS profile_language_code,
      c.parent_id,
      c.dir_name,
      c.route_path,
      c.column_type,
      p.publish_status,
      ct.name AS column_name
    FROM topic_profiles p
    JOIN languages l ON l.id = p.language_id
    JOIN columns c ON c.id = p.column_id
    LEFT JOIN column_translations ct
      ON ct.column_id = c.id AND ct.language_id = ?
    ORDER BY p.sort_order ASC, c.sort_order ASC, p.id ASC
  `, [language.id]);
  return hydrateTopicProfileRows(rows, language);
}

export function getTopicProfileByColumnId(columnId, { languageCode = null } = {}) {
  ensureTopicProfilesSchema();
  const normalizedColumnId = toInteger(columnId, 0);
  if (normalizedColumnId <= 0) {
    return null;
  }
  const language = resolveLanguage(languageCode);
  const rows = queryAll(`
    SELECT
      p.*,
      l.code AS profile_language_code,
      c.parent_id,
      c.dir_name,
      c.route_path,
      c.column_type,
      p.publish_status,
      ct.name AS column_name
    FROM topic_profiles p
    JOIN languages l ON l.id = p.language_id
    JOIN columns c ON c.id = p.column_id
    LEFT JOIN column_translations ct
      ON ct.column_id = c.id AND ct.language_id = ?
    WHERE p.column_id = ?
    ORDER BY p.id ASC
  `, [language.id, normalizedColumnId]);
  return hydrateTopicProfileRows(rows, language)[0] || null;
}

export function saveTopicProfile(columnId, input = {}, { languageCode = null } = {}) {
  ensureTopicProfilesSchema();
  const normalizedColumnId = toInteger(columnId, 0);
  if (normalizedColumnId <= 0) {
    throw new Error('栏目 ID 无效');
  }
  const language = resolveLanguage(languageCode);

  const column = queryOne('SELECT id FROM columns WHERE id = ?', [normalizedColumnId]);
  if (!column) {
    throw new Error('栏目不存在');
  }

  const language = resolveLanguage(languageCode);
  const payload = normalizeTopicProfileInput(input);
  execute(`
    INSERT INTO topic_profiles (
      column_id,
      language_id,
      seo_title,
      intro_html,
      topic_keyword,
      related_content_json,
      publish_status,
      sort_order,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(column_id, language_id) DO UPDATE SET
      seo_title = excluded.seo_title,
      intro_html = excluded.intro_html,
      topic_keyword = excluded.topic_keyword,
      related_content_json = excluded.related_content_json,
      publish_status = excluded.publish_status,
      sort_order = excluded.sort_order,
      updated_at = CURRENT_TIMESTAMP
  `, [
    normalizedColumnId,
    language.id,
    payload.seo_title,
    payload.intro_html,
    payload.topic_keyword,
    payload.related_content_json,
    payload.publish_status,
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

export function deleteTopicProfileForLanguage(columnId, { languageCode = null } = {}) {
  ensureTopicProfilesSchema();
  const normalizedColumnId = toInteger(columnId, 0);
  if (normalizedColumnId <= 0) {
    return false;
  }
  const language = resolveLanguage(languageCode);
  const result = execute('DELETE FROM topic_profiles WHERE column_id = ? AND language_id = ?', [normalizedColumnId, language.id]);
  return result.changes > 0;
}

function normalizeTopicProfileInput(input) {
  return {
    seo_title: normalizeText(input.seo_title),
    intro_html: normalizeHtmlText(input.intro_html),
    topic_keyword: normalizeText(input.topic_keyword),
    related_content_json: normalizeJsonText(input.related_content_json, '[]'),
    publish_status: normalizePublishStatus(input.publish_status),
    sort_order: toInteger(input.sort_order, 0)
  };
}

function mapTopicProfileRow(row) {
  return {
    id: toInteger(row.id, 0),
    column_id: toInteger(row.column_id, 0),
    language_id: toInteger(row.language_id, 0),
    language_code: row.profile_language_code || '',
    column_name: String(row.column_name || ''),
    parent_id: row.parent_id == null ? null : toInteger(row.parent_id, 0),
    dir_name: row.dir_name || null,
    route_path: row.route_path || null,
    column_type: row.column_type || '',
    seo_title: row.seo_title || '',
    intro_html: row.intro_html || '',
    topic_keyword: row.topic_keyword || '',
    related_content_json: row.related_content_json || '[]',
    publish_status: normalizePublishStatus(row.publish_status),
    sort_order: toInteger(row.sort_order, 0),
    created_at: row.created_at || '',
    updated_at: row.updated_at || '',
    current_language_code: row.profile_language_code || '',
    requested_language_code: row.requested_language_code || '',
    fallback_language_code: row.fallback_language_code || null,
    is_language_fallback: row.is_language_fallback || 0
  };
}

function hydrateTopicProfileRows(rows, language) {
  const byColumnId = new Map();
  for (const row of rows) {
    const columnId = toInteger(row.column_id, 0);
    const list = byColumnId.get(columnId) || [];
    list.push(row);
    byColumnId.set(columnId, list);
  }

  return Array.from(byColumnId.values()).map((group) => {
    const selected = group.find((row) => toInteger(row.language_id, 0) === language.id);
    const fallback = selected
      || group.find((row) => toInteger(row.language_id, 0) === language.defaultId)
      || group[0]
      || null;
    if (!fallback) {
      return null;
    }
    return mapTopicProfileRow({
      ...fallback,
      requested_language_code: language.code,
      fallback_language_code: toInteger(fallback.language_id, 0) !== language.id ? fallback.profile_language_code : null,
      is_language_fallback: toInteger(fallback.language_id, 0) !== language.id ? 1 : 0
    });
  }).filter(Boolean);
}

function resolveLanguage(languageCode) {
  const normalized = normalizeText(languageCode);
  const defaultLanguage = getDefaultLanguage();
  if (normalized) {
    const exact = queryOne('SELECT id, code FROM languages WHERE code = ?', [normalized]);
    if (exact) {
      return {
        ...exact,
        defaultId: defaultLanguage?.id || exact.id,
        defaultCode: defaultLanguage?.code || exact.code
      };
    }
  }
  const fallback = defaultLanguage
    || listLanguages()[0]
    || { id: 1, code: 'zh-CN' };
  return {
    id: fallback.id,
    code: fallback.code,
    defaultId: defaultLanguage?.id || fallback.id,
    defaultCode: defaultLanguage?.code || fallback.code
  };
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

function normalizeHtmlText(value) {
  return String(value ?? '').trim();
}

function normalizePublishStatus(value) {
  return String(value || '').trim() === 'published' ? 'published' : 'draft';
}

function toInteger(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function addColumnIfMissing(tableName, columnName, definition) {
  const columns = getDb().prepare(`PRAGMA table_info(${tableName})`).all();
  if (!columns.some((column) => column.name === columnName)) {
    getDb().exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}
