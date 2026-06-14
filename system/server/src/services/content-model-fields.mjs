import { execute, getDb, queryAll, queryOne } from '../db.mjs';

const PROTECTED_TRANSLATION_FIELDS = new Set([
  'id',
  'parent_id',
  'source_id',
  'source_type',
  'route_path',
  'custom_url',
  'sort_order',
  'is_system',
  'is_visible',
  'is_featured_home',
  'code',
  'images',
  'picture',
  'created_at',
  'updated_at'
]);

let schemaEnsured = false;

export function ensureContentModelFieldsSchema() {
  if (schemaEnsured) {
    return;
  }

  getDb().exec(`
    CREATE TABLE IF NOT EXISTS content_model_fields (
      id INTEGER PRIMARY KEY,
      model_code TEXT NOT NULL,
      field_name TEXT NOT NULL,
      field_label TEXT,
      field_type TEXT NOT NULL DEFAULT 'text',
      is_required INTEGER NOT NULL DEFAULT 0,
      is_listed INTEGER NOT NULL DEFAULT 1,
      is_editable INTEGER NOT NULL DEFAULT 1,
      is_translatable INTEGER NOT NULL DEFAULT 0,
      is_system INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      settings_json TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(model_code, field_name)
    );
  `);

  migrateLegacyContentModelFieldsSchema();

  schemaEnsured = true;
}

export function listConfiguredModelFields(modelCode) {
  ensureContentModelFieldsSchema();
  return queryAll(
    `
      SELECT
        id,
        model_code,
        field_name,
        field_label,
        field_type,
        is_required,
        is_listed,
        is_editable,
        is_translatable,
        is_system,
        sort_order,
        settings_json,
        created_at,
        updated_at
      FROM content_model_fields
      WHERE model_code = ?
      ORDER BY sort_order ASC, id ASC
    `,
    [modelCode]
  ).map(mapConfiguredField);
}

export function getConfiguredModelField(modelCode, fieldName) {
  ensureContentModelFieldsSchema();
  const row = queryOne(
    `
      SELECT
        id,
        model_code,
        field_name,
        field_label,
        field_type,
        is_required,
        is_listed,
        is_editable,
        is_translatable,
        is_system,
        sort_order,
        settings_json,
        created_at,
        updated_at
      FROM content_model_fields
      WHERE model_code = ? AND field_name = ?
    `,
    [modelCode, fieldName]
  );
  return row ? mapConfiguredField(row) : null;
}

export function upsertConfiguredModelField(modelCode, fieldName, input, sourceField = null) {
  ensureContentModelFieldsSchema();
  const existing = getConfiguredModelField(modelCode, fieldName);
  const payload = normalizeFieldConfigInput(modelCode, fieldName, input, sourceField);
  const now = new Date().toISOString();

  if (existing) {
    execute(
      `
        UPDATE content_model_fields
        SET
          field_label = ?,
          field_type = ?,
          is_required = ?,
          is_listed = ?,
          is_editable = ?,
          is_translatable = ?,
          is_system = ?,
          sort_order = ?,
          settings_json = ?,
          updated_at = ?
        WHERE model_code = ? AND field_name = ?
      `,
      [
        payload.field_label,
        payload.field_type,
        payload.is_required,
        payload.is_listed,
        payload.is_editable,
        payload.is_translatable,
        payload.is_system,
        payload.sort_order,
        payload.settings_json,
        now,
        modelCode,
        fieldName
      ]
    );
  } else {
    execute(
      `
        INSERT INTO content_model_fields (
          model_code,
          field_name,
          field_label,
          field_type,
          is_required,
          is_listed,
          is_editable,
          is_translatable,
          is_system,
          sort_order,
          settings_json,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        modelCode,
        fieldName,
        payload.field_label,
        payload.field_type,
        payload.is_required,
        payload.is_listed,
        payload.is_editable,
        payload.is_translatable,
        payload.is_system,
        payload.sort_order,
        payload.settings_json,
        now,
        now
      ]
    );
  }

  return getConfiguredModelField(modelCode, fieldName);
}

export function mergeModelFieldConfigs(modelCode, fields) {
  ensureContentModelFieldsSchema();
  const configured = new Map(
    listConfiguredModelFields(modelCode).map((field) => [field.field_name, field])
  );

  return fields.map((field) => {
    const override = configured.get(field.field_name);
    return {
      ...field,
      field_label: override?.field_label || field.field_label,
      field_type: override?.field_type || field.field_type,
      is_required: override?.is_required ?? field.is_required,
      is_listed: override?.is_listed ?? 1,
      is_editable: override?.is_editable ?? 1,
      is_translatable: override?.is_translatable ?? 0,
      sort_order: override?.sort_order ?? field.sort_order,
      settings_json: override?.settings_json ?? null,
      config_id: override?.id ?? null
    };
  });
}

function normalizeFieldConfigInput(modelCode, fieldName, input, sourceField) {
  const safeFieldName = String(fieldName || '').trim();
  if (!safeFieldName) {
    throw new Error('字段名不能为空');
  }

  const source = sourceField || {};
  const isProtected = PROTECTED_TRANSLATION_FIELDS.has(safeFieldName);
  const requestedTranslatable = toBooleanInt(input?.is_translatable);

  if (isProtected && requestedTranslatable) {
    throw new Error(`字段 ${safeFieldName} 不允许配置为翻译字段`);
  }

  return {
    model_code: modelCode,
    field_name: safeFieldName,
    field_label: String(input?.field_label ?? source.field_label ?? safeFieldName).trim() || safeFieldName,
    field_type: String(input?.field_type ?? source.field_type ?? 'text').trim() || 'text',
    is_required: input?.is_required === undefined ? Number(source.is_required || 0) : toBooleanInt(input?.is_required),
    is_listed: input?.is_listed === undefined ? 1 : toBooleanInt(input?.is_listed),
    is_editable: input?.is_editable === undefined ? 1 : toBooleanInt(input?.is_editable),
    is_translatable: requestedTranslatable,
    is_system: Number(source.is_system || 0),
    sort_order: toInteger(input?.sort_order, Number(source.sort_order || 0)),
    settings_json: input?.settings_json ? JSON.stringify(input.settings_json) : null
  };
}

function mapConfiguredField(row) {
  return {
    id: Number(row.id),
    model_code: row.model_code,
    field_name: row.field_name,
    field_label: row.field_label,
    field_type: row.field_type,
    is_required: Number(row.is_required || 0),
    is_listed: Number(row.is_listed || 0),
    is_editable: Number(row.is_editable || 0),
    is_translatable: Number(row.is_translatable || 0),
    is_system: Number(row.is_system || 0),
    sort_order: Number(row.sort_order || 0),
    settings_json: row.settings_json || null,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function toBooleanInt(value) {
  if (value === true || value === 'true' || value === '1' || value === 1) {
    return 1;
  }
  return 0;
}

function toInteger(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function migrateLegacyContentModelFieldsSchema() {
  const columns = queryAll('PRAGMA table_info(content_model_fields)');
  if (!columns.length) {
    return;
  }

  const columnNames = new Set(columns.map((column) => String(column.name)));
  const hasModelCode = columnNames.has('model_code');
  const hasModelId = columnNames.has('model_id');

  if (!hasModelCode) {
    execute('ALTER TABLE content_model_fields ADD COLUMN model_code TEXT');
  }
  if (!columnNames.has('is_listed')) {
    execute('ALTER TABLE content_model_fields ADD COLUMN is_listed INTEGER NOT NULL DEFAULT 1');
  }
  if (!columnNames.has('is_editable')) {
    execute('ALTER TABLE content_model_fields ADD COLUMN is_editable INTEGER NOT NULL DEFAULT 1');
  }
  if (!columnNames.has('is_translatable')) {
    execute('ALTER TABLE content_model_fields ADD COLUMN is_translatable INTEGER NOT NULL DEFAULT 0');
  }
  if (!columnNames.has('settings_json')) {
    execute('ALTER TABLE content_model_fields ADD COLUMN settings_json TEXT');
  }

  if (hasModelId) {
    execute(
      `
        UPDATE content_model_fields
        SET model_code = (
          SELECT cm.code
          FROM content_models cm
          WHERE cm.id = content_model_fields.model_id
        )
        WHERE model_code IS NULL OR trim(model_code) = ''
      `
    );
  }

  execute(
    `
      UPDATE content_model_fields
      SET model_code = CASE field_name
        WHEN 'name' THEN 'product'
        WHEN 'code' THEN 'product'
        WHEN 'images' THEN 'product'
        WHEN 'title' THEN 'news'
        WHEN 'picture' THEN 'news'
        ELSE model_code
      END
      WHERE model_code IS NULL OR trim(model_code) = ''
    `
  );

  execute(
    `
      UPDATE content_model_fields
      SET model_code = 'product'
      WHERE model_code IS NULL OR trim(model_code) = ''
    `
  );

  execute(
    `
      DELETE FROM content_model_fields
      WHERE rowid NOT IN (
        SELECT MIN(rowid)
        FROM content_model_fields
        GROUP BY model_code, field_name
      )
    `
  );

  getDb().exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_content_model_fields_model_code_field_name
    ON content_model_fields(model_code, field_name);
  `);
}
