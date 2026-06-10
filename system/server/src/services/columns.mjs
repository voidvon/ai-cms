import { execute, getDb, queryAll, queryOne } from '../db.mjs';

let schemaEnsured = false;

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

  schemaEnsured = true;
}

export function listColumns() {
  syncBuiltinColumns();
  return queryAll(
    `
      SELECT id, name, parent_id, model_code, source_type, source_id, sort_order, is_system, created_at, updated_at
      FROM columns
      ORDER BY coalesce(parent_id, 0) ASC, sort_order ASC, id ASC
    `
  );
}

export function syncBuiltinColumns() {
  ensureColumnsSchema();
  upsertColumn({
    name: '产品展示',
    parent_id: null,
    model_code: 'product',
    source_type: 'product_root',
    source_id: 0,
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
    sort_order: 200
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
      sort_order: rootSortOffset + Number(category.sort_order || 0)
    });
  }
}

function upsertColumn(input) {
  const now = new Date().toISOString();
  execute(
    `
      INSERT INTO columns (
        name, parent_id, model_code, source_type, source_id, sort_order, is_system, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(source_type, source_id) DO UPDATE SET
        name = excluded.name,
        parent_id = excluded.parent_id,
        model_code = excluded.model_code,
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
      input.sort_order,
      now,
      now
    ]
  );
}

function getColumnBySource(sourceType, sourceId) {
  return queryOne(
    `
      SELECT id, name, parent_id, model_code, source_type, source_id, sort_order
      FROM columns
      WHERE source_type = ? AND source_id = ?
    `,
    [sourceType, sourceId]
  );
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
