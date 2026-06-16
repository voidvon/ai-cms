import { execute, getDb, queryAll } from '../db.mjs';
import { ensureContentModelsSchema, getContentModelByCode } from './content-models.mjs';
import { ensureLanguagesSchema } from './languages.mjs';

let schemaEnsured = false;

export function ensureContentModelStorageSchema() {
  if (schemaEnsured) {
    return;
  }

  ensureLanguagesSchema();
  ensureContentModelsSchema();

  ensureModelTables('product');
  ensureModelTables('news');

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

  rebuildContentTableIfNeeded(tableName);
  rebuildContentTranslationTableIfNeeded(tableName, translationTableName);

  getDb().exec(`
    CREATE TABLE IF NOT EXISTS ${quoteIdentifier(tableName)} (
      id INTEGER PRIMARY KEY,
      column_id INTEGER NOT NULL,
      slug TEXT,
      code TEXT,
      images TEXT NOT NULL DEFAULT '[]',
      primary_image TEXT,
      is_visible INTEGER NOT NULL DEFAULT 1,
      is_featured_home INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      publish_status TEXT NOT NULL DEFAULT 'published',
      published_at TEXT,
      legacy_extra TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (column_id) REFERENCES columns(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS ${quoteIdentifier(`idx_${tableName}_column_sort`)}
    ON ${quoteIdentifier(tableName)}(column_id, sort_order, id);

    CREATE INDEX IF NOT EXISTS ${quoteIdentifier(`idx_${tableName}_visible`)}
    ON ${quoteIdentifier(tableName)}(is_visible, is_featured_home, sort_order, id);

    CREATE INDEX IF NOT EXISTS ${quoteIdentifier(`idx_${tableName}_slug`)}
    ON ${quoteIdentifier(tableName)}(slug);

    CREATE TABLE IF NOT EXISTS ${quoteIdentifier(translationTableName)} (
      id INTEGER PRIMARY KEY,
      entry_id INTEGER NOT NULL,
      language_id INTEGER NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '',
      content_html TEXT NOT NULL DEFAULT '',
      keywords TEXT,
      seo_title TEXT,
      seo_keywords TEXT,
      seo_description TEXT,
      publish_status TEXT NOT NULL DEFAULT 'published',
      published_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(entry_id, language_id),
      FOREIGN KEY (entry_id) REFERENCES ${quoteIdentifier(tableName)}(id) ON DELETE CASCADE,
      FOREIGN KEY (language_id) REFERENCES languages(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS ${quoteIdentifier(`idx_${translationTableName}_entry_language`)}
    ON ${quoteIdentifier(translationTableName)}(entry_id, language_id);
  `);

  addColumnIfMissing(tableName, 'code', 'TEXT');
  addColumnIfMissing(tableName, 'slug', 'TEXT');
  addColumnIfMissing(tableName, 'images', `TEXT NOT NULL DEFAULT '[]'`);
  addColumnIfMissing(tableName, 'primary_image', 'TEXT');
  addColumnIfMissing(tableName, 'is_visible', 'INTEGER NOT NULL DEFAULT 1');
  addColumnIfMissing(tableName, 'is_featured_home', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing(tableName, 'sort_order', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing(tableName, 'publish_status', `TEXT NOT NULL DEFAULT 'published'`);
  addColumnIfMissing(tableName, 'published_at', 'TEXT');
  addColumnIfMissing(tableName, 'legacy_extra', 'TEXT');
  addColumnIfMissing(tableName, 'created_at', 'TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP');
  addColumnIfMissing(tableName, 'updated_at', 'TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP');

  addColumnIfMissing(translationTableName, 'summary', `TEXT NOT NULL DEFAULT ''`);
  addColumnIfMissing(translationTableName, 'content_html', `TEXT NOT NULL DEFAULT ''`);
  addColumnIfMissing(translationTableName, 'keywords', 'TEXT');
  addColumnIfMissing(translationTableName, 'seo_title', 'TEXT');
  addColumnIfMissing(translationTableName, 'seo_keywords', 'TEXT');
  addColumnIfMissing(translationTableName, 'seo_description', 'TEXT');
  addColumnIfMissing(translationTableName, 'publish_status', `TEXT NOT NULL DEFAULT 'published'`);
  addColumnIfMissing(translationTableName, 'published_at', 'TEXT');
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
  const createSql = queryAll(
    `
      SELECT sql
      FROM sqlite_master
      WHERE type = 'table' AND name = ?
    `,
    [tableName]
  )[0]?.sql || '';

  if (!createSql.includes('"columns_legacy_rebuild"') && !createSql.includes('columns_legacy_rebuild')) {
    return;
  }

  const tempTableName = `${tableName}__rebuild`;
  getDb().exec(`
    ALTER TABLE ${quoteIdentifier(tableName)} RENAME TO ${quoteIdentifier(tempTableName)};

    CREATE TABLE ${quoteIdentifier(tableName)} (
      id INTEGER PRIMARY KEY,
      column_id INTEGER NOT NULL,
      slug TEXT,
      code TEXT,
      images TEXT NOT NULL DEFAULT '[]',
      primary_image TEXT,
      is_visible INTEGER NOT NULL DEFAULT 1,
      is_featured_home INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      publish_status TEXT NOT NULL DEFAULT 'published',
      published_at TEXT,
      legacy_extra TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (column_id) REFERENCES columns(id) ON DELETE CASCADE
    );

    INSERT INTO ${quoteIdentifier(tableName)} (
      id,
      column_id,
      slug,
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
      slug,
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

    CREATE INDEX IF NOT EXISTS ${quoteIdentifier(`idx_${tableName}_slug`)}
    ON ${quoteIdentifier(tableName)}(slug);
  `);
}

function rebuildContentTranslationTableIfNeeded(tableName, translationTableName) {
  const createSql = queryAll(
    `
      SELECT sql
      FROM sqlite_master
      WHERE type = 'table' AND name = ?
    `,
    [translationTableName]
  )[0]?.sql || '';

  if (!createSql.includes(`"${tableName}__rebuild"`)) {
    return;
  }

  const tempTableName = `${translationTableName}__rebuild`;
  getDb().exec(`
    ALTER TABLE ${quoteIdentifier(translationTableName)} RENAME TO ${quoteIdentifier(tempTableName)};

    CREATE TABLE ${quoteIdentifier(translationTableName)} (
      id INTEGER PRIMARY KEY,
      entry_id INTEGER NOT NULL,
      language_id INTEGER NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '',
      content_html TEXT NOT NULL DEFAULT '',
      keywords TEXT,
      seo_title TEXT,
      seo_keywords TEXT,
      seo_description TEXT,
      publish_status TEXT NOT NULL DEFAULT 'published',
      published_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(entry_id, language_id),
      FOREIGN KEY (entry_id) REFERENCES ${quoteIdentifier(tableName)}(id) ON DELETE CASCADE,
      FOREIGN KEY (language_id) REFERENCES languages(id) ON DELETE CASCADE
    );

    INSERT INTO ${quoteIdentifier(translationTableName)} (
      id,
      entry_id,
      language_id,
      name,
      summary,
      content_html,
      keywords,
      seo_title,
      seo_keywords,
      seo_description,
      publish_status,
      published_at,
      created_at,
      updated_at
    )
    SELECT
      id,
      entry_id,
      language_id,
      name,
      summary,
      content_html,
      keywords,
      seo_title,
      seo_keywords,
      seo_description,
      publish_status,
      published_at,
      created_at,
      updated_at
    FROM ${quoteIdentifier(tempTableName)};

    DROP TABLE ${quoteIdentifier(tempTableName)};

    CREATE INDEX IF NOT EXISTS ${quoteIdentifier(`idx_${translationTableName}_entry_language`)}
    ON ${quoteIdentifier(translationTableName)}(entry_id, language_id);
  `);
}

function isSafeIdentifier(value) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(String(value || ''));
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}
