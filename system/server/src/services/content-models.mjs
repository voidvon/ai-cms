import { execute, getDb, queryAll, queryOne } from '../db.mjs';
import {
  ensureContentModelFieldsSchema,
  listConfiguredModelFields,
  mergeModelFieldConfigs,
  upsertConfiguredModelField
} from './content-model-fields.mjs';

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
  },
  {
    code: 'price_record',
    name: '价格条目',
    source_table: 'content_price_record',
    description: '报价列表下的价格条目'
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
  model: '型号',
  spec: '规格',
  diameter: '口径',
  price: '价格',
  material_code: '物料代码',
  category: '分类',
  description: '说明',
  stock: '库存',
  reference_no: '参考编号',
  name_en: '英文名称',
  material: '材质',
  requirements_html: '具体要求',
  images: '产品图片',
  spec_options_json: '产品规格',
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

  ensureBuiltinModelFields();
}

function ensureBuiltinModelFields() {
  upsertConfiguredModelField('product', 'images', {
    field_label: '产品图片',
    field_type: 'images',
    is_required: 0,
    is_editable: 1,
    is_translatable: 0,
    is_searchable: 0,
    is_system: 1,
    sort_order: 30,
    settings_json: null
  }, {
    field_name: 'images',
    field_label: '产品图片',
    field_type: 'images',
    is_required: 0,
    sort_order: 30
  });

  upsertConfiguredModelField('product', 'spec_options_json', {
    field_label: '产品规格',
    field_type: 'text',
    is_required: 0,
    is_editable: 1,
    is_translatable: 0,
    is_searchable: 0,
    is_system: 1,
    sort_order: 35,
    settings_json: null
  }, {
    field_name: 'spec_options_json',
    field_label: '产品规格',
    field_type: 'text',
    is_required: 0,
    sort_order: 35
  });

  const priceRecordFields = [
    {
      field_name: 'column_id',
      field_label: '所属报价列表',
      field_type: 'number',
      is_required: 1,
      is_editable: 0,
      is_translatable: 0,
      is_searchable: 0,
      sort_order: 1
    },
    {
      field_name: 'custom_url',
      field_label: '自定义文件名',
      field_type: 'text',
      is_required: 0,
      is_editable: 0,
      is_translatable: 0,
      is_searchable: 0,
      sort_order: 2
    },
    {
      field_name: 'code',
      field_label: '内容编号',
      field_type: 'text',
      is_required: 0,
      is_editable: 0,
      is_translatable: 0,
      is_searchable: 0,
      sort_order: 3
    },
    {
      field_name: 'name',
      field_label: '名称',
      field_type: 'text',
      is_required: 1,
      is_editable: 1,
      is_translatable: 0,
      is_searchable: 1,
      sort_order: 10
    },
    {
      field_name: 'model',
      field_label: '型号',
      field_type: 'text',
      is_required: 0,
      is_editable: 1,
      is_translatable: 0,
      is_searchable: 1,
      sort_order: 20
    },
    {
      field_name: 'spec',
      field_label: '规格',
      field_type: 'text',
      is_required: 0,
      is_editable: 1,
      is_translatable: 0,
      is_searchable: 1,
      sort_order: 30
    },
    {
      field_name: 'diameter',
      field_label: '口径',
      field_type: 'text',
      is_required: 0,
      is_editable: 1,
      is_translatable: 0,
      is_searchable: 0,
      sort_order: 40
    },
    {
      field_name: 'price',
      field_label: '价格',
      field_type: 'number',
      is_required: 0,
      is_editable: 1,
      is_translatable: 0,
      is_searchable: 0,
      sort_order: 50
    },
    {
      field_name: 'material_code',
      field_label: '物料代码',
      field_type: 'text',
      is_required: 0,
      is_editable: 1,
      is_translatable: 0,
      is_searchable: 1,
      sort_order: 60
    },
    {
      field_name: 'category',
      field_label: '分类',
      field_type: 'text',
      is_required: 0,
      is_editable: 1,
      is_translatable: 0,
      is_searchable: 1,
      sort_order: 70
    },
    {
      field_name: 'description',
      field_label: '说明',
      field_type: 'textarea',
      is_required: 0,
      is_editable: 1,
      is_translatable: 0,
      is_searchable: 0,
      sort_order: 80
    },
    {
      field_name: 'stock',
      field_label: '库存',
      field_type: 'number',
      is_required: 0,
      is_editable: 1,
      is_translatable: 0,
      is_searchable: 0,
      sort_order: 90
    },
    {
      field_name: 'reference_no',
      field_label: '参考编号',
      field_type: 'text',
      is_required: 0,
      is_editable: 1,
      is_translatable: 0,
      is_searchable: 1,
      sort_order: 100
    },
    {
      field_name: 'name_en',
      field_label: '英文名称',
      field_type: 'text',
      is_required: 0,
      is_editable: 1,
      is_translatable: 0,
      is_searchable: 1,
      sort_order: 110
    },
    {
      field_name: 'material',
      field_label: '材质',
      field_type: 'text',
      is_required: 0,
      is_editable: 1,
      is_translatable: 0,
      is_searchable: 1,
      sort_order: 120
    },
    {
      field_name: 'is_visible',
      field_label: '显示状态',
      field_type: 'boolean',
      is_required: 0,
      is_editable: 0,
      is_translatable: 0,
      is_searchable: 0,
      sort_order: 130
    },
    {
      field_name: 'is_featured_home',
      field_label: '推荐',
      field_type: 'boolean',
      is_required: 0,
      is_editable: 0,
      is_translatable: 0,
      is_searchable: 0,
      sort_order: 140
    },
    {
      field_name: 'sort_order',
      field_label: '排序',
      field_type: 'number',
      is_required: 0,
      is_editable: 0,
      is_translatable: 0,
      is_searchable: 0,
      sort_order: 150
    },
    {
      field_name: 'created_at',
      field_label: '创建时间',
      field_type: 'datetime',
      is_required: 0,
      is_editable: 0,
      is_translatable: 0,
      is_searchable: 0,
      sort_order: 160
    }
  ];

  priceRecordFields.forEach((field) => {
    upsertConfiguredModelField('price_record', field.field_name, {
      field_label: field.field_label,
      field_type: field.field_type,
      is_required: field.is_required,
      is_editable: field.is_editable,
      is_translatable: field.is_translatable,
      is_searchable: field.is_searchable,
      is_system: 1,
      sort_order: field.sort_order,
      settings_json: null
    }, field);
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

  const configuredFields = listConfiguredModelFields(model.code);
  const byName = new Map(fields.map((field) => [field.field_name, field]));

  configuredFields.forEach((field) => {
    if (byName.has(field.field_name)) {
      return;
    }

    byName.set(field.field_name, {
      id: Number(field.id || 0) || (fields.length + byName.size + 1),
      model_id: model.id,
      field_name: field.field_name,
      field_label: field.field_label || FIELD_LABELS[field.field_name] || field.field_name,
      field_type: field.field_type || 'text',
      db_type: inferDbTypeFromFieldType(field.field_type),
      is_required: Number(field.is_required || 0),
      is_primary: 0,
      is_system: Number(field.is_system || model.is_system || 0),
      sort_order: Number(field.sort_order || 0)
    });
  });

  return mergeModelFieldConfigs(model.code, Array.from(byName.values()).sort((left, right) => {
    if (Number(left.sort_order || 0) !== Number(right.sort_order || 0)) {
      return Number(left.sort_order || 0) - Number(right.sort_order || 0);
    }
    return String(left.field_name || '').localeCompare(String(right.field_name || ''));
  }));
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

function inferDbTypeFromFieldType(fieldType) {
  const normalized = String(fieldType || '').trim().toLowerCase();
  if (normalized === 'number' || normalized === 'boolean') {
    return 'NUMERIC';
  }
  if (normalized === 'datetime') {
    return 'TEXT';
  }
  return 'TEXT';
}

export function migratePriceRecordTranslationsToMainTable() {
  const tableExists = queryOne(
    `
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name = 'content_price_record'
    `
  );
  const translationTableExists = queryOne(
    `
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name = 'content_price_record_translations'
    `
  );
  if (!tableExists || !translationTableExists) {
    return;
  }

  execute(
    `
      UPDATE content_price_record
      SET name = (
        SELECT coalesce(t.name, '')
        FROM content_price_record_translations t
        WHERE t.entry_id = content_price_record.id
        ORDER BY t.id ASC
        LIMIT 1
      )
      WHERE coalesce(name, '') = ''
        AND EXISTS (
          SELECT 1
          FROM content_price_record_translations t
          WHERE t.entry_id = content_price_record.id
            AND coalesce(t.name, '') <> ''
        )
    `
  );

  execute(
    `
      DELETE FROM content_price_record_translations
      WHERE entry_id IN (
        SELECT id
        FROM content_price_record
      )
    `
  );
}
