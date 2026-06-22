#!/usr/bin/env node
/**
 * 自动生成内容节点 slug
 *
 * 根据内容的 code 或 name 自动生成语义化 slug。
 * 当前用于 columns 表中的 node_type=content 节点。
 * 用法：
 *   node system/server/scripts/generate-content-node-slugs.mjs
 *   node system/server/scripts/generate-content-node-slugs.mjs --model=product
 */

import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '../../..');
const DB_PATH = process.env.DATABASE_PATH || resolve(PROJECT_ROOT, 'data/site.sqlite');
const MODEL_CODE = resolveModelCode(process.argv.slice(2));

console.log('🔧 开始生成内容节点 slug');
console.log(`📁 数据库路径: ${DB_PATH}`);
console.log(`🧩 内容模型: ${MODEL_CODE}`);

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
  const contentItems = db.prepare(`
    SELECT id, name, code, slug
    FROM columns
    WHERE model_code = ?
      AND node_type = 'content'
    ORDER BY id
  `).all(MODEL_CODE);

  console.log(`📊 找到 ${contentItems.length} 条内容`);

  const updateStmt = db.prepare(`
    UPDATE columns
    SET slug = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  let updated = 0;
  let skipped = 0;
  const slugMap = new Map();

  db.transaction(() => {
    for (const contentItem of contentItems) {
      // 如果已有 slug，跳过
      if (contentItem.slug) {
        skipped++;
        slugMap.set(contentItem.slug, contentItem.id);
        continue;
      }

      // 优先使用 code，其次使用 name
      const baseSlug = generateSlug(contentItem.code || contentItem.name);

      if (!baseSlug) {
        console.warn(`⚠️  内容 ${contentItem.id} 无法生成 slug，跳过`);
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
      updateStmt.run(slug, contentItem.id);
      slugMap.set(slug, contentItem.id);
      updated++;

      console.log(`✓ 内容 ${contentItem.id}: ${contentItem.name} -> ${slug}`);
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

function resolveModelCode(args) {
  for (const arg of args) {
    if (String(arg).startsWith('--model=')) {
      const value = String(arg).slice('--model='.length).trim();
      if (value) {
        return value;
      }
    }
  }
  return 'product';
}
