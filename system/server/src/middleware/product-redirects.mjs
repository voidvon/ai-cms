/**
 * 产品 URL 重定向中间件
 * 将旧的 /product/{id}.html 重定向到新的 /products/{category-slug}/{product-slug}/
 */

import { queryAll, queryOne } from '../db.mjs';

export async function redirectLegacyProductUrls(request, reply) {
  const pathname = request.url.split('?')[0];

  // 匹配 /product/{id}.html
  const match = pathname.match(/^\/product\/(\d+)\.html$/);
  if (!match) {
    return;
  }

  const productId = parseInt(match[1], 10);

  // 从新内容表查询产品的 slug 和所属分类
  const product = queryOne(
    `
      SELECT
        p.id,
        p.slug,
        p.column_id
      FROM content_product p
      WHERE p.id = ?
    `,
    [productId]
  );

  if (!product) {
    // 产品不存在，让它继续到 404
    return;
  }

  // 如果有 slug，重定向到新 URL
  if (product.slug) {
    const categorySlugPath = buildCategorySlugPath(product.column_id);
    const newUrl = categorySlugPath
      ? `/products/${categorySlugPath}/${product.slug}/`
      : `/products/${product.slug}/`;
    reply.redirect(newUrl, 301);
    return;
  }

  // 没有 slug，继续处理（可能返回 404）
}

function buildCategorySlugPath(columnId) {
  const safeColumnId = Number.parseInt(String(columnId || ''), 10);
  if (!Number.isFinite(safeColumnId) || safeColumnId <= 0) {
    return '';
  }

  const rows = queryAll(
    `
      WITH RECURSIVE column_chain AS (
        SELECT id, parent_id, slug
        FROM columns
        WHERE id = ?
        UNION ALL
        SELECT c.id, c.parent_id, c.slug
        FROM columns c
        INNER JOIN column_chain chain ON c.id = chain.parent_id
      )
      SELECT id, parent_id, slug
      FROM column_chain
    `,
    [safeColumnId]
  );

  if (!rows.length) {
    return '';
  }

  const rowById = new Map(rows.map((row) => [Number(row.id), row]));
  const segments = [];
  const visited = new Set();
  let currentId = safeColumnId;

  while (currentId > 0 && !visited.has(currentId)) {
    visited.add(currentId);
    const current = rowById.get(currentId);
    if (!current) {
      break;
    }
    const slug = String(current.slug || '').trim();
    if (slug) {
      segments.unshift(slug);
    }
    currentId = Number.parseInt(String(current.parent_id || ''), 10) || 0;
  }

  return segments.join('/');
}
