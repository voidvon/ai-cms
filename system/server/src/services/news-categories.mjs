import { execute, getDb, queryAll, queryOne } from '../db.mjs';
import { ensureLanguagesSchema, getDefaultLanguage, listLanguages } from './languages.mjs';

let schemaEnsured = false;

export function ensureNewsCategoriesSchema() {
  if (schemaEnsured) {
    return;
  }

  ensureLanguagesSchema();
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS news_category_translations (
      id INTEGER PRIMARY KEY,
      category_id INTEGER NOT NULL,
      language_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(category_id, language_id),
      FOREIGN KEY (category_id) REFERENCES news_categories(id) ON DELETE CASCADE,
      FOREIGN KEY (language_id) REFERENCES languages(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_news_category_translations_category_id
    ON news_category_translations(category_id, language_id);
  `);

  ensureRootCategorySentinel();
  ensureDefaultNewsCategoryTranslations();
  schemaEnsured = true;
}

export function listNewsCategories({ languageCode = null } = {}) {
  ensureNewsCategoriesSchema();
  const rows = queryAll(
    `
      SELECT
        id,
        name,
        parent_id,
        sort_order
      FROM news_categories
      WHERE id <> 0
      ORDER BY parent_id ASC, sort_order ASC, id ASC
    `
  );
  return hydrateCategories(rows, { languageCode, includeTranslations: false });
}

export function listNewsCategoriesAdmin({ parentId = 0, page = 1, limit = 10, languageCode = null } = {}) {
  ensureNewsCategoriesSchema();
  const safeParentId = Number.parseInt(String(parentId), 10) || 0;
  const safeLimit = Math.min(Math.max(Number.parseInt(String(limit), 10) || 10, 1), 200);
  const safePage = Math.max(Number.parseInt(String(page), 10) || 1, 1);
  const offset = (safePage - 1) * safeLimit;

  const rows = queryAll(
    `
      SELECT
        c.id,
        c.name,
        c.parent_id,
        c.sort_order,
        p.name AS parent_name,
        (
          SELECT COUNT(*)
          FROM news_categories child
          WHERE child.parent_id = c.id
        ) AS child_count
      FROM news_categories c
      LEFT JOIN news_categories p ON p.id = c.parent_id
      WHERE c.parent_id = ?
        AND c.id <> 0
      ORDER BY c.sort_order ASC, c.id ASC
      LIMIT ?
      OFFSET ?
    `,
    [safeParentId, safeLimit, offset]
  );

  const total = queryOne(
    `
      SELECT COUNT(*) AS count
      FROM news_categories
      WHERE parent_id = ?
        AND id <> 0
    `,
    [safeParentId]
  )?.count || 0;

  return {
    items: hydrateCategories(rows, { languageCode, includeTranslations: true }),
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.max(Math.ceil(total / safeLimit), 1)
    }
  };
}

export function listRootNewsCategories({ languageCode = null } = {}) {
  ensureNewsCategoriesSchema();
  const rows = queryAll(
    `
      SELECT
        id,
        name,
        parent_id,
        sort_order
      FROM news_categories
      WHERE parent_id = 0
        AND id <> 0
      ORDER BY sort_order ASC, id ASC
    `
  );
  return hydrateCategories(rows, { languageCode, includeTranslations: false });
}

export function listNewsCategoryOptions({ languageCode = null } = {}) {
  const categories = listNewsCategories({ languageCode });
  const childrenByParent = new Map();

  for (const category of categories) {
    const parentId = Number.parseInt(String(category.parent_id ?? 0), 10) || 0;
    if (!childrenByParent.has(parentId)) {
      childrenByParent.set(parentId, []);
    }
    childrenByParent.get(parentId).push(category);
  }

  const options = [];
  for (const root of childrenByParent.get(0) || []) {
    options.push({ ...root, depth: 0 });
    appendChildren(root.id, 1);
  }

  return options;

  function appendChildren(parentId, depth) {
    for (const child of childrenByParent.get(parentId) || []) {
      options.push({ ...child, depth });
      appendChildren(child.id, depth + 1);
    }
  }
}

export function getNewsCategoryById(id, { languageCode = null, includeTranslations = false } = {}) {
  ensureNewsCategoriesSchema();
  const row = queryOne(
    `
      SELECT
        id,
        name,
        parent_id,
        sort_order
      FROM news_categories
      WHERE id = ?
    `,
    [id]
  );
  if (!row) {
    return null;
  }
  return hydrateCategories([row], { languageCode, includeTranslations })[0] || null;
}

export function createNewsCategory(input) {
  ensureNewsCategoriesSchema();
  const payload = normalizeNewsCategoryMutationInput(input);
  const defaultLanguage = getDefaultLanguage();
  const defaultTranslation = resolveDefaultTranslationPayload(payload.translations, defaultLanguage?.code);
  const result = execute(
    `
      INSERT INTO news_categories (
        name,
        parent_id,
        sort_order
      ) VALUES (?, ?, ?)
    `,
    [defaultTranslation.name, payload.base.parent_id, payload.base.sort_order]
  );

  saveCategoryTranslations(result.lastInsertRowid, payload.translations);
  return getNewsCategoryById(result.lastInsertRowid, { includeTranslations: true });
}

export function updateNewsCategory(id, input) {
  ensureNewsCategoriesSchema();
  const existing = getNewsCategoryById(id, { includeTranslations: true });
  if (!existing) {
    return null;
  }

  const payload = normalizeNewsCategoryMutationInput(input, { existingCategory: existing });
  const defaultLanguage = getDefaultLanguage();
  const defaultTranslation = resolveDefaultTranslationPayload(payload.translations, defaultLanguage?.code);
  execute(
    `
      UPDATE news_categories
      SET
        name = ?,
        parent_id = ?,
        sort_order = ?
      WHERE id = ?
    `,
    [defaultTranslation.name, payload.base.parent_id, payload.base.sort_order, id]
  );

  saveCategoryTranslations(id, payload.translations);
  return getNewsCategoryById(id, { includeTranslations: true });
}

export function deleteNewsCategory(id) {
  ensureNewsCategoriesSchema();
  const existing = getNewsCategoryById(id);
  if (!existing || existing.id === 0) {
    return null;
  }

  execute('DELETE FROM news_categories WHERE id = ?', [id]);
  return existing;
}

export function normalizeNewsCategoryInput(input, options = {}) {
  const name = String(input.name ?? '').trim();
  if (!name) {
    throw new Error('name is required');
  }

  const parentId = toInteger(input.parent_id, 0);
  if (options.currentId && parentId === Number(options.currentId)) {
    throw new Error('parent_id cannot equal id');
  }

  return {
    name,
    parent_id: parentId,
    sort_order: toInteger(input.sort_order, 0)
  };
}

function normalizeNewsCategoryMutationInput(input, { existingCategory = null } = {}) {
  const defaultLanguageCode = getDefaultLanguage()?.code || 'zh-CN';

  if (input?.base || input?.translations) {
    const base = {
      parent_id: toInteger(input.base?.parent_id ?? existingCategory?.parent_id, 0),
      sort_order: toInteger(input.base?.sort_order ?? existingCategory?.sort_order, 0)
    };
    const translations = normalizeTranslations(input.translations || {}, {
      defaultLanguageCode,
      existingTranslations: existingCategory?.translations || {}
    });
    assertValidParent(existingCategory?.id, base.parent_id);
    return { base, translations };
  }

  const legacy = normalizeNewsCategoryInput({ ...(existingCategory || {}), ...(input || {}) }, { currentId: existingCategory?.id });
  return {
    base: {
      parent_id: legacy.parent_id,
      sort_order: legacy.sort_order
    },
    translations: {
      [defaultLanguageCode]: {
        name: legacy.name
      }
    }
  };
}

function normalizeTranslations(translations, { defaultLanguageCode, existingTranslations = {} }) {
  const output = {};
  const knownCodes = new Set(listLanguages().map((language) => language.code));

  for (const [languageCode, value] of Object.entries(translations || {})) {
    if (!knownCodes.has(languageCode)) {
      continue;
    }
    const normalized = {
      name: String(value?.name ?? existingTranslations?.[languageCode]?.name ?? '').trim()
    };
    if (languageCode === defaultLanguageCode && !normalized.name) {
      throw new Error('默认语言的分类名称不能为空');
    }
    if (normalized.name) {
      output[languageCode] = normalized;
    }
  }

  if (!output[defaultLanguageCode]) {
    const fallback = String(existingTranslations?.[defaultLanguageCode]?.name || '').trim();
    if (!fallback) {
      throw new Error('默认语言的分类名称不能为空');
    }
    output[defaultLanguageCode] = { name: fallback };
  }

  return output;
}

function resolveDefaultTranslationPayload(translations, defaultLanguageCode) {
  const code = defaultLanguageCode || 'zh-CN';
  const direct = translations[code];
  if (direct?.name) {
    return direct;
  }
  const first = Object.values(translations).find((item) => item?.name);
  if (first) {
    return first;
  }
  throw new Error('至少需要提供默认语言的分类名称');
}

function hydrateCategories(rows, { languageCode, includeTranslations = false }) {
  if (!rows.length) {
    return [];
  }

  const entityIds = rows.map((row) => Number(row.id)).filter((id) => Number.isInteger(id) && id > 0);
  const translationsById = loadTranslations(entityIds);
  const selectedLanguage = resolveLanguageForContent(languageCode);

  return rows.map((row) => {
    const translations = translationsById.get(Number(row.id)) || [];
    const translationMap = Object.fromEntries(translations.map((translation) => [translation.language_code, translation]));
    const selectedTranslation = translationMap[selectedLanguage.code];
    const defaultTranslation = translationMap[selectedLanguage.default_code];
    const fallbackTranslation = selectedTranslation || defaultTranslation || translations[0] || null;

    return {
      ...row,
      name: fallbackTranslation?.name || row.name,
      current_language_code: fallbackTranslation?.language_code || selectedLanguage.code,
      ...(includeTranslations ? {
        translations: Object.fromEntries(
          Object.entries(translationMap).map(([language, translation]) => [
            language,
            { name: translation.name }
          ])
        )
      } : {})
    };
  });
}

function loadTranslations(entityIds) {
  if (!entityIds.length) {
    return new Map();
  }

  const placeholders = entityIds.map(() => '?').join(', ');
  const rows = queryAll(
    `
      SELECT
        t.id,
        t.category_id AS entity_id,
        t.language_id,
        l.code AS language_code,
        t.name
      FROM news_category_translations t
      INNER JOIN languages l ON l.id = t.language_id
      WHERE t.category_id IN (${placeholders})
      ORDER BY t.category_id ASC, l.sort_order ASC, l.id ASC
    `,
    entityIds
  );

  const map = new Map();
  for (const row of rows) {
    const list = map.get(Number(row.entity_id)) || [];
    list.push({
      id: Number(row.id),
      entity_id: Number(row.entity_id),
      language_id: Number(row.language_id),
      language_code: row.language_code,
      name: row.name || ''
    });
    map.set(Number(row.entity_id), list);
  }
  return map;
}

function saveCategoryTranslations(categoryId, translations, now = new Date().toISOString()) {
  const languageIdByCode = new Map(listLanguages().map((language) => [language.code, language.id]));

  for (const [languageCode, translation] of Object.entries(translations || {})) {
    const languageId = languageIdByCode.get(languageCode);
    if (!languageId) {
      continue;
    }

    execute(
      `
        INSERT INTO news_category_translations (
          category_id,
          language_id,
          name,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(category_id, language_id) DO UPDATE SET
          name = excluded.name,
          updated_at = excluded.updated_at
      `,
      [
        categoryId,
        languageId,
        String(translation?.name || '').trim(),
        now,
        now
      ]
    );
  }
}

function ensureDefaultNewsCategoryTranslations() {
  const defaultLanguage = getDefaultLanguage();
  if (!defaultLanguage) {
    return;
  }

  execute(
    `
      INSERT INTO news_category_translations (
        category_id,
        language_id,
        name,
        created_at,
        updated_at
      )
      SELECT
        c.id,
        ?,
        coalesce(c.name, ''),
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      FROM news_categories c
      WHERE c.id <> 0
        AND NOT EXISTS (
          SELECT 1
          FROM news_category_translations t
          WHERE t.category_id = c.id
            AND t.language_id = ?
        )
    `,
    [defaultLanguage.id, defaultLanguage.id]
  );
}

function resolveLanguageForContent(languageCode) {
  const defaultLanguage = getDefaultLanguage();
  const fallbackCode = defaultLanguage?.code || 'zh-CN';
  const code = String(languageCode || '').trim() || fallbackCode;
  return {
    code,
    default_code: fallbackCode
  };
}

function assertValidParent(currentId, parentId) {
  if (currentId && Number(currentId) === Number(parentId)) {
    throw new Error('parent_id cannot equal id');
  }
}

function toInteger(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function ensureRootCategorySentinel() {
  execute(
    `
      INSERT OR IGNORE INTO news_categories (
        id,
        name,
        parent_id,
        sort_order
      ) VALUES (0, '__root__', 0, 0)
    `
  );
}
