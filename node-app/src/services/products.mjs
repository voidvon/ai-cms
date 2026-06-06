import { execute, queryAll, queryOne } from '../db.mjs';
import { deleteUploadedFile } from './uploads.mjs';
import { looksLikeLegacyMojibake } from '../utils/legacy-text.mjs';

const LEGACY_MARKETING_PATTERNS = [
  /以上内容由彪维公司[（(](?:www\.)?(?:bilwe|bilvie)\.com[）)]编写，?转载请注明文章出处。?/gi,
  /[-,，\s]*上海彪维供应[-,，\s]*中国驰名商标/gi,
  /[-,，\s]*上海彪维疏水阀/gi,
  /[,，]?\s*上海彪维专业制造/gi,
  /彪维传热介绍[，,]*/gi,
  /[,，]?\s*彪维公司始终站在蒸汽利用的历史前沿[\s\S]*$/gi
];
const LEGACY_PRODUCT_BRAND_PATTERNS = [
  /(?:美国|进口)?彪维(?=[\u4E00-\u9FFFA-Za-z0-9])/gi,
  /[-,，\s]*中国驰名商标/gi
];

export function listProducts({ featured = false, visibleOnly = true, limit = 20 } = {}) {
  const safeLimit = clampLimit(limit);
  const whereParts = [];
  const params = [];

  if (visibleOnly) {
    whereParts.push('is_visible = 1');
  }
  if (featured) {
    whereParts.push('is_featured_home = 1');
  }

  const where = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';
  return queryAll(
    `
      SELECT
        id,
        category_id,
        name,
        code,
        summary,
        content_html,
        small_image,
        large_image,
        keywords,
        is_featured_home,
        is_visible,
        sort_order
      FROM products
      ${where}
      ORDER BY sort_order ASC, id DESC
      LIMIT ?
    `,
    [...params, safeLimit]
  ).map(normalizeProductRecord);
}

export function listProductsAdmin({ page = 1, limit = 50 } = {}) {
  const safeLimit = Math.min(Math.max(Number.parseInt(String(limit), 10) || 50, 1), 200);
  const safePage = Math.max(Number.parseInt(String(page), 10) || 1, 1);
  const offset = (safePage - 1) * safeLimit;

  const items = queryAll(
    `
      SELECT
        p.id,
        p.category_id,
        p.name,
        p.code,
        p.summary,
        p.content_html,
        p.small_image,
        p.large_image,
        p.keywords,
        p.is_featured_home,
        p.is_visible,
        p.sort_order,
        c.name AS category_name
      FROM products p
      LEFT JOIN product_categories c ON c.id = p.category_id
      ORDER BY p.sort_order ASC, p.id DESC
      LIMIT ?
      OFFSET ?
    `,
    [safeLimit, offset]
  ).map(normalizeProductRecord);

  const total = queryOne('SELECT COUNT(*) AS count FROM products')?.count || 0;
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

export function getProductById(id) {
  return normalizeProductRecord(queryOne(
    `
      SELECT
        id,
        category_id,
        name,
        code,
        summary,
        content_html,
        small_image,
        large_image,
        keywords,
        is_featured_home,
        is_visible,
        sort_order
      FROM products
      WHERE id = ?
    `,
    [id]
  ));
}

export function searchProducts(rawQuery, limit = 20) {
  const normalizedQuery = String(rawQuery ?? '').trim();
  const safeLimit = clampLimit(limit);

  if (normalizedQuery === '') {
    return listProducts({ visibleOnly: true, limit: safeLimit });
  }

  const likeQuery = `%${normalizedQuery}%`;
  return queryAll(
    `
      SELECT
        id,
        category_id,
        name,
        code,
        summary,
        content_html,
        small_image,
        large_image,
        keywords,
        is_featured_home,
        is_visible,
        sort_order
      FROM products
      WHERE is_visible = 1
        AND (
          name LIKE ?
          OR coalesce(summary, '') LIKE ?
          OR coalesce(keywords, '') LIKE ?
        )
      ORDER BY sort_order ASC, id DESC
      LIMIT ?
    `,
    [likeQuery, likeQuery, likeQuery, safeLimit]
  ).map(normalizeProductRecord);
}

export function searchProductsPaged(rawQuery, { page = 1, limit = 20 } = {}) {
  const normalizedQuery = String(rawQuery ?? '').trim();
  const safeLimit = Math.min(Math.max(Number.parseInt(String(limit), 10) || 20, 1), 200);
  const safePage = Math.max(Number.parseInt(String(page), 10) || 1, 1);
  const offset = (safePage - 1) * safeLimit;

  if (normalizedQuery === '') {
    const items = queryAll(
      `
        SELECT
          id,
          category_id,
          name,
          code,
          summary,
          content_html,
          small_image,
          large_image,
          keywords,
          is_featured_home,
          is_visible,
          sort_order
        FROM products
        WHERE is_visible = 1
        ORDER BY sort_order ASC, id DESC
        LIMIT ?
        OFFSET ?
      `,
      [safeLimit, offset]
    ).map(normalizeProductRecord);

    const total = queryOne('SELECT COUNT(*) AS count FROM products WHERE is_visible = 1')?.count || 0;
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

  const likeQuery = `%${normalizedQuery}%`;
  const items = queryAll(
    `
      SELECT
        id,
        category_id,
        name,
        code,
        summary,
        content_html,
        small_image,
        large_image,
        keywords,
        is_featured_home,
        is_visible,
        sort_order
      FROM products
      WHERE is_visible = 1
        AND (
          name LIKE ?
          OR coalesce(summary, '') LIKE ?
          OR coalesce(keywords, '') LIKE ?
        )
      ORDER BY sort_order ASC, id DESC
      LIMIT ?
      OFFSET ?
    `,
    [likeQuery, likeQuery, likeQuery, safeLimit, offset]
  ).map(normalizeProductRecord);

  const total = queryOne(
    `
      SELECT COUNT(*) AS count
      FROM products
      WHERE is_visible = 1
        AND (
          name LIKE ?
          OR coalesce(summary, '') LIKE ?
          OR coalesce(keywords, '') LIKE ?
        )
    `,
    [likeQuery, likeQuery, likeQuery]
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

export function createProduct(input) {
  const payload = normalizeProductInput(input);
  const result = execute(
    `
      INSERT INTO products (
        category_id,
        name,
        code,
        summary,
        content_html,
        small_image,
        large_image,
        keywords,
        is_featured_home,
        is_visible,
        sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      payload.category_id,
      payload.name,
      payload.code,
      payload.summary,
      payload.content_html,
      payload.small_image,
      payload.large_image,
      payload.keywords,
      payload.is_featured_home,
      payload.is_visible,
      payload.sort_order
    ]
  );

  return getProductById(result.lastInsertRowid);
}

export function getNextProductSortOrder() {
  const maxValue = queryOne('SELECT MAX(sort_order) AS value FROM products')?.value;
  return Number.isInteger(maxValue) ? maxValue + 1 : 1;
}

export function updateProduct(id, input) {
  const existing = getProductById(id);
  if (!existing) {
    return null;
  }

  const payload = normalizeProductInput({ ...existing, ...input });
  execute(
    `
      UPDATE products
      SET
        category_id = ?,
        name = ?,
        code = ?,
        summary = ?,
        content_html = ?,
        small_image = ?,
        large_image = ?,
        keywords = ?,
        is_featured_home = ?,
        is_visible = ?,
        sort_order = ?
      WHERE id = ?
    `,
    [
      payload.category_id,
      payload.name,
      payload.code,
      payload.summary,
      payload.content_html,
      payload.small_image,
      payload.large_image,
      payload.keywords,
      payload.is_featured_home,
      payload.is_visible,
      payload.sort_order,
      id
    ]
  );

  return getProductById(id);
}

export function deleteProduct(id) {
  const existing = getProductById(id);
  if (!existing) {
    return null;
  }

  execute('DELETE FROM products WHERE id = ?', [id]);
  deleteUploadedFile(existing.small_image);
  deleteUploadedFile(existing.large_image);
  return existing;
}

export function normalizeProductInput(input) {
  const name = String(input.name ?? '').trim();
  if (!name) {
    throw new Error('name is required');
  }

  return {
    category_id: toNullableInteger(input.category_id),
    name,
    code: toNullableString(input.code),
    summary: toNullableString(input.summary),
    content_html: toNullableString(input.content_html),
    small_image: toNullableString(input.small_image) || '/skin/dfpic.gif',
    large_image: toNullableString(input.large_image) || '/skin/dfpic.gif',
    keywords: toNullableString(input.keywords),
    is_featured_home: toBooleanInt(input.is_featured_home),
    is_visible: toBooleanInt(input.is_visible, 1),
    sort_order: toInteger(input.sort_order, 0)
  };
}

function clampLimit(limit) {
  return Math.min(Math.max(Number.parseInt(String(limit), 10) || 20, 1), 10000);
}

function normalizeProductRecord(row) {
  if (!row) {
    return row;
  }

  return {
    ...row,
    name: resolveProductName(row),
    code: resolveProductCode(row),
    summary: resolveProductSummary(row),
    keywords: resolveProductKeywords(row)
  };
}

function resolveProductName(row) {
  const normalized = normalizeProductPlainText(row.name, { stripBrand: true });
  if (normalized && !looksLikeLegacyMojibake(normalized)) {
    return normalized;
  }
  return normalized || toNullableString(row.name) || '';
}

function resolveProductSummary(row) {
  const summary = normalizeProductPlainText(row.summary, { stripBrand: true });
  if (summary && !looksLikeLegacyMojibake(summary)) {
    return truncateProductText(summary);
  }

  const keywords = normalizeProductKeywords(row);
  if (keywords) {
    return truncateProductText(keywords.replace(/[|]+/g, '，'));
  }

  const contentSummary = extractProductContentSummary(row.content_html);
  if (contentSummary) {
    return truncateProductText(contentSummary);
  }

  return truncateProductText(resolveProductName(row));
}

function resolveProductCode(row) {
  const normalized = normalizeProductPlainText(row.code, { stripBrand: true });
  if (normalized && !looksLikeLegacyMojibake(normalized)) {
    return normalized;
  }
  return normalized || toNullableString(row.code);
}

function resolveProductKeywords(row) {
  const keywords = normalizeProductKeywords(row);
  if (keywords) {
    return keywords;
  }
  const summary = normalizeProductPlainText(row.summary, { stripBrand: true });
  if (summary && !looksLikeLegacyMojibake(summary)) {
    return truncateProductText(summary);
  }
  return resolveProductName(row);
}

function normalizeProductKeywords(row) {
  const value = String(row?.keywords || '');
  if (!value.trim() || looksLikeLegacyMojibake(value)) {
    return null;
  }

  const parts = value
    .split(/[|,，]+/)
    .map((item) => normalizeProductPlainText(item, { stripBrand: true }))
    .filter(Boolean);

  return parts.length > 0 ? Array.from(new Set(parts)).join('|') : null;
}

function extractProductContentSummary(value) {
  const normalized = normalizeProductPlainText(
    String(value || '')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/p>/gi, ' ')
      .replace(/<\/div>/gi, ' ')
      .replace(/<\/li>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
    { stripBrand: true }
  );
  return normalized && !looksLikeLegacyMojibake(normalized) ? normalized : null;
}

function normalizeProductPlainText(value, { stripBrand = false } = {}) {
  let output = String(value || '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();

  for (const pattern of LEGACY_MARKETING_PATTERNS) {
    output = output.replace(pattern, ' ');
  }
  if (stripBrand) {
    for (const pattern of LEGACY_PRODUCT_BRAND_PATTERNS) {
      output = output.replace(pattern, ' ');
    }
  }

  return output
    .replace(/[|,，、/]\s*[-]+/g, ' ')
    .replace(/^\s*[●•\-|,，、/]+\s*/g, '')
    .replace(/\s*[●•\-|,，、/]+\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateProductText(value, maxLength = 220) {
  if (!value) {
    return null;
  }
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
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

function toNullableInteger(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return null;
  }
  const parsed = Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function toBooleanInt(value, fallback = 0) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return 1;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return 0;
  }
  return fallback;
}
