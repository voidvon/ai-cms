import { execute, queryAll, queryOne } from '../db.mjs';
import { getColumnById } from './columns.mjs';
import { ensureContentModelStorageSchema, getContentTableName, getTranslationTableName } from './content-model-storage.mjs';
import { getDefaultLanguage, listLanguages } from './languages.mjs';
import { normalizeUploadedRelativePath } from './uploads.mjs';

const EMPTY_IMAGE_LIST = '[]';

/**
 * 获取模型的字段配置
 */
function getModelFieldNames(modelCode) {
  const rows = queryAll(
    `SELECT field_name, is_translatable
     FROM content_model_fields
     WHERE model_code = ?
     ORDER BY sort_order`,
    [modelCode]
  );
  return {
    mainFields: rows.filter(r => r.is_translatable === 0).map(r => r.field_name),
    translationFields: rows.filter(r => r.is_translatable === 1).map(r => r.field_name)
  };
}

/**
 * 构建主表字段的 SELECT 子句
 * 对于不存在的字段，使用默认值
 */
function buildMainTableSelect(modelCode, alias = 'e') {
  const { mainFields } = getModelFieldNames(modelCode);
  const allPossibleFields = [
    'custom_url',
    'code',
    'images',
    'primary_image',
    'is_visible',
    'is_featured_home',
    'sort_order'
  ];

  const selectParts = allPossibleFields.map(field => {
    if (mainFields.includes(field)) {
      return `${alias}.${field}`;
    } else {
      // 字段不存在，返回默认值
      if (field === 'images') return `'[]' AS ${field}`;
      if (field === 'is_visible') return `1 AS ${field}`;
      if (field === 'is_featured_home') return `0 AS ${field}`;
      if (field === 'sort_order') return `0 AS ${field}`;
      return `NULL AS ${field}`;
    }
  });

  return selectParts.join(',\n        ');
}

function getTranslationCreatedAtExpr(translationAlias, defaultTranslationAlias, entryAlias) {
  return `coalesce(${translationAlias}.created_at, ${defaultTranslationAlias}.created_at, ${entryAlias}.created_at)`;
}

function getTranslationTemplateDataExpr(selectedAlias, defaultAlias) {
  return `coalesce(${selectedAlias}.template_data_json, ${defaultAlias}.template_data_json)`;
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
  const { mainFields } = getModelFieldNames(modelCode);
  const whereParts = [];

  // 只有当字段存在时才添加过滤条件
  if (visibleOnly && mainFields.includes('is_visible')) {
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
        ${buildMainTableSelect(modelCode, 'e')},
        e.created_at,
        e.updated_at,
        ${buildNameExpr('t', 'dt')} AS name,
        coalesce(t.summary, dt.summary, '') AS summary,
        coalesce(t.content_html, dt.content_html, '') AS content_html,
        ${getTranslationTemplateDataExpr('t', 'dt')} AS template_data_json,
        coalesce(t.seo_title, dt.seo_title) AS seo_title,
        coalesce(t.seo_description, dt.seo_description) AS seo_description,
        coalesce(t.publish_status, dt.publish_status, 'published') AS translation_publish_status,
        ${getTranslationCreatedAtExpr('t', 'dt', 'e')} AS translation_created_at,
        coalesce(tc.name, dtc.name, '') AS column_name,
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
  const { mainFields } = getModelFieldNames(modelCode);

  // 只有当字段存在时才添加过滤条件
  if (visibleOnly && mainFields.includes('is_visible')) {
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
        ${buildMainTableSelect(modelCode, 'e')},
        e.created_at,
        e.updated_at,
        ${buildNameExpr('t', 'dt')} AS name,
        coalesce(t.summary, dt.summary, '') AS summary,
        coalesce(t.content_html, dt.content_html, '') AS content_html,
        ${getTranslationTemplateDataExpr('t', 'dt')} AS template_data_json,
        coalesce(t.seo_title, dt.seo_title) AS seo_title,
        coalesce(t.seo_description, dt.seo_description) AS seo_description,
        coalesce(t.publish_status, dt.publish_status, 'published') AS translation_publish_status,
        ${getTranslationCreatedAtExpr('t', 'dt', 'e')} AS translation_created_at,
        coalesce(tc.name, dtc.name, '') AS column_name,
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
        ${buildMainTableSelect(modelCode, 'e')},
        e.created_at,
        e.updated_at,
        ${buildNameExpr('t', 'dt')} AS name,
        coalesce(t.summary, dt.summary, '') AS summary,
        coalesce(t.content_html, dt.content_html, '') AS content_html,
        ${getTranslationTemplateDataExpr('t', 'dt')} AS template_data_json,
        coalesce(t.seo_title, dt.seo_title) AS seo_title,
        coalesce(t.seo_description, dt.seo_description) AS seo_description,
        coalesce(t.publish_status, dt.publish_status, 'published') AS translation_publish_status,
        ${getTranslationCreatedAtExpr('t', 'dt', 'e')} AS translation_created_at,
        coalesce(tc.name, dtc.name, '') AS column_name,
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
          template_data_json: translation.template_data_json,
          template_data: parseTemplateDataJson(translation.template_data_json),
          seo_title: translation.seo_title,
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
  const { mainFields } = getModelFieldNames(modelCode);
  const defaultLanguage = getDefaultLanguage();
  const defaultTranslation = resolveDefaultTranslation(payload.translations, defaultLanguage?.code);
  const now = new Date().toISOString();
  const insertFields = ['column_id'];
  const insertValues = [payload.base.column_id];

  appendMainTableField(insertFields, insertValues, 'custom_url', payload.base.custom_url, mainFields);
  appendMainTableField(insertFields, insertValues, 'code', payload.base.code, mainFields);
  appendMainTableField(insertFields, insertValues, 'images', payload.base.images, mainFields);
  appendMainTableField(insertFields, insertValues, 'primary_image', payload.base.primary_image, mainFields);
  appendMainTableField(insertFields, insertValues, 'is_visible', payload.base.is_visible, mainFields);
  appendMainTableField(insertFields, insertValues, 'is_featured_home', payload.base.is_featured_home, mainFields);
  appendMainTableField(insertFields, insertValues, 'sort_order', payload.base.sort_order, mainFields);
  insertFields.push('created_at', 'updated_at');
  insertValues.push(payload.base.created_at || now, now);
  const placeholders = insertFields.map(() => '?').join(', ');

  const result = execute(
    `
      INSERT INTO ${quoteIdentifier(tableName)} (
        ${insertFields.join(',\n        ')}
      ) VALUES (${placeholders})
    `,
    insertValues
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
  const { mainFields } = getModelFieldNames(modelCode);
  const defaultLanguage = getDefaultLanguage();
  const now = new Date().toISOString();
  const updateAssignments = ['column_id = ?'];
  const updateValues = [payload.base.column_id];

  appendMainTableAssignment(updateAssignments, updateValues, 'custom_url', payload.base.custom_url, mainFields);
  appendMainTableAssignment(updateAssignments, updateValues, 'code', payload.base.code, mainFields);
  appendMainTableAssignment(updateAssignments, updateValues, 'images', payload.base.images, mainFields);
  appendMainTableAssignment(updateAssignments, updateValues, 'primary_image', payload.base.primary_image, mainFields);
  appendMainTableAssignment(updateAssignments, updateValues, 'is_visible', payload.base.is_visible, mainFields);
  appendMainTableAssignment(updateAssignments, updateValues, 'is_featured_home', payload.base.is_featured_home, mainFields);
  appendMainTableAssignment(updateAssignments, updateValues, 'sort_order', payload.base.sort_order, mainFields);
  updateAssignments.push('created_at = ?', 'updated_at = ?');
  updateValues.push(payload.base.created_at || existing.created_at || now, now, id);

  execute(
    `
      UPDATE ${quoteIdentifier(tableName)}
      SET
        ${updateAssignments.join(',\n        ')}
      WHERE id = ?
    `,
    updateValues
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

function loadEntryTranslations(modelCode, entryIds) {
  if (!entryIds.length) {
    return new Map();
  }
  const translationTableName = getTranslationTableName(modelCode);
  const placeholders = entryIds.map(() => '?').join(', ');

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
        t.template_data_json,
        t.seo_title,
        t.seo_description,
        t.publish_status
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
      template_data_json: row.template_data_json || null,
      seo_title: row.seo_title || '',
      seo_description: row.seo_description || '',
      publish_status: normalizePublishStatus(row.publish_status)
    });
    map.set(Number(row.entry_id), list);
  }
  return map;
}

function appendMainTableField(fields, values, fieldName, fieldValue, mainFields) {
  if (!mainFields.includes(fieldName)) {
    return;
  }
  fields.push(fieldName);
  values.push(fieldValue);
}

function appendMainTableAssignment(assignments, values, fieldName, fieldValue, mainFields) {
  if (!mainFields.includes(fieldName)) {
    return;
  }
  assignments.push(`${fieldName} = ?`);
  values.push(fieldValue);
}

function saveEntryTranslations(translationTableName, entryId, translations, now) {
  const languageIdByCode = new Map(listLanguages().map((language) => [language.code, language.id]));

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
          template_data_json,
          seo_title,
          seo_description,
          publish_status,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(entry_id, language_id) DO UPDATE SET
          name = excluded.name,
          summary = excluded.summary,
          content_html = excluded.content_html,
          template_data_json = excluded.template_data_json,
          seo_title = excluded.seo_title,
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
        normalizeTemplateDataJson(translation?.template_data_json ?? translation?.template_data ?? null),
        toNullableString(translation?.seo_title),
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
    ? (normalizeSingleImage(baseInput.primary_image ?? existing.primary_image) || images[0] || '')
    : picture;
  const customUrl = normalizeEntryCustomUrl(baseInput.custom_url ?? existing.custom_url);

  const fallbackBase = {
    name: modelCode === 'news' ? String(existing.title || existing.name || '') : String(existing.name || ''),
    summary: String(existing.summary || ''),
    content_html: String(existing.content_html || ''),
    template_data_json: existing.template_data_json ?? existing.template_data ?? null,
    seo_title: toNullableString(existing.seo_title),
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
      template_data_json: normalizeTemplateDataJson(value?.template_data_json ?? value?.template_data ?? existingTranslations?.[languageCode]?.template_data_json ?? existingTranslations?.[languageCode]?.template_data ?? fallbackBase.template_data_json ?? fallbackBase.template_data ?? null),
      seo_title: toNullableString(value?.seo_title ?? existingTranslations?.[languageCode]?.seo_title ?? fallbackBase.seo_title),
      seo_description: toNullableString(value?.seo_description ?? existingTranslations?.[languageCode]?.seo_description ?? fallbackBase.seo_description),
      publish_status: normalizePublishStatus(value?.publish_status ?? existingTranslations?.[languageCode]?.publish_status ?? fallbackBase.publish_status)
    };
  }

  if (!output[defaultLanguageCode]) {
    output[defaultLanguageCode] = {
      name: String(fallbackBase.name || '').trim(),
      summary: String(fallbackBase.summary || ''),
      content_html: String(fallbackBase.content_html || ''),
      template_data_json: normalizeTemplateDataJson(fallbackBase.template_data_json ?? fallbackBase.template_data ?? null),
      seo_title: toNullableString(fallbackBase.seo_title),
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
    template_data_json: null,
    seo_title: null,
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
    template_data_json: row.template_data_json || null,
    template_data: parseTemplateDataJson(row.template_data_json),
    seo_title: row.seo_title ?? null,
    seo_description: row.seo_description ?? null,
    custom_url: row.custom_url || null,
    publish_status: normalizePublishStatus(row.translation_publish_status || row.publish_status),
    code: row.code || '',
    column_id: toNullableInteger(row.column_id),
    images,
    primary_image: primaryImage,
    is_visible: toBooleanInt(row.is_visible, 1),
    is_featured_home: toBooleanInt(row.is_featured_home, 0),
    sort_order: toInteger(row.sort_order, 0),
    column_name: row.column_name || undefined,
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
    return value
      .map((item) => normalizeUploadedRelativePath(String(item || '').trim()))
      .filter(Boolean);
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
      return parsed
        .map((item) => normalizeUploadedRelativePath(String(item || '').trim()))
        .filter(Boolean);
    }
  } catch {
    // ignore
  }
  return trimmed
    .split(',')
    .map((item) => normalizeUploadedRelativePath(item.trim()))
    .filter(Boolean);
}

function normalizeImagesJson(value) {
  return JSON.stringify(normalizeImageList(value));
}

function normalizeSingleImage(value) {
  if (Array.isArray(value)) {
    return normalizeUploadedRelativePath(String(value[0] || '').trim());
  }
  return normalizeUploadedRelativePath(String(value || '').trim());
}

function normalizeTemplateDataJson(value) {
  if (value == null || value === '') {
    return null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    JSON.parse(trimmed);
    return trimmed;
  }
  if (typeof value !== 'object') {
    throw new Error('template_data_json must be a JSON object or array');
  }
  return JSON.stringify(value);
}

function parseTemplateDataJson(value) {
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeEntryCustomUrl(value) {
  const normalized = toNullableString(value);
  if (!normalized) {
    return null;
  }
  if (/^https?:\/\//i.test(normalized)) {
    throw new Error('内容自定义文件名不能是完整网址');
  }

  let routePath = normalized.replace(/\/{2,}/g, '/');
  routePath = routePath.replace(/\/+$/g, '');

  if (!routePath || routePath === '/') {
    throw new Error('内容自定义文件名不能为空');
  }

  const segments = routePath.replace(/^\/+/, '').split('/').filter(Boolean);
  if (segments.length === 0) {
    throw new Error('内容自定义文件名不能为空');
  }

  const lastSegment = segments[segments.length - 1] || '';
  if (!lastSegment.includes('.')) {
    throw new Error('内容自定义文件名必须包含文件名，例如 abcd/index.html');
  }

  return normalized.startsWith('/') ? `/${segments.join('/')}` : segments.join('/');
}

function resolvePrimaryImage(modelCode, primaryImage, imagesValue) {
  const images = normalizeImageList(imagesValue);
  const resolved = normalizeSingleImage(primaryImage) || images[0] || '';
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

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}
