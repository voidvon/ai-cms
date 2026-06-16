/**
 * 产品 URL 重定向中间件
 * 将旧的 /product/{id}.html 重定向到新的内容详情地址
 */

import { queryAll, queryOne } from '../db.mjs';
import {
  buildCategorySlugPathFromColumnIdMap,
  buildProductDetailPublicUrl
} from '../services/column-paths.mjs';

export async function redirectLegacyProductUrls(request, reply) {
  const pathname = request.url.split('?')[0];

  // 匹配 /product/{id}.html
  const match = pathname.match(/^\/product\/(\d+)\.html$/);
  if (!match) {
    return;
  }

  const productId = parseInt(match[1], 10);

  // 从新内容表查询产品自定义路径和所属栏目
  const product = queryOne(
    `
      SELECT
        p.id,
        p.custom_url,
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

  const categorySlugPath = buildCategorySlugPath(product.column_id);
  const newUrl = buildProductDetailPublicUrl(product, categorySlugPath);
  reply.redirect(newUrl, 301);
}

function buildCategorySlugPath(columnId) {
  const safeColumnId = Number.parseInt(String(columnId || ''), 10);
  if (!Number.isFinite(safeColumnId) || safeColumnId <= 0) {
    return '';
  }

  const rows = queryAll(
    `
      WITH RECURSIVE column_chain AS (
        SELECT id, parent_id, dir_name
        FROM columns
        WHERE id = ?
        UNION ALL
        SELECT c.id, c.parent_id, c.dir_name
        FROM columns c
        INNER JOIN column_chain chain ON c.id = chain.parent_id
      )
      SELECT id, parent_id, dir_name
      FROM column_chain
    `,
    [safeColumnId]
  );

  if (!rows.length) {
    return '';
  }

  const rowById = new Map(rows.map((row) => [Number(row.id), row]));
  return buildCategorySlugPathFromColumnIdMap(safeColumnId, rowById).join('/');
}
