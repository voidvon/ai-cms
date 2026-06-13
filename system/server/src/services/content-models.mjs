import { getDb, queryAll, queryOne } from '../db.mjs';
import { ensureContentModelFieldsSchema, mergeModelFieldConfigs } from './content-model-fields.mjs';

const BUILTIN_MODELS = [
  {
    code: 'product',
    name: '产品',
    source_table: 'products',
    description: '产品列表和产品详情'
  },
  {
    code: 'news',
    name: '新闻',
    source_table: 'news',
    description: '新闻列表和新闻详情'
  }
];

const FIELD_LABELS = {
  id: 'ID',
  category_id: '分类',
  name: '名称',
  title: '标题',
  code: '型号/编码',
  summary: '摘要',
  content_html: '正文内容',
  requirements_html: '具体要求',
  images: '产品图片',
  picture: '图片',
  keywords: '关键词',
  is_featured_home: '首页推荐',
  is_visible: '显示',
  is_active: '启用',
  sort_order: '排序',
  address: '地点',
  openings: '需求人数',
  contact_person: '联系人',
  phone: '联系电话',
  created_at: '创建时间',
  legacy_extra: '扩展数据'
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

  schemaEnsured = true;
}

export function listContentModels() {
  ensureContentModelsSchema();
  ensureContentModelFieldsSchema();
  return getContentModelRows().map((model) => ({
    ...model,
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
    fields: readModelFields(model)
  };
}

function getContentModelRows() {
  const customModels = queryAll(
    `
      SELECT id, code, name, source_table, description, is_system, sort_order, created_at, updated_at
      FROM content_models
      ORDER BY sort_order ASC, id ASC
    `
  );
  const customByCode = new Map(customModels.map((model) => [model.code, model]));
  const builtinModels = BUILTIN_MODELS.map((model, index) => {
    const stored = customByCode.get(model.code);
    if (stored) {
      return {
        ...stored,
        ...model,
        is_system: 1,
        sort_order: stored.sort_order || (index + 1) * 10
      };
    }
    return {
      id: -1 * (index + 1),
      ...model,
      is_system: 1,
      sort_order: (index + 1) * 10
    };
  });
  const builtinCodes = new Set(BUILTIN_MODELS.map((model) => model.code));
  const userModels = customModels.filter((model) => !builtinCodes.has(model.code));
  return [...builtinModels, ...userModels].sort((a, b) => {
    if (a.sort_order !== b.sort_order) {
      return a.sort_order - b.sort_order;
    }
    return a.id - b.id;
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
