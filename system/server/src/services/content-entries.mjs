import { execute, queryAll, queryOne } from '../db.mjs';
import { getColumnById } from './columns.mjs';
import { ensureContentModelStorageSchema, getContentTableName, getTranslationTableName } from './content-model-storage.mjs';
import { getDefaultLanguage, listLanguages } from './languages.mjs';

const DEFAULT_PRODUCT_IMAGE = '/skin/dfpic.gif';
const EMPTY_IMAGE_LIST = '[]';

/**
 * 获取翻译表的发布时间字段表达式
 * 所有模型统一使用 created_at（已删除 published_at 字段）
 */
function getTranslationPublishedAtExpr(modelCode, translationAlias, defaultTranslationAlias, entryAlias) {
  // 所有模型统一使用 created_at
  return `coalesce(${translationAlias}.created_at, ${defaultTranslationAlias}.created_at, ${entryAlias}.created_at)`;
}

export function listContentEntries(modelCode, {
  featured = false,
  visibleOnly = true,
  limit = 20,
  languageCode = null
} = {}) {
  ensureContentModelStorageSchema();
  const selectedLanguage = resolveLanguage(languageCode);
  const tableName = getContentTableName(modelCode);
  const translationTableName = getTranslationTableName(modelCode);
  const whereParts = [];
  if (visibleOnly) {
    whereParts.push('e.is_visible = 1');
  }
  if (featured) {
    whereParts.push('e.is_featured_home = 1');
  }

  const rows = queryAll(
    `
      SELECT
        e.id,
        e.column_id,
        e.custom_url,
        e.code,
        e.images,
        e.primary_image,
        e.is_visible,
        e.is_featured_home,
        e.sort_order,
        e.publish_status,
        e.created_at,
        e.legacy_extra,
        e.created_at,
        e.updated_at,
        ${buildNameExpr('t', 'dt')} AS name,
        coalesce(t.summary, dt.summary, '') AS summary,
        coalesce(t.content_html, dt.content_html, '') AS content_html,
        coalesce(t.keywords, dt.keywords, '') AS keywords,
        coalesce(t.seo_title, dt.seo_title) AS seo_title,
        coalesce(t.seo_keywords, dt.seo_keywords) AS seo_keywords,
        coalesce(t.seo_description, dt.seo_description) AS seo_description,
        coalesce(t.publish_status, dt.publish_status, e.publish_status, 'published') AS translation_publish_status,
        ${getTranslationPublishedAtExpr(modelCode, 't', 'dt', 'e')} AS translation_published_at,
        coalesce(tc.name, dtc.name, '') AS category_name,
        coalesce(l.code, dl.code, ?) AS current_language_code
      FROM ${quoteIdentifier(tableName)} e
      LEFT JOIN ${quoteIdentifier(translationTableName)} t ON t.entry_id = e.id AND t.language_id = ?
      LEFT JOIN ${quoteIdentifier(translationTableName)} dt ON dt.entry_id = e.id AND dt.language_id = ?
      LEFT JOIN languages l ON l.id = t.language_id
      LEFT JOIN languages dl ON dl.id = dt.language_id
      LEFT JOIN columns c ON c.id = e.column_id
      LEFT JOIN column_translations tc ON tc.column_id = c.id AND tc.language_id = ?
      LEFT JOIN column_translations dtc ON dtc.column_id = c.id AND dtc.language_id = ?
      ${whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : ''}
      ORDER BY ${modelCode === 'news' ? 'e.created_at DESC, e.id DESC' : 'e.sort_order ASC, e.id DESC'}
      LIMIT ?
    `,
    [
      selectedLanguage.code,
      selectedLanguage.id,
      selectedLanguage.default_id,
      selectedLanguage.id,
      selectedLanguage.default_id,
      clampLimit(limit)
    ]
  );

  return rows.map((row) => mapEntryRow(modelCode, row));
}

export function listContentEntriesPaged(modelCode, {
  page = 1,
  limit = 20,
  columnId = null,
  includeDescendants = false,
  visibleOnly = false,
  languageCode = null
} = {}) {
  ensureContentModelStorageSchema();
  const selectedLanguage = resolveLanguage(languageCode);
  const tableName = getContentTableName(modelCode);
  const translationTableName = getTranslationTableName(modelCode);
  const safeLimit = Math.min(Math.max(toInteger(limit, 20), 1), 200);
  const safePage = Math.max(toInteger(page, 1), 1);
  const safeColumnId = toInteger(columnId, 0);
  const hasColumnFilter = safeColumnId > 0;
  const offset = (safePage - 1) * safeLimit;
  const params = [
    selectedLanguage.code,
    selectedLanguage.id,
    selectedLanguage.default_id,
    selectedLanguage.id,
    selectedLanguage.default_id
  ];
  const whereParts = [];
  const treeSql = hasColumnFilter && includeDescendants
    ? `
      WITH RECURSIVE column_tree(id) AS (
        SELECT id FROM columns WHERE id = ?
        UNION ALL
        SELECT child.id
        FROM columns child
        INNER JOIN column_tree parent ON child.parent_id = parent.id
      )
    `
    : '';

  const queryParams = hasColumnFilter && includeDescendants ? [safeColumnId, ...params] : [...params];
  if (visibleOnly) {
    whereParts.push('e.is_visible = 1');
  }
  if (hasColumnFilter) {
    whereParts.push(includeDescendants ? 'e.column_id IN (SELECT id FROM column_tree)' : 'e.column_id = ?');
    if (!includeDescendants) {
      queryParams.push(safeColumnId);
    }
  }
  const where = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

  const rows = queryAll(
    `
      ${treeSql}
      SELECT
        e.id,
        e.column_id,
        e.custom_url,
        e.code,
        e.images,
        e.primary_image,
        e.is_visible,
        e.is_featured_home,
        e.sort_order,
        e.publish_status,
        e.created_at,
        e.legacy_extra,
        e.created_at,
        e.updated_at,
        ${buildNameExpr('t', 'dt')} AS name,
        coalesce(t.summary, dt.summary, '') AS summary,
        coalesce(t.content_html, dt.content_html, '') AS content_html,
        coalesce(t.keywords, dt.keywords, '') AS keywords,
        coalesce(t.seo_title, dt.seo_title) AS seo_title,
        coalesce(t.seo_keywords, dt.seo_keywords) AS seo_keywords,
        coalesce(t.seo_description, dt.seo_description) AS seo_description,
        coalesce(t.publish_status, dt.publish_status, e.publish_status, 'published') AS translation_publish_status,
        ${getTranslationPublishedAtExpr(modelCode, 't', 'dt', 'e')} AS translation_published_at,
        coalesce(tc.name, dtc.name, '') AS category_name,
        coalesce(l.code, dl.code, ?) AS current_language_code
      FROM ${quoteIdentifier(tableName)} e
      LEFT JOIN ${quoteIdentifier(translationTableName)} t ON t.entry_id = e.id AND t.language_id = ?
      LEFT JOIN ${quoteIdentifier(translationTableName)} dt ON dt.entry_id = e.id AND dt.language_id = ?
      LEFT JOIN languages l ON l.id = t.language_id
      LEFT JOIN languages dl ON dl.id = dt.language_id
      LEFT JOIN columns c ON c.id = e.column_id
      LEFT JOIN column_translations tc ON tc.column_id = c.id AND tc.language_id = ?
      LEFT JOIN column_translations dtc ON dtc.column_id = c.id AND dtc.language_id = ?
      ${where}
      ORDER BY ${modelCode === 'news' ? 'e.created_at DESC, e.id DESC' : 'e.sort_order ASC, e.id DESC'}
      LIMIT ?
      OFFSET ?
    `,
    [...queryParams, safeLimit, offset]
  );

  const total = queryOne(
    `
      ${treeSql}
      SELECT COUNT(*) AS count
      FROM ${quoteIdentifier(tableName)} e
      ${where}
    `,
    hasColumnFilter && includeDescendants ? [safeColumnId] : (!includeDescendants && hasColumnFilter ? [safeColumnId] : [])
  )?.count || 0;

  return {
    items: rows.map((row) => mapEntryRow(modelCode, row)),
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.max(Math.ceil(total / safeLimit), 1)
    }
  };
}

export function getContentEntryById(modelCode, id, {
  languageCode = null,
  includeTranslations = false,
  includeTranslationStatuses = false
} = {}) {
  ensureContentModelStorageSchema();
  const selectedLanguage = resolveLanguage(languageCode);
  const tableName = getContentTableName(modelCode);
  const translationTableName = getTranslationTableName(modelCode);
  const row = queryOne(
    `
      SELECT
        e.id,
        e.column_id,
        e.custom_url,
        e.code,
        e.images,
        e.primary_image,
        e.is_visible,
        e.is_featured_home,
        e.sort_order,
        e.publish_status,
        e.created_at,
        e.legacy_extra,
        e.created_at,
        e.updated_at,
        ${buildNameExpr('t', 'dt')} AS name,
        coalesce(t.summary, dt.summary, '') AS summary,
        coalesce(t.content_html, dt.content_html, '') AS content_html,
        coalesce(t.keywords, dt.keywords, '') AS keywords,
        coalesce(t.seo_title, dt.seo_title) AS seo_title,
        coalesce(t.seo_keywords, dt.seo_keywords) AS seo_keywords,
        coalesce(t.seo_description, dt.seo_description) AS seo_description,
        coalesce(t.publish_status, dt.publish_status, e.publish_status, 'published') AS translation_publish_status,
        ${getTranslationPublishedAtExpr(modelCode, 't', 'dt', 'e')} AS translation_published_at,
        coalesce(tc.name, dtc.name, '') AS category_name,
        coalesce(l.code, dl.code, ?) AS current_language_code
      FROM ${quoteIdentifier(tableName)} e
      LEFT JOIN ${quoteIdentifier(translationTableName)} t ON t.entry_id = e.id AND t.language_id = ?
      LEFT JOIN ${quoteIdentifier(translationTableName)} dt ON dt.entry_id = e.id AND dt.language_id = ?
      LEFT JOIN languages l ON l.id = t.language_id
      LEFT JOIN languages dl ON dl.id = dt.language_id
      LEFT JOIN columns c ON c.id = e.column_id
      LEFT JOIN column_translations tc ON tc.column_id = c.id AND tc.language_id = ?
      LEFT JOIN column_translations dtc ON dtc.column_id = c.id AND dtc.language_id = ?
      WHERE e.id = ?
    `,
    [
      selectedLanguage.code,
      selectedLanguage.id,
      selectedLanguage.default_id,
      selectedLanguage.id,
      selectedLanguage.default_id,
      id
    ]
  );
  if (!row) {
    return null;
  }

  const entry = mapEntryRow(modelCode, row);
  if (!includeTranslations && !includeTranslationStatuses) {
    return entry;
  }

  const translations = loadEntryTranslations(modelCode, [entry.id]).get(entry.id) || [];
  if (includeTranslations) {
    entry.translations = Object.fromEntries(
      translations.map((translation) => {
        const translationData = {
          name: translation.name,
          title: translation.name,
          summary: translation.summary,
          content_html: translation.content_html,
          keywords: translation.keywords,
          seo_title: translation.seo_title,
          seo_keywords: translation.seo_keywords,
          seo_description: translation.seo_description,
          publish_status: translation.publish_status
        };
        return [translation.language_code, translationData];
      })
    );
  }
  if (includeTranslationStatuses) {
    entry.translation_statuses = translations.map((translation) => {
      const status = {
        language_code: translation.language_code,
        publish_status: translation.publish_status,
        has_content: Boolean(
          String(translation.name || '').trim()
          || String(translation.summary || '').trim()
          || String(translation.content_html || '').trim()
        )
      };
      return status;
    });
  }
  return entry;
}

export function createContentEntry(modelCode, input) {
  ensureContentModelStorageSchema();
  const payload = normalizeContentEntryInput(modelCode, input);
  const tableName = getContentTableName(modelCode);
  const translationTableName = getTranslationTableName(modelCode);
  const defaultLanguage = getDefaultLanguage();
  const defaultTranslation = resolveDefaultTranslation(payload.translations, defaultLanguage?.code);
  const now = new Date().toISOString();

  const result = execute(
    `
      INSERT INTO ${quoteIdentifier(tableName)} (
        column_id,
        custom_url,
        code,
        images,
        primary_image,
        is_visible,
        is_featured_home,
        sort_order,
        publish_status,
        legacy_extra,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      payload.base.column_id,
      payload.base.custom_url,
      payload.base.code,
      payload.base.images,
      payload.base.primary_image,
      payload.base.is_visible,
      payload.base.is_featured_home,
      payload.base.sort_order,
      defaultTranslation.publish_status,
      payload.base.legacy_extra,
      payload.base.created_at || now,
      now
    ]
  );

  saveEntryTranslations(translationTableName, result.lastInsertRowid, payload.translations, now);
  return getContentEntryById(modelCode, result.lastInsertRowid, {
    includeTranslations: true,
    includeTranslationStatuses: true
  });
}

export function updateContentEntry(modelCode, id, input) {
  ensureContentModelStorageSchema();
  const existing = getContentEntryById(modelCode, id, {
    includeTranslations: true,
    includeTranslationStatuses: true
  });
  if (!existing) {
    return null;
  }

  const payload = normalizeContentEntryInput(modelCode, input, { existingEntry: existing });
  const tableName = getContentTableName(modelCode);
  const translationTableName = getTranslationTableName(modelCode);
  const defaultLanguage = getDefaultLanguage();
  const defaultTranslation = resolveDefaultTranslation(payload.translations, defaultLanguage?.code);
  const now = new Date().toISOString();

  execute(
    `
      UPDATE ${quoteIdentifier(tableName)}
      SET
        column_id = ?,
        custom_url = ?,
        code = ?,
        images = ?,
        primary_image = ?,
        is_visible = ?,
        is_featured_home = ?,
        sort_order = ?,
        publish_status = ?,
        legacy_extra = ?,
        created_at = ?,
        updated_at = ?
      WHERE id = ?
    `,
    [
      payload.base.column_id,
      payload.base.custom_url,
      payload.base.code,
      payload.base.images,
      payload.base.primary_image,
      payload.base.is_visible,
      payload.base.is_featured_home,
      payload.base.sort_order,
      defaultTranslation.publish_status,
      payload.base.legacy_extra,
      payload.base.created_at || existing.created_at || now,
      now,
      id
    ]
  );

  saveEntryTranslations(translationTableName, id, payload.translations, now);
  return getContentEntryById(modelCode, id, {
    includeTranslations: true,
    includeTranslationStatuses: true
  });
}

export function deleteContentEntry(modelCode, id) {
  ensureContentModelStorageSchema();
  const existing = getContentEntryById(modelCode, id);
  if (!existing) {
    return null;
  }
  const tableName = getContentTableName(modelCode);
  execute(`DELETE FROM ${quoteIdentifier(tableName)} WHERE id = ?`, [id]);
  return existing;
}

export function migrateLegacyContentNodesToModelTables(modelCode) {
  ensureContentModelStorageSchema();
  const defaultLanguageId = toInteger(getDefaultLanguage()?.id, 0);
  const categoryColumnIdBySourceId = buildCategoryColumnIdBySourceId(modelCode);
  const categoryColumnIdByLegacyKey = buildCategoryColumnIdByLegacyKey(modelCode);
  const legacyRows = queryAll(
    `
      SELECT
        c.id,
        c.parent_id AS column_id,
        NULL AS custom_url,
        c.source_id,
        c.code,
        c.images,
        c.primary_image,
        c.is_visible,
        c.is_featured_home,
        c.sort_order,
        c.legacy_extra,
        c.created_at,
        c.updated_at,
        dct.publish_status AS default_publish_status,
        dct.published_at AS default_published_at
      FROM columns c
      LEFT JOIN column_translations dct
        ON dct.column_id = c.id
       AND dct.language_id = ?
      WHERE c.source_type = ?
      ORDER BY c.id ASC
    `,
    [defaultLanguageId, getLegacySourceType(modelCode)]
  );

  if (!legacyRows.length) {
    return;
  }

  const tableName = getContentTableName(modelCode);
  const translationTableName = getTranslationTableName(modelCode);
  const existingByLegacyId = new Map(
    queryAll(
      `
        SELECT id, legacy_extra
        FROM ${quoteIdentifier(tableName)}
        WHERE legacy_extra IS NOT NULL AND legacy_extra <> ''
      `
    ).map((row) => [extractLegacyColumnId(row.legacy_extra), row.id])
  );

  for (const row of legacyRows) {
    const now = new Date().toISOString();
    const legacyExtra = buildLegacyEntryExtra(row.legacy_extra, row.id);
    const existingId = existingByLegacyId.get(row.id);
    const resolvedColumnId = resolveLegacyEntryColumnId(row, modelCode, {
      categoryColumnIdBySourceId,
      categoryColumnIdByLegacyKey
    });
    const payload = [
      resolvedColumnId,
      null,
      String(row.code || ''),
      normalizeImagesJson(row.images),
      resolvePrimaryImage(modelCode, row.primary_image, row.images),
      toBooleanInt(row.is_visible, 1),
      toBooleanInt(row.is_featured_home, 0),
      toInteger(row.sort_order, 0),
      normalizePublishStatus(row.default_publish_status),
      legacyExtra,
      toNullableString(row.created_at) || now,
      toNullableString(row.updated_at) || now
    ];

    if (existingId) {
      execute(
        `
          UPDATE ${quoteIdentifier(tableName)}
          SET
            column_id = ?,
            custom_url = ?,
            code = ?,
            images = ?,
            primary_image = ?,
            is_visible = ?,
            is_featured_home = ?,
            sort_order = ?,
            publish_status = ?,
            legacy_extra = ?,
            created_at = ?,
            updated_at = ?
          WHERE id = ?
        `,
        [...payload, existingId]
      );
    } else {
      execute(
        `
          INSERT INTO ${quoteIdentifier(tableName)} (
            column_id,
            custom_url,
            code,
            images,
            primary_image,
            is_visible,
            is_featured_home,
            sort_order,
            publish_status,
            legacy_extra,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        payload
      );
    }

    const entryId = existingId || queryOne(
      `SELECT id FROM ${quoteIdentifier(tableName)} WHERE legacy_extra = ? LIMIT 1`,
      [legacyExtra]
    )?.id;
    if (!entryId) {
      continue;
    }

    const translations = queryAll(
      `
        SELECT
          ct.language_id,
          ct.name,
          ct.summary,
          ct.content_html,
          ct.keywords,
          ct.seo_title,
          ct.seo_keywords,
          ct.seo_description,
          ct.publish_status
        FROM column_translations ct
        WHERE ct.column_id = ?
      `,
      [row.id]
    );

    for (const translation of translations) {
      // 所有翻译表统一不使用 published_at 字段（已删除）
      execute(
        `
          INSERT INTO ${quoteIdentifier(translationTableName)} (
            entry_id,
            language_id,
            name,
            summary,
            content_html,
            keywords,
            seo_title,
            seo_keywords,
            seo_description,
            publish_status,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(entry_id, language_id) DO UPDATE SET
            name = excluded.name,
            summary = excluded.summary,
            content_html = excluded.content_html,
            keywords = excluded.keywords,
            seo_title = excluded.seo_title,
            seo_keywords = excluded.seo_keywords,
            seo_description = excluded.seo_description,
            publish_status = excluded.publish_status,
            updated_at = excluded.updated_at
        `,
        [
          entryId,
          translation.language_id,
          String(translation.name || ''),
          String(translation.summary || ''),
          String(translation.content_html || ''),
          toNullableString(translation.keywords),
          toNullableString(translation.seo_title),
          toNullableString(translation.seo_keywords),
          toNullableString(translation.seo_description),
          normalizePublishStatus(translation.publish_status),
          toNullableString(row.created_at) || now,
          toNullableString(row.updated_at) || now
        ]
      );
    }
  }
}

function resolveLegacyEntryColumnId(row, modelCode, { categoryColumnIdBySourceId, categoryColumnIdByLegacyKey }) {
  const directColumnId = toNullableInteger(row.column_id);
  if (directColumnId) {
    return directColumnId;
  }

  const sourceId = toInteger(row.source_id, 0);
  const bySourceId = categoryColumnIdBySourceId.get(sourceId);
  if (bySourceId) {
    return bySourceId;
  }

  const legacyKeys = extractLegacyEntryKeys(row.legacy_extra, modelCode);
  for (const key of legacyKeys) {
    const normalized = normalizeLegacyKey(key);
    if (!normalized) {
      continue;
    }
    const matched = categoryColumnIdByLegacyKey.get(normalized);
    if (matched) {
      return matched;
    }
  }

  throw new Error(`旧内容节点 ${row.id} 未找到所属栏目`);
}

function buildCategoryColumnIdBySourceId(modelCode) {
  const sourceType = modelCode === 'news' ? 'news_category' : 'product_category';
  return new Map(
    queryAll(
      `
        SELECT id, source_id
        FROM columns
        WHERE source_type = ?
      `,
      [sourceType]
    ).map((row) => [toInteger(row.source_id, 0), toInteger(row.id, 0)])
  );
}

function buildCategoryColumnIdByLegacyKey(modelCode) {
  const sourceType = modelCode === 'news' ? 'news_category' : 'product_category';
  const rows = queryAll(
    `
      SELECT id, legacy_extra
      FROM columns
      WHERE source_type = ?
    `,
    [sourceType]
  );
  const map = new Map();
  for (const row of rows) {
    const columnId = toInteger(row.id, 0);
    const candidates = [
      parseLegacyExtra(row.legacy_extra).key
    ];
    for (const candidate of candidates) {
      const normalized = normalizeLegacyKey(candidate);
      if (!normalized || map.has(normalized)) {
        continue;
      }
      map.set(normalized, columnId);
    }
  }
  return map;
}

function extractLegacyEntryKeys(legacyExtra, modelCode) {
  const parsed = parseLegacyExtra(legacyExtra);
  const rawKey = String(parsed.key || '').trim();
  const keys = [];

  if (rawKey) {
    keys.push(rawKey);
    if (modelCode === 'product' && rawKey.startsWith('product:')) {
      keys.push(rawKey.slice('product:'.length));
    }
    if (modelCode === 'news' && rawKey.startsWith('news:')) {
      const newsPath = rawKey.slice('news:'.length);
      const segments = newsPath.split(':').filter(Boolean);
      const section = segments[0] || '';
      const knownNewsSectionMap = {
        'knowledge-exchange': 'root/news',
        'customer-stories': 'root/news',
        promo: 'root/services'
      };
      if (knownNewsSectionMap[section]) {
        keys.push(knownNewsSectionMap[section]);
      }
      if (newsPath) {
        keys.push(newsPath);
        const slashIndex = newsPath.lastIndexOf('/');
        if (slashIndex > 0) {
          keys.push(newsPath.slice(0, slashIndex));
        }
        const normalizedNewsPath = newsPath.replaceAll(':', '/');
        keys.push(normalizedNewsPath);
        const normalizedSlashIndex = normalizedNewsPath.lastIndexOf('/');
        if (normalizedSlashIndex > 0) {
          keys.push(normalizedNewsPath.slice(0, normalizedSlashIndex));
        }
      }
      if (segments.length > 1) {
        keys.push(segments.slice(0, -1).join(':'));
      }
      if (segments.length > 2) {
        keys.push(segments.slice(0, -1).join('/'));
        keys.push(segments.slice(0, -2).join('/'));
      }
      if (segments.length > 0) {
        keys.push(segments.join('/'));
        if (segments.length > 1) {
          keys.push(segments.slice(0, -1).join('/'));
        }
      }
    }
  }

  return keys;
}

function normalizeLegacyKey(value) {
  return String(value || '').trim().toLowerCase().replace(/^\/+|\/+$/g, '');
}

function loadEntryTranslations(modelCode, entryIds) {
  if (!entryIds.length) {
    return new Map();
  }
  const translationTableName = getTranslationTableName(modelCode);
  const placeholders = entryIds.map(() => '?').join(', ');

  // 所有翻译表统一使用 created_at（已删除 published_at 字段）
  const rows = queryAll(
    `
      SELECT
        t.id,
        t.entry_id,
        t.language_id,
        l.code AS language_code,
        t.name,
        t.summary,
        t.content_html,
        t.keywords,
        t.seo_title,
        t.seo_keywords,
        t.seo_description,
        t.publish_status,
        t.created_at AS published_at
      FROM ${quoteIdentifier(translationTableName)} t
      INNER JOIN languages l ON l.id = t.language_id
      WHERE t.entry_id IN (${placeholders})
      ORDER BY t.entry_id ASC, l.sort_order ASC, l.id ASC
    `,
    entryIds
  );
  const map = new Map();
  for (const row of rows) {
    const list = map.get(Number(row.entry_id)) || [];
    list.push({
      id: Number(row.id),
      entry_id: Number(row.entry_id),
      language_id: Number(row.language_id),
      language_code: row.language_code,
      name: row.name || '',
      summary: row.summary || '',
      content_html: row.content_html || '',
      keywords: row.keywords || '',
      seo_title: row.seo_title || '',
      seo_keywords: row.seo_keywords || '',
      seo_description: row.seo_description || '',
      publish_status: normalizePublishStatus(row.publish_status),
      published_at: toNullableString(row.published_at)
    });
    map.set(Number(row.entry_id), list);
  }
  return map;
}

function saveEntryTranslations(translationTableName, entryId, translations, now) {
  const languageIdByCode = new Map(listLanguages().map((language) => [language.code, language.id]));

  // 所有翻译表统一不使用 published_at 字段（已删除）
  for (const [languageCode, translation] of Object.entries(translations || {})) {
    const languageId = languageIdByCode.get(languageCode);
    if (!languageId) {
      continue;
    }

    execute(
      `
        INSERT INTO ${quoteIdentifier(translationTableName)} (
          entry_id,
          language_id,
          name,
          summary,
          content_html,
          keywords,
          seo_title,
          seo_keywords,
          seo_description,
          publish_status,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(entry_id, language_id) DO UPDATE SET
          name = excluded.name,
          summary = excluded.summary,
          content_html = excluded.content_html,
          keywords = excluded.keywords,
          seo_title = excluded.seo_title,
          seo_keywords = excluded.seo_keywords,
          seo_description = excluded.seo_description,
          publish_status = excluded.publish_status,
          updated_at = excluded.updated_at
      `,
      [
        entryId,
        languageId,
        String(translation?.name || '').trim(),
        String(translation?.summary || ''),
        String(translation?.content_html || ''),
        toNullableString(translation?.keywords),
        toNullableString(translation?.seo_title),
        toNullableString(translation?.seo_keywords),
        toNullableString(translation?.seo_description),
        normalizePublishStatus(translation?.publish_status),
        now,
        now
      ]
    );
  }
}

function normalizeContentEntryInput(modelCode, input, { existingEntry = null } = {}) {
  const existing = existingEntry || {};
  const baseInput = input?.base || input || {};
  const columnId = toInteger(baseInput.column_id ?? existing.column_id, 0);
  if (columnId <= 0) {
    throw new Error('请选择所属栏目');
  }
  const column = getColumnById(columnId);
  if (!column) {
    throw new Error('所属栏目不存在');
  }
  const defaultLanguageCode = getDefaultLanguage()?.code || 'zh-CN';
  const images = modelCode === 'product'
    ? normalizeImageList(baseInput.images ?? existing.images)
    : [];
  const picture = modelCode === 'news'
    ? normalizeSingleImage(baseInput.picture ?? baseInput.image ?? existing.picture ?? existing.image)
    : '';
  const primaryImage = modelCode === 'product'
    ? (normalizeSingleImage(baseInput.primary_image ?? existing.primary_image) || images[0] || DEFAULT_PRODUCT_IMAGE)
    : picture;
  const customUrl = normalizeEntryCustomUrl(baseInput.custom_url ?? existing.custom_url);

  const fallbackBase = {
    name: modelCode === 'news' ? String(existing.title || existing.name || '') : String(existing.name || ''),
    summary: String(existing.summary || ''),
    content_html: String(existing.content_html || ''),
    keywords: String(existing.keywords || ''),
    seo_title: toNullableString(existing.seo_title),
    seo_keywords: toNullableString(existing.seo_keywords),
    seo_description: toNullableString(existing.seo_description),
    publish_status: normalizePublishStatus(existing.publish_status),
    created_at: toNullableString(existing.created_at)
  };

  const translations = normalizeTranslations(input?.translations || {}, {
    defaultLanguageCode,
    existingTranslations: existing.translations || {},
    fallbackBase,
    nameField: modelCode === 'news' ? 'title' : 'name',
    requiredNameError: modelCode === 'news' ? '请输入默认语言的标题' : '请输入默认语言的产品名称'
  });

  return {
    base: {
      column_id: column.id,
      custom_url: customUrl,
      code: toNullableString(baseInput.code ?? existing.code) || '',
      images: modelCode === 'product' ? JSON.stringify(images) : EMPTY_IMAGE_LIST,
      primary_image: modelCode === 'product' ? primaryImage : picture,
      is_visible: toBooleanInt(baseInput.is_visible ?? existing.is_visible, 1),
      is_featured_home: toBooleanInt(baseInput.is_featured_home ?? existing.is_featured_home ?? existing.is_featured, 0),
      sort_order: toInteger(baseInput.sort_order ?? existing.sort_order, 0),
      legacy_extra: baseInput.legacy_extra ?? existing.legacy_extra ?? null,
      created_at: toNullableString(baseInput.created_at ?? existing.created_at)
    },
    translations
  };
}

function normalizeTranslations(translations, {
  defaultLanguageCode,
  existingTranslations = {},
  fallbackBase,
  nameField = 'name',
  requiredNameError = '请输入默认语言的名称'
}) {
  const output = {};
  const knownCodes = new Set(listLanguages().map((language) => language.code));

  for (const [languageCode, value] of Object.entries(translations || {})) {
    if (!knownCodes.has(languageCode)) {
      continue;
    }
    const translationName = String(
      value?.[nameField]
      ?? value?.name
      ?? value?.title
      ?? existingTranslations?.[languageCode]?.[nameField]
      ?? existingTranslations?.[languageCode]?.name
      ?? existingTranslations?.[languageCode]?.title
      ?? ''
    ).trim();
    output[languageCode] = {
      name: translationName,
      summary: String(value?.summary ?? existingTranslations?.[languageCode]?.summary ?? fallbackBase.summary ?? ''),
      content_html: String(value?.content_html ?? existingTranslations?.[languageCode]?.content_html ?? fallbackBase.content_html ?? ''),
      keywords: toNullableString(value?.keywords ?? existingTranslations?.[languageCode]?.keywords ?? fallbackBase.keywords),
      seo_title: toNullableString(value?.seo_title ?? existingTranslations?.[languageCode]?.seo_title ?? fallbackBase.seo_title),
      seo_keywords: toNullableString(value?.seo_keywords ?? existingTranslations?.[languageCode]?.seo_keywords ?? fallbackBase.seo_keywords),
      seo_description: toNullableString(value?.seo_description ?? existingTranslations?.[languageCode]?.seo_description ?? fallbackBase.seo_description),
      publish_status: normalizePublishStatus(value?.publish_status ?? existingTranslations?.[languageCode]?.publish_status ?? fallbackBase.publish_status)
    };
  }

  if (!output[defaultLanguageCode]) {
    output[defaultLanguageCode] = {
      name: String(fallbackBase.name || '').trim(),
      summary: String(fallbackBase.summary || ''),
      content_html: String(fallbackBase.content_html || ''),
      keywords: toNullableString(fallbackBase.keywords),
      seo_title: toNullableString(fallbackBase.seo_title),
      seo_keywords: toNullableString(fallbackBase.seo_keywords),
      seo_description: toNullableString(fallbackBase.seo_description),
      publish_status: normalizePublishStatus(fallbackBase.publish_status)
    };
  }

  if (!String(output[defaultLanguageCode].name || '').trim()) {
    throw new Error(requiredNameError);
  }

  return output;
}

function resolveDefaultTranslation(translations, defaultLanguageCode) {
  return translations?.[defaultLanguageCode] || Object.values(translations || {})[0] || {
    name: '',
    summary: '',
    content_html: '',
    keywords: null,
    seo_title: null,
    seo_keywords: null,
    seo_description: null,
    publish_status: 'published'
  };
}

function mapEntryRow(modelCode, row) {
  const images = normalizeImageList(row.images);
  const primaryImage = resolvePrimaryImage(modelCode, row.primary_image, row.images);
  const base = {
    id: toInteger(row.id, 0),
    name: row.name || '',
    summary: row.summary || '',
    content_html: row.content_html || '',
    keywords: row.keywords || '',
    seo_title: row.seo_title ?? null,
    seo_keywords: row.seo_keywords ?? null,
    seo_description: row.seo_description ?? null,
    custom_url: row.custom_url || null,
    publish_status: normalizePublishStatus(row.translation_publish_status || row.publish_status),
    legacy_extra: row.legacy_extra || null,
    code: row.code || '',
    column_id: toNullableInteger(row.column_id),
    images,
    primary_image: primaryImage,
    is_visible: toBooleanInt(row.is_visible, 1),
    is_featured_home: toBooleanInt(row.is_featured_home, 0),
    sort_order: toInteger(row.sort_order, 0),
    category_name: row.category_name || undefined,
    current_language_code: row.current_language_code,
    created_at: row.created_at,
    updated_at: row.updated_at
  };

  if (modelCode === 'news') {
    return {
      ...base,
      title: base.name,
      picture: primaryImage,
      image: primaryImage,
      is_featured: base.is_featured_home
    };
  }
  return base;
}

function resolveLanguage(languageCode) {
  const languages = listLanguages();
  const defaultLanguage = getDefaultLanguage() || languages[0];
  const selected = languageCode
    ? languages.find((language) => language.code === languageCode)
    : defaultLanguage;
  return {
    code: selected?.code || defaultLanguage?.code || 'zh-CN',
    id: toInteger(selected?.id, toInteger(defaultLanguage?.id, 1)),
    default_id: toInteger(defaultLanguage?.id, toInteger(selected?.id, 1))
  };
}

function buildNameExpr(selectedAlias, defaultAlias) {
  return `coalesce(${selectedAlias}.name, ${defaultAlias}.name, '')`;
}

function normalizeImageList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }
  if (typeof value !== 'string') {
    return [];
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item || '').trim()).filter(Boolean);
    }
  } catch {
    // ignore
  }
  return trimmed.split(',').map((item) => item.trim()).filter(Boolean);
}

function normalizeImagesJson(value) {
  return JSON.stringify(normalizeImageList(value));
}

function normalizeSingleImage(value) {
  if (Array.isArray(value)) {
    return String(value[0] || '').trim();
  }
  return String(value || '').trim();
}

function normalizeEntryCustomUrl(value) {
  const normalized = toNullableString(value);
  if (!normalized) {
    return null;
  }
  if (/^https?:\/\//i.test(normalized)) {
    throw new Error('内容自定义文件名不能是完整网址');
  }

  let routePath = normalized.startsWith('/') ? normalized : `/${normalized}`;
  routePath = routePath.replace(/\/{2,}/g, '/');
  routePath = routePath.replace(/\/+$/g, '');

  if (routePath === '/') {
    throw new Error('内容自定义文件名不能为空');
  }

  const segments = routePath.split('/').filter(Boolean);
  if (segments.length === 0) {
    throw new Error('内容自定义文件名不能为空');
  }

  const lastSegment = segments[segments.length - 1] || '';
  if (!lastSegment.includes('.')) {
    throw new Error('内容自定义文件名必须包含文件名，例如 abcd/index.html');
  }

  return routePath;
}

function resolvePrimaryImage(modelCode, primaryImage, imagesValue) {
  const images = normalizeImageList(imagesValue);
  const resolved = normalizeSingleImage(primaryImage) || images[0] || '';
  if (modelCode === 'product') {
    return resolved || DEFAULT_PRODUCT_IMAGE;
  }
  return resolved;
}

function clampLimit(limit) {
  return Math.min(Math.max(toInteger(limit, 20), 1), 10000);
}

function toInteger(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toNullableInteger(value) {
  const parsed = toInteger(value, 0);
  return parsed > 0 ? parsed : null;
}

function toBooleanInt(value, fallback = 0) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  if (value === true || value === 'true' || value === '1' || value === 1) {
    return 1;
  }
  return 0;
}

function toNullableString(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const normalized = String(value).trim();
  return normalized === '' ? null : normalized;
}

function normalizePublishStatus(value) {
  return String(value || '').trim() === 'draft' ? 'draft' : 'published';
}

function getLegacySourceType(modelCode) {
  return modelCode === 'news' ? 'news_item' : 'product_item';
}


function buildLegacyEntryExtra(legacyExtra, columnId) {
  const parsed = parseLegacyExtra(legacyExtra);
  if (Object.keys(parsed).length > 0) {
    return JSON.stringify({
      ...parsed,
      legacy_column_id: columnId
    });
  }

  const base = String(legacyExtra || '').trim();
  if (!base) {
    return `legacy_column_id:${columnId}`;
  }
  if (base.includes('legacy_column_id:')) {
    return base;
  }
  return `${base}\nlegacy_column_id:${columnId}`;
}

function extractLegacyColumnId(legacyExtra) {
  const parsed = parseLegacyExtra(legacyExtra);
  const jsonValue = toInteger(parsed.legacy_column_id, 0);
  if (jsonValue > 0) {
    return jsonValue;
  }
  const text = String(legacyExtra || '');
  const match = text.match(/legacy_column_id:(\d+)/);
  return match ? Number.parseInt(match[1], 10) : null;
}

function parseLegacyExtra(value) {
  if (!value) {
    return {};
  }
  const raw = String(value).trim();
  const candidates = [raw];
  const newlineIndex = raw.indexOf('\n');
  if (newlineIndex > 0) {
    candidates.push(raw.slice(0, newlineIndex).trim());
  }
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    } catch {
      // ignore
    }
  }
  return {};
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}
