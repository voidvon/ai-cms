import { randomUUID } from 'node:crypto';
import { execute, getDb, queryAll, queryOne } from '../db.mjs';
import { getColumnById } from './columns.mjs';
import { ensureContentModelsSchema, getContentModelById } from './content-models.mjs';
import { ensureContentModelStorageSchema, getContentTableName } from './content-model-storage.mjs';

const FIELD_TYPES = new Set(['text', 'textarea', 'number', 'currency', 'date', 'datetime', 'boolean', 'select', 'multi_select', 'url']);
const IMMUTABLE_FIELD_NAMES = new Set(['id', 'column_id', 'created_at', 'updated_at']);
const HIDDEN_DEFAULT_FIELD_NAMES = new Set(['custom_url', 'code', 'is_visible', 'is_featured_home', 'sort_order', 'publish_status']);
const HIDDEN_DEFAULT_FIELD_TYPES = new Set(['richtext', 'textarea', 'image', 'images', 'attachments']);
const OPAQUE_FIELD_KEY_PATTERN = /^fld_[0-9a-f]{32}$/;
const TABLE_MODEL_CODE = 'multidimensional_table';
const LEGACY_TABLE_MODEL_CODE = 'price_record';
let schemaEnsured = false;

export function ensureDataTablesSchema() {
  if (schemaEnsured) return;
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS data_tables (
      id INTEGER PRIMARY KEY,
      column_id INTEGER NOT NULL UNIQUE,
      model_code TEXT,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS data_table_fields (
      id INTEGER PRIMARY KEY,
      table_id INTEGER NOT NULL,
      field_key TEXT NOT NULL,
      field_name TEXT NOT NULL,
      field_type TEXT NOT NULL DEFAULT 'text',
      is_deleted INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      settings_json TEXT,
      source_field_name TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(table_id, field_key)
    );
    CREATE INDEX IF NOT EXISTS idx_data_table_fields_sort ON data_table_fields(table_id, is_deleted, sort_order, id);
    CREATE TABLE IF NOT EXISTS data_table_records (
      id INTEGER PRIMARY KEY,
      table_id INTEGER NOT NULL,
      source_record_id INTEGER,
      data_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(table_id, source_record_id)
    );
    CREATE INDEX IF NOT EXISTS idx_data_table_records_table ON data_table_records(table_id, updated_at DESC, id DESC);
  `);
  addColumnIfMissing('data_table_fields', 'source_field_name', 'TEXT');
  dropColumnIfPresent('data_table_fields', 'is_primary');
  schemaEnsured = true;
  try {
    migrateLegacyTableModel();
  } catch (error) {
    schemaEnsured = false;
    throw error;
  }
}

export function migrateLegacyTableModel() {
  ensureContentModelsSchema();
  const legacyModel = queryOne('SELECT id FROM content_models WHERE code = ?', [LEGACY_TABLE_MODEL_CODE]);
  const targetModel = queryOne('SELECT id FROM content_models WHERE code = ?', [TABLE_MODEL_CODE]);
  if (!targetModel) throw new Error('多维表格记录模型不存在，无法迁移旧价格表格');

  if (legacyModel) {
    migrateLegacyPriceTranslations();
    const legacyColumns = queryAll('SELECT id FROM columns WHERE content_model_id = ? ORDER BY id ASC', [legacyModel.id]);
    legacyColumns.forEach((column) => getDataTableByColumn(column.id));
  }

  const db = getDb();
  db.exec('BEGIN IMMEDIATE');
  try {
    if (legacyModel) {
      execute('UPDATE columns SET content_model_id = ?, updated_at = CURRENT_TIMESTAMP WHERE content_model_id = ?', [targetModel.id, legacyModel.id]);
    }
    execute(`UPDATE columns
      SET route_path = replace(route_path, '/price-lists/', '/data-tables/'), updated_at = CURRENT_TIMESTAMP
      WHERE content_model_id = ? AND route_path LIKE '/price-lists/%'`, [targetModel.id]);
    execute('UPDATE data_tables SET model_code = ?, updated_at = CURRENT_TIMESTAMP WHERE model_code = ?', [TABLE_MODEL_CODE, LEGACY_TABLE_MODEL_CODE]);
    if (tableExists('content_table_views')) {
      execute("UPDATE content_table_views SET model_code = ?, updated_at = CURRENT_TIMESTAMP WHERE model_code = ?", [TABLE_MODEL_CODE, LEGACY_TABLE_MODEL_CODE]);
    }
    execute(`UPDATE data_table_fields SET source_field_name = NULL WHERE table_id IN (SELECT id FROM data_tables WHERE model_code = ?)`, [TABLE_MODEL_CODE]);
    execute(`UPDATE data_table_records SET source_record_id = NULL WHERE table_id IN (SELECT id FROM data_tables WHERE model_code = ?)`, [TABLE_MODEL_CODE]);
    execute('DELETE FROM content_model_fields WHERE model_code = ?', [LEGACY_TABLE_MODEL_CODE]);
    execute('DELETE FROM content_models WHERE code = ?', [LEGACY_TABLE_MODEL_CODE]);
    db.exec('DROP TABLE IF EXISTS content_price_record_translations');
    db.exec('DROP TABLE IF EXISTS content_price_record');
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return Boolean(legacyModel);
}

function migrateLegacyPriceTranslations() {
  if (!tableExists('content_price_record') || !tableExists('content_price_record_translations')) return;
  const columns = queryAll('PRAGMA table_info(content_price_record)');
  if (!columns.some((column) => column.name === 'name')) return;
  execute(`
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
        SELECT 1 FROM content_price_record_translations t
        WHERE t.entry_id = content_price_record.id AND coalesce(t.name, '') <> ''
      )
  `);
}

function tableExists(tableName) {
  return Boolean(queryOne("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", [tableName]));
}

export function getDataTableByColumn(columnId) {
  ensureDataTablesSchema();
  const context = resolveContext(columnId);
  const table = ensureTable(context);
  ensureDefaultFields(table.id, context.model);
  migrateDataTableFieldKeys(table.id);
  migrateLegacyRecords(table, context);
  return readTable(table.id, context);
}

export function updateDataTableFields(columnId, input = {}) {
  ensureDataTablesSchema();
  const context = resolveContext(columnId);
  const table = ensureTable(context);
  migrateDataTableFieldKeys(table.id);
  const fields = normalizeFields(input.fields, table.id);
  const now = new Date().toISOString();
  const db = getDb();
  db.exec('BEGIN IMMEDIATE');
  try {
    fields.forEach((field, index) => {
      const existing = queryOne('SELECT id FROM data_table_fields WHERE table_id = ? AND field_key = ?', [table.id, field.field_key]);
      if (existing) {
        execute(
          `UPDATE data_table_fields SET field_name = ?, field_type = ?, is_deleted = 0, sort_order = ?, settings_json = ?, updated_at = ? WHERE id = ?`,
          [field.field_name, field.field_type, index * 10, field.settings_json, now, existing.id]
        );
      } else {
        execute(
          `INSERT INTO data_table_fields (table_id, field_key, field_name, field_type, sort_order, settings_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [table.id, field.field_key, field.field_name, field.field_type, index * 10, field.settings_json, now, now]
        );
      }
    });
    const activeKeys = fields.map((field) => field.field_key);
    if (activeKeys.length) {
      const placeholders = activeKeys.map(() => '?').join(', ');
      execute(`UPDATE data_table_fields SET is_deleted = 1, updated_at = ? WHERE table_id = ? AND field_key NOT IN (${placeholders})`, [now, table.id, ...activeKeys]);
    }
    execute('UPDATE data_tables SET updated_at = ? WHERE id = ?', [now, table.id]);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return readTable(table.id, context);
}

export function listDataTableRecords(columnId, { page = 1, limit = 100, keyword = '' } = {}) {
  ensureDataTablesSchema();
  const table = getDataTableByColumn(columnId);
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(500, Math.max(1, Number(limit) || 100));
  const rows = queryAll('SELECT id, source_record_id, data_json, created_at, updated_at FROM data_table_records WHERE table_id = ? ORDER BY updated_at DESC, id DESC', [table.id])
    .map((row) => mapRecord(row, table.fields))
    .filter((row) => isDataTableRecordValid(row.fields));
  const normalizedKeyword = String(keyword || '').trim().toLowerCase();
  const filtered = normalizedKeyword
    ? rows.filter((row) => JSON.stringify(row.fields).toLowerCase().includes(normalizedKeyword))
    : rows;
  const start = (safePage - 1) * safeLimit;
  return {
    table,
    items: filtered.slice(start, start + safeLimit),
    pagination: { page: safePage, limit: safeLimit, total: filtered.length }
  };
}

export function createDataTableRecord(columnId, fields = {}) {
  ensureDataTablesSchema();
  const table = getDataTableByColumn(columnId);
  const data = normalizeRecordFields(table, fields);
  assertDataTableRecordValid(data);
  const now = new Date().toISOString();
  const result = execute('INSERT INTO data_table_records (table_id, data_json, created_at, updated_at) VALUES (?, ?, ?, ?)', [table.id, JSON.stringify(data), now, now]);
  return getDataTableRecord(table.id, result.lastInsertRowid);
}

export function updateDataTableRecord(columnId, recordId, fields = {}) {
  ensureDataTablesSchema();
  const table = getDataTableByColumn(columnId);
  const current = queryOne('SELECT id, data_json FROM data_table_records WHERE id = ? AND table_id = ?', [recordId, table.id]);
  if (!current) return null;
  const allowedKeys = new Set(table.fields.map((field) => field.field_key));
  const currentFields = Object.fromEntries(
    Object.entries(parseJson(current.data_json)).filter(([key]) => allowedKeys.has(key))
  );
  const patch = normalizeRecordFields(table, fields);
  const merged = { ...currentFields, ...patch };
  const data = normalizeRecordFields(table, merged);
  assertDataTableRecordValid(data);
  execute('UPDATE data_table_records SET data_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [JSON.stringify(data), current.id]);
  return getDataTableRecord(table.id, current.id);
}

export function deleteDataTableRecord(columnId, recordId) {
  ensureDataTablesSchema();
  const table = getDataTableByColumn(columnId);
  const result = execute('DELETE FROM data_table_records WHERE id = ? AND table_id = ?', [recordId, table.id]);
  return Number(result.changes || 0) > 0;
}

export function deleteDataTableByColumn(columnId) {
  ensureDataTablesSchema();
  const table = queryOne('SELECT id FROM data_tables WHERE column_id = ?', [columnId]);
  if (!table) return false;
  const db = getDb();
  db.exec('BEGIN IMMEDIATE');
  try {
    execute('DELETE FROM data_table_records WHERE table_id = ?', [table.id]);
    execute('DELETE FROM data_table_fields WHERE table_id = ?', [table.id]);
    execute('DELETE FROM data_tables WHERE id = ?', [table.id]);
    db.exec('COMMIT');
    return true;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function resolveContext(columnId) {
  const column = getColumnById(columnId, { includeTranslations: false });
  if (!column) throw new Error('栏目不存在');
  const model = column.content_model_id ? getContentModelById(column.content_model_id) : null;
  return { column, model };
}

function ensureTable(context) {
  let table = queryOne('SELECT id, column_id, model_code, name, created_at, updated_at FROM data_tables WHERE column_id = ?', [context.column.id]);
  if (!table) {
    const now = new Date().toISOString();
    execute('INSERT INTO data_tables (column_id, model_code, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [context.column.id, context.model?.code || null, context.column.name || '数据表格', now, now]);
    table = queryOne('SELECT id, column_id, model_code, name, created_at, updated_at FROM data_tables WHERE column_id = ?', [context.column.id]);
  }
  return table;
}

function ensureDefaultFields(tableId, model) {
  const count = queryOne('SELECT COUNT(*) AS count FROM data_table_fields WHERE table_id = ? AND is_deleted = 0', [tableId]);
  if (!model?.fields?.length) return;
  if (Number(count?.count || 0) > 0) {
    model.fields.forEach((field) => {
      execute('UPDATE data_table_fields SET source_field_name = COALESCE(source_field_name, ?) WHERE table_id = ? AND field_key = ?', [field.field_name, tableId, `fld_${field.field_name}`]);
    });
    return;
  }
  const fields = model.fields.filter((field) => (
    !IMMUTABLE_FIELD_NAMES.has(field.field_name)
    && !HIDDEN_DEFAULT_FIELD_NAMES.has(field.field_name)
    && !HIDDEN_DEFAULT_FIELD_TYPES.has(field.field_type)
  )).sort((left, right) => (
    Number(right.field_name === 'name') - Number(left.field_name === 'name')
    || Number(left.sort_order || 0) - Number(right.sort_order || 0)
  ));
  fields.forEach((field, index) => {
    execute(
      `INSERT OR IGNORE INTO data_table_fields (table_id, field_key, field_name, field_type, sort_order, settings_json, source_field_name) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [tableId, createOpaqueFieldKey(), field.field_label || field.field_name, normalizeType(field.field_type), index * 10, field.settings_json || null, field.field_name]
    );
  });
}

function migrateDataTableFieldKeys(tableId) {
  const fields = queryAll(
    'SELECT id, field_key FROM data_table_fields WHERE table_id = ? ORDER BY id ASC',
    [tableId]
  );
  const keyMap = new Map(
    fields
      .filter((field) => !OPAQUE_FIELD_KEY_PATTERN.test(String(field.field_key || '')))
      .map((field) => [String(field.field_key), createOpaqueFieldKey()])
  );
  if (keyMap.size === 0) return;

  const db = getDb();
  db.exec('BEGIN IMMEDIATE');
  try {
    const records = queryAll('SELECT id, data_json FROM data_table_records WHERE table_id = ?', [tableId]);
    records.forEach((record) => {
      const currentData = parseJson(record.data_json);
      const nextData = remapDataTableRecordFields(currentData, keyMap);
      if (nextData !== currentData) {
        execute('UPDATE data_table_records SET data_json = ? WHERE id = ?', [JSON.stringify(nextData), record.id]);
      }
    });
    fields.forEach((field) => {
      const nextKey = keyMap.get(String(field.field_key));
      if (nextKey) {
        execute('UPDATE data_table_fields SET field_key = ? WHERE id = ?', [nextKey, field.id]);
      }
    });
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function remapDataTableRecordFields(fields, keyMap) {
  const entries = Object.entries(fields || {});
  if (!entries.some(([key]) => keyMap.has(key))) return fields;
  return Object.fromEntries(entries.map(([key, value]) => [keyMap.get(key) || key, value]));
}

function migrateLegacyRecords(table, context) {
  if (!context.model?.source_table) return;
  ensureContentModelStorageSchema();
  const sourceTable = getContentTableName(context.model.code);
  if (!/^[a-zA-Z0-9_]+$/.test(sourceTable)) return;
  const sourceRows = queryAll(`SELECT * FROM "${sourceTable.replaceAll('"', '""')}" WHERE column_id = ?`, [context.column.id]);
  const fields = queryAll('SELECT field_key, source_field_name FROM data_table_fields WHERE table_id = ? AND is_deleted = 0', [table.id]);
  const now = new Date().toISOString();
  sourceRows.forEach((row) => {
    const data = Object.fromEntries(fields.map((field) => [field.field_key, field.source_field_name ? row[field.source_field_name] ?? '' : '']));
    if (!isDataTableRecordValid(data)) return;
    const existing = queryOne('SELECT id, data_json FROM data_table_records WHERE table_id = ? AND source_record_id = ?', [table.id, row.id]);
    if (!existing) {
      execute('INSERT INTO data_table_records (table_id, source_record_id, data_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [table.id, row.id, JSON.stringify(data), now, now]);
    } else if (Object.values(parseJson(existing.data_json)).every((value) => value === '' || value === null)) {
      execute('UPDATE data_table_records SET data_json = ?, updated_at = ? WHERE id = ?', [JSON.stringify(data), now, existing.id]);
    }
  });
}

function readTable(tableId, context) {
  const table = queryOne('SELECT id, column_id, model_code, name, created_at, updated_at FROM data_tables WHERE id = ?', [tableId]);
  const fields = queryAll('SELECT id, field_key, field_name, field_type, is_deleted, sort_order, settings_json, source_field_name, created_at, updated_at FROM data_table_fields WHERE table_id = ? AND is_deleted = 0 ORDER BY sort_order ASC, id ASC', [tableId]);
  return { ...table, column_name: context.column.name, fields: fields.map((field) => ({ ...field, settings: parseJson(field.settings_json) })) };
}

function getDataTableRecord(tableId, recordId) {
  const fields = queryAll('SELECT field_key FROM data_table_fields WHERE table_id = ? AND is_deleted = 0 ORDER BY sort_order ASC, id ASC', [tableId]);
  const row = queryOne('SELECT id, table_id, source_record_id, data_json, created_at, updated_at FROM data_table_records WHERE table_id = ? AND id = ?', [tableId, recordId]);
  return row ? mapRecord(row, fields) : null;
}

function mapRecord(row, fields = []) {
  const activeKeys = new Set(fields.map((field) => field.field_key));
  const data = parseJson(row.data_json);
  const activeData = Object.fromEntries(Object.entries(data).filter(([key]) => activeKeys.has(key)));
  return { id: Number(row.id), source_record_id: row.source_record_id ? Number(row.source_record_id) : null, fields: activeData, created_at: row.created_at, updated_at: row.updated_at };
}

function normalizeFields(input, tableId) {
  if (!Array.isArray(input) || input.length === 0) throw new Error('至少需要一个字段');
  const seen = new Set();
  return input.map((field) => {
    const requestedKey = String(field?.field_key || '').trim();
    const existing = requestedKey
      ? queryOne('SELECT field_key FROM data_table_fields WHERE table_id = ? AND field_key = ?', [tableId, requestedKey])
      : null;
    const fieldKey = existing?.field_key || createOpaqueFieldKey();
    const fieldName = String(field?.field_name || '').trim();
    if (!fieldName) throw new Error('字段名称不能为空');
    if (seen.has(fieldKey)) throw new Error(`字段重复：${fieldKey}`);
    seen.add(fieldKey);
    const type = normalizeType(field?.field_type);
    return { table_id: tableId, field_key: fieldKey, field_name: fieldName.slice(0, 100), field_type: type, settings_json: normalizeSettings(field?.settings_json ?? field?.settings) };
  });
}

function createOpaqueFieldKey() {
  return `fld_${randomUUID().replaceAll('-', '')}`;
}

function normalizeRecordFields(table, fields) {
  const allowed = new Map(table.fields.map((field) => [field.field_key, field]));
  const data = {};
  Object.entries(fields || {}).forEach(([key, value]) => {
    const definition = allowed.get(key);
    if (!definition) throw new Error(`字段不存在：${key}`);
    data[key] = normalizeValue(definition, value);
  });
  return data;
}

export function isDataTableRecordValid(fields = {}) {
  return Object.values(fields || {}).some((value) => hasMeaningfulValue(value));
}

function assertDataTableRecordValid(fields) {
  if (!isDataTableRecordValid(fields)) {
    throw new Error('一行至少需要填写一个字段');
  }
}

function hasMeaningfulValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.some((item) => hasMeaningfulValue(item));
  return true;
}

function normalizeValue(field, value) {
  if (value === null || value === undefined) return '';
  if (field.field_type === 'number' || field.field_type === 'currency') {
    if (typeof value === 'string' && value.trim() === '') return '';
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error(`字段“${field.field_name}”必须是数字`);
    return number;
  }
  if (field.field_type === 'boolean') {
    if (typeof value === 'string' && value.trim() === '') return '';
    return value === true || value === 1 || value === '1' || value === 'true';
  }
  if (field.field_type === 'multi_select') return Array.isArray(value) ? value.filter((item) => hasMeaningfulValue(item)) : [];
  return String(value);
}

function normalizeType(type) {
  const normalized = String(type || 'text').trim().toLowerCase();
  return FIELD_TYPES.has(normalized) ? normalized : 'text';
}

function normalizeSettings(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    try { return JSON.stringify(JSON.parse(value)); } catch { return null; }
  }
  return JSON.stringify(value);
}

function parseJson(value) {
  if (!value) return {};
  try { return JSON.parse(value); } catch { return {}; }
}

function addColumnIfMissing(tableName, columnName, definition) {
  const columns = queryAll(`PRAGMA table_info(${tableName})`);
  if (!columns.some((column) => column.name === columnName)) {
    getDb().exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

function dropColumnIfPresent(tableName, columnName) {
  const columns = queryAll(`PRAGMA table_info(${tableName})`);
  if (columns.some((column) => column.name === columnName)) {
    getDb().exec(`ALTER TABLE ${tableName} DROP COLUMN ${columnName}`);
  }
}
