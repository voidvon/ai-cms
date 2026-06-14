#!/usr/bin/env node
/**
 * 数据库迁移：为产品添加 slug 字段以支持自定义URL
 *
 * 用法：node system/server/scripts/add-product-slug.mjs
 */

import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '../../..');
const DB_PATH = process.env.DATABASE_PATH || resolve(PROJECT_ROOT, 'data/site.sqlite');

console.log('🔧 开始数据库迁移：添加产品 slug 字段');
console.log(`📁 数据库路径: ${DB_PATH}`);

const db = new Database(DB_PATH);

try {
  // 检查 slug 字段是否已存在
  const columns = db.pragma('table_info(products)');
  const hasSlug = columns.some(col => col.name === 'slug');

  if (hasSlug) {
    console.log('✓ slug 字段已存在，跳过迁移');
    process.exit(0);
  }

  // 添加 slug 字段
  console.log('📝 添加 slug 字段...');
  db.exec(`
    ALTER TABLE products ADD COLUMN slug TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_products_slug ON products(slug) WHERE slug IS NOT NULL;
  `);

  console.log('✓ slug 字段添加成功');

  // 显示统计
  const total = db.prepare('SELECT COUNT(*) as count FROM products').get().count;
  const withSlug = db.prepare('SELECT COUNT(*) as count FROM products WHERE slug IS NOT NULL').get().count;

  console.log(`📊 产品总数: ${total}`);
  console.log(`📊 有 slug 的产品: ${withSlug}`);
  console.log(`📊 需要设置 slug 的产品: ${total - withSlug}`);

  console.log('');
  console.log('✅ 迁移完成！');
  console.log('');
  console.log('下一步：');
  console.log('1. 在管理后台为产品设置自定义 slug');
  console.log('2. 或运行 generate-product-slugs.mjs 自动生成 slug');

} catch (error) {
  console.error('❌ 迁移失败:', error.message);
  process.exit(1);
} finally {
  db.close();
}
