import { execute, getDb, queryAll, queryOne } from '../db.mjs';
import { ensureLanguagesSchema, listLanguages } from './languages.mjs';

const DEFAULT_CATEGORIES = [
  { code: 'sales_brochure', sortOrder: 10, en: 'Sales brochures', zh: '销售手册' },
  { code: 'technical_information', sortOrder: 20, en: 'Technical information', zh: '技术资料' },
  { code: 'installation_guide', sortOrder: 30, en: 'Installation and maintenance', zh: '安装与维护' },
  { code: 'other_documents', sortOrder: 40, en: 'Other documents', zh: '其他文档' },
];

let schemaEnsured = false;

export function ensureMediaCategoriesSchema() {
  if (schemaEnsured) return;

  ensureLanguagesSchema();
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS media_categories (
      id INTEGER PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS media_category_translations (
      id INTEGER PRIMARY KEY,
      category_id INTEGER NOT NULL,
      language_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(category_id, language_id),
      FOREIGN KEY (category_id) REFERENCES media_categories(id) ON DELETE CASCADE,
      FOREIGN KEY (language_id) REFERENCES languages(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_media_categories_sort
    ON media_categories(is_enabled, sort_order, id);

    CREATE INDEX IF NOT EXISTS idx_media_category_translations_category
    ON media_category_translations(category_id, language_id);
  `);

  seedDefaultCategories();
  schemaEnsured = true;
}

export function listMediaCategories({ includeDisabled = true, languageCode } = {}) {
  ensureMediaCategoriesSchema();
  const whereSql = includeDisabled ? '' : 'WHERE c.is_enabled = 1';
  const categories = queryAll(`
    SELECT c.id, c.code, c.sort_order, c.is_enabled, c.created_at, c.updated_at
    FROM media_categories c
    ${whereSql}
    ORDER BY c.sort_order ASC, c.id ASC
  `).map(mapCategoryRow);
  return attachTranslations(categories, languageCode);
}

export function getMediaCategoryById(id, { languageCode } = {}) {
  ensureMediaCategoriesSchema();
  const row = queryOne(`
    SELECT id, code, sort_order, is_enabled, created_at, updated_at
    FROM media_categories
    WHERE id = ?
  `, [id]);
  if (!row) return null;
  return attachTranslations([mapCategoryRow(row)], languageCode)[0];
}

export function getMediaCategoryByCode(code, options = {}) {
  ensureMediaCategoriesSchema();
  const row = queryOne(`
    SELECT id, code, sort_order, is_enabled, created_at, updated_at
    FROM media_categories
    WHERE code = ?
  `, [normalizeCode(code)]);
  if (!row) return null;
  return attachTranslations([mapCategoryRow(row)], options.languageCode)[0];
}

export function createMediaCategory(input) {
  ensureMediaCategoriesSchema();
  const payload = normalizeCategoryInput(input);
  const result = execute(`
    INSERT INTO media_categories (code, sort_order, is_enabled, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
  `, [payload.code, payload.sortOrder, payload.isEnabled]);
  saveTranslations(result.lastInsertRowid, payload.translations);
  return getMediaCategoryById(result.lastInsertRowid);
}

export function updateMediaCategory(id, input) {
  ensureMediaCategoriesSchema();
  const existing = getMediaCategoryById(id);
  if (!existing) return null;
  const payload = normalizeCategoryInput(input, existing);
  execute(`
    UPDATE media_categories
    SET code = ?, sort_order = ?, is_enabled = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [payload.code, payload.sortOrder, payload.isEnabled, existing.id]);
  saveTranslations(existing.id, payload.translations);
  return getMediaCategoryById(existing.id);
}

export function deleteMediaCategory(id) {
  ensureMediaCategoriesSchema();
  const existing = getMediaCategoryById(id);
  if (!existing) return null;
  const usageCount = tableHasColumn('media_assets', 'category_id')
    ? queryOne('SELECT COUNT(*) AS count FROM media_assets WHERE category_id = ?', [existing.id])?.count || 0
    : 0;
  if (usageCount > 0) {
    const error = new Error(`该分类仍被 ${usageCount} 个媒体资源使用，不能删除`);
    error.statusCode = 409;
    throw error;
  }
  execute('DELETE FROM media_category_translations WHERE category_id = ?', [existing.id]);
  execute('DELETE FROM media_categories WHERE id = ?', [existing.id]);
  return existing;
}

function tableHasColumn(tableName, columnName) {
  return queryAll(`PRAGMA table_info(${tableName})`).some((column) => String(column.name || '') === columnName);
}

function seedDefaultCategories() {
  if (Number(queryOne('SELECT COUNT(*) AS count FROM media_categories')?.count || 0) > 0) return;
  const languages = listLanguages();
  const english = languages.find((item) => String(item.code).toLowerCase() === 'en');
  const chinese = languages.find((item) => String(item.code).toLowerCase() === 'zh-cn');

  for (const category of DEFAULT_CATEGORIES) {
    execute(`
      INSERT INTO media_categories (code, sort_order, is_enabled)
      VALUES (?, ?, 1)
      ON CONFLICT(code) DO NOTHING
    `, [category.code, category.sortOrder]);
    const row = queryOne('SELECT id FROM media_categories WHERE code = ?', [category.code]);
    if (english) insertDefaultTranslation(row.id, english.id, category.en);
    if (chinese) insertDefaultTranslation(row.id, chinese.id, category.zh);
  }
}

function insertDefaultTranslation(categoryId, languageId, name) {
  execute(`
    INSERT INTO media_category_translations (category_id, language_id, name)
    VALUES (?, ?, ?)
    ON CONFLICT(category_id, language_id) DO NOTHING
  `, [categoryId, languageId, name]);
}

function attachTranslations(categories, requestedLanguageCode) {
  if (!categories.length) return categories;
  const ids = categories.map((item) => item.id);
  const placeholders = ids.map(() => '?').join(', ');
  const rows = queryAll(`
    SELECT t.category_id, t.language_id, t.name, l.code AS language_code
    FROM media_category_translations t
    JOIN languages l ON l.id = t.language_id
    WHERE t.category_id IN (${placeholders})
    ORDER BY l.sort_order ASC, l.id ASC
  `, ids);
  const byCategory = new Map();
  for (const row of rows) {
    if (!byCategory.has(Number(row.category_id))) byCategory.set(Number(row.category_id), []);
    byCategory.get(Number(row.category_id)).push({
      language_id: Number(row.language_id),
      language_code: row.language_code,
      name: row.name,
    });
  }

  return categories.map((category) => {
    const translations = byCategory.get(category.id) || [];
    const requested = translations.find((item) => sameLanguage(item.language_code, requestedLanguageCode));
    const english = translations.find((item) => sameLanguage(item.language_code, 'en'));
    const resolved = requested || english || translations[0] || null;
    return {
      ...category,
      name: resolved?.name || category.code,
      translations: Object.fromEntries(translations.map((item) => [item.language_code, item.name])),
    };
  });
}

function saveTranslations(categoryId, translations) {
  const languages = listLanguages();
  const languageByCode = new Map(languages.map((item) => [String(item.code).toLowerCase(), item]));
  for (const [languageCode, rawName] of Object.entries(translations || {})) {
    const language = languageByCode.get(String(languageCode).toLowerCase());
    if (!language) continue;
    const name = String(rawName || '').trim();
    if (!name) {
      execute('DELETE FROM media_category_translations WHERE category_id = ? AND language_id = ?', [categoryId, language.id]);
      continue;
    }
    execute(`
      INSERT INTO media_category_translations (category_id, language_id, name, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(category_id, language_id) DO UPDATE SET
        name = excluded.name,
        updated_at = CURRENT_TIMESTAMP
    `, [categoryId, language.id, name]);
  }
}

function normalizeCategoryInput(input, existing = null) {
  const code = normalizeCode(input?.code ?? existing?.code);
  if (!code) throw new Error('分类编码不能为空');
  const rawTranslations = input?.translations && typeof input.translations === 'object'
    ? input.translations
    : existing?.translations || {};
  const languageCodes = new Set(listLanguages().map((language) => String(language.code).toLowerCase()));
  const translations = Object.fromEntries(Object.entries(rawTranslations)
    .filter(([languageCode]) => languageCodes.has(String(languageCode).toLowerCase())));
  if (!Object.values(translations).some((name) => String(name || '').trim())) {
    throw new Error('至少需要一个分类名称');
  }
  const englishName = Object.entries(translations)
    .find(([languageCode]) => String(languageCode).toLowerCase() === 'en')?.[1];
  if (languageCodes.has('en') && !String(englishName || '').trim()) {
    throw new Error('英文分类名称不能为空，其他语言将使用它作为回退');
  }
  return {
    code,
    sortOrder: normalizeInteger(input?.sort_order ?? existing?.sort_order, 0),
    isEnabled: input?.is_enabled === undefined ? Number(existing?.is_enabled ?? 1) : (input.is_enabled ? 1 : 0),
    translations,
  };
}

function normalizeCode(value) {
  const code = String(value || '').trim().toLowerCase();
  if (!code) return '';
  if (!/^[a-z][a-z0-9_]*$/.test(code)) throw new Error('分类编码只能包含小写字母、数字和下划线');
  return code;
}

function normalizeInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sameLanguage(left, right) {
  return String(left || '').trim().toLowerCase() === String(right || '').trim().toLowerCase();
}

function mapCategoryRow(row) {
  return {
    ...row,
    id: Number(row.id),
    sort_order: Number(row.sort_order || 0),
    is_enabled: Number(row.is_enabled || 0),
  };
}
