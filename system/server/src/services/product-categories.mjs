import { execute, getDb, queryAll, queryOne } from '../db.mjs';
import { ensureLanguagesSchema, getDefaultLanguage, listLanguages } from './languages.mjs';

let schemaEnsured = false;

export function ensureProductCategoriesSchema() {
  if (schemaEnsured) {
    return;
  }

  ensureLanguagesSchema();
  addColumnIfMissing('product_categories', 'content_html', "TEXT NOT NULL DEFAULT ''");
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS product_category_translations (
      id INTEGER PRIMARY KEY,
      category_id INTEGER NOT NULL,
      language_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      seo_keywords TEXT,
      seo_description TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(category_id, language_id),
      FOREIGN KEY (category_id) REFERENCES product_categories(id) ON DELETE CASCADE,
      FOREIGN KEY (language_id) REFERENCES languages(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_product_category_translations_category_id
    ON product_category_translations(category_id, language_id);
  `);

  ensureRootCategorySentinel();
  ensureDefaultProductCategoryTranslations();
  schemaEnsured = true;
}

export function listProductCategories({ languageCode = null } = {}) {
  ensureProductCategoriesSchema();
  const rows = queryAll(
    `
      SELECT
        id,
        name,
        parent_id,
        sort_order,
        content_html,
        seo_keywords,
        seo_description,
        legacy_extra
      FROM product_categories
      WHERE id <> 0
      ORDER BY parent_id ASC, sort_order ASC, id ASC
    `
  );
  return hydrateCategories(rows, {
    translationTable: 'product_category_translations',
    entityKey: 'category_id',
    languageCode,
    includeTranslations: false
  });
}

export function listProductCategoriesAdmin({ parentId = 0, page = 1, limit = 10, languageCode = null } = {}) {
  ensureProductCategoriesSchema();
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
        c.content_html,
        c.seo_keywords,
        c.seo_description,
        c.legacy_extra,
        p.name AS parent_name,
        (
          SELECT COUNT(*)
          FROM product_categories child
          WHERE child.parent_id = c.id
        ) AS child_count
      FROM product_categories c
      LEFT JOIN product_categories p ON p.id = c.parent_id
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
      FROM product_categories
      WHERE parent_id = ?
        AND id <> 0
    `,
    [safeParentId]
  )?.count || 0;

  const items = hydrateCategories(rows, {
    translationTable: 'product_category_translations',
    entityKey: 'category_id',
    languageCode,
    includeTranslations: true
  });

  return {
    items,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.max(Math.ceil(total / safeLimit), 1)
    }
  };
}

export function listRootProductCategories({ languageCode = null } = {}) {
  ensureProductCategoriesSchema();
  const rows = queryAll(
    `
      SELECT
        id,
        name,
        parent_id,
        sort_order,
        content_html,
        seo_keywords,
        seo_description,
        legacy_extra
      FROM product_categories
      WHERE parent_id = 0
        AND id <> 0
      ORDER BY sort_order ASC, id ASC
    `
  );
  return hydrateCategories(rows, {
    translationTable: 'product_category_translations',
    entityKey: 'category_id',
    languageCode,
    includeTranslations: false
  });
}

export function listProductCategoryOptions({ languageCode = null } = {}) {
  const categories = listProductCategories({ languageCode });
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

export function getProductCategoryById(id, { languageCode = null, includeTranslations = false } = {}) {
  ensureProductCategoriesSchema();
  const row = queryOne(
    `
      SELECT
        id,
        name,
        parent_id,
        sort_order,
        content_html,
        seo_keywords,
        seo_description,
        legacy_extra
      FROM product_categories
      WHERE id = ?
    `,
    [id]
  );
  if (!row) {
    return null;
  }
  return hydrateCategories([row], {
    translationTable: 'product_category_translations',
    entityKey: 'category_id',
    languageCode,
    includeTranslations
  })[0] || null;
}

export function getNextProductCategorySortOrder(parentId = 0) {
  ensureProductCategoriesSchema();
  const safeParentId = Number.parseInt(String(parentId), 10) || 0;
  const maxValue = queryOne(
    `
      SELECT MAX(sort_order) AS value
      FROM product_categories
      WHERE parent_id = ?
    `,
    [safeParentId]
  )?.value;
  return Number.isInteger(maxValue) ? maxValue + 1 : 1;
}

export function createProductCategory(input) {
  ensureProductCategoriesSchema();
  const payload = normalizeProductCategoryMutationInput(input);
  const defaultLanguage = getDefaultLanguage();
  const defaultTranslation = resolveDefaultTranslationPayload(payload.translations, defaultLanguage?.code);
  const result = execute(
    `
      INSERT INTO product_categories (
        name,
        parent_id,
        sort_order,
        content_html,
        seo_keywords,
        seo_description
      ) VALUES (?, ?, ?, ?, ?, ?)
    `,
    [
      defaultTranslation.name,
      payload.base.parent_id,
      payload.base.sort_order,
      payload.base.content_html,
      defaultTranslation.seo_keywords,
      defaultTranslation.seo_description
    ]
  );

  saveCategoryTranslations('product_category_translations', 'category_id', result.lastInsertRowid, payload.translations);
  return getProductCategoryById(result.lastInsertRowid, { includeTranslations: true });
}

export function updateProductCategory(id, input) {
  ensureProductCategoriesSchema();
  const existing = getProductCategoryById(id, { includeTranslations: true });
  if (!existing) {
    return null;
  }

  const payload = normalizeProductCategoryMutationInput(input, {
    existingCategory: existing
  });
  const defaultLanguage = getDefaultLanguage();
  const defaultTranslation = resolveDefaultTranslationPayload(payload.translations, defaultLanguage?.code);
  execute(
    `
      UPDATE product_categories
      SET
        name = ?,
        parent_id = ?,
        sort_order = ?,
        content_html = ?,
        seo_keywords = ?,
        seo_description = ?
      WHERE id = ?
    `,
    [
      defaultTranslation.name,
      payload.base.parent_id,
      payload.base.sort_order,
      payload.base.content_html,
      defaultTranslation.seo_keywords,
      defaultTranslation.seo_description,
      id
    ]
  );

  saveCategoryTranslations('product_category_translations', 'category_id', id, payload.translations);
  return getProductCategoryById(id, { includeTranslations: true });
}

export function deleteProductCategory(id) {
  ensureProductCategoriesSchema();
  const existing = getProductCategoryById(id);
  if (!existing || existing.id === 0) {
    return null;
  }

  execute('DELETE FROM product_categories WHERE id = ?', [id]);
  return existing;
}

export function normalizeProductCategoryInput(input, options = {}) {
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
    sort_order: toInteger(input.sort_order, 0),
    content_html: String(input.content_html ?? ''),
    seo_keywords: toNullableString(input.seo_keywords),
    seo_description: toNullableString(input.seo_description)
  };
}

function normalizeProductCategoryMutationInput(input, { existingCategory = null } = {}) {
  const defaultLanguageCode = getDefaultLanguage()?.code || 'zh-CN';

  if (input?.base || input?.translations) {
    const base = {
      parent_id: toInteger(input.base?.parent_id ?? existingCategory?.parent_id, 0),
      sort_order: toInteger(input.base?.sort_order ?? existingCategory?.sort_order, 0),
      content_html: String(input.base?.content_html ?? existingCategory?.content_html ?? '')
    };
    const translations = normalizeCategoryTranslations(input.translations || {}, {
      defaultLanguageCode,
      existingTranslations: existingCategory?.translations || {}
    });
    assertValidParent(existingCategory?.id, base.parent_id);
    return { base, translations };
  }

  const legacy = normalizeProductCategoryInput({ ...(existingCategory || {}), ...(input || {}) }, { currentId: existingCategory?.id });
  return {
    base: {
      parent_id: legacy.parent_id,
      sort_order: legacy.sort_order,
      content_html: legacy.content_html
    },
    translations: {
      [defaultLanguageCode]: {
        name: legacy.name,
        seo_keywords: legacy.seo_keywords,
        seo_description: legacy.seo_description
      }
    }
  };
}

function normalizeCategoryTranslations(translations, { defaultLanguageCode, existingTranslations = {} }) {
  const output = {};
  const knownCodes = new Set(listLanguages().map((language) => language.code));

  for (const [languageCode, value] of Object.entries(translations || {})) {
    if (!knownCodes.has(languageCode)) {
      continue;
    }
    const normalized = {
      name: String(value?.name ?? existingTranslations?.[languageCode]?.name ?? '').trim(),
      seo_keywords: toNullableString(value?.seo_keywords ?? existingTranslations?.[languageCode]?.seo_keywords),
      seo_description: toNullableString(value?.seo_description ?? existingTranslations?.[languageCode]?.seo_description)
    };
    if (languageCode === defaultLanguageCode && !normalized.name) {
      throw new Error('默认语言的分类名称不能为空');
    }
    if (normalized.name || normalized.seo_keywords || normalized.seo_description) {
      output[languageCode] = normalized;
    }
  }

  if (!output[defaultLanguageCode]) {
    const fallback = existingTranslations?.[defaultLanguageCode];
    const normalized = {
      name: String(fallback?.name || '').trim(),
      seo_keywords: toNullableString(fallback?.seo_keywords),
      seo_description: toNullableString(fallback?.seo_description)
    };
    if (!normalized.name) {
      throw new Error('默认语言的分类名称不能为空');
    }
    output[defaultLanguageCode] = normalized;
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

function hydrateCategories(rows, {
  translationTable,
  entityKey,
  languageCode,
  includeTranslations = false
}) {
  if (!rows.length) {
    return [];
  }

  const entityIds = rows.map((row) => Number(row.id)).filter((id) => Number.isInteger(id) && id > 0);
  const translationsById = loadCategoryTranslations(translationTable, entityKey, entityIds);
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
      content_html: row.content_html || '',
      seo_keywords: fallbackTranslation?.seo_keywords ?? row.seo_keywords,
      seo_description: fallbackTranslation?.seo_description ?? row.seo_description,
      legacy_extra: row.legacy_extra || null,
      page_data: parseLegacyExtra(row.legacy_extra)?.page_data || null,
      current_language_code: fallbackTranslation?.language_code || selectedLanguage.code,
      ...(includeTranslations ? {
        translations: Object.fromEntries(
          Object.entries(translationMap).map(([language, translation]) => [
            language,
            {
              name: translation.name,
              seo_keywords: translation.seo_keywords,
              seo_description: translation.seo_description
            }
          ])
        )
      } : {})
    };
  });
}

function loadCategoryTranslations(tableName, entityKey, entityIds) {
  if (!entityIds.length) {
    return new Map();
  }

  const placeholders = entityIds.map(() => '?').join(', ');
  const rows = queryAll(
    `
      SELECT
        t.id,
        t.${entityKey} AS entity_id,
        t.language_id,
        l.code AS language_code,
        t.name,
        t.seo_keywords,
        t.seo_description
      FROM ${tableName} t
      INNER JOIN languages l ON l.id = t.language_id
      WHERE t.${entityKey} IN (${placeholders})
      ORDER BY t.${entityKey} ASC, l.sort_order ASC, l.id ASC
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
      name: row.name || '',
      seo_keywords: row.seo_keywords || '',
      seo_description: row.seo_description || ''
    });
    map.set(Number(row.entity_id), list);
  }
  return map;
}

function saveCategoryTranslations(tableName, entityKey, entityId, translations, now = new Date().toISOString()) {
  const languageIdByCode = new Map(listLanguages().map((language) => [language.code, language.id]));

  for (const [languageCode, translation] of Object.entries(translations || {})) {
    const languageId = languageIdByCode.get(languageCode);
    if (!languageId) {
      continue;
    }

    execute(
      `
        INSERT INTO ${tableName} (
          ${entityKey},
          language_id,
          name,
          seo_keywords,
          seo_description,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(${entityKey}, language_id) DO UPDATE SET
          name = excluded.name,
          seo_keywords = excluded.seo_keywords,
          seo_description = excluded.seo_description,
          updated_at = excluded.updated_at
      `,
      [
        entityId,
        languageId,
        String(translation?.name || '').trim(),
        toNullableString(translation?.seo_keywords),
        toNullableString(translation?.seo_description),
        now,
        now
      ]
    );
  }
}

function ensureDefaultProductCategoryTranslations() {
  const defaultLanguage = getDefaultLanguage();
  if (!defaultLanguage) {
    return;
  }

  execute(
    `
      INSERT INTO product_category_translations (
        category_id,
        language_id,
        name,
        seo_keywords,
        seo_description,
        created_at,
        updated_at
      )
      SELECT
        c.id,
        ?,
        coalesce(c.name, ''),
        c.seo_keywords,
        c.seo_description,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      FROM product_categories c
      WHERE c.id <> 0
        AND NOT EXISTS (
          SELECT 1
          FROM product_category_translations t
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

function toNullableString(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const normalized = String(value).trim();
  return normalized === '' ? null : normalized;
}

function toInteger(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function ensureRootCategorySentinel() {
  execute(
    `
      INSERT OR IGNORE INTO product_categories (
        id,
        name,
        parent_id,
        sort_order,
        content_html,
        seo_keywords,
        seo_description
      ) VALUES (0, '__root__', 0, 0, '', null, null)
    `
  );
}

function addColumnIfMissing(tableName, columnName, definitionSql) {
  const columns = queryAll(`PRAGMA table_info(${tableName})`);
  if (!columns.some((column) => column.name === columnName)) {
    getDb().exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definitionSql}`);
  }
}

function parseLegacyExtra(value) {
  if (!value) {
    return {};
  }
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}
