import { execute, getDb, queryAll, queryOne } from '../db.mjs';
import { getColumnById } from './columns.mjs';
import { getContentModelById } from './content-models.mjs';

const ALLOWED_ALIGNMENTS = new Set(['left', 'center', 'right']);
const EXCLUDED_DEFAULT_FIELDS = new Set(['id', 'column_id']);
const READ_ONLY_SYSTEM_FIELDS = new Set(['id', 'column_id', 'created_at', 'updated_at']);
const HIDDEN_BY_DEFAULT_TYPES = new Set(['richtext', 'textarea', 'image', 'images', 'attachments']);

let schemaEnsured = false;

export function ensureContentTableViewsSchema() {
  if (schemaEnsured) {
    return;
  }

  getDb().exec(`
    CREATE TABLE IF NOT EXISTS content_table_views (
      id INTEGER PRIMARY KEY,
      column_id INTEGER NOT NULL UNIQUE,
      model_code TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS content_table_view_columns (
      id INTEGER PRIMARY KEY,
      view_id INTEGER NOT NULL,
      field_name TEXT NOT NULL,
      label_override TEXT,
      is_visible INTEGER NOT NULL DEFAULT 1,
      width INTEGER NOT NULL DEFAULT 140,
      align TEXT NOT NULL DEFAULT 'left',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(view_id, field_name)
    );

    CREATE INDEX IF NOT EXISTS idx_content_table_view_columns_sort
      ON content_table_view_columns(view_id, sort_order, id);
  `);

  schemaEnsured = true;
}

export function getContentTableView(columnId) {
  ensureContentTableViewsSchema();
  const context = resolveTableViewContext(columnId);
  const view = queryOne(
    `SELECT id, column_id, model_code, created_at, updated_at
     FROM content_table_views
     WHERE column_id = ?`,
    [context.column.id]
  );
  const savedColumns = view
    ? queryAll(
      `SELECT field_name, label_override, is_visible, width, align, sort_order
       FROM content_table_view_columns
       WHERE view_id = ?
       ORDER BY sort_order ASC, id ASC`,
      [view.id]
    )
    : [];

  return buildResolvedTableView(context, view, savedColumns);
}

export function saveContentTableView(columnId, input = {}) {
  ensureContentTableViewsSchema();
  const context = resolveTableViewContext(columnId);
  const columns = normalizeColumnsInput(input.columns, context.model.fields);
  const db = getDb();
  const now = new Date().toISOString();

  db.exec('BEGIN IMMEDIATE');
  try {
    execute(
      `INSERT INTO content_table_views (column_id, model_code, created_at, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(column_id) DO UPDATE SET
         model_code = excluded.model_code,
         updated_at = excluded.updated_at`,
      [context.column.id, context.model.code, now, now]
    );
    const view = queryOne('SELECT id FROM content_table_views WHERE column_id = ?', [context.column.id]);
    execute('DELETE FROM content_table_view_columns WHERE view_id = ?', [view.id]);

    columns.forEach((column, index) => {
      execute(
        `INSERT INTO content_table_view_columns (
          view_id, field_name, label_override, is_visible, width, align, sort_order, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          view.id,
          column.field_name,
          column.label_override,
          column.is_visible,
          column.width,
          column.align,
          index * 10,
          now,
          now
        ]
      );
    });
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return getContentTableView(context.column.id);
}

export function resetContentTableView(columnId) {
  ensureContentTableViewsSchema();
  const context = resolveTableViewContext(columnId);
  const view = queryOne('SELECT id FROM content_table_views WHERE column_id = ?', [context.column.id]);
  if (view) {
    execute('DELETE FROM content_table_view_columns WHERE view_id = ?', [view.id]);
    execute('DELETE FROM content_table_views WHERE id = ?', [view.id]);
  }
  return getContentTableView(context.column.id);
}

export function deleteContentTableViewByColumn(columnId) {
  ensureContentTableViewsSchema();
  const view = queryOne('SELECT id FROM content_table_views WHERE column_id = ?', [columnId]);
  if (!view) return false;
  execute('DELETE FROM content_table_view_columns WHERE view_id = ?', [view.id]);
  execute('DELETE FROM content_table_views WHERE id = ?', [view.id]);
  return true;
}

function resolveTableViewContext(columnId) {
  const column = getColumnById(columnId, { includeTranslations: false });
  if (!column) {
    throw new Error('栏目不存在');
  }
  if (!column.content_model_id) {
    throw new Error('栏目尚未绑定内容模型');
  }
  const model = getContentModelById(column.content_model_id);
  if (!model) {
    throw new Error('栏目绑定的内容模型不存在');
  }
  return { column, model };
}

function buildResolvedTableView(context, view, savedColumns) {
  const savedByField = new Map(savedColumns.map((column) => [column.field_name, column]));
  const configuredFieldNames = new Set(context.model.fields.map((field) => field.field_name));
  const orderedFields = savedColumns.length > 0
    ? [
      ...savedColumns
        .filter((column) => configuredFieldNames.has(column.field_name))
        .map((column) => context.model.fields.find((field) => field.field_name === column.field_name)),
      ...context.model.fields.filter((field) => !savedByField.has(field.field_name))
    ].filter(Boolean)
    : [...context.model.fields].sort((left, right) => (
      defaultFieldSortOrder(left) - defaultFieldSortOrder(right)
      || String(left.field_name || '').localeCompare(String(right.field_name || ''))
    ));

  return {
    id: view?.id || null,
    column_id: context.column.id,
    model_code: context.model.code,
    model_name: context.model.name,
    is_default: !view,
    columns: orderedFields.map((field, index) => {
      const saved = savedByField.get(field.field_name);
      return {
        field_name: field.field_name,
        field_label: field.field_label || field.field_name,
        label: saved?.label_override || field.field_label || field.field_name,
        label_override: saved?.label_override || '',
        field_type: field.field_type || 'text',
        is_required: Number(field.is_required || 0),
        is_editable: READ_ONLY_SYSTEM_FIELDS.has(field.field_name) ? 0 : Number(field.is_editable ?? 1),
        is_searchable: Number(field.is_searchable || 0),
        is_visible: saved ? Number(saved.is_visible || 0) : inferDefaultVisibility(field),
        width: saved ? Number(saved.width || 140) : inferDefaultWidth(field),
        align: saved?.align || inferDefaultAlignment(field),
        sort_order: saved ? Number(saved.sort_order || 0) : index * 10,
        settings_json: field.settings_json || null
      };
    })
  };
}

function normalizeColumnsInput(columns, modelFields) {
  if (!Array.isArray(columns) || columns.length === 0) {
    throw new Error('表格列配置不能为空');
  }
  const fieldsByName = new Map(modelFields.map((field) => [field.field_name, field]));
  const seen = new Set();
  const normalized = columns.map((input) => {
    const fieldName = String(input?.field_name || '').trim();
    const field = fieldsByName.get(fieldName);
    if (!field) {
      throw new Error(`字段不存在：${fieldName || '-'}`);
    }
    if (seen.has(fieldName)) {
      throw new Error(`字段配置重复：${fieldName}`);
    }
    seen.add(fieldName);

    const requiredEditable = Number(field.is_required || 0) === 1
      && Number(field.is_editable ?? 1) === 1
      && !READ_ONLY_SYSTEM_FIELDS.has(field.field_name);
    const labelOverride = String(input?.label_override || '').trim();
    const width = Math.max(72, Math.min(480, Number.parseInt(input?.width, 10) || inferDefaultWidth(field)));
    const align = ALLOWED_ALIGNMENTS.has(input?.align) ? input.align : inferDefaultAlignment(field);
    return {
      field_name: fieldName,
      label_override: labelOverride ? labelOverride.slice(0, 100) : null,
      is_visible: requiredEditable ? 1 : (input?.is_visible ? 1 : 0),
      width,
      align
    };
  });

  modelFields.forEach((field) => {
    if (!seen.has(field.field_name)) {
      normalized.push({
        field_name: field.field_name,
        label_override: null,
        is_visible: inferDefaultVisibility(field),
        width: inferDefaultWidth(field),
        align: inferDefaultAlignment(field)
      });
    }
  });

  if (!normalized.some((column) => column.is_visible)) {
    throw new Error('至少需要显示一列');
  }
  return normalized;
}

function inferDefaultVisibility(field) {
  if (EXCLUDED_DEFAULT_FIELDS.has(field.field_name)) {
    return 0;
  }
  if (field.field_name === 'updated_at') {
    return 1;
  }
  if (HIDDEN_BY_DEFAULT_TYPES.has(field.field_type)) {
    return 0;
  }
  return Number(field.is_editable ?? 1) === 1 ? 1 : 0;
}

function defaultFieldSortOrder(field) {
  if (field.field_name === 'updated_at') {
    return Number.MAX_SAFE_INTEGER - 1;
  }
  if (field.field_name === 'created_at') {
    return Number.MAX_SAFE_INTEGER - 2;
  }
  return Number(field.sort_order || 0);
}

function inferDefaultWidth(field) {
  if (field.field_type === 'datetime') {
    return 160;
  }
  if (field.field_type === 'number' || field.field_type === 'boolean') {
    return 110;
  }
  if (field.field_type === 'richtext' || field.field_type === 'attachments' || field.field_type === 'image') {
    return 220;
  }
  return 150;
}

function inferDefaultAlignment(field) {
  return field.field_type === 'number' ? 'right' : (field.field_type === 'boolean' ? 'center' : 'left');
}
