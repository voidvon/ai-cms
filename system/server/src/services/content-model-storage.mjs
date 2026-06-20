import { execute, getDb, queryAll, queryOne } from '../db.mjs';
import { ensureContentModelsSchema, getContentModelByCode } from './content-models.mjs';
import { ensureLanguagesSchema } from './languages.mjs';

let schemaEnsured = false;

/**
 * 获取模型的字段配置
 */
function getModelFields(modelCode) {
  const fields = queryAll(
    `SELECT field_name, is_translatable, field_type
     FROM content_model_fields
     WHERE model_code = ?
     ORDER BY sort_order`,
    [modelCode]
  );

  return {
    mainTableFields: fields.filter(f => f.is_translatable === 0).map(f => f.field_name),
    translationTableFields: fields.filter(f => f.is_translatable === 1).map(f => f.field_name)
  };
}

/**
 * 获取字段的 SQL 定义
 */
function getFieldDefinition(fieldName) {
  const fieldDefinitions = {
    // 主表字段
    'custom_url': 'TEXT',
    'code': 'TEXT',
    'images': `TEXT NOT NULL DEFAULT '[]'`,
    'primary_image': 'TEXT',
    'is_visible': 'INTEGER NOT NULL DEFAULT 1',
    'is_featured_home': 'INTEGER NOT NULL DEFAULT 0',
    'sort_order': 'INTEGER NOT NULL DEFAULT 0',

    // 翻译表字段
    'name': `TEXT NOT NULL DEFAULT ''`,
    'summary': `TEXT NOT NULL DEFAULT ''`,
    'content_html': `TEXT NOT NULL DEFAULT ''`,
    'seo_title': 'TEXT',
    'seo_description': 'TEXT',
    'publish_status': `TEXT NOT NULL DEFAULT 'published'`
  };

  return fieldDefinitions[fieldName];
}

export function ensureContentModelStorageSchema() {
  if (schemaEnsured) {
    return;
  }

  ensureLanguagesSchema();
  ensureContentModelsSchema();

  const modelCodes = queryAll(
    `
      SELECT code
      FROM content_models
      WHERE source_table IS NOT NULL
        AND TRIM(source_table) <> ''
      ORDER BY sort_order ASC, id ASC
    `
  ).map((row) => String(row.code || '').trim()).filter(Boolean);

  modelCodes.forEach((modelCode) => {
    ensureModelTables(modelCode);
  });

  schemaEnsured = true;
}

export function ensureModelTables(modelCode) {
  ensureLanguagesSchema();
  ensureContentModelsSchema();
  const model = getContentModelByCode(modelCode);
  if (!model?.source_table) {
    throw new Error(`内容模型 ${modelCode} 未配置数据表`);
  }

  const tableName = model.source_table;
  const translationTableName = `${tableName}_translations`;

  if (!isSafeIdentifier(tableName) || !isSafeIdentifier(translationTableName)) {
    throw new Error(`内容模型 ${modelCode} 的数据表名不合法`);
  }

  rebuildContentTableIfNeeded(tableName, modelCode);
  rebuildContentTranslationTableIfNeeded(tableName, translationTableName, modelCode);

  getDb().exec(`
    ${buildContentTableSql(tableName, modelCode)}

    CREATE INDEX IF NOT EXISTS ${quoteIdentifier(`idx_${tableName}_column_sort`)}
    ON ${quoteIdentifier(tableName)}(column_id, created_at DESC, id);

    ${buildContentTranslationTableSql(tableName, translationTableName, modelCode)}

    CREATE INDEX IF NOT EXISTS ${quoteIdentifier(`idx_${translationTableName}_entry_language`)}
    ON ${quoteIdentifier(translationTableName)}(entry_id, language_id);
  `);

  // 根据字段配置动态添加列
  applyConfiguredMainTableColumns(tableName, modelCode);
  applyConfiguredTranslationTableColumns(translationTableName, modelCode);

  addColumnIfMissing(translationTableName, 'template_data_json', 'TEXT');
}

export function getTranslationTableName(modelCode) {
  const model = getContentModelByCode(modelCode);
  if (!model?.source_table) {
    throw new Error(`内容模型 ${modelCode} 未配置数据表`);
  }
  return `${model.source_table}_translations`;
}

export function getContentTableName(modelCode) {
  const model = getContentModelByCode(modelCode);
  if (!model?.source_table) {
    throw new Error(`内容模型 ${modelCode} 未配置数据表`);
  }
  return model.source_table;
}

function addColumnIfMissing(tableName, columnName, definition) {
  const columns = queryAll(`PRAGMA table_info(${quoteIdentifier(tableName)})`);
  if (columns.some((column) => String(column.name) === columnName)) {
    return;
  }
  execute(`ALTER TABLE ${quoteIdentifier(tableName)} ADD COLUMN ${columnName} ${definition}`);
}

function rebuildContentTableIfNeeded(tableName, modelCode) {
  const createSql = getCreateTableSql(tableName);
  const hasSlugColumn = hasColumn(tableName, 'slug');
  const hasLegacyExtraColumn = hasColumn(tableName, 'legacy_extra');

  if (!tableNeedsForeignKeylessRebuild(tableName, createSql, ['columns_legacy_rebuild']) && !hasSlugColumn && !hasLegacyExtraColumn) {
    return;
  }

  rebuildContentTable(tableName, modelCode);
}

function rebuildContentTable(tableName, modelCode) {
  const tempTableName = createTempTableName(tableName);
  const oldColumns = queryAll(`PRAGMA table_info(${quoteIdentifier(tableName)})`);
  const oldColumnNames = oldColumns.map((column) => String(column.name || ''));
  const oldCount = queryOne(`SELECT COUNT(*) AS value FROM ${quoteIdentifier(tableName)}`)?.value || 0;

  getDb().exec(`ALTER TABLE ${quoteIdentifier(tableName)} RENAME TO ${quoteIdentifier(tempTableName)};`);
  getDb().exec(buildContentTableSql(tableName, modelCode));
  applyConfiguredMainTableColumns(tableName, modelCode);

  const newColumns = queryAll(`PRAGMA table_info(${quoteIdentifier(tableName)})`);
  const columnsToMigrate = newColumns
    .map((column) => String(column.name || ''))
    .filter((columnName) => oldColumnNames.includes(columnName));

  if (columnsToMigrate.length > 0) {
    const columnList = columnsToMigrate.map((columnName) => quoteIdentifier(columnName)).join(', ');
    getDb().exec(`
      INSERT INTO ${quoteIdentifier(tableName)} (${columnList})
      SELECT ${columnList}
      FROM ${quoteIdentifier(tempTableName)};
    `);
  }

  const newCount = queryOne(`SELECT COUNT(*) AS value FROM ${quoteIdentifier(tableName)}`)?.value || 0;
  if (Number(newCount) !== Number(oldCount)) {
    throw new Error(`内容表 ${tableName} 重建后记录数不一致：旧 ${oldCount}，新 ${newCount}`);
  }

  getDb().exec(`
    DROP TABLE ${quoteIdentifier(tempTableName)};

    CREATE INDEX IF NOT EXISTS ${quoteIdentifier(`idx_${tableName}_column_sort`)}
    ON ${quoteIdentifier(tableName)}(column_id, created_at DESC, id);
  `);

  if (hasColumn(tableName, 'is_visible') && hasColumn(tableName, 'is_featured_home') && hasColumn(tableName, 'sort_order')) {
    getDb().exec(`
      CREATE INDEX IF NOT EXISTS ${quoteIdentifier(`idx_${tableName}_visible`)}
      ON ${quoteIdentifier(tableName)}(is_visible, is_featured_home, sort_order, id);
    `);
  }
}

function rebuildContentTranslationTableIfNeeded(tableName, translationTableName, modelCode) {
  const createSql = getCreateTableSql(translationTableName);

  if (!tableNeedsForeignKeylessRebuild(translationTableName, createSql, [tableName, `${tableName}__rebuild`])) {
    return;
  }

  const tempTableName = createTempTableName(translationTableName);

  // 获取旧表的列信息
  const oldColumns = getDb().prepare(`PRAGMA table_info(${quoteIdentifier(translationTableName)})`).all();
  const oldColumnNames = oldColumns.map(col => col.name);

  const newTableColumns = [
    'id',
    'entry_id',
    'language_id',
    'name',
    'summary',
    'content_html',
    'template_data_json',
    'seo_title',
    'seo_description',
    'publish_status',
    'created_at',
    'updated_at'
  ];

  // 计算交集：只复制新旧表都存在的列
  const columnsToMigrate = newTableColumns.filter(col => oldColumnNames.includes(col));

  console.log(`[数据迁移] ${translationTableName}: 从 ${oldColumnNames.length} 列迁移 ${columnsToMigrate.length} 列`);

  // 记录旧表的行数用于验证
  const oldCount = getDb().prepare(`SELECT COUNT(*) as count FROM ${quoteIdentifier(translationTableName)}`).get().count;
  console.log(`[数据迁移] ${translationTableName}: 旧表有 ${oldCount} 条记录`);

  // 使用事务保护整个迁移过程
  const db = getDb();

  try {
    db.exec('BEGIN TRANSACTION;');

    // 1. 重命名旧表
    db.exec(`ALTER TABLE ${quoteIdentifier(translationTableName)} RENAME TO ${quoteIdentifier(tempTableName)};`);

    // 2. 创建新表
    db.exec(buildContentTranslationTableSql(tableName, translationTableName, modelCode));

    // 3. 复制数据（只复制共同的列）
    const columnsList = columnsToMigrate.join(', ');
    db.exec(`
      INSERT INTO ${quoteIdentifier(translationTableName)} (${columnsList})
      SELECT ${columnsList}
      FROM ${quoteIdentifier(tempTableName)};
    `);

    // 4. 验证数据完整性
    const newCount = db.prepare(`SELECT COUNT(*) as count FROM ${quoteIdentifier(translationTableName)}`).get().count;
    if (newCount !== oldCount) {
      throw new Error(`数据迁移失败: ${translationTableName} 旧表 ${oldCount} 条，新表 ${newCount} 条`);
    }

    console.log(`[数据迁移] ${translationTableName}: 成功迁移 ${newCount} 条记录`);

    // 5. 删除临时表
    db.exec(`DROP TABLE ${quoteIdentifier(tempTableName)};`);

    // 6. 创建索引
    db.exec(`
      CREATE INDEX IF NOT EXISTS ${quoteIdentifier(`idx_${translationTableName}_entry_language`)}
      ON ${quoteIdentifier(translationTableName)}(entry_id, language_id);
    `);

    db.exec('COMMIT;');
  } catch (error) {
    db.exec('ROLLBACK;');
    console.error(`[数据迁移失败] ${translationTableName}:`, error.message);
    throw error;
  }
}

function buildContentTableSql(tableName, modelCode) {
  // 只创建基础系统字段，其他字段通过 addColumnIfMissing 动态添加
  return `
    CREATE TABLE IF NOT EXISTS ${quoteIdentifier(tableName)} (
      id INTEGER PRIMARY KEY,
      column_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `;
}

function applyConfiguredMainTableColumns(tableName, modelCode) {
  const { mainTableFields } = getModelFields(modelCode);
  mainTableFields.forEach((fieldName) => {
    const def = getFieldDefinition(fieldName);
    if (def) {
      addColumnIfMissing(tableName, fieldName, def);
    }
  });
}

function applyConfiguredTranslationTableColumns(translationTableName, modelCode) {
  const { translationTableFields } = getModelFields(modelCode);
  translationTableFields.forEach((fieldName) => {
    const def = getFieldDefinition(fieldName);
    if (def) {
      addColumnIfMissing(translationTableName, fieldName, def);
    }
  });
}

function buildContentTranslationTableSql(tableName, translationTableName, modelCode) {
  // 创建完整的字段，确保重建时字段一致
  return `
    CREATE TABLE IF NOT EXISTS ${quoteIdentifier(translationTableName)} (
      id INTEGER PRIMARY KEY,
      entry_id INTEGER NOT NULL,
      language_id INTEGER NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '',
      content_html TEXT NOT NULL DEFAULT '',
      template_data_json TEXT,
      seo_title TEXT,
      seo_description TEXT,
      publish_status TEXT NOT NULL DEFAULT 'published',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(entry_id, language_id)
    );
  `;
}

function getCreateTableSql(tableName) {
  return queryAll(
    `
      SELECT sql
      FROM sqlite_master
      WHERE type = 'table' AND name = ?
    `,
    [tableName]
  )[0]?.sql || '';
}

function tableNeedsForeignKeylessRebuild(tableName, createSql, legacyReferenceNames = []) {
  if (!createSql) {
    return false;
  }

  const foreignKeys = queryAll(`PRAGMA foreign_key_list(${quoteIdentifier(tableName)})`);
  if (foreignKeys.length > 0) {
    return true;
  }

  return legacyReferenceNames.some((name) => createSqlReferencesIdentifier(createSql, name));
}

function createSqlReferencesIdentifier(createSql, identifier) {
  const source = String(createSql || '');
  const safeIdentifier = String(identifier || '').trim();
  if (!source || !safeIdentifier) {
    return false;
  }

  const escaped = safeIdentifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [
    new RegExp(`"${escaped}"`, 'i'),
    new RegExp(`\\b${escaped}\\b`, 'i')
  ].some((pattern) => pattern.test(source));
}

function createTempTableName(tableName) {
  return `${tableName}__fkless_rebuild`;
}

function hasColumn(tableName, columnName) {
  return queryAll(`PRAGMA table_info(${quoteIdentifier(tableName)})`)
    .some((column) => String(column.name || '') === columnName);
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

function isSafeIdentifier(value) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(String(value || ''));
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}
