import { execute, queryAll, queryOne } from '../db.mjs';

export function listProductCategories() {
  ensureRootCategorySentinel();
  return queryAll(
    `
      SELECT
        id,
        name,
        parent_id,
        sort_order,
        seo_keywords,
        seo_description
      FROM product_categories
      WHERE id <> 0
      ORDER BY parent_id ASC, sort_order ASC, id ASC
    `
  );
}

export function listProductCategoriesAdmin({ parentId = 0, page = 1, limit = 10 } = {}) {
  ensureRootCategorySentinel();
  const safeParentId = Number.parseInt(String(parentId), 10) || 0;
  const safeLimit = Math.min(Math.max(Number.parseInt(String(limit), 10) || 10, 1), 200);
  const safePage = Math.max(Number.parseInt(String(page), 10) || 1, 1);
  const offset = (safePage - 1) * safeLimit;

  const items = queryAll(
    `
      SELECT
        c.id,
        c.name,
        c.parent_id,
        c.sort_order,
        c.seo_keywords,
        c.seo_description,
        p.name AS parent_name,
        (
          SELECT COUNT(*)
          FROM product_categories child
          WHERE child.parent_id = c.id
        ) AS child_count
      FROM product_categories c
      LEFT JOIN product_categories p ON p.id = c.parent_id
      WHERE c.parent_id = ?
        AND c.id <> 0
      ORDER BY c.sort_order ASC, c.id ASC
      LIMIT ?
      OFFSET ?
    `,
    [safeParentId, safeLimit, offset]
  );

  const total = queryOne(
    `
      SELECT COUNT(*) AS count
      FROM product_categories
      WHERE parent_id = ?
        AND id <> 0
    `,
    [safeParentId]
  )?.count || 0;

  return {
    items,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.max(Math.ceil(total / safeLimit), 1)
    }
  };
}

export function listRootProductCategories() {
  ensureRootCategorySentinel();
  return queryAll(
    `
      SELECT
        id,
        name,
        parent_id,
        sort_order,
        seo_keywords,
        seo_description
      FROM product_categories
      WHERE parent_id = 0
        AND id <> 0
      ORDER BY sort_order ASC, id ASC
    `
  );
}

export function listProductCategoryOptions() {
  const categories = listProductCategories();
  const childrenByParent = new Map();

  for (const category of categories) {
    const parentId = Number.parseInt(String(category.parent_id ?? 0), 10) || 0;
    if (!childrenByParent.has(parentId)) {
      childrenByParent.set(parentId, []);
    }
    childrenByParent.get(parentId).push(category);
  }

  const options = [];
  for (const root of childrenByParent.get(0) || []) {
    options.push({ ...root, depth: 0 });
    appendChildren(root.id, 1);
  }

  return options;

  function appendChildren(parentId, depth) {
    for (const child of childrenByParent.get(parentId) || []) {
      options.push({ ...child, depth });
      appendChildren(child.id, depth + 1);
    }
  }
}

export function getProductCategoryById(id) {
  ensureRootCategorySentinel();
  return queryOne(
    `
      SELECT
        id,
        name,
        parent_id,
        sort_order,
        seo_keywords,
        seo_description
      FROM product_categories
      WHERE id = ?
    `,
    [id]
  );
}

export function getNextProductCategorySortOrder(parentId = 0) {
  ensureRootCategorySentinel();
  const safeParentId = Number.parseInt(String(parentId), 10) || 0;
  const maxValue = queryOne(
    `
      SELECT MAX(sort_order) AS value
      FROM product_categories
      WHERE parent_id = ?
    `,
    [safeParentId]
  )?.value;
  return Number.isInteger(maxValue) ? maxValue + 1 : 1;
}

export function createProductCategory(input) {
  ensureRootCategorySentinel();
  const payload = normalizeProductCategoryInput(input);
  const result = execute(
    `
      INSERT INTO product_categories (
        name,
        parent_id,
        sort_order,
        seo_keywords,
        seo_description
      ) VALUES (?, ?, ?, ?, ?)
    `,
    [
      payload.name,
      payload.parent_id,
      payload.sort_order,
      payload.seo_keywords,
      payload.seo_description
    ]
  );

  return getProductCategoryById(result.lastInsertRowid);
}

export function updateProductCategory(id, input) {
  ensureRootCategorySentinel();
  const existing = getProductCategoryById(id);
  if (!existing) {
    return null;
  }

  const payload = normalizeProductCategoryInput({ ...existing, ...input }, { currentId: id });
  execute(
    `
      UPDATE product_categories
      SET
        name = ?,
        parent_id = ?,
        sort_order = ?,
        seo_keywords = ?,
        seo_description = ?
      WHERE id = ?
    `,
    [
      payload.name,
      payload.parent_id,
      payload.sort_order,
      payload.seo_keywords,
      payload.seo_description,
      id
    ]
  );

  return getProductCategoryById(id);
}

export function deleteProductCategory(id) {
  ensureRootCategorySentinel();
  const existing = getProductCategoryById(id);
  if (!existing) {
    return null;
  }
  if (existing.id === 0) {
    return null;
  }

  execute('DELETE FROM product_categories WHERE id = ?', [id]);
  return existing;
}

export function normalizeProductCategoryInput(input, options = {}) {
  const name = String(input.name ?? '').trim();
  if (!name) {
    throw new Error('name is required');
  }

  const parentId = toInteger(input.parent_id, 0);
  if (options.currentId && parentId === Number(options.currentId)) {
    throw new Error('parent_id cannot equal id');
  }

  return {
    name,
    parent_id: parentId,
    sort_order: toInteger(input.sort_order, 0),
    seo_keywords: toNullableString(input.seo_keywords),
    seo_description: toNullableString(input.seo_description)
  };
}

function toNullableString(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const normalized = String(value).trim();
  return normalized === '' ? null : normalized;
}

function toInteger(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function ensureRootCategorySentinel() {
  execute(
    `
      INSERT OR IGNORE INTO product_categories (
        id,
        name,
        parent_id,
        sort_order,
        seo_keywords,
        seo_description
      ) VALUES (0, '__root__', 0, 0, null, null)
    `
  );
}
