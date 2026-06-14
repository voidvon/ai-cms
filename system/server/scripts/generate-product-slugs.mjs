#!/usr/bin/env node
/**
 * 自动生成产品 slug
 *
 * 根据产品 code 或 name 自动生成语义化的 slug
 * 用法：node system/server/scripts/generate-product-slugs.mjs
 */

import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '../../..');
const DB_PATH = process.env.DATABASE_PATH || resolve(PROJECT_ROOT, 'data/site.sqlite');

console.log('🔧 开始生成产品 slug');
console.log(`📁 数据库路径: ${DB_PATH}`);

const db = new Database(DB_PATH);

/**
 * 将字符串转换为 URL 友好的 slug
 */
function generateSlug(text) {
  if (!text) return null;

  return text
    .toLowerCase()
    .trim()
    // 移除特殊字符
    .replace(/[^\w\s一-龥-]/g, '')
    // 空格和多个连字符转为单个连字符
    .replace(/[\s_]+/g, '-')
    // 移除开头和结尾的连字符
    .replace(/^-+|-+$/g, '')
    // 限制长度
    .substring(0, 100);
}

try {
  // 获取所有产品
  const products = db.prepare(`
    SELECT id, name, code, slug
    FROM products
    ORDER BY id
  `).all();

  console.log(`📊 找到 ${products.length} 个产品`);

  const updateStmt = db.prepare('UPDATE products SET slug = ? WHERE id = ?');

  let updated = 0;
  let skipped = 0;
  const slugMap = new Map();

  db.transaction(() => {
    for (const product of products) {
      // 如果已有 slug，跳过
      if (product.slug) {
        skipped++;
        slugMap.set(product.slug, product.id);
        continue;
      }

      // 优先使用 code，其次使用 name
      let baseSlug = generateSlug(product.code || product.name);

      if (!baseSlug) {
        console.warn(`⚠️  产品 ${product.id} 无法生成 slug，跳过`);
        skipped++;
        continue;
      }

      // 处理重复 slug
      let slug = baseSlug;
      let counter = 1;
      while (slugMap.has(slug)) {
        slug = `${baseSlug}-${counter}`;
        counter++;
      }

      // 更新数据库
      updateStmt.run(slug, product.id);
      slugMap.set(slug, product.id);
      updated++;

      console.log(`✓ 产品 ${product.id}: ${product.name} -> ${slug}`);
    }
  })();

  console.log('');
  console.log('📊 统计：');
  console.log(`  - 已更新: ${updated}`);
  console.log(`  - 已跳过: ${skipped}`);
  console.log('');
  console.log('✅ slug 生成完成！');

} catch (error) {
  console.error('❌ 生成失败:', error.message);
  process.exit(1);
} finally {
  db.close();
}
