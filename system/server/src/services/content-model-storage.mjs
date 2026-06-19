import { execute, getDb, queryAll } from '../db.mjs';
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
    'legacy_extra': 'TEXT',

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

  migrateLegacySlugUrlsToCustomUrl(tableName);
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
  const { mainTableFields, translationTableFields } = getModelFields(modelCode);

  // 主表字段
  mainTableFields.forEach(fieldName => {
    const def = getFieldDefinition(fieldName);
    if (def) {
      addColumnIfMissing(tableName, fieldName, def);
    }
  });

  // 翻译表字段
  translationTableFields.forEach(fieldName => {
    const def = getFieldDefinition(fieldName);
    if (def) {
      addColumnIfMissing(translationTableName, fieldName, def);
    }
  });

  if (mainTableFields.includes('legacy_extra')) {
    migrateLegacyExtraKeysToCustomUrl(tableName);
  }
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

function rebuildContentTableIfNeeded(tableName) {
  const createSql = getCreateTableSql(tableName);
  const hasSlugColumn = hasColumn(tableName, 'slug');

  if (!tableNeedsForeignKeylessRebuild(tableName, createSql, ['columns_legacy_rebuild']) && !hasSlugColumn) {
    return;
  }

  const tempTableName = createTempTableName(tableName);
  getDb().exec(`
    ALTER TABLE ${quoteIdentifier(tableName)} RENAME TO ${quoteIdentifier(tempTableName)};

    ${buildContentTableSql(tableName)}

    INSERT INTO ${quoteIdentifier(tableName)} (
      id,
      column_id,
      custom_url,
      code,
      images,
      primary_image,
      is_visible,
      is_featured_home,
      sort_order,
      publish_status,
      published_at,
      legacy_extra,
      created_at,
      updated_at
    )
    SELECT
      id,
      column_id,
      custom_url,
      code,
      images,
      primary_image,
      is_visible,
      is_featured_home,
      sort_order,
      publish_status,
      published_at,
      legacy_extra,
      created_at,
      updated_at
    FROM ${quoteIdentifier(tempTableName)};

    DROP TABLE ${quoteIdentifier(tempTableName)};

    CREATE INDEX IF NOT EXISTS ${quoteIdentifier(`idx_${tableName}_column_sort`)}
    ON ${quoteIdentifier(tableName)}(column_id, sort_order, id);

    CREATE INDEX IF NOT EXISTS ${quoteIdentifier(`idx_${tableName}_visible`)}
    ON ${quoteIdentifier(tableName)}(is_visible, is_featured_home, sort_order, id);
  `);
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

  // 定义新表应该有的列（不包含 published_at 如果是产品模型）
  const includePublishedAt = modelCode !== 'product';
  const newTableColumns = [
    'id',
    'entry_id',
    'language_id',
    'name',
    'summary',
    'content_html',
    'seo_title',
    'seo_description',
    'publish_status',
    ...(includePublishedAt ? ['published_at'] : []),
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

function migrateLegacySlugUrlsToCustomUrl(tableName) {
  if (!hasColumn(tableName, 'slug')) {
    return;
  }

  const rows = queryAll(
    `
      SELECT
        entry.id,
        entry.column_id,
        entry.slug,
        entry.custom_url,
        column.route_path,
        column.detail_rule
      FROM ${quoteIdentifier(tableName)} entry
      LEFT JOIN columns column ON column.id = entry.column_id
      WHERE trim(coalesce(entry.slug, '')) <> ''
        AND trim(coalesce(entry.custom_url, '')) = ''
    `
  );

  for (const row of rows) {
    const migrated = buildLegacyCustomUrlFromSlug(row);
    if (!migrated) {
      continue;
    }
    execute(
      `UPDATE ${quoteIdentifier(tableName)} SET custom_url = ? WHERE id = ?`,
      [migrated, Number(row.id || 0)]
    );
  }
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
      seo_title TEXT,
      seo_description TEXT,
      publish_status TEXT NOT NULL DEFAULT 'published',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(entry_id, language_id)
    );
  `;
}

function migrateLegacyExtraKeysToCustomUrl(tableName) {
  if (!hasColumn(tableName, 'custom_url') || !hasColumn(tableName, 'legacy_extra')) {
    return;
  }

  const rows = queryAll(
    `
      SELECT id, legacy_extra, custom_url
      FROM ${quoteIdentifier(tableName)}
      WHERE trim(coalesce(legacy_extra, '')) <> ''
        AND trim(coalesce(custom_url, '')) = ''
    `
  );

  for (const row of rows) {
    const migrated = buildCustomUrlFromLegacyExtraKey(row?.legacy_extra);
    if (!migrated) {
      continue;
    }
    execute(
      `UPDATE ${quoteIdentifier(tableName)} SET custom_url = ? WHERE id = ?`,
      [migrated, Number(row.id || 0)]
    );
  }
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

  return legacyReferenceNames.some((name) => (
    createSql.includes(`"${name}"`) || createSql.includes(name)
  ));
}

function createTempTableName(tableName) {
  return `${tableName}__fkless_rebuild`;
}

function hasColumn(tableName, columnName) {
  return queryAll(`PRAGMA table_info(${quoteIdentifier(tableName)})`)
    .some((column) => String(column.name || '') === columnName);
}

function buildLegacyCustomUrlFromSlug(row) {
  const slug = String(row?.slug || '').trim();
  if (!slug) {
    return null;
  }

  const routePath = normalizeRoutePath(row?.route_path);
  const detailRule = String(row?.detail_rule || '').trim();

  if (detailRule === '{slug}.html') {
    return `${routePath}${slug}.html`;
  }
  if (detailRule === '{slug}/index.html' || !detailRule) {
    return `${routePath}${slug}/index.html`;
  }
  return null;
}

function buildCustomUrlFromLegacyExtraKey(value) {
  const legacyExtra = parseJsonObject(value);
  const rawKey = String(legacyExtra?.key || '').trim();
  if (!rawKey) {
    return null;
  }

  const normalizedKey = rawKey.includes(':') ? rawKey.slice(rawKey.indexOf(':') + 1) : rawKey;
  const lastSegment = normalizedKey.split('/').map((segment) => segment.trim()).filter(Boolean).pop();
  if (!lastSegment) {
    return null;
  }

  return `${lastSegment}/index.html`;
}

function parseJsonObject(value) {
  if (!value || typeof value !== 'string') {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeRoutePath(value) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return '';
  }
  return `${normalized.replace(/^\/+|\/+$/g, '')}/`;
}

function isSafeIdentifier(value) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(String(value || ''));
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}
