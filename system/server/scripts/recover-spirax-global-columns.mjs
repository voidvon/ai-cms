import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execute, getDb, queryAll, queryOne } from '../src/db.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../../..');
const sourceRoot = process.env.SPIRAX_GLOBAL_DIR
  ? path.resolve(process.env.SPIRAX_GLOBAL_DIR)
  : '/Users/yytest/Documents/projects/spirax-global';
const docsRoot = path.join(sourceRoot, 'docs', 'zh-cn');
const dryRun = process.argv.includes('--dry-run');

const ARTICLE_ROOTS = ['services', 'knowledge-exchange', 'customer-stories', 'promo', 'learn-about-steam'];
const PRODUCT_ROOT = 'products';
const NEWS_ROOT_SOURCE_ID = 4;
const SERVICE_ROOT_SOURCE_ID = 12;
const FIRST_LEARN_SECTION_SOURCE_ID = 13;

main();

function main() {
  if (!fs.existsSync(docsRoot)) {
    throw new Error(`源项目文档目录不存在: ${docsRoot}`);
  }

  getDb().exec('BEGIN');
  try {
    const defaultLanguageId = Number(
      queryOne('SELECT id FROM languages WHERE is_default = 1 LIMIT 1')?.id || 0
    );
    if (!defaultLanguageId) {
      throw new Error('未找到默认语言');
    }

    const source = buildSourceSnapshot();
    const result = {
      dryRun,
      sourceRoot,
      productCategoryParentUpdates: 0,
      productCategoryNameUpdates: 0,
      productItemParentUpdates: 0,
      productItemNameUpdates: 0,
      newsCategoryParentUpdates: 0,
      newsCategoryNameUpdates: 0,
      newsItemParentUpdates: 0,
      newsItemNameUpdates: 0,
      unresolved: [],
    };

    recoverProductColumns(defaultLanguageId, source, result);
    recoverNewsColumns(defaultLanguageId, source, result);

    if (dryRun) {
      getDb().exec('ROLLBACK');
    } else {
      getDb().exec('COMMIT');
    }

    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    getDb().exec('ROLLBACK');
    throw error;
  }
}

function buildSourceSnapshot() {
  const productCategoryMap = new Map();
  const productItemMap = new Map();
  const articleTitleMap = new Map();
  const learnSectionTitleMap = new Map();
  const learnSectionSourceIdMap = new Map();

  loadProductDocs(productCategoryMap, productItemMap);
  loadArticleDocs(articleTitleMap);
  loadLearnSectionMaps(learnSectionTitleMap, learnSectionSourceIdMap);

  return {
    productCategoryMap,
    productItemMap,
    articleTitleMap,
    learnSectionTitleMap,
    learnSectionSourceIdMap,
    newsRootTitle: loadPageTitle(path.join(docsRoot, 'news', 'index.mdx')) || '公司新闻',
    serviceRootTitle: loadPageTitle(path.join(docsRoot, 'services', 'index.mdx')) || '服务',
  };
}

function loadProductDocs(productCategoryMap, productItemMap) {
  const rootDir = path.join(docsRoot, PRODUCT_ROOT);
  if (!fs.existsSync(rootDir)) {
    return;
  }

  for (const filePath of findIndexFiles(rootDir)) {
    const parsed = parseSourceFile(filePath);
    const relativePath = path.relative(docsRoot, filePath);
    const routeSegments = relativePath.replace(/\/index\.mdx$/u, '').split(path.sep).filter(Boolean);
    if (routeSegments[0] !== PRODUCT_ROOT || routeSegments.length < 2) {
      continue;
    }

    const pagePath = routeSegments.slice(1).join('/');
    if (parsed.raw.includes('ProductCategoryPage')) {
      productCategoryMap.set(pagePath, {
        path: pagePath,
        title: parsed.displayTitle || titleizeSlug(routeSegments.at(-1) || ''),
      });
      continue;
    }

    if (parsed.raw.includes('ProductDetailPage')) {
      productItemMap.set(`product:${pagePath}`, {
        key: `product:${pagePath}`,
        path: pagePath,
        categoryPath: routeSegments.slice(1, -1).join('/'),
        title: parsed.displayTitle || titleizeSlug(routeSegments.at(-1) || ''),
      });
    }
  }
}

function loadArticleDocs(articleTitleMap) {
  for (const rootName of ARTICLE_ROOTS) {
    const rootDir = path.join(docsRoot, rootName);
    if (!fs.existsSync(rootDir)) {
      continue;
    }

    for (const filePath of findIndexFiles(rootDir)) {
      const relativePath = path.relative(docsRoot, filePath);
      const routeSegments = relativePath.replace(/\/index\.mdx$/u, '').split(path.sep).filter(Boolean);
      if (routeSegments[0] !== rootName || routeSegments.length < 2) {
        continue;
      }
      const slug = routeSegments.at(-1);
      if (!slug || slug === rootName) {
        continue;
      }
      const parsed = parseSourceFile(filePath);
      const restSegments = routeSegments.slice(1);
      const stableKey = `news:${rootName}:${restSegments.join('/')}`;
      articleTitleMap.set(stableKey, {
        key: stableKey,
        rootName,
        sectionSlug: rootName === 'learn-about-steam' ? restSegments[0] || '' : '',
        title: parsed.displayTitle || titleizeSlug(slug),
      });
    }
  }
}

function loadLearnSectionMaps(titleMap, sourceIdMap) {
  const learnRootPath = path.join(docsRoot, 'learn-about-steam', 'index.mdx');
  const learnRoot = parseSourceFile(learnRootPath);
  const sections = Array.isArray(learnRoot.pageData?.sections) ? learnRoot.pageData.sections : [];
  for (const section of sections) {
    const href = String(section?.links?.[0]?.href || '').trim();
    const slug = href.replace(/^\/learn-about-steam\/+/u, '').split('/').filter(Boolean)[0] || '';
    if (!slug) {
      continue;
    }
    titleMap.set(slug, String(section?.title || '').trim() || titleizeSlug(slug));
  }

  const learnRootDir = path.join(docsRoot, 'learn-about-steam');
  let nextSourceId = FIRST_LEARN_SECTION_SOURCE_ID;
  const seen = new Set();
  for (const filePath of findIndexFiles(learnRootDir)) {
    const relativePath = path.relative(docsRoot, filePath);
    const routeSegments = relativePath.replace(/\/index\.mdx$/u, '').split(path.sep).filter(Boolean);
    if (routeSegments[0] !== 'learn-about-steam' || routeSegments.length < 3) {
      continue;
    }
    const slug = routeSegments[1];
    if (!slug || seen.has(slug)) {
      continue;
    }
    seen.add(slug);
    sourceIdMap.set(slug, nextSourceId);
    nextSourceId += 1;
  }
}

function recoverProductColumns(defaultLanguageId, source, result) {
  const productRootId = Number(
    queryOne("SELECT id FROM columns WHERE source_type = 'product_root' LIMIT 1")?.id || 0
  );
  const categoryRows = queryAll(
    `
      SELECT
        id,
        parent_id,
        slug,
        legacy_extra
      FROM columns
      WHERE source_type = 'product_category'
      ORDER BY id ASC
    `
  );
  const categoryPathToId = new Map();

  for (const row of categoryRows) {
    const pathKey = readLegacyKey(row.legacy_extra);
    if (pathKey) {
      categoryPathToId.set(pathKey, Number(row.id));
    }
  }

  for (const row of categoryRows) {
    const pathKey = readLegacyKey(row.legacy_extra);
    if (!pathKey) {
      result.unresolved.push(`未找到产品栏目 key: column ${row.id}`);
      continue;
    }
    const sourceEntry = source.productCategoryMap.get(pathKey);
    if (!sourceEntry) {
      result.unresolved.push(`原项目缺少产品栏目: ${pathKey}`);
    }

    const parentPath = pathKey.includes('/') ? pathKey.split('/').slice(0, -1).join('/') : '';
    const nextParentId = parentPath
      ? Number(categoryPathToId.get(parentPath) || 0)
      : productRootId;

    if (Number(row.parent_id || 0) !== nextParentId) {
      result.productCategoryParentUpdates += 1;
      if (!dryRun) {
        execute('UPDATE columns SET parent_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [
          nextParentId || null,
          row.id,
        ]);
      }
    }

    const nextName = sourceEntry?.title || '';
    if (nextName && upsertColumnName(row.id, defaultLanguageId, nextName, dryRun)) {
      result.productCategoryNameUpdates += 1;
    }
  }

  const itemRows = queryAll(
    `
      SELECT
        id,
        parent_id,
        legacy_extra
      FROM columns
      WHERE source_type = 'product_item'
      ORDER BY id ASC
    `
  );

  for (const row of itemRows) {
    const stableKey = readLegacyKey(row.legacy_extra);
    const sourceEntry = stableKey ? source.productItemMap.get(stableKey) : null;
    if (!stableKey || !sourceEntry) {
      result.unresolved.push(`原项目缺少产品内容页: ${stableKey || `column ${row.id}`}`);
      continue;
    }

    const nextParentId = Number(categoryPathToId.get(sourceEntry.categoryPath) || 0);
    if (!nextParentId) {
      result.unresolved.push(`产品内容页缺少父栏目: ${stableKey}`);
      continue;
    }

    if (Number(row.parent_id || 0) !== nextParentId) {
      result.productItemParentUpdates += 1;
      if (!dryRun) {
        execute('UPDATE columns SET parent_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [
          nextParentId,
          row.id,
        ]);
      }
    }

    if (sourceEntry.title && upsertColumnName(row.id, defaultLanguageId, sourceEntry.title, dryRun)) {
      result.productItemNameUpdates += 1;
    }
  }
}

function recoverNewsColumns(defaultLanguageId, source, result) {
  const newsRoot = queryOne(
    "SELECT id, parent_id, legacy_extra FROM columns WHERE source_type = 'news_category' AND source_id = ? LIMIT 1",
    [NEWS_ROOT_SOURCE_ID]
  );
  const serviceRoot = queryOne(
    "SELECT id, parent_id, legacy_extra FROM columns WHERE source_type = 'news_category' AND source_id = ? LIMIT 1",
    [SERVICE_ROOT_SOURCE_ID]
  );

  if (!newsRoot || !serviceRoot) {
    throw new Error('未找到新闻或服务根栏目');
  }

  if (Number(newsRoot.parent_id || 0) !== 0) {
    result.newsCategoryParentUpdates += 1;
    if (!dryRun) {
      execute('UPDATE columns SET parent_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newsRoot.id]);
    }
  }
  if (Number(serviceRoot.parent_id || 0) !== 0) {
    result.newsCategoryParentUpdates += 1;
    if (!dryRun) {
      execute('UPDATE columns SET parent_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [serviceRoot.id]);
    }
  }

  if (upsertColumnName(newsRoot.id, defaultLanguageId, source.newsRootTitle, dryRun)) {
    result.newsCategoryNameUpdates += 1;
  }
  if (upsertColumnName(serviceRoot.id, defaultLanguageId, source.serviceRootTitle, dryRun)) {
    result.newsCategoryNameUpdates += 1;
  }
  if (!dryRun) {
    maybeUpdateLegacyExtra(newsRoot.id, newsRoot.legacy_extra, { import_source: 'spirax-global', key: 'root/news' });
    maybeUpdateLegacyExtra(serviceRoot.id, serviceRoot.legacy_extra, { import_source: 'spirax-global', key: 'root/services' });
  }

  const sectionColumnIdBySlug = new Map();
  const sectionRows = queryAll(
    `
      SELECT
        id,
        source_id,
        parent_id,
        legacy_extra
      FROM columns
      WHERE source_type = 'news_category'
        AND source_id >= ?
      ORDER BY source_id ASC
    `,
    [FIRST_LEARN_SECTION_SOURCE_ID]
  );

  for (const row of sectionRows) {
    const sourceId = Number(row.source_id || 0);
    const slug = Array.from(source.learnSectionSourceIdMap.entries()).find(([, value]) => value === sourceId)?.[0] || '';
    if (!slug) {
      result.unresolved.push(`未识别了解蒸汽栏目 source_id: ${sourceId}`);
      continue;
    }
    sectionColumnIdBySlug.set(slug, Number(row.id));

    if (Number(row.parent_id || 0) !== Number(newsRoot.id)) {
      result.newsCategoryParentUpdates += 1;
      if (!dryRun) {
        execute('UPDATE columns SET parent_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [
          newsRoot.id,
          row.id,
        ]);
      }
    }

    const nextName = source.learnSectionTitleMap.get(slug) || titleizeSlug(slug);
    if (nextName && upsertColumnName(row.id, defaultLanguageId, nextName, dryRun)) {
      result.newsCategoryNameUpdates += 1;
    }

    if (!dryRun) {
      maybeUpdateLegacyExtra(row.id, row.legacy_extra, {
        import_source: 'spirax-global',
        key: `learn-about-steam/${slug}`,
      });
    }
  }

  const itemRows = queryAll(
    `
      SELECT
        id,
        parent_id,
        legacy_extra
      FROM columns
      WHERE source_type = 'news_item'
      ORDER BY id ASC
    `
  );

  for (const row of itemRows) {
    const stableKey = readLegacyKey(row.legacy_extra);
    const sourceEntry = stableKey ? source.articleTitleMap.get(stableKey) : null;
    if (!stableKey || !sourceEntry) {
      result.unresolved.push(`原项目缺少文章内容页: ${stableKey || `column ${row.id}`}`);
      continue;
    }

    let nextParentId = 0;
    if (sourceEntry.rootName === 'services') {
      nextParentId = Number(serviceRoot.id);
    } else if (sourceEntry.rootName === 'learn-about-steam') {
      nextParentId = Number(sectionColumnIdBySlug.get(sourceEntry.sectionSlug) || 0);
    } else {
      nextParentId = Number(newsRoot.id);
    }

    if (!nextParentId) {
      result.unresolved.push(`文章内容页缺少父栏目: ${stableKey}`);
      continue;
    }

    if (Number(row.parent_id || 0) !== nextParentId) {
      result.newsItemParentUpdates += 1;
      if (!dryRun) {
        execute('UPDATE columns SET parent_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [
          nextParentId,
          row.id,
        ]);
      }
    }

    if (sourceEntry.title && upsertColumnName(row.id, defaultLanguageId, sourceEntry.title, dryRun)) {
      result.newsItemNameUpdates += 1;
    }
  }
}

function upsertColumnName(columnId, languageId, nextName, isDryRun) {
  const normalized = String(nextName || '').trim();
  if (!normalized) {
    return false;
  }

  const existing = queryOne(
    'SELECT id, name FROM column_translations WHERE column_id = ? AND language_id = ? LIMIT 1',
    [columnId, languageId]
  );
  if (String(existing?.name || '').trim() === normalized) {
    return false;
  }

  if (isDryRun) {
    return true;
  }

  if (existing?.id) {
    execute(
      'UPDATE column_translations SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [normalized, existing.id]
    );
  } else {
    execute(
      `
        INSERT INTO column_translations (
          column_id, language_id, name, content_html, created_at, updated_at
        ) VALUES (?, ?, ?, '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `,
      [columnId, languageId, normalized]
    );
  }
  return true;
}

function maybeUpdateLegacyExtra(columnId, rawValue, additions) {
  const current = parseJson(rawValue);
  const next = {
    ...current,
    ...additions,
  };
  const currentJson = JSON.stringify(current);
  const nextJson = JSON.stringify(next);
  if (currentJson === nextJson) {
    return;
  }
  execute('UPDATE columns SET legacy_extra = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [
    nextJson,
    columnId,
  ]);
}

function findIndexFiles(rootDir) {
  const results = [];
  walk(rootDir);
  return results;

  function walk(currentDir) {
    const items = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const item of items) {
      const nextPath = path.join(currentDir, item.name);
      if (item.isDirectory()) {
        walk(nextPath);
        continue;
      }
      if (item.isFile() && item.name === 'index.mdx') {
        results.push(nextPath);
      }
    }
  }
}

function parseSourceFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const frontmatter = parseFrontmatter(raw);
  const pageData = extractPageData(raw);
  const displayTitle = String(pageData?.title || frontmatter.title || '').trim();
  return {
    raw,
    frontmatter,
    pageData,
    displayTitle,
  };
}

function loadPageTitle(filePath) {
  if (!fs.existsSync(filePath)) {
    return '';
  }
  return parseSourceFile(filePath).displayTitle;
}

function parseFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?/u);
  const source = match ? match[1] : '';
  const result = {};
  for (const line of source.split('\n')) {
    const matched = line.match(/^([A-Za-z0-9_-]+):\s*(.+)$/u);
    if (!matched) {
      continue;
    }
    result[matched[1]] = stripYamlScalar(matched[2]);
  }
  return result;
}

function extractPageData(raw) {
  const marker = 'export const pageData = ';
  const start = raw.indexOf(marker);
  if (start === -1) {
    return {};
  }
  const objectStart = raw.indexOf('{', start);
  if (objectStart === -1) {
    return {};
  }
  const objectEnd = findBalancedObjectEnd(raw, objectStart);
  if (objectEnd === -1) {
    return {};
  }
  try {
    return Function(`"use strict"; return (${raw.slice(objectStart, objectEnd + 1)});`)();
  } catch {
    return {};
  }
}

function findBalancedObjectEnd(text, startIndex) {
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let escaped = false;

  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (!inDouble && !inTemplate && char === '\'') {
      inSingle = !inSingle;
      continue;
    }
    if (!inSingle && !inTemplate && char === '"') {
      inDouble = !inDouble;
      continue;
    }
    if (!inSingle && !inDouble && char === '`') {
      inTemplate = !inTemplate;
      continue;
    }
    if (inSingle || inDouble || inTemplate) {
      continue;
    }
    if (char === '{') {
      depth += 1;
      continue;
    }
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return -1;
}

function parseJson(value) {
  if (!value) {
    return {};
  }
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function readLegacyKey(rawValue) {
  return String(parseJson(rawValue).key || '').trim();
}

function stripYamlScalar(value) {
  const trimmed = String(value || '').trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith('\'') && trimmed.endsWith('\''))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function titleizeSlug(value) {
  return String(value || '')
    .split(/[/-]+/u)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
