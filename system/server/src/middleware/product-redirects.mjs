/**
 * 产品 URL 重定向中间件
 * 将旧的 /product/{id}.html 重定向到新的 /products/{category-slug}/{product-slug}/
 */

import { queryOne } from '../db.mjs';

export async function redirectLegacyProductUrls(request, reply) {
  const pathname = request.url.split('?')[0];

  // 匹配 /product/{id}.html
  const match = pathname.match(/^\/product\/(\d+)\.html$/);
  if (!match) {
    return;
  }

  const productId = parseInt(match[1], 10);

  // 从数据库查询产品的 slug 和分类 slug
  const product = queryOne(
    `
      SELECT p.id, p.slug, p.column_id, c.slug AS category_slug
      FROM products p
      LEFT JOIN columns c ON c.id = p.column_id
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
    let newUrl;
    if (product.category_slug) {
      newUrl = `/products/${product.category_slug}/${product.slug}/`;
    } else {
      newUrl = `/products/${product.slug}/`;
    }
    reply.redirect(newUrl, 301);
    return;
  }

  // 没有 slug，继续处理（可能返回 404）
}
