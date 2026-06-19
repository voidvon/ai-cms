import { execute, getDb, queryAll, queryOne } from '../db.mjs';
import { ensureLanguagesSchema, getDefaultLanguage, listLanguages } from './languages.mjs';
import { ensureTemplatesSchema } from './templates.mjs';
import { ensureContentModelsSchema, getContentModelById } from './content-models.mjs';
import { resolveRelativePublicPath } from './column-paths.mjs';

let schemaEnsured = false;

const COLUMN_TYPES = new Set(['single', 'list', 'link']);
const RESERVED_SINGLE_PAGE_PREFIXES = [
  '/admin',
  '/api',
  '/assets',
  '/upload',
  '/uploads',
  '/skin'
];
const RESERVED_SINGLE_PAGE_PATHS = new Set([
  '/',
  '/index.html',
  '/robots.txt',
  '/sitemap.xml',
  '/web.config',
  '/.user.ini'
]);

export function ensureColumnsSchema() {
  if (schemaEnsured) {
    return;
  }

  ensureLanguagesSchema();
  ensureContentModelsSchema();
  ensureColumnsTableSchema();
  ensureColumnTranslationsSchema();
  createColumnsIndexes();

  schemaEnsured = true;
}

export function listColumns({ languageCode = null, includeTranslations = true } = {}) {
  ensureColumnsSchema();
  const rows = queryAll(
    `
      SELECT
        id,
        parent_id,
        column_type,
        custom_url,
        route_path,
        content_model_id,
        dir_name,
        detail_rule,
        is_visible,
        legacy_extra,
        sort_order,
        created_at,
        updated_at
      FROM columns
      ORDER BY coalesce(parent_id, 0) ASC, sort_order ASC, id ASC
    `
  );
  return hydrateColumns(rows, { languageCode, includeTranslations });
}

export function getColumnById(id, { languageCode = null, includeTranslations = true } = {}) {
  const row = getColumnByIdRaw(id);
  if (!row) {
    return null;
  }
  return hydrateColumns([row], { languageCode, includeTranslations })[0] || null;
}

export function listCategoryColumns(model, { languageCode = null } = {}) {
  return listColumns({ languageCode, includeTranslations: true }).filter((item) => isColumnInModelTree(item, model));
}

export function getCategoryRootColumn(model, { languageCode = null } = {}) {
  return listCategoryColumns(model, { languageCode }).find((item) => toInteger(item.parent_id, 0) <= 0) || null;
}

export function createManualColumn(input) {
  const payload = normalizeManualColumnMutationInput(input);
  validateColumnResolvedPathConflict(payload.base);
  const now = new Date().toISOString();
  const result = execute(
    `
      INSERT INTO columns (
        parent_id,
        column_type,
        custom_url,
        route_path,
        content_model_id,
        dir_name,
        detail_rule,
        is_visible,
        legacy_extra,
        sort_order,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      payload.base.parent_id,
      payload.base.column_type,
      payload.base.custom_url,
      payload.base.route_path,
      payload.base.content_model_id,
      payload.base.dir_name,
      payload.base.detail_rule,
      payload.base.is_visible,
      payload.base.legacy_extra,
      payload.base.sort_order,
      now,
      now
    ]
  );

  saveColumnTranslations(result.lastInsertRowid, payload.translations, now);
  return getColumnById(result.lastInsertRowid, { includeTranslations: true });
}

export function updateManualColumn(id, input) {
  const existing = getColumnByIdRaw(id);
  if (!existing) {
    return null;
  }
  assertEditableManualColumn(existing);

  const existingHydrated = getColumnById(id, { includeTranslations: true });
  const payload = normalizeManualColumnMutationInput(input, { currentId: id, existingColumn: existingHydrated });
  validateColumnResolvedPathConflict(payload.base, id);

  execute(
    `
      UPDATE columns
      SET
        parent_id = ?,
        column_type = ?,
        custom_url = ?,
        route_path = ?,
        content_model_id = ?,
        dir_name = ?,
        detail_rule = ?,
        is_visible = ?,
        legacy_extra = ?,
        sort_order = ?,
        updated_at = ?
      WHERE id = ?
    `,
    [
      payload.base.parent_id,
      payload.base.column_type,
      payload.base.custom_url,
      payload.base.route_path,
      payload.base.content_model_id,
      payload.base.dir_name,
      payload.base.detail_rule,
      payload.base.is_visible,
      payload.base.legacy_extra,
      payload.base.sort_order,
      new Date().toISOString(),
      id
    ]
  );

  saveColumnTranslations(id, payload.translations);
  return getColumnById(id, { includeTranslations: true });
}

export function updateColumnRecord(id, input) {
  const existing = getColumnByIdRaw(id);
  if (!existing) {
    return null;
  }

  const existingHydrated = getColumnById(id, { includeTranslations: true });
  const payload = normalizeExistingColumnMutationInput(input, existingHydrated);
  validateColumnResolvedPathConflict({ ...existingHydrated, ...payload.base }, id);

  execute(
    `
      UPDATE columns
      SET
        parent_id = ?,
        content_model_id = ?,
        dir_name = ?,
        route_path = ?,
        detail_rule = ?,
        is_visible = ?,
        sort_order = ?,
        updated_at = ?
      WHERE id = ?
    `,
    [
      payload.base.parent_id,
      payload.base.content_model_id,
      payload.base.dir_name,
      payload.base.route_path,
      payload.base.detail_rule,
      payload.base.is_visible,
      payload.base.sort_order,
      new Date().toISOString(),
      id
    ]
  );

  saveColumnTranslations(id, payload.translations);
  return getColumnById(id, { includeTranslations: true });
}

export function deleteManualColumn(id) {
  const existing = getColumnByIdRaw(id);
  if (!existing) {
    return null;
  }
  assertEditableManualColumn(existing);

  const childCount = queryOne(
    'SELECT COUNT(*) AS value FROM columns WHERE parent_id = ?',
    [id]
  )?.value;
  if (Number(childCount || 0) > 0) {
    throw new Error('请先删除或移动子栏目');
  }

  ensureTemplatesSchema();
  execute(
    'DELETE FROM template_bindings WHERE target_type = ? AND target_id = ?',
    ['column', id]
  );
  execute('DELETE FROM column_translations WHERE column_id = ?', [id]);
  execute('DELETE FROM columns WHERE id = ?', [id]);
  return existing;
}

function hydrateColumns(rows, {
  languageCode,
  includeTranslations = true,
  includeTranslationStatuses = false
} = {}) {
  if (!rows.length) {
    return [];
  }

  ensureContentModelsSchema();
  const modelCodeById = new Map(
    queryAll('SELECT id, code FROM content_models ORDER BY id ASC')
      .map((row) => [toInteger(row.id, 0), String(row.code || '').trim()])
  );

  const columnIds = rows.map((row) => Number(row.id)).filter((id) => Number.isInteger(id) && id > 0);
  const translationsById = loadColumnTranslations(columnIds);
  const selectedLanguage = resolveLanguageForContent(languageCode);
  const rowById = new Map(rows.map((row) => [toInteger(row.id, 0), row]));
  const semanticsById = new Map();

  return rows.map((row) => {
    const translations = translationsById.get(Number(row.id)) || [];
    const translationMap = Object.fromEntries(translations.map((translation) => [translation.language_code, translation]));
    const selectedTranslation = translationMap[selectedLanguage.code];
    const defaultTranslation = translationMap[selectedLanguage.default_code];
    const fallbackTranslation = selectedTranslation || defaultTranslation || translations[0] || null;
    const displayName = fallbackTranslation?.name || row.name || '';
    const resolvedSummary = fallbackTranslation?.summary ?? '';
    const resolvedContentHtml = fallbackTranslation?.content_html ?? '';
    const resolvedSeoTitle = fallbackTranslation?.seo_title ?? null;
    const resolvedSeoDescription = fallbackTranslation?.seo_description ?? null;
    const resolvedPublishStatus = fallbackTranslation?.publish_status ?? 'published';
    const resolvedPublishedAt = fallbackTranslation?.published_at ?? null;
    const modelCode = inferModelCode(row, rowById, modelCodeById);
    const semantics = inferColumnSemantics(row, rowById, semanticsById, modelCode);

    const base = {
      ...row,
      name: displayName,
      summary: resolvedSummary,
      content_html: resolvedContentHtml,
      seo_title: resolvedSeoTitle ?? null,
      seo_description: resolvedSeoDescription ?? null,
      publish_status: resolvedPublishStatus,
      published_at: resolvedPublishedAt,
      current_language_code: fallbackTranslation?.language_code || selectedLanguage.code,
      content_model_id: toNullableInteger(row.content_model_id),
      dir_name: row.dir_name || null,
      detail_rule: row.detail_rule || null,
      route_path: row.route_path || null,
      custom_url: row.custom_url || null,
      legacy_extra: row.legacy_extra || null,
      page_data: extractColumnPageData(row.legacy_extra),
      sort_order: toInteger(row.sort_order, 0),
      is_visible: toBooleanInt(row.is_visible, 1),
      column_type: normalizeColumnType(row.column_type),
      model_code: modelCode,
      column_semantics: semantics
    };

    return {
      ...base,
      ...(includeTranslations ? {
        translations: Object.fromEntries(
          Object.entries(translationMap).map(([language, translation]) => [
            language,
            {
              name: translation.name,
              title: translation.name,
              summary: translation.summary,
              content_html: translation.content_html,
              seo_title: translation.seo_title,
              seo_description: translation.seo_description,
              publish_status: translation.publish_status,
              published_at: translation.published_at
            }
          ])
        )
      } : {}),
      ...(includeTranslationStatuses ? {
        translation_statuses: translations.map((translation) => ({
          language_code: translation.language_code,
          publish_status: translation.publish_status,
          published_at: translation.published_at,
          has_content: Boolean(
            String(translation.name || '').trim()
            || String(translation.summary || '').trim()
            || String(translation.content_html || '').trim()
          )
        }))
      } : {})
    };
  });
}

function loadColumnTranslations(columnIds) {
  if (!columnIds.length) {
    return new Map();
  }

  const placeholders = columnIds.map(() => '?').join(', ');
  const rows = queryAll(
    `
      SELECT
        t.id,
        t.column_id,
        t.language_id,
        l.code AS language_code,
        t.name,
        t.summary,
        t.content_html,
        t.seo_title,
        t.seo_description,
        t.publish_status,
        t.published_at
      FROM column_translations t
      INNER JOIN languages l ON l.id = t.language_id
      WHERE t.column_id IN (${placeholders})
      ORDER BY t.column_id ASC, l.sort_order ASC, l.id ASC
    `,
    columnIds
  );

  const map = new Map();
  for (const row of rows) {
    const list = map.get(Number(row.column_id)) || [];
    list.push({
      id: Number(row.id),
      column_id: Number(row.column_id),
      language_id: Number(row.language_id),
      language_code: row.language_code,
      name: row.name || '',
      summary: row.summary || '',
      content_html: row.content_html || '',
      seo_title: row.seo_title || '',
      seo_description: row.seo_description || '',
      publish_status: normalizePublishStatus(row.publish_status),
      published_at: toNullableString(row.published_at)
    });
    map.set(Number(row.column_id), list);
  }
  return map;
}

function saveColumnTranslations(columnId, translations, now = new Date().toISOString()) {
  const languageIdByCode = new Map(listLanguages().map((language) => [language.code, language.id]));

  for (const [languageCode, translation] of Object.entries(translations || {})) {
    const languageId = languageIdByCode.get(languageCode);
    if (!languageId) {
      continue;
    }
    const persistedTranslation = translation || {};

    execute(
      `
        INSERT INTO column_translations (
          column_id,
          language_id,
          name,
          summary,
          content_html,
          seo_title,
          seo_description,
          publish_status,
          published_at,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(column_id, language_id) DO UPDATE SET
          name = excluded.name,
          summary = excluded.summary,
          content_html = excluded.content_html,
          seo_title = excluded.seo_title,
          seo_description = excluded.seo_description,
          publish_status = excluded.publish_status,
          published_at = excluded.published_at,
          updated_at = excluded.updated_at
      `,
      [
        columnId,
        languageId,
        String(persistedTranslation?.name || '').trim(),
        String(persistedTranslation?.summary || ''),
        String(persistedTranslation?.content_html || ''),
        toNullableString(persistedTranslation?.seo_title),
        toNullableString(persistedTranslation?.seo_description),
        normalizePublishStatus(persistedTranslation?.publish_status),
        toNullableString(persistedTranslation?.published_at),
        now,
        now
      ]
    );
  }
}

function getColumnByIdRaw(id) {
  ensureColumnsSchema();
  return queryOne(
    `
      SELECT
        id,
        parent_id,
        column_type,
        custom_url,
        route_path,
        content_model_id,
        dir_name,
        detail_rule,
        is_visible,
        legacy_extra,
        sort_order,
        created_at,
        updated_at
      FROM columns
      WHERE id = ?
    `,
    [id]
  ) || null;
}

function normalizeManualColumnInput(input, options = {}) {
  const currentId = toInteger(options.currentId, 0);
  const existing = currentId ? getColumnByIdRaw(currentId) : null;
  const existingView = options.existingColumn || existing || {};
  const requestedType = normalizeColumnType(input.column_type ?? existing?.column_type);
  const name = String(input.name ?? existingView.name ?? '').trim();
  if (!name) {
    throw new Error('栏目名称不能为空');
  }

  const parentId = toInteger(input.parent_id ?? existing?.parent_id, 0);
  if (currentId && parentId === currentId) {
    throw new Error('父栏目不能选择自己');
  }

  const parent = parentId > 0 ? getColumnByIdRaw(parentId) : null;
  if (parentId > 0 && !parent) {
    throw new Error('父栏目不存在');
  }
  if (currentId && parentId > 0 && wouldCreateColumnCycle(currentId, parentId)) {
    throw new Error('不能将栏目移动到自己的子栏目下');
  }

  const sortOrder = toInteger(input.sort_order ?? existing?.sort_order, 0);
  const isVisible = toBooleanInt(input.is_visible ?? existing?.is_visible, 1);
  const seoTitle = toNullableString(input.seo_title ?? existingView.seo_title);
  const seoDescription = toNullableString(input.seo_description ?? existingView.seo_description);
  const summary = toNullableString(input.summary ?? existingView.summary) || '';
  const contentModelId = normalizeContentModelId(input.content_model_id ?? existing?.content_model_id);
  const detailRule = normalizeColumnDetailRule(input.detail_rule ?? existing?.detail_rule, requestedType);

  if (requestedType === 'link') {
    return {
      name,
      parent_id: parentId || null,
      column_type: 'link',
      custom_url: normalizeColumnUrl(input.custom_url ?? existing?.custom_url),
      route_path: null,
      content_html: '',
      summary,
      seo_title: seoTitle,
      seo_description: seoDescription,
      content_model_id: null,
      dir_name: null,
      detail_rule: null,
      publish_status: 'published',
      published_at: null,
      is_visible: isVisible,
      legacy_extra: existing?.legacy_extra ?? null,
      sort_order: sortOrder
    };
  }

  const routePath = normalizeRoutePath(input.route_path ?? existing?.route_path);
  if (requestedType === 'single') {
    validateSinglePageRoutePath(routePath, currentId || null);
  }

  return {
    name,
    parent_id: parentId || null,
    column_type: requestedType,
    custom_url: null,
    route_path: routePath,
    content_html: String(input.content_html ?? existingView.content_html ?? ''),
    summary,
    seo_title: seoTitle,
    seo_description: seoDescription,
    content_model_id: requestedType === 'link' ? null : contentModelId,
    dir_name: normalizeColumnDirName(input.dir_name ?? existing?.dir_name),
    detail_rule: detailRule,
    publish_status: normalizePublishStatus(input.publish_status ?? existing?.publish_status),
    published_at: toNullableString(input.published_at ?? existing?.published_at),
    is_visible: isVisible,
    legacy_extra: existing?.legacy_extra ?? null,
    sort_order: sortOrder
  };
}

function normalizeManualColumnMutationInput(input, { currentId = 0, existingColumn = null } = {}) {
  if (input?.base || input?.translations) {
    const existing = existingColumn || {};
    const baseSource = { ...existing, ...(input.base || {}) };
    const base = normalizeManualColumnInput(baseSource, { currentId });
    const translations = normalizeColumnTranslations(input.translations || {}, {
      defaultLanguageCode: getDefaultLanguage()?.code || 'zh-CN',
      existingTranslations: existing.translations || {},
      fallbackBase: base
    });
    return { base, translations };
  }

  const legacy = normalizeManualColumnInput({ ...(existingColumn || {}), ...(input || {}) }, { currentId });
  const defaultLanguageCode = getDefaultLanguage()?.code || 'zh-CN';
  return {
    base: legacy,
    translations: {
      [defaultLanguageCode]: {
        name: legacy.name,
        summary: legacy.summary,
        content_html: legacy.content_html,
        seo_title: legacy.seo_title,
        seo_description: legacy.seo_description,
        publish_status: legacy.publish_status,
        published_at: legacy.published_at
      }
    }
  };
}

function normalizeExistingColumnMutationInput(input, existingColumn = null) {
  const existing = existingColumn || {};
  const defaultLanguageCode = getDefaultLanguage()?.code || 'zh-CN';
  const parentId = toInteger(input?.parent_id ?? existing.parent_id, 0);
  const sortOrder = toInteger(input?.sort_order ?? existing.sort_order, 0);
  const isVisible = toBooleanInt(input?.is_visible ?? existing.is_visible, 1);
  const contentModelId = normalizeContentModelId(input?.content_model_id ?? existing.content_model_id);
  const dirName = normalizeColumnDirName(input?.dir_name ?? existing.dir_name);
  const routePath = normalizeRoutePath(input?.route_path ?? existing.route_path);
  const detailRule = normalizeColumnDetailRule(input?.detail_rule ?? existing.detail_rule, existing.column_type);

  const translations = normalizeColumnTranslations(input?.translations || {}, {
    defaultLanguageCode,
    existingTranslations: existing.translations || {},
    fallbackBase: {
      name: String(existing.name || '').trim(),
      summary: String(existing.summary || ''),
      content_html: String(existing.content_html || ''),
      seo_title: toNullableString(existing.seo_title),
      seo_description: toNullableString(existing.seo_description),
      publish_status: normalizePublishStatus(existing.publish_status || 'published'),
      published_at: toNullableString(existing.published_at)
    }
  });

  return {
    base: {
      parent_id: parentId || null,
      content_model_id: contentModelId,
      dir_name: dirName,
      route_path: routePath,
      detail_rule: detailRule,
      sort_order: sortOrder,
      is_visible: isVisible
    },
    translations
  };
}

function normalizeContentModelId(value) {
  ensureContentModelsSchema();
  const modelId = toInteger(value, 0);
  if (modelId <= 0) {
    return null;
  }
  const model = getContentModelById(modelId);
  if (!model) {
    throw new Error('绑定的内容模型不存在');
  }
  return model.id;
}

function normalizeColumnTranslations(translations, {
  defaultLanguageCode,
  existingTranslations = {},
  fallbackBase,
  nameField = 'name'
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
    const normalized = {
      name: translationName,
      summary: String(value?.summary ?? existingTranslations?.[languageCode]?.summary ?? fallbackBase.summary ?? ''),
      content_html: String(value?.content_html ?? existingTranslations?.[languageCode]?.content_html ?? fallbackBase.content_html ?? ''),
      seo_title: toNullableString(value?.seo_title ?? existingTranslations?.[languageCode]?.seo_title ?? fallbackBase.seo_title),
      seo_description: toNullableString(value?.seo_description ?? existingTranslations?.[languageCode]?.seo_description ?? fallbackBase.seo_description),
      publish_status: normalizePublishStatus(value?.publish_status ?? existingTranslations?.[languageCode]?.publish_status ?? fallbackBase.publish_status),
      published_at: toNullableString(value?.published_at ?? existingTranslations?.[languageCode]?.published_at ?? fallbackBase.published_at)
    };
    if (languageCode === defaultLanguageCode && !normalized.name) {
      throw new Error('默认语言名称不能为空');
    }
    if (
      normalized.name
      || normalized.summary
      || normalized.content_html
      || normalized.seo_title
      || normalized.seo_description
    ) {
      output[languageCode] = normalized;
    }
  }

  if (!output[defaultLanguageCode]) {
    const fallback = existingTranslations?.[defaultLanguageCode];
    output[defaultLanguageCode] = {
      name: String(fallback?.name || fallback?.title || fallbackBase.name || '').trim(),
      summary: String(fallback?.summary || fallbackBase.summary || ''),
      content_html: String(fallback?.content_html || fallbackBase.content_html || ''),
      seo_title: toNullableString(fallback?.seo_title || fallbackBase.seo_title),
      seo_description: toNullableString(fallback?.seo_description || fallbackBase.seo_description),
      publish_status: normalizePublishStatus(fallback?.publish_status || fallbackBase.publish_status),
      published_at: toNullableString(fallback?.published_at || fallbackBase.published_at)
    };
    if (!output[defaultLanguageCode].name) {
      throw new Error('默认语言名称不能为空');
    }
  }

  return output;
}

function resolveLanguageForContent(languageCode) {
  const languages = listLanguages();
  const defaultLanguage = getDefaultLanguage();
  const fallbackLanguage = defaultLanguage || languages[0] || null;
  const fallbackCode = fallbackLanguage?.code || 'zh-CN';
  const requestedCode = String(languageCode || '').trim();
  const selectedLanguage = languages.find((language) => language.code === requestedCode) || fallbackLanguage;
  const code = selectedLanguage?.code || requestedCode || fallbackCode;
  return {
    code,
    id: toInteger(selectedLanguage?.id, 0) || null,
    default_code: fallbackCode,
    default_id: toInteger(fallbackLanguage?.id, 0) || null
  };
}

function assertEditableManualColumn(column) {
  const columnType = normalizeColumnType(column?.column_type);
  if (columnType !== 'single' && columnType !== 'link') {
    throw new Error('当前栏目不支持直接编辑');
  }
}

function wouldCreateColumnCycle(currentId, parentId) {
  let cursor = getColumnByIdRaw(parentId);
  const visited = new Set();
  while (cursor) {
    const cursorId = toInteger(cursor.id, 0);
    if (!cursorId || visited.has(cursorId)) {
      break;
    }
    if (cursorId === currentId) {
      return true;
    }
    visited.add(cursorId);
    const nextParentId = toInteger(cursor.parent_id, 0);
    cursor = nextParentId > 0 ? getColumnByIdRaw(nextParentId) : null;
  }
  return false;
}

function validateSinglePageRoutePath(routePath) {
  const normalizedRoutePath = resolveColumnResolvedRoutePath({ route_path: routePath, parent_id: null, column_type: 'single' });
  if (RESERVED_SINGLE_PAGE_PATHS.has(normalizedRoutePath.toLowerCase())) {
    throw new Error('该访问路径已被系统保留');
  }

  const normalized = normalizedRoutePath.toLowerCase();
  if (RESERVED_SINGLE_PAGE_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`))) {
    throw new Error('该访问路径与保留系统路径冲突');
  }
}

function normalizeColumnType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!COLUMN_TYPES.has(normalized)) {
    throw new Error('栏目形态不正确');
  }
  return normalized;
}

function inferModelCode(row, rowById, modelCodeById) {
  const contentModelId = toInteger(row?.content_model_id, 0);
  if (contentModelId > 0) {
    return modelCodeById.get(contentModelId) || null;
  }

  const resolvedPath = resolveColumnResolvedRoutePath(row, null, rowById);
  if (resolvedPath === '/about/' || resolvedPath.startsWith('/about/')) {
    return 'corporation';
  }
  return null;
}

function inferColumnSemantics(row, rowById, semanticsById, modelCode) {
  const columnId = toInteger(row?.id, 0);
  if (columnId > 0 && semanticsById.has(columnId)) {
    return semanticsById.get(columnId);
  }

  const columnType = normalizeColumnType(row?.column_type);
  const rootColumn = resolveSemanticRootColumn(row, rowById);
  const rootColumnId = toInteger(rootColumn?.id, columnId || 0) || null;
  const isRoot = rootColumnId !== null && rootColumnId === columnId;

  let structureKind = columnType;
  let renderDriver = columnType;
  let generationModes = [];

  if (columnType === 'link') {
    structureKind = 'link';
    renderDriver = 'link';
    generationModes = [];
  } else if (columnType === 'single') {
    structureKind = 'page';
    const resolvedPath = String(resolveColumnResolvedRoutePath(row, null, rowById) || '').trim();
    renderDriver = resolvedPath === '/about/' || resolvedPath.startsWith('/about/')
      ? 'page_tree'
      : 'single_page';
    generationModes = ['page'];
  } else {
    structureKind = 'collection';
    const resolvedPath = String(resolveColumnResolvedRoutePath(row, null, rowById) || '').trim();
    const hasDetailRule = Boolean(toNullableString(row?.detail_rule));
    renderDriver = resolvedPath.startsWith('/products/')
      ? 'managed_category'
      : hasDetailRule
        ? 'section'
        : 'collection';
    generationModes = ['list'];
    if (toNullableInteger(row?.content_model_id) && toNullableString(row?.detail_rule)) {
      generationModes.push('detail');
    }
  }

  const semantics = {
    structure_kind: structureKind,
    render_driver: renderDriver,
    generation_modes: generationModes,
    is_root: isRoot,
    root_column_id: rootColumnId,
    model_code: modelCode,
    column_type: columnType
  };

  if (columnId > 0) {
    semanticsById.set(columnId, semantics);
  }

  return semantics;
}

function resolveSemanticRootColumn(row, rowById) {
  let current = row;
  let resolved = row;
  const visited = new Set();

  while (current) {
    const currentId = toInteger(current?.id, 0);
    if (currentId <= 0 || visited.has(currentId)) {
      break;
    }
    visited.add(currentId);
    resolved = current;

    const parentId = toInteger(current?.parent_id, 0);
    if (parentId <= 0) {
      break;
    }

    const parent = rowById.get(parentId) || null;
    if (!parent) {
      break;
    }
    current = parent;
  }

  return resolved || row || null;
}

function normalizeColumnUrl(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    throw new Error('链接地址不能为空');
  }
  return normalized;
}

function normalizeRoutePath(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    throw new Error('访问路径不能为空');
  }
  if (/^https?:\/\//i.test(normalized)) {
    throw new Error('栏目访问路径不能是完整网址');
  }

  let routePath = normalized.startsWith('/') ? normalized : `/${normalized}`;
  routePath = routePath.replace(/\/{2,}/g, '/');

  if (routePath !== '/' && routePath.endsWith('/')) {
    return routePath;
  }
  if (pathLooksLikeFile(routePath)) {
    return routePath;
  }
  return `${routePath}/`;
}

function normalizeColumnDirName(value) {
  const normalized = toNullableString(value);
  if (!normalized) {
    return null;
  }
  return normalized
    .toLowerCase()
    .replace(/^\/+|\/+$/g, '')
    .replace(/[^a-z0-9/_-]+/g, '-')
    .replace(/\/{2,}/g, '/')
    .replace(/-+/g, '-')
    .replace(/^[-/]+|[-/]+$/g, '') || null;
}

function normalizeColumnDetailRule(value, columnType) {
  if (normalizeColumnType(columnType) !== 'list') {
    return null;
  }
  return toNullableString(value);
}

function pathLooksLikeFile(value) {
  const lastSegment = String(value || '').split('/').filter(Boolean).pop() || '';
  return lastSegment.includes('.');
}

function hasTable(name) {
  return Boolean(queryOne(
    `
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name = ?
    `,
    [name]
  ));
}

function hasColumn(tableName, columnName) {
  if (!hasTable(tableName)) {
    return false;
  }
  return queryAll(`PRAGMA table_info(${tableName})`).some((column) => column.name === columnName);
}

function addColumnIfMissing(tableName, columnName, definition) {
  if (hasColumn(tableName, columnName)) {
    return;
  }
  getDb().exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

function extractColumnPageData(legacyExtra) {
  const parsed = parseLegacyExtra(legacyExtra);
  return parsed?.page_data && typeof parsed.page_data === 'object'
    ? parsed.page_data
    : null;
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

function validateColumnResolvedPathConflict(base, currentId = null) {
  if (normalizeColumnType(base?.column_type) === 'link') {
    return;
  }

  const resolvedRoutePath = resolveColumnResolvedRoutePath(base, currentId);
  if (!resolvedRoutePath) {
    return;
  }

  const rows = queryAll(
    `
      SELECT id, parent_id, column_type, route_path
      FROM columns
      WHERE route_path IS NOT NULL
    `
  );

  for (const row of rows) {
    const rowId = toInteger(row.id, 0);
    if (currentId && rowId === toInteger(currentId, 0)) {
      continue;
    }
    const existingResolvedPath = resolveColumnResolvedRoutePath(row);
    if (existingResolvedPath && existingResolvedPath === resolvedRoutePath) {
      throw new Error('访问路径已存在');
    }
  }
}

function resolveColumnResolvedRoutePath(column, currentId = null, rowById = null) {
  const columnType = normalizeColumnType(column?.column_type);
  if (columnType === 'link') {
    return '';
  }

  const routePath = toNullableString(column?.route_path);
  if (!routePath) {
    return '';
  }

  const parentPublicPath = resolveColumnParentRoutePath(column, currentId, rowById);
  const resolved = resolveRelativePublicPath(routePath, parentPublicPath);
  if (!resolved) {
    return '';
  }
  if (resolved !== '/' && !pathLooksLikeFile(resolved) && !resolved.endsWith('/')) {
    return `${resolved}/`;
  }
  return resolved;
}

function resolveColumnParentRoutePath(column, currentId = null, rowById = null) {
  const parentId = toInteger(column?.parent_id, 0);
  if (parentId <= 0) {
    return '/';
  }

  const parent = rowById?.get(parentId) || getColumnByIdRaw(parentId);
  if (!parent) {
    return '/';
  }
  if (currentId && toInteger(parent.id, 0) === toInteger(currentId, 0)) {
    return '/';
  }

  return resolveColumnResolvedRoutePath(parent, currentId, rowById) || '/';
}

function ensureColumnsTableSchema() {
  if (!hasTable('columns')) {
    getDb().exec(`
      CREATE TABLE columns (
        id INTEGER PRIMARY KEY,
        parent_id INTEGER,
        column_type TEXT NOT NULL,
        custom_url TEXT,
        route_path TEXT,
        content_model_id INTEGER,
        dir_name TEXT,
        detail_rule TEXT,
        is_visible INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        legacy_extra TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    return;
  }

  const columnNames = new Set(queryAll('PRAGMA table_info(columns)').map((column) => String(column.name || '')));
  const requiredColumns = [
    'column_type',
    'custom_url',
    'route_path',
    'content_model_id',
    'dir_name',
    'detail_rule',
    'is_visible',
    'sort_order',
    'legacy_extra',
    'created_at',
    'updated_at'
  ];
  const missingRequiredColumns = requiredColumns.filter((columnName) => !columnNames.has(columnName));
  if (missingRequiredColumns.length > 0) {
    throw new Error('columns 表结构不符合当前系统要求，请重新初始化数据库');
  }
}

function ensureColumnTranslationsSchema() {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS column_translations (
      id INTEGER PRIMARY KEY,
      column_id INTEGER NOT NULL,
      language_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      content_html TEXT NOT NULL DEFAULT '',
      seo_title TEXT,
      seo_description TEXT,
      publish_status TEXT NOT NULL DEFAULT 'published',
      published_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (column_id, language_id)
    );
  `);

  addColumnIfMissing('column_translations', 'summary', "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing('column_translations', 'content_html', "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing('column_translations', 'seo_title', 'TEXT');
  addColumnIfMissing('column_translations', 'seo_description', 'TEXT');
  addColumnIfMissing('column_translations', 'publish_status', "TEXT NOT NULL DEFAULT 'published'");
  addColumnIfMissing('column_translations', 'published_at', 'TEXT');
}

function createColumnsIndexes() {
  getDb().exec(`
    CREATE INDEX IF NOT EXISTS idx_columns_parent_sort ON columns(parent_id, sort_order, id);
    CREATE INDEX IF NOT EXISTS idx_columns_visible_sort ON columns(is_visible, sort_order, id);
    CREATE INDEX IF NOT EXISTS idx_columns_dir_name ON columns(dir_name);
    CREATE INDEX IF NOT EXISTS idx_columns_route_path
    ON columns(route_path)
    WHERE route_path IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_column_translations_column_id
    ON column_translations(column_id, language_id);
  `);
}

function isColumnInModelTree(column, model) {
  const columnType = normalizeColumnType(column?.column_type);
  const modelCode = String(column?.model_code || '').trim();

  if (model === 'product') {
    return columnType === 'list' && modelCode === 'product';
  }
  if (model === 'news') {
    return columnType === 'list' && modelCode === 'news';
  }
  if (model === 'corporation') {
    return columnType === 'single' && modelCode === 'corporation';
  }
  return false;
}

function normalizePublishStatus(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'draft' ? 'draft' : 'published';
}

function toInteger(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function toNullableInteger(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return null;
  }
  const parsed = Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function toBooleanInt(value, fallback = 0) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on', '-1'].includes(normalized)) {
    return 1;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return 0;
  }
  return toInteger(value, fallback) === 0 ? 0 : 1;
}

function toNullableString(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const normalized = String(value).trim();
  return normalized ? normalized : null;
}
