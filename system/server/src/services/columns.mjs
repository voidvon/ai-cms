import { execute, getDb, queryAll, queryOne } from '../db.mjs';
import { ensureTemplatesSchema } from './templates.mjs';

let schemaEnsured = false;

const EDITABLE_MANUAL_SOURCE_TYPES = new Set(['custom_link', 'single_page']);
const RESERVED_SINGLE_PAGE_PREFIXES = [
  '/about',
  '/news',
  '/service',
  '/valve',
  '/product',
  '/products',
  '/admin',
  '/api',
  '/assets',
  '/upload',
  '/uploadfile',
  '/skin'
];
const RESERVED_SINGLE_PAGE_PATHS = new Set([
  '/',
  '/index.html',
  '/contact.html',
  '/msg.html',
  '/robots.txt',
  '/sitemap.xml',
  '/web.config',
  '/.user.ini'
]);

export function ensureColumnsSchema() {
  if (schemaEnsured) {
    return;
  }

  getDb().exec(`
    CREATE TABLE IF NOT EXISTS columns (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      parent_id INTEGER,
      model_code TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_id INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_system INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (source_type, source_id),
      FOREIGN KEY (parent_id) REFERENCES columns(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_columns_parent_sort ON columns(parent_id, sort_order, id);
    CREATE INDEX IF NOT EXISTS idx_columns_source ON columns(source_type, source_id);
  `);

  addColumnIfMissing('columns', 'column_kind', "TEXT NOT NULL DEFAULT 'category'");
  addColumnIfMissing('columns', 'custom_url', 'TEXT');
  addColumnIfMissing('columns', 'route_path', 'TEXT');
  addColumnIfMissing('columns', 'open_in_new_tab', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('columns', 'content_html', "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing('columns', 'seo_title', 'TEXT');
  addColumnIfMissing('columns', 'seo_keywords', 'TEXT');
  addColumnIfMissing('columns', 'seo_description', 'TEXT');

  getDb().exec(`
    CREATE INDEX IF NOT EXISTS idx_columns_parent_sort ON columns(parent_id, sort_order, id);
    CREATE INDEX IF NOT EXISTS idx_columns_source ON columns(source_type, source_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_columns_route_path_unique
    ON columns(route_path)
    WHERE route_path IS NOT NULL;
  `);

  schemaEnsured = true;
}

export function listColumns() {
  syncBuiltinColumns();
  return queryAll(
    `
      SELECT
        id,
        name,
        parent_id,
        model_code,
        source_type,
        source_id,
        column_kind,
        custom_url,
        route_path,
        open_in_new_tab,
        content_html,
        seo_title,
        seo_keywords,
        seo_description,
        sort_order,
        is_system,
        created_at,
        updated_at
      FROM columns
      ORDER BY coalesce(parent_id, 0) ASC, sort_order ASC, id ASC
    `
  );
}

export function getColumnById(id) {
  syncBuiltinColumns();
  return getColumnByIdRaw(id);
}

export function createManualColumn(input) {
  syncBuiltinColumns();
  const payload = normalizeManualColumnInput(input);
  const now = new Date().toISOString();
  const sourceType = payload.column_kind === 'link' ? 'custom_link' : 'single_page';
  const sourceId = getNextManualColumnSourceId(sourceType);
  const result = execute(
    `
      INSERT INTO columns (
        name,
        parent_id,
        model_code,
        source_type,
        source_id,
        column_kind,
        custom_url,
        route_path,
        open_in_new_tab,
        content_html,
        seo_title,
        seo_keywords,
        seo_description,
        sort_order,
        is_system,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `,
    [
      payload.name,
      payload.parent_id,
      payload.model_code,
      sourceType,
      sourceId,
      payload.column_kind,
      payload.custom_url,
      payload.route_path,
      payload.open_in_new_tab,
      payload.content_html,
      payload.seo_title,
      payload.seo_keywords,
      payload.seo_description,
      payload.sort_order,
      now,
      now
    ]
  );

  return getColumnByIdRaw(result.lastInsertRowid);
}

export function updateManualColumn(id, input) {
  syncBuiltinColumns();
  const existing = getColumnByIdRaw(id);
  if (!existing) {
    return null;
  }
  assertEditableManualColumn(existing);

  const payload = normalizeManualColumnInput({ ...existing, ...input }, { currentId: id });
  if (String(existing.column_kind || '') !== payload.column_kind) {
    throw new Error('暂不支持直接切换栏目类型');
  }
  execute(
    `
      UPDATE columns
      SET
        name = ?,
        parent_id = ?,
        model_code = ?,
        column_kind = ?,
        custom_url = ?,
        route_path = ?,
        open_in_new_tab = ?,
        content_html = ?,
        seo_title = ?,
        seo_keywords = ?,
        seo_description = ?,
        sort_order = ?,
        updated_at = ?
      WHERE id = ?
    `,
    [
      payload.name,
      payload.parent_id,
      payload.model_code,
      payload.column_kind,
      payload.custom_url,
      payload.route_path,
      payload.open_in_new_tab,
      payload.content_html,
      payload.seo_title,
      payload.seo_keywords,
      payload.seo_description,
      payload.sort_order,
      new Date().toISOString(),
      id
    ]
  );

  return getColumnByIdRaw(id);
}

export function deleteManualColumn(id) {
  syncBuiltinColumns();
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
  execute('DELETE FROM columns WHERE id = ?', [id]);
  return existing;
}

export function syncBuiltinColumns() {
  ensureColumnsSchema();
  upsertColumn({
    name: '产品展示',
    parent_id: null,
    model_code: 'product',
    source_type: 'product_root',
    source_id: 0,
    column_kind: 'category',
    sort_order: 10
  });

  const productRoot = getColumnBySource('product_root', 0);
  const productCategories = queryAll(
    `
      SELECT id, name, parent_id, sort_order
      FROM product_categories
      WHERE id <> 0
      ORDER BY parent_id ASC, sort_order ASC, id ASC
    `
  );
  pruneStaleCategoryColumns('product_category', productCategories.map((category) => category.id));
  syncCategoryColumns(productCategories, {
    modelCode: 'product',
    sourceType: 'product_category',
    rootParentId: productRoot.id,
    rootSortOffset: 0
  });

  const newsCategories = queryAll(
    `
      SELECT id, name, parent_id, sort_order
      FROM news_categories
      WHERE id <> 0
      ORDER BY parent_id ASC, sort_order ASC, id ASC
    `
  );
  pruneStaleCategoryColumns('news_category', newsCategories.map((category) => category.id));
  syncCategoryColumns(newsCategories, {
    modelCode: 'news',
    sourceType: 'news_category',
    rootParentId: null,
    rootSortOffset: 100
  });

  upsertColumn({
    name: '公司信息',
    parent_id: null,
    model_code: 'corporation',
    source_type: 'corporation_root',
    source_id: 0,
    column_kind: 'category',
    sort_order: 200
  });

  upsertColumn({
    name: '联系我们',
    parent_id: null,
    model_code: 'page',
    source_type: 'contact_page',
    source_id: 0,
    column_kind: 'single',
    route_path: '/contact.html',
    sort_order: 300
  });

  upsertColumn({
    name: '在线留言',
    parent_id: null,
    model_code: 'page',
    source_type: 'message_page',
    source_id: 0,
    column_kind: 'single',
    route_path: '/msg.html',
    sort_order: 310
  });

  const corporationRoot = getColumnBySource('corporation_root', 0);
  const corporationCategories = queryAll(
    `
      SELECT id, name, parent_id, sort_order
      FROM corporation_categories
      WHERE id <> 0
      ORDER BY parent_id ASC, sort_order ASC, id ASC
    `
  );
  pruneStaleCategoryColumns('corporation_category', corporationCategories.map((category) => category.id));
  syncCategoryColumns(corporationCategories, {
    modelCode: 'corporation',
    sourceType: 'corporation_category',
    rootParentId: corporationRoot.id,
    rootSortOffset: 0
  });
}

function syncCategoryColumns(categories, { modelCode, sourceType, rootParentId, rootSortOffset }) {
  for (const category of categories) {
    const parentColumn = category.parent_id
      ? getColumnBySource(sourceType, category.parent_id)
      : null;
    upsertColumn({
      name: category.name,
      parent_id: parentColumn?.id ?? rootParentId,
      model_code: modelCode,
      source_type: sourceType,
      source_id: category.id,
      column_kind: 'category',
      sort_order: rootSortOffset + Number(category.sort_order || 0)
    });
  }
}

function upsertColumn(input) {
  const now = new Date().toISOString();
  execute(
    `
      INSERT INTO columns (
        name,
        parent_id,
        model_code,
        source_type,
        source_id,
        column_kind,
        custom_url,
        route_path,
        open_in_new_tab,
        content_html,
        seo_title,
        seo_keywords,
        seo_description,
        sort_order,
        is_system,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(source_type, source_id) DO UPDATE SET
        name = excluded.name,
        parent_id = excluded.parent_id,
        model_code = excluded.model_code,
        column_kind = excluded.column_kind,
        custom_url = excluded.custom_url,
        route_path = excluded.route_path,
        open_in_new_tab = excluded.open_in_new_tab,
        sort_order = excluded.sort_order,
        is_system = 1,
        updated_at = excluded.updated_at
    `,
    [
      input.name,
      input.parent_id,
      input.model_code,
      input.source_type,
      input.source_id,
      input.column_kind || 'category',
      input.custom_url ?? null,
      input.route_path ?? null,
      toBooleanInt(input.open_in_new_tab, 0),
      '',
      null,
      null,
      null,
      input.sort_order,
      now,
      now
    ]
  );
}

function getColumnBySource(sourceType, sourceId) {
  return queryOne(
    `
      SELECT
        id,
        name,
        parent_id,
        model_code,
        source_type,
        source_id,
        column_kind,
        custom_url,
        route_path,
        open_in_new_tab,
        content_html,
        seo_title,
        seo_keywords,
        seo_description,
        sort_order,
        is_system,
        created_at,
        updated_at
      FROM columns
      WHERE source_type = ? AND source_id = ?
    `,
    [sourceType, sourceId]
  );
}

function getColumnByIdRaw(id) {
  ensureColumnsSchema();
  return queryOne(
    `
      SELECT
        id,
        name,
        parent_id,
        model_code,
        source_type,
        source_id,
        column_kind,
        custom_url,
        route_path,
        open_in_new_tab,
        content_html,
        seo_title,
        seo_keywords,
        seo_description,
        sort_order,
        is_system,
        created_at,
        updated_at
      FROM columns
      WHERE id = ?
    `,
    [id]
  ) || null;
}

function pruneStaleCategoryColumns(sourceType, sourceIds) {
  const ids = sourceIds.map((id) => Number(id)).filter((id) => Number.isInteger(id));
  if (ids.length === 0) {
    execute('DELETE FROM columns WHERE is_system = 1 AND source_type = ?', [sourceType]);
    return;
  }

  const placeholders = ids.map(() => '?').join(', ');
  execute(
    `
      DELETE FROM columns
      WHERE is_system = 1
        AND source_type = ?
        AND source_id NOT IN (${placeholders})
    `,
    [sourceType, ...ids]
  );
}

function normalizeManualColumnInput(input, options = {}) {
  const currentId = toInteger(options.currentId, 0);
  const existing = currentId ? getColumnByIdRaw(currentId) : null;
  const columnKind = normalizeColumnKind(input.column_kind ?? existing?.column_kind);
  const name = String(input.name ?? existing?.name ?? '').trim();
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
  if (parent && String(parent.column_kind || '') === 'single') {
    throw new Error('单页栏目下不能再挂子栏目');
  }
  if (currentId && parentId > 0 && wouldCreateColumnCycle(currentId, parentId)) {
    throw new Error('不能将栏目移动到自己的子栏目下');
  }

  const sortOrder = toInteger(input.sort_order ?? existing?.sort_order, 0);
  const seoTitle = toNullableString(input.seo_title ?? existing?.seo_title);
  const seoKeywords = toNullableString(input.seo_keywords ?? existing?.seo_keywords);
  const seoDescription = toNullableString(input.seo_description ?? existing?.seo_description);

  if (columnKind === 'link') {
    const customUrl = normalizeColumnUrl(input.custom_url ?? existing?.custom_url);
    return {
      name,
      parent_id: parentId || null,
      model_code: 'link',
      column_kind: columnKind,
      custom_url: customUrl,
      route_path: null,
      open_in_new_tab: toBooleanInt(input.open_in_new_tab ?? existing?.open_in_new_tab, 0),
      content_html: '',
      seo_title: seoTitle,
      seo_keywords: seoKeywords,
      seo_description: seoDescription,
      sort_order: sortOrder
    };
  }

  const routePath = normalizeRoutePath(input.route_path ?? existing?.route_path);
  validateSinglePageRoutePath(routePath, currentId || null);
  return {
    name,
    parent_id: parentId || null,
    model_code: 'page',
    column_kind: columnKind,
    custom_url: null,
    route_path: routePath,
    open_in_new_tab: 0,
    content_html: String(input.content_html ?? existing?.content_html ?? ''),
    seo_title: seoTitle,
    seo_keywords: seoKeywords,
    seo_description: seoDescription,
    sort_order: sortOrder
  };
}

function assertEditableManualColumn(column) {
  if (!column || Number(column.is_system || 0) === 1 || !EDITABLE_MANUAL_SOURCE_TYPES.has(String(column.source_type || ''))) {
    throw new Error('当前栏目不支持直接编辑');
  }
}

function getNextManualColumnSourceId(sourceType) {
  const value = queryOne(
    'SELECT COALESCE(MAX(source_id), 0) + 1 AS value FROM columns WHERE source_type = ?',
    [sourceType]
  )?.value;
  return toInteger(value, 1);
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

function validateSinglePageRoutePath(routePath, currentId = null) {
  if (RESERVED_SINGLE_PAGE_PATHS.has(routePath.toLowerCase())) {
    throw new Error('该访问路径已被系统保留');
  }

  const normalized = routePath.toLowerCase();
  if (RESERVED_SINGLE_PAGE_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`))) {
    throw new Error('该访问路径与系统栏目冲突');
  }

  const params = currentId
    ? [routePath, currentId]
    : [routePath];
  const existing = queryOne(
    currentId
      ? 'SELECT id FROM columns WHERE route_path = ? AND id <> ? LIMIT 1'
      : 'SELECT id FROM columns WHERE route_path = ? LIMIT 1',
    params
  );
  if (existing) {
    throw new Error('访问路径已存在');
  }
}

function normalizeColumnKind(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'link' || normalized === 'single') {
    return normalized;
  }
  throw new Error('栏目类型不正确');
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
    throw new Error('单页栏目访问路径不能是完整网址');
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

function pathLooksLikeFile(value) {
  const lastSegment = String(value || '').split('/').filter(Boolean).pop() || '';
  return lastSegment.includes('.');
}

function addColumnIfMissing(tableName, columnName, definition) {
  const columns = queryAll(`PRAGMA table_info(${tableName})`);
  if (columns.some((column) => column.name === columnName)) {
    return;
  }
  getDb().exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

function toInteger(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
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
