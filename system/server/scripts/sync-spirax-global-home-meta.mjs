import fs from 'node:fs';
import path from 'node:path';
import { execute, queryOne } from '../src/db.mjs';

const sourceRoot = process.env.SPIRAX_GLOBAL_DIR
  ? path.resolve(process.env.SPIRAX_GLOBAL_DIR)
  : '/Users/yytest/Documents/projects/spirax-global';

const sourceHomeFile = path.join(sourceRoot, 'docs', 'zh-cn', 'index.mdx');
const dryRun = process.argv.includes('--dry-run');

if (!fs.existsSync(sourceHomeFile)) {
  throw new Error(`未找到原站首页文档: ${sourceHomeFile}`);
}

const defaultLanguage = queryOne(`
  SELECT id, code
  FROM languages
  WHERE is_default = 1
  ORDER BY id ASC
  LIMIT 1
`);

if (!defaultLanguage?.id) {
  throw new Error('未找到默认语言');
}

const currentTranslation = queryOne(`
  SELECT
    id,
    seo_home_title,
    seo_home_description
  FROM site_config_translations
  WHERE site_config_id = 1
    AND language_id = ?
  LIMIT 1
`, [defaultLanguage.id]);

if (!currentTranslation?.id) {
  throw new Error(`未找到默认语言站点配置翻译: ${defaultLanguage.code}`);
}

const raw = fs.readFileSync(sourceHomeFile, 'utf8');
const frontmatter = parseFrontmatter(raw);

const nextSeoHomeTitle = toNullableString(frontmatter.seoTitle);
const nextSeoHomeDescription = toNullableString(frontmatter.seoDescription);

if (!nextSeoHomeTitle && !nextSeoHomeDescription) {
  throw new Error(`原站首页文档缺少 SEO 字段: ${sourceHomeFile}`);
}

const before = {
  seo_home_title: toNullableString(currentTranslation.seo_home_title),
  seo_home_description: toNullableString(currentTranslation.seo_home_description),
};

const changed = before.seo_home_title !== nextSeoHomeTitle
  || before.seo_home_description !== nextSeoHomeDescription;

if (!changed) {
  console.log(`${dryRun ? '[dry-run] ' : ''}首页 SEO 已与原站一致，无需更新。`);
  process.exit(0);
}

if (!dryRun) {
  execute(`
    UPDATE site_config_translations
       SET seo_home_title = ?,
           seo_home_description = ?,
           updated_at = CURRENT_TIMESTAMP
     WHERE id = ?
  `, [
    nextSeoHomeTitle,
    nextSeoHomeDescription,
    currentTranslation.id,
  ]);
}

console.log(`${dryRun ? '[dry-run] ' : ''}首页 SEO 已${dryRun ? '识别为待更新' : '更新'}。`);
console.log(`seo_home_title: ${stringifyForLog(before.seo_home_title)} -> ${stringifyForLog(nextSeoHomeTitle)}`);
console.log(`seo_home_description: ${stringifyForLog(before.seo_home_description)} -> ${stringifyForLog(nextSeoHomeDescription)}`);

function parseFrontmatter(rawText) {
  const normalized = String(rawText || '');
  if (!normalized.startsWith('---')) {
    return {};
  }

  const endIndex = normalized.indexOf('\n---', 3);
  if (endIndex < 0) {
    return {};
  }

  const body = normalized.slice(3, endIndex).trim();
  const result = {};

  for (const line of body.split(/\r?\n/u)) {
    const match = line.match(/^([A-Za-z0-9_]+)\s*:\s*(.*)$/u);
    if (!match) {
      continue;
    }
    const [, key, rawValue] = match;
    result[key] = stripWrappedQuotes(rawValue.trim());
  }

  return result;
}

function stripWrappedQuotes(value) {
  const normalized = String(value || '').trim();
  if (
    (normalized.startsWith('"') && normalized.endsWith('"'))
    || (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    return normalized.slice(1, -1);
  }
  return normalized;
}

function toNullableString(value) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function stringifyForLog(value) {
  return value == null ? 'NULL' : JSON.stringify(value);
}
