import { execute, getDb, queryAll, queryOne } from '../db.mjs';
import { ensureContentModelFieldsSchema, mergeModelFieldConfigs } from './content-model-fields.mjs';

const BUILTIN_MODELS = [
  {
    code: 'product',
    name: '产品',
    source_table: 'content_product',
    description: '产品列表和产品详情'
  },
  {
    code: 'news',
    name: '新闻',
    source_table: 'content_news',
    description: '新闻列表和新闻详情'
  }
];

const FIELD_LABELS = {
  id: 'ID',
  column_id: '栏目',
  name: '名称',
  title: '标题',
  code: '型号/编码',
  summary: '摘要',
  content_html: '正文内容',
  requirements_html: '具体要求',
  images: '产品图片',
  picture: '图片',
  is_featured_home: '首页推荐',
  is_visible: '显示',
  is_active: '启用',
  sort_order: '排序',
  address: '地点',
  openings: '需求人数',
  contact_person: '联系人',
  phone: '联系电话',
  created_at: '创建时间'
};

let schemaEnsured = false;

export function ensureContentModelsSchema() {
  if (schemaEnsured) {
    return;
  }

  getDb().exec(`
    CREATE TABLE IF NOT EXISTS content_models (
      id INTEGER PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      source_table TEXT,
      description TEXT,
      is_system INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_content_models_sort ON content_models(sort_order, id);
  `);

  ensureBuiltinContentModels();
  schemaEnsured = true;
}

export function listContentModels() {
  ensureContentModelsSchema();
  ensureContentModelFieldsSchema();
  return getContentModelRows().map((model) => ({
    ...model,
    bound_columns: listBoundColumnsForModel(model.id),
    bound_column_count: countBoundColumnsForModel(model.id),
    fields: readModelFields(model)
  }));
}

export function getContentModelById(id) {
  ensureContentModelsSchema();
  ensureContentModelFieldsSchema();
  const modelId = Number(id);
  const model = getContentModelRows().find((item) => Number(item.id) === modelId);
  if (!model) {
    return null;
  }
  return {
    ...model,
    bound_columns: listBoundColumnsForModel(model.id),
    bound_column_count: countBoundColumnsForModel(model.id),
    fields: readModelFields(model)
  };
}

export function getContentModelByCode(code) {
  ensureContentModelsSchema();
  ensureContentModelFieldsSchema();
  const modelCode = String(code || '').trim();
  if (!modelCode) {
    return null;
  }
  const model = getContentModelRows().find((item) => item.code === modelCode);
  if (!model) {
    return null;
  }
  return {
    ...model,
    bound_columns: listBoundColumnsForModel(model.id),
    bound_column_count: countBoundColumnsForModel(model.id),
    fields: readModelFields(model)
  };
}

function getContentModelRows() {
  const storedModels = queryAll(
    `
      SELECT id, code, name, source_table, description, is_system, sort_order, created_at, updated_at
      FROM content_models
      ORDER BY sort_order ASC, id ASC
    `
  );
  const builtinCodes = new Set(BUILTIN_MODELS.map((model) => model.code));
  const rows = storedModels.map((model) => {
    const builtin = BUILTIN_MODELS.find((item) => item.code === model.code);
    if (!builtin) {
      return model;
    }
    return {
      ...model,
      ...builtin,
      is_system: 1,
      sort_order: Number(model.sort_order || 0) || ((BUILTIN_MODELS.indexOf(builtin) + 1) * 10)
    };
  });
  const missingBuiltinRows = BUILTIN_MODELS
    .filter((model) => !rows.some((item) => item.code === model.code))
    .map((model, index) => ({
      id: -1 * (index + 1),
      ...model,
      is_system: 1,
      sort_order: (index + 1) * 10
    }));
  const userModels = rows.filter((model) => !builtinCodes.has(model.code));
  const builtinModels = rows.filter((model) => builtinCodes.has(model.code));
  return [...builtinModels, ...missingBuiltinRows, ...userModels].sort((a, b) => {
    if (a.sort_order !== b.sort_order) {
      return a.sort_order - b.sort_order;
    }
    return a.id - b.id;
  });
}

function ensureBuiltinContentModels() {
  const now = new Date().toISOString();
  BUILTIN_MODELS.forEach((model, index) => {
    const expectedSortOrder = (index + 1) * 10;
    const existing = queryOne(
      `
        SELECT id, name, source_table, description, is_system, sort_order
        FROM content_models
        WHERE code = ?
        LIMIT 1
      `,
      [model.code]
    );
    if (!existing) {
      execute(
        `
          INSERT INTO content_models (
            code,
            name,
            source_table,
            description,
            is_system,
            sort_order,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, 1, ?, ?, ?)
        `,
        [
          model.code,
          model.name,
          model.source_table,
          model.description,
          expectedSortOrder,
          now,
          now
        ]
      );
      return;
    }

    if (
      String(existing.name || '') !== model.name
      || String(existing.source_table || '') !== model.source_table
      || String(existing.description || '') !== model.description
      || Number(existing.is_system || 0) !== 1
      || Number(existing.sort_order || 0) !== expectedSortOrder
    ) {
      execute(
        `
          UPDATE content_models
          SET
            name = ?,
            source_table = ?,
            description = ?,
            is_system = 1,
            sort_order = ?,
            updated_at = ?
          WHERE code = ?
        `,
        [
          model.name,
          model.source_table,
          model.description,
          expectedSortOrder,
          now,
          model.code
        ]
      );
    }
  });
}

function readModelFields(model) {
  const columns = getTableColumns(model.source_table);
  const fields = columns.map((column) => ({
    id: Number(column.cid || 0) + 1,
    model_id: model.id,
    field_name: column.name,
    field_label: FIELD_LABELS[column.name] || column.name,
    field_type: inferFieldType(column.name, column.type),
    db_type: column.type || '',
    is_required: Number(column.notnull || 0),
    is_primary: Number(column.pk || 0),
    is_system: Number(model.is_system || 0),
    sort_order: Number(column.cid || 0) * 10
  }));

  return mergeModelFieldConfigs(model.code, fields);
}

function countBoundColumnsForModel(modelId) {
  const row = queryOne(
    `
      SELECT COUNT(*) AS value
      FROM columns
      WHERE content_model_id = ?
    `,
    [modelId]
  );
  return Number(row?.value || 0);
}

function listBoundColumnsForModel(modelId) {
  return queryAll(
    `
      SELECT
        id,
        parent_id,
        column_type,
        route_path,
        sort_order
      FROM columns
      WHERE content_model_id = ?
      ORDER BY sort_order ASC, id ASC
    `,
    [modelId]
  ).map((row) => ({
    id: Number(row.id || 0),
    parent_id: row.parent_id === null || row.parent_id === undefined ? null : Number(row.parent_id),
    column_type: String(row.column_type || ''),
    route_path: row.route_path || null,
    sort_order: Number(row.sort_order || 0)
  }));
}

function getTableColumns(tableName) {
  if (!isSafeIdentifier(tableName)) {
    return [];
  }
  const table = queryOne(
    `
      SELECT name
      FROM sqlite_master
      WHERE type IN ('table', 'view') AND name = ?
    `,
    [tableName]
  );
  if (!table) {
    return [];
  }
  return queryAll(`PRAGMA table_info(${quoteIdentifier(tableName)})`);
}

function isSafeIdentifier(value) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(String(value || ''));
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function inferFieldType(fieldName, dbType) {
  const name = String(fieldName || '').toLowerCase();
  const type = String(dbType || '').toUpperCase();
  if (name === 'content_html' || name === 'requirements_html') {
    return 'richtext';
  }
  if (name.includes('image') || name === 'picture') {
    return 'image';
  }
  if (name.startsWith('is_')) {
    return 'boolean';
  }
  if (name.endsWith('_at')) {
    return 'datetime';
  }
  if (type.includes('INT')) {
    return 'number';
  }
  return 'text';
}
