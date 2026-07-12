import { execute, queryAll, queryOne } from '../db.mjs';
import { getColumnById } from './columns.mjs';
import { listConfiguredModelFields } from './content-model-fields.mjs';
import { ensureContentModelStorageSchema, getContentTableName, getTranslationTableName } from './content-model-storage.mjs';
import { getDefaultLanguage, listLanguages } from './languages.mjs';
import { normalizeUploadedRelativePath } from './uploads.mjs';
import { normalizeTemplateDataAssetsDeep } from './template-data-assets.mjs';
import { assertStructuredContentHtmlPreserved } from './structured-content-html.mjs';

const EMPTY_IMAGE_LIST = '[]';
const SYSTEM_FIELD_NAMES = new Set([
  'id',
  'column_id',
  'custom_url',
  'code',
  'images',
  'spec_options_json',
  'primary_image',
  'is_visible',
  'is_featured_home',
  'sort_order',
  'created_at',
  'updated_at',
  'name',
  'summary',
  'content_html',
  'template_data_json',
  'seo_title',
  'seo_description',
  'publish_status'
]);

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

function getModelFieldNameSet(modelCode) {
  const { mainFields, translationFields } = getModelFieldNames(modelCode);
  return new Set([...mainFields, ...translationFields]);
}

function isFieldTranslatable(modelCode, fieldName) {
  return getModelFieldNames(modelCode).translationFields.includes(fieldName);
}

function hasTranslatableFields(modelCode) {
  return getModelFieldNames(modelCode).translationFields.length > 0;
}

function getDynamicModelFields(modelCode) {
  return listConfiguredModelFields(modelCode)
    .filter((field) => !SYSTEM_FIELD_NAMES.has(String(field.field_name || '').trim()))
    .sort((left, right) => {
      if (Number(left.sort_order || 0) !== Number(right.sort_order || 0)) {
        return Number(left.sort_order || 0) - Number(right.sort_order || 0);
      }
      return String(left.field_name || '').localeCompare(String(right.field_name || ''));
    });
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
    'spec_options_json',
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
      if (field === 'spec_options_json') return `'[]' AS ${field}`;
      if (field === 'is_visible') return `1 AS ${field}`;
      if (field === 'is_featured_home') return `0 AS ${field}`;
      if (field === 'sort_order') return `0 AS ${field}`;
      return `NULL AS ${field}`;
    }
  });

  return selectParts.join(',\n        ');
}

function buildDynamicFieldSelect(modelCode, mainAlias = 'e') {
  const fields = getDynamicModelFields(modelCode);
  if (!fields.length) {
    return '';
  }

  return fields.map((field) => {
    const fieldName = quoteIdentifier(field.field_name);
    if (Number(field.is_translatable || 0) === 1) {
      return `coalesce(t.${fieldName}, dt.${fieldName}, ft.${fieldName}, '') AS ${fieldName}`;
    }
    return `${mainAlias}.${fieldName}`;
  }).join(',\n        ');
}

function buildContentValueExpr(modelCode, fieldName, {
  mainAlias = 'e',
  emptyFallback = "''",
  nullFallback = 'NULL',
  publishFallback = "'published'"
} = {}) {
  const { mainFields, translationFields } = getModelFieldNames(modelCode);
  const quotedFieldName = quoteIdentifier(fieldName);

  if (translationFields.includes(fieldName)) {
    if (fieldName === 'publish_status') {
      return `coalesce(t.${quotedFieldName}, dt.${quotedFieldName}, ft.${quotedFieldName}, ${publishFallback})`;
    }
    if (fieldName === 'seo_title' || fieldName === 'seo_description') {
      return `coalesce(t.${quotedFieldName}, dt.${quotedFieldName}, ft.${quotedFieldName})`;
    }
    return `coalesce(t.${quotedFieldName}, dt.${quotedFieldName}, ft.${quotedFieldName}, ${emptyFallback})`;
  }

  if (mainFields.includes(fieldName)) {
    return `${mainAlias}.${quotedFieldName}`;
  }

  if (fieldName === 'publish_status') {
    return publishFallback;
  }
  if (fieldName === 'seo_title' || fieldName === 'seo_description') {
    return nullFallback;
  }
  return emptyFallback;
}

function getTranslationCreatedAtExpr(translationAlias, defaultTranslationAlias, entryAlias) {
  return `coalesce(${translationAlias}.created_at, ${defaultTranslationAlias}.created_at, ft.created_at, ${entryAlias}.created_at)`;
}

function getTranslationTemplateDataExpr(selectedAlias, defaultAlias) {
  return `coalesce(${selectedAlias}.template_data_json, ${defaultAlias}.template_data_json, ft.template_data_json)`;
}

function getFallbackTranslationJoin(translationTableName) {
  return `
      LEFT JOIN ${quoteIdentifier(translationTableName)} ft
        ON ft.id = (
          SELECT inner_t.id
          FROM ${quoteIdentifier(translationTableName)} inner_t
          INNER JOIN languages inner_l ON inner_l.id = inner_t.language_id
          WHERE inner_t.entry_id = e.id
          ORDER BY inner_l.sort_order ASC, inner_l.id ASC, inner_t.id ASC
          LIMIT 1
        )
      LEFT JOIN languages fl ON fl.id = ft.language_id
  `;
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
        ${buildDynamicFieldSelect(modelCode) ? `${buildDynamicFieldSelect(modelCode)},` : ''}
        e.created_at,
        e.updated_at,
        ${buildContentValueExpr(modelCode, 'name')} AS name,
        ${buildContentValueExpr(modelCode, 'summary')} AS summary,
        ${buildContentValueExpr(modelCode, 'content_html')} AS content_html,
        ${getTranslationTemplateDataExpr('t', 'dt')} AS template_data_json,
        ${buildContentValueExpr(modelCode, 'seo_title')} AS seo_title,
        ${buildContentValueExpr(modelCode, 'seo_description')} AS seo_description,
        ${buildContentValueExpr(modelCode, 'publish_status')} AS translation_publish_status,
        ${getTranslationCreatedAtExpr('t', 'dt', 'e')} AS translation_created_at,
        coalesce(tc.name, dtc.name, '') AS column_name,
        ? AS requested_language_code,
        coalesce(l.code, dl.code, fl.code, ?) AS current_language_code
      FROM ${quoteIdentifier(tableName)} e
      LEFT JOIN ${quoteIdentifier(translationTableName)} t ON t.entry_id = e.id AND t.language_id = ?
      LEFT JOIN ${quoteIdentifier(translationTableName)} dt ON dt.entry_id = e.id AND dt.language_id = ?
      LEFT JOIN languages l ON l.id = t.language_id
      LEFT JOIN languages dl ON dl.id = dt.language_id
      ${getFallbackTranslationJoin(translationTableName)}
      LEFT JOIN columns c ON c.id = e.column_id
      LEFT JOIN column_translations tc ON tc.column_id = c.id AND tc.language_id = ?
      LEFT JOIN column_translations dtc ON dtc.column_id = c.id AND dtc.language_id = ?
      ${whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : ''}
      ORDER BY ${buildContentEntryOrderClause(modelCode)}
      LIMIT ?
    `,
    [
      selectedLanguage.code,
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

  const queryParams = [...params];
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
        ${buildDynamicFieldSelect(modelCode) ? `${buildDynamicFieldSelect(modelCode)},` : ''}
        e.created_at,
        e.updated_at,
        ${buildContentValueExpr(modelCode, 'name')} AS name,
        ${buildContentValueExpr(modelCode, 'summary')} AS summary,
        ${buildContentValueExpr(modelCode, 'content_html')} AS content_html,
        ${getTranslationTemplateDataExpr('t', 'dt')} AS template_data_json,
        ${buildContentValueExpr(modelCode, 'seo_title')} AS seo_title,
        ${buildContentValueExpr(modelCode, 'seo_description')} AS seo_description,
        ${buildContentValueExpr(modelCode, 'publish_status')} AS translation_publish_status,
        ${getTranslationCreatedAtExpr('t', 'dt', 'e')} AS translation_created_at,
        coalesce(tc.name, dtc.name, '') AS column_name,
        ? AS requested_language_code,
        coalesce(l.code, dl.code, fl.code, ?) AS current_language_code
      FROM ${quoteIdentifier(tableName)} e
      LEFT JOIN ${quoteIdentifier(translationTableName)} t ON t.entry_id = e.id AND t.language_id = ?
      LEFT JOIN ${quoteIdentifier(translationTableName)} dt ON dt.entry_id = e.id AND dt.language_id = ?
      LEFT JOIN languages l ON l.id = t.language_id
      LEFT JOIN languages dl ON dl.id = dt.language_id
      ${getFallbackTranslationJoin(translationTableName)}
      LEFT JOIN columns c ON c.id = e.column_id
      LEFT JOIN column_translations tc ON tc.column_id = c.id AND tc.language_id = ?
      LEFT JOIN column_translations dtc ON dtc.column_id = c.id AND dtc.language_id = ?
      ${where}
      ORDER BY ${buildContentEntryOrderClause(modelCode)}
      LIMIT ?
      OFFSET ?
    `,
    hasColumnFilter && includeDescendants
      ? [safeColumnId, selectedLanguage.code, ...queryParams, safeLimit, offset]
      : [selectedLanguage.code, ...queryParams, safeLimit, offset]
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
        ${buildDynamicFieldSelect(modelCode) ? `${buildDynamicFieldSelect(modelCode)},` : ''}
        e.created_at,
        e.updated_at,
        ${buildContentValueExpr(modelCode, 'name')} AS name,
        ${buildContentValueExpr(modelCode, 'summary')} AS summary,
        ${buildContentValueExpr(modelCode, 'content_html')} AS content_html,
        ${getTranslationTemplateDataExpr('t', 'dt')} AS template_data_json,
        ${buildContentValueExpr(modelCode, 'seo_title')} AS seo_title,
        ${buildContentValueExpr(modelCode, 'seo_description')} AS seo_description,
        ${buildContentValueExpr(modelCode, 'publish_status')} AS translation_publish_status,
        ${getTranslationCreatedAtExpr('t', 'dt', 'e')} AS translation_created_at,
        coalesce(tc.name, dtc.name, '') AS column_name,
        ? AS requested_language_code,
        coalesce(l.code, dl.code, fl.code, ?) AS current_language_code
      FROM ${quoteIdentifier(tableName)} e
      LEFT JOIN ${quoteIdentifier(translationTableName)} t ON t.entry_id = e.id AND t.language_id = ?
      LEFT JOIN ${quoteIdentifier(translationTableName)} dt ON dt.entry_id = e.id AND dt.language_id = ?
      LEFT JOIN languages l ON l.id = t.language_id
      LEFT JOIN languages dl ON dl.id = dt.language_id
      ${getFallbackTranslationJoin(translationTableName)}
      LEFT JOIN columns c ON c.id = e.column_id
      LEFT JOIN column_translations tc ON tc.column_id = c.id AND tc.language_id = ?
      LEFT JOIN column_translations dtc ON dtc.column_id = c.id AND dtc.language_id = ?
      WHERE e.id = ?
    `,
    [
      selectedLanguage.code,
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
          publish_status: translation.publish_status,
          ...translation.dynamic_fields
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
  const now = new Date().toISOString();
  const insertFields = ['column_id'];
  const insertValues = [payload.base.column_id];
  const dynamicFields = getDynamicModelFields(modelCode);

  appendMainTableField(insertFields, insertValues, 'name', payload.base.name, mainFields);
  appendMainTableField(insertFields, insertValues, 'custom_url', payload.base.custom_url, mainFields);
  appendMainTableField(insertFields, insertValues, 'code', payload.base.code, mainFields);
  appendMainTableField(insertFields, insertValues, 'images', payload.base.images, mainFields);
  appendMainTableField(insertFields, insertValues, 'spec_options_json', payload.base.spec_options_json, mainFields);
  appendMainTableField(insertFields, insertValues, 'primary_image', payload.base.primary_image, mainFields);
  appendMainTableField(insertFields, insertValues, 'is_visible', payload.base.is_visible, mainFields);
  appendMainTableField(insertFields, insertValues, 'is_featured_home', payload.base.is_featured_home, mainFields);
  appendMainTableField(insertFields, insertValues, 'sort_order', payload.base.sort_order, mainFields);
  appendDynamicMainTableFieldValues(insertFields, insertValues, payload.base.dynamic_fields, dynamicFields);
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

  saveEntryTranslations(translationTableName, result.lastInsertRowid, payload.translations, now, dynamicFields);
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
  assertStructuredTranslationHtmlPreserved(existing.translations, payload.translations);
  const tableName = getContentTableName(modelCode);
  const translationTableName = getTranslationTableName(modelCode);
  const { mainFields } = getModelFieldNames(modelCode);
  const now = new Date().toISOString();
  const updateAssignments = ['column_id = ?'];
  const updateValues = [payload.base.column_id];
  const dynamicFields = getDynamicModelFields(modelCode);

  appendMainTableAssignment(updateAssignments, updateValues, 'name', payload.base.name, mainFields);
  appendMainTableAssignment(updateAssignments, updateValues, 'custom_url', payload.base.custom_url, mainFields);
  appendMainTableAssignment(updateAssignments, updateValues, 'code', payload.base.code, mainFields);
  appendMainTableAssignment(updateAssignments, updateValues, 'images', payload.base.images, mainFields);
  appendMainTableAssignment(updateAssignments, updateValues, 'spec_options_json', payload.base.spec_options_json, mainFields);
  appendMainTableAssignment(updateAssignments, updateValues, 'primary_image', payload.base.primary_image, mainFields);
  appendMainTableAssignment(updateAssignments, updateValues, 'is_visible', payload.base.is_visible, mainFields);
  appendMainTableAssignment(updateAssignments, updateValues, 'is_featured_home', payload.base.is_featured_home, mainFields);
  appendMainTableAssignment(updateAssignments, updateValues, 'sort_order', payload.base.sort_order, mainFields);
  appendDynamicMainTableAssignments(updateAssignments, updateValues, payload.base.dynamic_fields, dynamicFields);
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

  saveEntryTranslations(translationTableName, id, payload.translations, now, dynamicFields);
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
  const dynamicFields = getDynamicModelFields(modelCode).filter((field) => Number(field.is_translatable || 0) === 1);
  const placeholders = entryIds.map(() => '?').join(', ');
  const dynamicSelect = dynamicFields.length
    ? `${dynamicFields.map((field) => `t.${quoteIdentifier(field.field_name)}`).join(',\n        ')},`
    : '';

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
        ${dynamicSelect}
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
      publish_status: normalizePublishStatus(row.publish_status),
      dynamic_fields: extractDynamicFieldValues(row, dynamicFields)
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

function appendDynamicMainTableFieldValues(fields, values, dynamicValues, dynamicFields) {
  dynamicFields
    .filter((field) => Number(field.is_translatable || 0) === 0)
    .forEach((field) => {
      fields.push(quoteIdentifier(field.field_name));
      values.push(dynamicValues?.[field.field_name] ?? null);
    });
}

function appendDynamicMainTableAssignments(assignments, values, dynamicValues, dynamicFields) {
  dynamicFields
    .filter((field) => Number(field.is_translatable || 0) === 0)
    .forEach((field) => {
      assignments.push(`${quoteIdentifier(field.field_name)} = ?`);
      values.push(dynamicValues?.[field.field_name] ?? null);
    });
}

function saveEntryTranslations(translationTableName, entryId, translations, now, dynamicFields = []) {
  const languageIdByCode = new Map(listLanguages().map((language) => [language.code, language.id]));
  const translationFields = dynamicFields.filter((field) => Number(field.is_translatable || 0) === 1);

  for (const [languageCode, translation] of Object.entries(translations || {})) {
    const languageId = languageIdByCode.get(languageCode);
    if (!languageId) {
      continue;
    }

    const dynamicColumnNames = translationFields.map((field) => quoteIdentifier(field.field_name));
    const dynamicValues = translationFields.map((field) => translation?.dynamic_fields?.[field.field_name] ?? '');
    const insertDynamicColumns = dynamicColumnNames.length ? `,\n          ${dynamicColumnNames.join(',\n          ')}` : '';
    const insertDynamicPlaceholders = dynamicColumnNames.length ? `, ${dynamicColumnNames.map(() => '?').join(', ')}` : '';
    const updateDynamicAssignments = dynamicColumnNames.length
      ? `,\n          ${dynamicColumnNames.map((columnName) => `${columnName} = excluded.${columnName}`).join(',\n          ')}`
      : '';

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
          ${insertDynamicColumns ? `${insertDynamicColumns.slice(2)},` : ''}
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?${insertDynamicPlaceholders}, ?, ?)
        ON CONFLICT(entry_id, language_id) DO UPDATE SET
          name = excluded.name,
          summary = excluded.summary,
          content_html = excluded.content_html,
          template_data_json = excluded.template_data_json,
          seo_title = excluded.seo_title,
          seo_description = excluded.seo_description,
          publish_status = excluded.publish_status,
          ${updateDynamicAssignments ? `${updateDynamicAssignments.slice(2)},` : ''}
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
        ...dynamicValues,
        now,
        now
      ]
    );
  }
}

function normalizeContentEntryInput(modelCode, input, { existingEntry = null } = {}) {
  const existing = existingEntry || {};
  const baseInput = input?.base || input || {};
  const fieldNames = getModelFieldNameSet(modelCode);
  const columnId = toInteger(baseInput.column_id ?? existing.column_id, 0);
  if (columnId <= 0) {
    throw new Error('请选择所属栏目');
  }
  const column = getColumnById(columnId);
  if (!column) {
    throw new Error('所属栏目不存在');
  }
  const defaultLanguageCode = getDefaultLanguage()?.code || 'zh-CN';
  const supportsImageGallery = fieldNames.has('images');
  const supportsPrimaryImage = fieldNames.has('primary_image');
  const supportsSpecOptions = fieldNames.has('spec_options_json');
  const dynamicFields = getDynamicModelFields(modelCode);
  const nameStoredOnMainTable = fieldNames.has('name') && !isFieldTranslatable(modelCode, 'name');
  const images = supportsImageGallery
    ? normalizeImageList(baseInput.images ?? existing.images)
    : [];
  const specOptions = supportsSpecOptions
    ? normalizeSpecOptionsJson(baseInput.spec_options_json ?? existing.spec_options_json)
    : '[]';
  const singleImage = normalizeSingleImage(baseInput.picture ?? baseInput.image ?? existing.picture ?? existing.image);
  const primaryImage = supportsPrimaryImage
    ? (normalizeSingleImage(baseInput.primary_image ?? existing.primary_image) || images[0] || singleImage || '')
    : singleImage;
  const customUrl = normalizeEntryCustomUrl(baseInput.custom_url ?? existing.custom_url);
  const nameField = resolveTranslationNameField(baseInput, input?.translations, existing);
  const baseName = nameStoredOnMainTable
    ? String(baseInput.name ?? existing.name ?? '').trim()
    : '';

  const fallbackBase = {
    name: String(existing.title || existing.name || '').trim(),
    summary: String(existing.summary || ''),
    content_html: String(existing.content_html || ''),
    template_data_json: existing.template_data_json ?? existing.template_data ?? null,
    seo_title: toNullableString(existing.seo_title),
    seo_description: toNullableString(existing.seo_description),
    publish_status: normalizePublishStatus(existing.publish_status),
    created_at: toNullableString(existing.created_at),
    ...extractDynamicFieldValues(existing, dynamicFields)
  };

  if (nameStoredOnMainTable && !baseName) {
    throw new Error('请输入名称');
  }

  const translations = hasTranslatableFields(modelCode)
    ? normalizeTranslations(input?.translations || {}, {
        defaultLanguageCode,
        existingTranslations: existing.translations || {},
        fallbackBase,
        dynamicFields,
        nameField,
        requiredNameError: '请输入默认语言的名称'
      })
    : {};

  return {
    base: {
      column_id: column.id,
      name: baseName,
      custom_url: customUrl,
      code: toNullableString(baseInput.code ?? existing.code) || '',
      images: supportsImageGallery ? JSON.stringify(images) : EMPTY_IMAGE_LIST,
      spec_options_json: specOptions,
      primary_image: primaryImage,
      is_visible: toBooleanInt(baseInput.is_visible ?? existing.is_visible, 1),
      is_featured_home: toBooleanInt(baseInput.is_featured_home ?? existing.is_featured_home ?? existing.is_featured, 0),
      sort_order: toInteger(baseInput.sort_order ?? existing.sort_order, 0),
      created_at: toNullableString(baseInput.created_at ?? existing.created_at),
      dynamic_fields: normalizeDynamicBaseFields(baseInput, existing, dynamicFields)
    },
    translations
  };
}

function assertStructuredTranslationHtmlPreserved(existingTranslations = {}, nextTranslations = {}) {
  for (const [languageCode, existingTranslation] of Object.entries(existingTranslations || {})) {
    const nextTranslation = nextTranslations?.[languageCode];
    if (!nextTranslation) {
      continue;
    }
    assertStructuredContentHtmlPreserved(
      existingTranslation?.content_html,
      nextTranslation?.content_html,
      { languageCode }
    );
  }
}

function normalizeTranslations(translations, {
  defaultLanguageCode,
  existingTranslations = {},
  fallbackBase,
  dynamicFields = [],
  nameField = 'name',
  requiredNameError = '请输入默认语言的名称'
}) {
  const output = {};
  const knownCodes = new Set(listLanguages().map((language) => language.code));
  const translatableFields = dynamicFields.filter((field) => Number(field.is_translatable || 0) === 1);

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
      publish_status: normalizePublishStatus(value?.publish_status ?? existingTranslations?.[languageCode]?.publish_status ?? fallbackBase.publish_status),
      dynamic_fields: normalizeDynamicTranslationFields(value, existingTranslations?.[languageCode], fallbackBase, translatableFields)
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
      publish_status: normalizePublishStatus(fallbackBase.publish_status),
      dynamic_fields: normalizeDynamicTranslationFields({}, existingTranslations?.[defaultLanguageCode], fallbackBase, translatableFields)
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
  const primaryImage = resolvePrimaryImage(row.primary_image, row.images);
  const specOptions = parseSpecOptionsJson(row.spec_options_json);
  const requestedLanguageCode = row.requested_language_code || row.current_language_code || null;
  const resolvedLanguageCode = row.current_language_code || requestedLanguageCode;
  const dynamicFields = getDynamicModelFields(modelCode);
  const base = {
    id: toInteger(row.id, 0),
    name: row.name || '',
    summary: row.summary || '',
    content_html: row.content_html || '',
    template_data_json: row.template_data_json || null,
    template_data: parseTemplateDataJson(row.template_data_json),
    spec_options_json: normalizeSpecOptionsJson(row.spec_options_json),
    spec_options: specOptions,
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
    current_language_code: resolvedLanguageCode,
    requested_language_code: requestedLanguageCode,
    resolved_language_code: resolvedLanguageCode,
    fallback_language_code: resolvedLanguageCode && requestedLanguageCode && resolvedLanguageCode !== requestedLanguageCode
      ? resolvedLanguageCode
      : null,
    is_language_fallback: Boolean(
      resolvedLanguageCode
      && requestedLanguageCode
      && resolvedLanguageCode !== requestedLanguageCode
    ),
    created_at: row.created_at,
    updated_at: row.updated_at,
    dynamic_fields: extractDynamicFieldValues(row, dynamicFields)
  };

  const entry = {
    ...base,
    title: base.name,
    picture: primaryImage,
    image: primaryImage,
    is_featured: base.is_featured_home
  };

  dynamicFields.forEach((field) => {
    entry[field.field_name] = entry.dynamic_fields[field.field_name];
  });

  return entry;
}

export function resolveContentEntryComparator(modelCode) {
  return hasSortableContentEntries(modelCode)
    ? compareEntriesBySortOrder
    : compareEntriesByCreatedAt;
}

export function resolveContentEntryDisplayTitle(item) {
  return String(item?.title || item?.name || '').trim();
}

export function resolveContentEntryCoverImage(item) {
  return normalizeSingleImage(item?.picture || item?.image || item?.primary_image)
    || normalizeImageList(item?.images)[0]
    || null;
}

function buildContentEntryOrderClause(modelCode) {
  return hasSortableContentEntries(modelCode)
    ? 'e.sort_order ASC, e.id DESC'
    : 'e.created_at DESC, e.id DESC';
}

function hasSortableContentEntries(modelCode) {
  return getModelFieldNameSet(modelCode).has('sort_order');
}

function resolveTranslationNameField(baseInput, translations, existing) {
  if (Object.values(translations || {}).some((value) => value && Object.prototype.hasOwnProperty.call(value, 'title'))) {
    return 'title';
  }
  if (Object.prototype.hasOwnProperty.call(baseInput || {}, 'title')) {
    return 'title';
  }
  if (Object.prototype.hasOwnProperty.call(existing || {}, 'title') && !Object.prototype.hasOwnProperty.call(existing || {}, 'name')) {
    return 'title';
  }
  return 'name';
}

function compareEntriesByCreatedAt(left, right) {
  const createdDiff = String(right?.created_at || '').localeCompare(String(left?.created_at || ''));
  if (createdDiff !== 0) {
    return createdDiff;
  }
  return Number(right?.id || 0) - Number(left?.id || 0);
}

function compareEntriesBySortOrder(left, right) {
  const sortDiff = Number(left?.sort_order || 0) - Number(right?.sort_order || 0);
  if (sortDiff !== 0) {
    return sortDiff;
  }
  return Number(right?.id || 0) - Number(left?.id || 0);
}

function resolveLanguage(languageCode) {
  const languages = listLanguages();
  const defaultLanguage = getDefaultLanguage() || languages[0];
  const requestedCode = String(languageCode || '').trim();
  const selected = requestedCode
    ? languages.find((language) => language.code === requestedCode)
    : defaultLanguage;
  return {
    code: requestedCode || selected?.code || defaultLanguage?.code || 'zh-CN',
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
    const parsed = JSON.parse(trimmed);
    return JSON.stringify(normalizeTemplateDataAssetsDeep(parsed));
  }
  if (typeof value !== 'object') {
    throw new Error('template_data_json must be a JSON object or array');
  }
  return JSON.stringify(normalizeTemplateDataAssetsDeep(value));
}

function normalizeSpecOptionsJson(value) {
  if (value == null || value === '') {
    return '[]';
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return '[]';
    }
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) {
      throw new Error('spec_options_json must be a JSON array');
    }
    return JSON.stringify(
      parsed
        .map((item) => String(item || '').trim())
        .filter(Boolean)
    );
  }
  if (!Array.isArray(value)) {
    throw new Error('spec_options_json must be a JSON array');
  }
  return JSON.stringify(value.map((item) => String(item || '').trim()).filter(Boolean));
}

function parseSpecOptionsJson(value) {
  try {
    return JSON.parse(normalizeSpecOptionsJson(value));
  } catch {
    return [];
  }
}

function parseTemplateDataJson(value) {
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? normalizeTemplateDataAssetsDeep(parsed) : null;
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

function resolvePrimaryImage(primaryImage, imagesValue) {
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

function normalizeDynamicBaseFields(baseInput, existing, fields) {
  const output = {};

  fields
    .filter((field) => Number(field.is_translatable || 0) === 0)
    .forEach((field) => {
      output[field.field_name] = normalizeDynamicFieldValue(
        baseInput?.[field.field_name] ?? existing?.[field.field_name],
        field
      );
    });

  return output;
}

function normalizeDynamicTranslationFields(value, existingTranslation, fallbackBase, fields) {
  const output = {};

  fields.forEach((field) => {
    output[field.field_name] = normalizeDynamicFieldValue(
      value?.[field.field_name]
      ?? existingTranslation?.[field.field_name]
      ?? fallbackBase?.[field.field_name],
      field
    );
  });

  return output;
}

function normalizeDynamicFieldValue(value, field) {
  const fieldType = String(field?.field_type || '').trim().toLowerCase();

  if (fieldType === 'number') {
    if (value === undefined || value === null || value === '') {
      return null;
    }
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      throw new Error(`${field.field_label || field.field_name} 必须是数字`);
    }
    return numericValue;
  }

  if (fieldType === 'boolean') {
    return toBooleanInt(value, 0);
  }

  if (fieldType === 'attachments') {
    return JSON.stringify(normalizeAttachmentPaths(value));
  }

  return value == null ? '' : String(value);
}

function extractDynamicFieldValues(source, fields) {
  const output = {};
  fields.forEach((field) => {
    output[field.field_name] = readDynamicFieldValue(source?.[field.field_name], field);
  });
  return output;
}

function readDynamicFieldValue(value, field) {
  const fieldType = String(field?.field_type || '').trim().toLowerCase();

  if (fieldType === 'number') {
    if (value === undefined || value === null || value === '') {
      return null;
    }
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
  }

  if (fieldType === 'boolean') {
    return toBooleanInt(value, 0);
  }

  if (fieldType === 'attachments') {
    return normalizeAttachmentPaths(value);
  }

  return value ?? '';
}

function normalizeAttachmentPaths(value) {
  let source = value;
  if (typeof source === 'string') {
    const normalized = source.trim();
    if (!normalized) return [];
    try {
      source = JSON.parse(normalized);
    } catch {
      source = [normalized];
    }
  }

  if (!Array.isArray(source)) return [];
  return Array.from(new Set(source
    .map((item) => String(item || '').trim())
    .filter(Boolean)));
}
