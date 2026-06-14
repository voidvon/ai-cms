import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execute, getDb, queryAll, queryOne } from '../src/db.mjs';
import { ensureLanguagesSchema, listLanguages } from '../src/services/languages.mjs';
import { ensureProductCategoriesSchema } from '../src/services/product-categories.mjs';
import { ensureProductsSchema } from '../src/services/products.mjs';
import { ensureNewsCategoriesSchema } from '../src/services/news-categories.mjs';
import { ensureNewsSchema } from '../src/services/news.mjs';
import { ensureColumnsSchema } from '../src/services/columns.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../../..');
const sourceRoot = process.env.SPIRAX_GLOBAL_DIR
  ? path.resolve(process.env.SPIRAX_GLOBAL_DIR)
  : '/Users/yytest/Documents/projects/spirax-global';
const docsRoot = path.join(sourceRoot, 'docs');
const publicRoot = path.join(sourceRoot, 'public');
const contentRoot = path.join(projectRoot, 'html');
const dryRun = process.argv.includes('--dry-run');

const LANGUAGE_MAP = new Map([
  ['zh-cn', 'zh-CN'],
  ['en', 'en'],
  ['ru', 'ru'],
  ['es', 'es'],
  ['vi', 'vi'],
  ['tr', 'tr'],
  ['th', 'th'],
  ['pt', 'pt'],
  ['id', 'id'],
  ['ar', 'ar'],
]);

const ARTICLE_ROOTS = [
  'services',
  'knowledge-exchange',
  'customer-stories',
  'promo',
  'learn-about-steam',
];

const MANUAL_COLUMN_EXCLUDED_ROOTS = new Set([
  'products',
  'services',
  'knowledge-exchange',
  'customer-stories',
  'promo',
  'learn-about-steam',
  'news'
]);

const SERVICE_ROOT_ID = 12;
const NEWS_ROOT_ID = 4;

const report = {
  productCategories: 0,
  products: 0,
  newsCategories: 0,
  newsItems: 0,
  columns: 0,
  copiedAssets: 0,
  skipped: [],
};

ensureLanguagesSchema();
ensureProductCategoriesSchema();
ensureProductsSchema();
ensureNewsCategoriesSchema();
ensureNewsSchema();
ensureColumnsSchema();
ensureLegacyNewsRoots();

const availableLanguages = new Set(listLanguages().map((item) => item.code));
const categoryCache = {
  product: new Map(),
  news: new Map(),
};
const contentCache = {
  product: new Map(),
  news: new Map(),
};

main();

function main() {
  if (!fs.existsSync(docsRoot)) {
    throw new Error(`docs 目录不存在: ${docsRoot}`);
  }

  const languageDirs = fs.readdirSync(docsRoot, { withFileTypes: true }).filter((item) => item.isDirectory());
  for (const languageDir of languageDirs) {
    const sourceLanguageCode = languageDir.name;
    const targetLanguageCode = LANGUAGE_MAP.get(sourceLanguageCode);
    if (!targetLanguageCode) {
      report.skipped.push(`跳过未映射语言: ${sourceLanguageCode}`);
      continue;
    }

    if (!availableLanguages.has(targetLanguageCode)) {
      report.skipped.push(`跳过未启用语言 ${targetLanguageCode}，源目录 ${sourceLanguageCode}`);
      continue;
    }

    importProductsForLanguage(sourceLanguageCode, targetLanguageCode);
    importArticlesForLanguage(sourceLanguageCode, targetLanguageCode);
    importManualColumnsForLanguage(sourceLanguageCode, targetLanguageCode);
  }

  console.log(JSON.stringify({
    dryRun,
    sourceRoot,
    ...report,
  }, null, 2));
}

function importProductsForLanguage(sourceLanguageCode, targetLanguageCode) {
  const productRoot = path.join(docsRoot, sourceLanguageCode, 'products');
  if (!fs.existsSync(productRoot)) {
    return;
  }

  const files = findIndexFiles(productRoot);
  for (const filePath of files) {
    const relativePath = path.relative(path.join(docsRoot, sourceLanguageCode), filePath);
    const routeSegments = relativePath.replace(/\/index\.mdx$/, '').split(path.sep).filter(Boolean);
    if (routeSegments[0] !== 'products' || routeSegments.length < 2) {
      continue;
    }

    const parsed = parseMdxFile(filePath);
    const imported = parsed.imports.join('\n');
    const isProductDetail = imported.includes('ProductDetailPage');
    const isProductCategory = imported.includes('ProductCategoryPage');

    if (!isProductDetail && !isProductCategory) {
      continue;
    }

    if (isProductCategory) {
      const categorySegments = routeSegments.slice(1);
      upsertProductCategoryPath(categorySegments, targetLanguageCode, parsed, filePath);
      continue;
    }

    const categorySegments = routeSegments.slice(1, -1);
    const productSlug = routeSegments.at(-1);
    if (!productSlug) {
      continue;
    }
    upsertProductEntry(categorySegments, productSlug, targetLanguageCode, parsed, filePath);
  }
}

function importArticlesForLanguage(sourceLanguageCode, targetLanguageCode) {
  for (const rootName of ARTICLE_ROOTS) {
    const rootDir = path.join(docsRoot, sourceLanguageCode, rootName);
    if (!fs.existsSync(rootDir)) {
      continue;
    }

    const files = findIndexFiles(rootDir);
    for (const filePath of files) {
      const relativePath = path.relative(path.join(docsRoot, sourceLanguageCode), filePath);
      const routeSegments = relativePath.replace(/\/index\.mdx$/, '').split(path.sep).filter(Boolean);
      if (routeSegments[0] !== rootName || routeSegments.length < 2) {
        continue;
      }

      const parsed = parseMdxFile(filePath);
      const categorySegments = routeSegments.slice(0, -1);
      const slug = routeSegments.at(-1);
      if (!slug) {
        continue;
      }

      const isLanding = slug === rootName;
      if (isLanding) {
        continue;
      }

      upsertNewsEntry(rootName, categorySegments, slug, targetLanguageCode, parsed, filePath);
    }
  }
}

function importManualColumnsForLanguage(sourceLanguageCode, targetLanguageCode) {
  const languageRoot = path.join(docsRoot, sourceLanguageCode);
  const files = findIndexFiles(languageRoot);
  const manualPaths = files
    .map((filePath) => ({
      filePath,
      relativePath: path.relative(languageRoot, filePath)
    }))
    .filter(({ relativePath }) => {
      const routeSegments = relativePath.replace(/\/index\.mdx$/, '').split(path.sep).filter(Boolean);
      if (routeSegments.length === 0) {
        return false;
      }
      if (relativePath === 'index.mdx') {
        return false;
      }
      return !MANUAL_COLUMN_EXCLUDED_ROOTS.has(routeSegments[0]);
    })
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath, 'zh-Hans-CN'));

  const columnPathCache = new Map();
  const importedRoutePaths = new Set();
  for (const { filePath, relativePath } of manualPaths) {
    const routeSegments = relativePath.replace(/\/index\.mdx$/, '').split(path.sep).filter(Boolean);
    const parsed = parseMdxFile(filePath);
    upsertManualColumnPath({
      routeSegments,
      languageCode: targetLanguageCode,
      parsed,
      filePath,
      columnPathCache,
      importedRoutePaths
    });
  }

  pruneStaleImportedManualColumns(importedRoutePaths);
}

function upsertProductCategoryPath(categorySegments, languageCode, parsed, filePath) {
  let parentId = 0;
  for (let index = 0; index < categorySegments.length; index += 1) {
    const pathKey = categorySegments.slice(0, index + 1).join('/');
    const existingId = categoryCache.product.get(pathKey);
    const isLeaf = index === categorySegments.length - 1;
    if (existingId && !isLeaf) {
      parentId = existingId;
      continue;
    }

    const categoryName = isLeaf
      ? String(parsed.frontmatter.title || parsed.pageData.title || categorySegments[index]).trim()
      : titleizeSlug(categorySegments[index]);
    const categorySeoDescription = isLeaf
      ? toNullableString(parsed.frontmatter.seoDescription || parsed.frontmatter.description)
      : null;
    const categorySeoKeywords = isLeaf
      ? toNullableString(parsed.pageData.seo?.category || parsed.frontmatter.seoTitle)
      : null;
    const categoryContentHtml = isLeaf ? buildContentHtml(parsed) : null;
    const categoryPageData = isLeaf
      ? extractSerializableCategoryPageData(parsed.pageData, parsed.frontmatter)
      : null;

    const categoryId = upsertProductCategory({
      slugPath: pathKey,
      name: categoryName,
      parentId,
      languageCode,
      content_html: categoryContentHtml,
      seo_keywords: categorySeoKeywords,
      seo_description: categorySeoDescription,
      page_data: categoryPageData,
    });
    categoryCache.product.set(pathKey, categoryId);
    parentId = categoryId;
  }

  copyReferencedAssets(parsed, filePath);
}

function upsertProductEntry(categorySegments, productSlug, languageCode, parsed, filePath) {
  const categoryPath = categorySegments.join('/');
  if (categoryPath) {
    upsertProductCategoryPath(categorySegments, languageCode, parsed, filePath);
  }
  const categoryId = categoryPath ? categoryCache.product.get(categoryPath) || 0 : 0;
  const pageData = parsed.pageData;
  const slugPath = [...categorySegments, productSlug].join('/');
  const stableKey = `product:${slugPath}`;
  const images = normalizeImageArray(parsed.frontmatter.coverImages);
  const defaultName = String(parsed.frontmatter.title || pageData.title || titleizeSlug(productSlug)).trim();
  const payload = {
    category_id: categoryId || null,
    code: toNullableString(pageData.seo?.model || pageData.seo?.sku || pageData.seo?.mpn || productSlug.toUpperCase()),
    images: JSON.stringify(images),
    is_featured_home: parsed.frontmatter.showInLatestProducts ? 1 : 0,
    is_visible: 1,
    sort_order: 0,
  };
  const translation = {
    name: defaultName,
    summary: toNullableString(parsed.frontmatter.description || pageData.topPanel?.description),
    content_html: buildContentHtml(parsed),
    keywords: toNullableString(pageData.seo?.category || parsed.frontmatter.seoTitle || parsed.frontmatter.title),
    seo_title: toNullableString(parsed.frontmatter.seoTitle),
    seo_keywords: toNullableString(pageData.seo?.category),
    seo_description: toNullableString(parsed.frontmatter.seoDescription || parsed.frontmatter.description),
    publish_status: 'published',
    published_at: normalizeDate(parsed.frontmatter.launchDate),
  };
  const productPageData = extractSerializableProductPageData(pageData, parsed.frontmatter);

  const existingId = contentCache.product.get(stableKey) || findProductIdByCode(payload.code, defaultName);
  const productId = upsertProductRecord(existingId, payload, languageCode, translation, stableKey, productPageData);
  contentCache.product.set(stableKey, productId);
  report.products += 1;
  copyReferencedAssets(parsed, filePath);
}

function upsertNewsEntry(rootName, categorySegments, slug, languageCode, parsed, filePath) {
  const rootId = rootName === 'services' ? SERVICE_ROOT_ID : NEWS_ROOT_ID;
  const childSegments = categorySegments.slice(1);
  const categoryId = upsertNewsCategoryPath(rootId, rootName, childSegments, languageCode, parsed, slug === childSegments.at(-1));
  const pageData = parsed.pageData;
  const stableKey = `news:${rootName}:${[...childSegments, slug].join('/')}`;
  const payload = {
    category_id: categoryId || rootId,
    picture: normalizePrimaryPicture(parsed.frontmatter.coverImages, pageData.heroImage),
    is_featured_home: parsed.frontmatter.showInLatestProducts ? 1 : 0,
    created_at: normalizeDate(parsed.frontmatter.launchDate) || new Date().toISOString(),
  };
  const translation = {
    title: String(parsed.frontmatter.title || pageData.title || titleizeSlug(slug)).trim(),
    summary: toNullableString(parsed.frontmatter.description || pageData.summary),
    content_html: buildContentHtml(parsed),
    keywords: toNullableString(parsed.frontmatter.seoTitle || parsed.frontmatter.title),
    seo_title: toNullableString(parsed.frontmatter.seoTitle),
    seo_keywords: null,
    seo_description: toNullableString(parsed.frontmatter.seoDescription || parsed.frontmatter.description),
    publish_status: 'published',
    published_at: normalizeDate(parsed.frontmatter.launchDate),
  };

  const existingId = contentCache.news.get(stableKey) || findNewsIdByTitle(translation.title, payload.category_id);
  const newsId = upsertNewsRecord(existingId, payload, languageCode, translation, stableKey);
  contentCache.news.set(stableKey, newsId);
  report.newsItems += 1;
  copyReferencedAssets(parsed, filePath);
}

function upsertNewsCategoryPath(rootId, rootName, childSegments, languageCode, parsed) {
  let parentId = rootId;
  for (let index = 0; index < childSegments.length; index += 1) {
    const pathKey = `${rootName}/${childSegments.slice(0, index + 1).join('/')}`;
    const existingId = categoryCache.news.get(pathKey);
    if (existingId) {
      parentId = existingId;
      continue;
    }

    const isLeaf = index === childSegments.length - 1;
    const categoryName = isLeaf
      ? String(parsed.frontmatter.title || parsed.pageData.title || childSegments[index]).trim()
      : titleizeSlug(childSegments[index]);
    const categoryId = upsertNewsCategory({
      slugPath: pathKey,
      name: categoryName,
      parentId,
      languageCode,
    });
    categoryCache.news.set(pathKey, categoryId);
    parentId = categoryId;
  }
  return parentId;
}

function upsertManualColumnPath({ routeSegments, languageCode, parsed, filePath, columnPathCache, importedRoutePaths }) {
  let parentColumnId = null;
  for (let index = 0; index < routeSegments.length; index += 1) {
    const currentSegments = routeSegments.slice(0, index + 1);
    const routeKey = currentSegments.join('/');
    const cachedId = columnPathCache.get(routeKey);
    const isLeaf = index === routeSegments.length - 1;

    if (cachedId && !isLeaf) {
      parentColumnId = cachedId;
      continue;
    }

    const defaultName = titleizeSlug(currentSegments[index]);
    const name = String(parsed.frontmatter.title || parsed.pageData.title || defaultName).trim() || defaultName;
    const routePath = toColumnRoutePath(currentSegments);
    importedRoutePaths?.add(routePath);
    const pageData = extractSerializableManualPageData(parsed.pageData, parsed.frontmatter, routePath);
    const contentHtml = buildContentHtml(parsed);
    const legacyExtra = JSON.stringify(pruneEmptyValues({
      import_source: 'spirax-global',
      key: `column:${routeKey}`,
      route_path: routePath,
      page_data: pageData || null
    }));

    const columnId = upsertManualColumnRecord({
      routePath,
      parentId: parentColumnId,
      languageCode,
      translation: {
        name,
        content_html: contentHtml,
        seo_title: toNullableString(parsed.frontmatter.seoTitle),
        seo_keywords: toNullableString(parsed.frontmatter.seoTitle || parsed.frontmatter.title),
        seo_description: toNullableString(parsed.frontmatter.seoDescription || parsed.frontmatter.description)
      },
      legacyExtra
    });

    columnPathCache.set(routeKey, columnId);
    parentColumnId = columnId;
  }

  copyReferencedAssets(parsed, filePath);
}

function pruneStaleImportedManualColumns(importedRoutePaths) {
  if (dryRun) {
    return;
  }
  const staleRows = queryAll(
    `
      SELECT id
      FROM columns
      WHERE source_type = 'single_page'
        AND legacy_extra LIKE '%"import_source":"spirax-global"%'
    `
  ).filter((row) => !importedRoutePaths.has(String(getColumnByIdRoutePath(row.id) || '').trim()));

  for (const row of staleRows) {
    execute('DELETE FROM columns WHERE id = ?', [Number(row.id)]);
  }
}

function getColumnByIdRoutePath(id) {
  return queryOne('SELECT route_path FROM columns WHERE id = ? LIMIT 1', [id])?.route_path || null;
}

function upsertProductCategory({ slugPath, name, parentId, languageCode, content_html = null, seo_keywords, seo_description, page_data = null }) {
  const existing = queryOne(
    'SELECT id, legacy_extra FROM product_categories WHERE legacy_extra = ? OR legacy_extra LIKE ? LIMIT 1',
    [buildLegacyExtraKey(slugPath), `%${escapeSqlLike(buildLegacyExtraMatchKey(slugPath))}%`]
  );

  if (dryRun) {
    if (!existing) {
      report.productCategories += 1;
      return pseudoId(slugPath);
    }
    saveProductCategoryTranslation(existing.id, languageCode, { name, seo_keywords, seo_description });
    return Number(existing.id);
  }

  if (existing) {
    const legacyExtra = mergeLegacyExtra(existing.legacy_extra, {
      import_source: 'spirax-global',
      key: slugPath,
      page_data: page_data || parseLegacyExtra(existing.legacy_extra)?.page_data || null
    });
    execute(
      'UPDATE product_categories SET parent_id = ?, name = ?, content_html = COALESCE(?, content_html), seo_keywords = ?, seo_description = ?, legacy_extra = ? WHERE id = ?',
      [parentId, name, content_html, seo_keywords, seo_description, legacyExtra, Number(existing.id)]
    );
    saveProductCategoryTranslation(existing.id, languageCode, { name, seo_keywords, seo_description });
    return Number(existing.id);
  }

  execute(
    'INSERT INTO product_categories (name, parent_id, sort_order, content_html, seo_keywords, seo_description, legacy_extra) VALUES (?, ?, 0, ?, ?, ?, ?)',
    [
      name,
      parentId,
      content_html || '',
      seo_keywords,
      seo_description,
      JSON.stringify({
        import_source: 'spirax-global',
        key: slugPath,
        page_data: page_data || null
      })
    ]
  );
  const id = Number(queryOne('SELECT last_insert_rowid() AS id')?.id || 0);
  saveProductCategoryTranslation(id, languageCode, { name, seo_keywords, seo_description });
  report.productCategories += 1;
  return id;
}

function upsertManualColumnRecord({ routePath, parentId, languageCode, translation, legacyExtra }) {
  const existing = queryOne(
    'SELECT id FROM columns WHERE source_type = ? AND route_path = ? LIMIT 1',
    ['single_page', routePath]
  ) || queryOne(
    'SELECT id FROM columns WHERE route_path = ? LIMIT 1',
    [routePath]
  );

  if (dryRun) {
    if (!existing) {
      report.columns += 1;
      return pseudoId(routePath);
    }
    saveColumnTranslation(existing.id, languageCode, translation);
    return Number(existing.id);
  }

  if (existing) {
    execute(
      `
        UPDATE columns
        SET
          name = ?,
          parent_id = ?,
          model_code = 'page',
          source_type = 'single_page',
          column_kind = 'single',
          route_path = ?,
          custom_url = NULL,
          open_in_new_tab = 0,
          content_html = ?,
          seo_title = ?,
          seo_keywords = ?,
          seo_description = ?,
          legacy_extra = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [
        translation.name,
        parentId,
        routePath,
        translation.content_html || '',
        translation.seo_title,
        translation.seo_keywords,
        translation.seo_description,
        legacyExtra,
        Number(existing.id)
      ]
    );
    saveColumnTranslation(existing.id, languageCode, translation);
    return Number(existing.id);
  }

  execute(
    `
      INSERT INTO columns (
        name,
        parent_id,
        model_code,
        source_type,
        source_id,
        column_kind,
        custom_url,
        route_path,
        open_in_new_tab,
        content_html,
        seo_title,
        seo_keywords,
        seo_description,
        legacy_extra,
        sort_order,
        is_system,
        created_at,
        updated_at
      ) VALUES (?, ?, 'page', 'single_page', ?, 'single', NULL, ?, 0, ?, ?, ?, ?, ?, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `,
    [
      translation.name,
      parentId,
      getNextManualColumnSourceId(),
      routePath,
      translation.content_html || '',
      translation.seo_title,
      translation.seo_keywords,
      translation.seo_description,
      legacyExtra
    ]
  );
  const id = Number(queryOne('SELECT last_insert_rowid() AS id')?.id || 0);
  saveColumnTranslation(id, languageCode, translation);
  report.columns += 1;
  return id;
}

function upsertNewsCategory({ slugPath, name, parentId, languageCode }) {
  const existing = queryOne('SELECT id FROM news_categories WHERE legacy_extra = ? LIMIT 1', [buildLegacyExtraKey(slugPath)]);

  if (dryRun) {
    if (!existing) {
      report.newsCategories += 1;
      return pseudoId(slugPath);
    }
    saveNewsCategoryTranslation(existing.id, languageCode, { name });
    return Number(existing.id);
  }

  if (existing) {
    execute('UPDATE news_categories SET parent_id = ?, name = ? WHERE id = ?', [parentId, name, Number(existing.id)]);
    saveNewsCategoryTranslation(existing.id, languageCode, { name });
    return Number(existing.id);
  }

  const columns = queryAll('PRAGMA table_info(news_categories)');
  const hasLegacyExtra = columns.some((column) => column.name === 'legacy_extra');
  if (!hasLegacyExtra) {
    getDb().exec('ALTER TABLE news_categories ADD COLUMN legacy_extra TEXT');
  }
  execute(
    'INSERT INTO news_categories (name, parent_id, sort_order, legacy_extra) VALUES (?, ?, 0, ?)',
    [name, parentId, buildLegacyExtraKey(slugPath)]
  );
  const id = Number(queryOne('SELECT last_insert_rowid() AS id')?.id || 0);
  saveNewsCategoryTranslation(id, languageCode, { name });
  report.newsCategories += 1;
  return id;
}

function upsertProductRecord(existingId, basePayload, languageCode, translation, stableKey, pageData = null) {
  if (dryRun) {
    return existingId || pseudoId(stableKey);
  }

  const legacyExtra = JSON.stringify(pruneEmptyValues({
    import_source: 'spirax-global',
    key: stableKey,
    page_data: pageData || null
  }));

  if (existingId) {
    execute(
      'UPDATE products SET category_id = ?, code = ?, images = ?, is_featured_home = ?, is_visible = ?, sort_order = ?, legacy_extra = ? WHERE id = ?',
      [basePayload.category_id, basePayload.code, basePayload.images, basePayload.is_featured_home, basePayload.is_visible, basePayload.sort_order, legacyExtra, existingId]
    );
    saveProductTranslation(existingId, languageCode, translation);
    return Number(existingId);
  }

  execute(
    'INSERT INTO products (category_id, name, code, summary, content_html, images, keywords, is_featured_home, is_visible, sort_order, legacy_extra, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      basePayload.category_id,
      translation.name,
      basePayload.code,
      translation.summary,
      translation.content_html,
      basePayload.images,
      translation.keywords,
      basePayload.is_featured_home,
      basePayload.is_visible,
      basePayload.sort_order,
      legacyExtra,
      translation.published_at || new Date().toISOString(),
    ]
  );
  const id = Number(queryOne('SELECT last_insert_rowid() AS id')?.id || 0);
  saveProductTranslation(id, languageCode, translation);
  return id;
}

function upsertNewsRecord(existingId, basePayload, languageCode, translation, stableKey) {
  if (dryRun) {
    return existingId || pseudoId(stableKey);
  }

  const columns = queryAll('PRAGMA table_info(news)');
  const hasLegacyExtra = columns.some((column) => column.name === 'legacy_extra');

  if (existingId) {
    execute(
      'UPDATE news SET category_id = ?, picture = ?, is_featured_home = ?, created_at = ?, title = ?, summary = ?, content_html = ?, keywords = ? WHERE id = ?',
      [basePayload.category_id, basePayload.picture, basePayload.is_featured_home, basePayload.created_at, translation.title, translation.summary, translation.content_html, translation.keywords, existingId]
    );
    saveNewsTranslation(existingId, languageCode, translation);
    return Number(existingId);
  }

  const insertColumns = hasLegacyExtra
    ? 'category_id, title, summary, content_html, picture, keywords, is_featured_home, created_at, legacy_extra'
    : 'category_id, title, summary, content_html, picture, keywords, is_featured_home, created_at';
  const insertValues = hasLegacyExtra
    ? '?, ?, ?, ?, ?, ?, ?, ?, ?'
    : '?, ?, ?, ?, ?, ?, ?, ?';
  const values = [
    basePayload.category_id,
    translation.title,
    translation.summary,
    translation.content_html,
    basePayload.picture,
    translation.keywords,
    basePayload.is_featured_home,
    basePayload.created_at,
  ];
  if (hasLegacyExtra) {
    values.push(buildLegacyExtraKey(stableKey));
  }
  execute(`INSERT INTO news (${insertColumns}) VALUES (${insertValues})`, values);
  const id = Number(queryOne('SELECT last_insert_rowid() AS id')?.id || 0);
  saveNewsTranslation(id, languageCode, translation);
  return id;
}

function saveProductCategoryTranslation(categoryId, languageCode, translation) {
  if (dryRun) {
    return;
  }
  const languageId = getLanguageId(languageCode);
  if (!languageId) {
    return;
  }
  execute(
    `
      INSERT INTO product_category_translations (
        category_id, language_id, name, seo_keywords, seo_description, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(category_id, language_id) DO UPDATE SET
        name = excluded.name,
        seo_keywords = excluded.seo_keywords,
        seo_description = excluded.seo_description,
        updated_at = excluded.updated_at
    `,
    [categoryId, languageId, translation.name, translation.seo_keywords || null, translation.seo_description || null]
  );
}

function saveNewsCategoryTranslation(categoryId, languageCode, translation) {
  if (dryRun) {
    return;
  }
  const languageId = getLanguageId(languageCode);
  if (!languageId) {
    return;
  }
  execute(
    `
      INSERT INTO news_category_translations (
        category_id, language_id, name, created_at, updated_at
      ) VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(category_id, language_id) DO UPDATE SET
        name = excluded.name,
        updated_at = excluded.updated_at
    `,
    [categoryId, languageId, translation.name]
  );
}

function saveColumnTranslation(columnId, languageCode, translation) {
  if (dryRun) {
    return;
  }
  const languageId = getLanguageId(languageCode);
  if (!languageId) {
    return;
  }
  execute(
    `
      INSERT INTO column_translations (
        column_id, language_id, name, content_html, seo_title, seo_keywords, seo_description, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(column_id, language_id) DO UPDATE SET
        name = excluded.name,
        content_html = excluded.content_html,
        seo_title = excluded.seo_title,
        seo_keywords = excluded.seo_keywords,
        seo_description = excluded.seo_description,
        updated_at = excluded.updated_at
    `,
    [
      columnId,
      languageId,
      translation.name || '',
      translation.content_html || '',
      translation.seo_title || null,
      translation.seo_keywords || null,
      translation.seo_description || null,
    ]
  );
}

function saveProductTranslation(productId, languageCode, translation) {
  if (dryRun) {
    return;
  }
  const languageId = getLanguageId(languageCode);
  if (!languageId) {
    return;
  }
  execute(
    `
      INSERT INTO product_translations (
        product_id, language_id, name, summary, content_html, keywords,
        seo_title, seo_keywords, seo_description, publish_status, published_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(product_id, language_id) DO UPDATE SET
        name = excluded.name,
        summary = excluded.summary,
        content_html = excluded.content_html,
        keywords = excluded.keywords,
        seo_title = excluded.seo_title,
        seo_keywords = excluded.seo_keywords,
        seo_description = excluded.seo_description,
        publish_status = excluded.publish_status,
        published_at = excluded.published_at,
        updated_at = excluded.updated_at
    `,
    [
      productId,
      languageId,
      translation.name,
      translation.summary,
      translation.content_html,
      translation.keywords,
      translation.seo_title,
      translation.seo_keywords,
      translation.seo_description,
      translation.publish_status,
      translation.published_at || null,
    ]
  );
}

function saveNewsTranslation(newsId, languageCode, translation) {
  if (dryRun) {
    return;
  }
  const languageId = getLanguageId(languageCode);
  if (!languageId) {
    return;
  }
  execute(
    `
      INSERT INTO news_translations (
        news_id, language_id, title, summary, content_html, keywords,
        seo_title, seo_keywords, seo_description, publish_status, published_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(news_id, language_id) DO UPDATE SET
        title = excluded.title,
        summary = excluded.summary,
        content_html = excluded.content_html,
        keywords = excluded.keywords,
        seo_title = excluded.seo_title,
        seo_keywords = excluded.seo_keywords,
        seo_description = excluded.seo_description,
        publish_status = excluded.publish_status,
        published_at = excluded.published_at,
        updated_at = excluded.updated_at
    `,
    [
      newsId,
      languageId,
      translation.title,
      translation.summary,
      translation.content_html,
      translation.keywords,
      translation.seo_title,
      translation.seo_keywords,
      translation.seo_description,
      translation.publish_status,
      translation.published_at || null,
    ]
  );
}

function findProductIdByCode(code, fallbackName) {
  if (code) {
    const row = queryOne('SELECT id FROM products WHERE code = ? LIMIT 1', [code]);
    if (row?.id) {
      return Number(row.id);
    }
  }
  if (fallbackName) {
    const row = queryOne('SELECT id FROM products WHERE name = ? LIMIT 1', [fallbackName]);
    if (row?.id) {
      return Number(row.id);
    }
  }
  return null;
}

function findNewsIdByTitle(title, categoryId) {
  const row = queryOne('SELECT id FROM news WHERE title = ? AND category_id = ? LIMIT 1', [title, categoryId]);
  return row?.id ? Number(row.id) : null;
}

function getLanguageId(languageCode) {
  const row = queryOne('SELECT id FROM languages WHERE code = ? LIMIT 1', [languageCode]);
  return row?.id ? Number(row.id) : null;
}

function getNextManualColumnSourceId() {
  const row = queryOne(
    'SELECT COALESCE(MAX(source_id), 0) + 1 AS value FROM columns WHERE source_type = ?',
    ['single_page']
  );
  return Number(row?.value || 1);
}

function ensureLegacyNewsRoots() {
  if (dryRun) {
    return;
  }

  const columns = queryAll('PRAGMA table_info(news_categories)');
  const hasLegacyExtra = columns.some((column) => column.name === 'legacy_extra');
  if (!hasLegacyExtra) {
    getDb().exec('ALTER TABLE news_categories ADD COLUMN legacy_extra TEXT');
  }

  execute(
    `
      INSERT OR IGNORE INTO news_categories (id, name, parent_id, sort_order, legacy_extra)
      VALUES
        (?, '公司新闻', 0, 0, ?),
        (?, '服务', 0, 0, ?)
    `,
    [NEWS_ROOT_ID, buildLegacyExtraKey('root/news'), SERVICE_ROOT_ID, buildLegacyExtraKey('root/services')]
  );

  saveNewsCategoryTranslation(NEWS_ROOT_ID, 'zh-CN', { name: '公司新闻' });
  saveNewsCategoryTranslation(SERVICE_ROOT_ID, 'zh-CN', { name: '服务' });
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

function parseMdxFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const frontmatterMatch = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  const frontmatterRaw = frontmatterMatch ? frontmatterMatch[1] : '';
  const body = frontmatterMatch ? raw.slice(frontmatterMatch[0].length) : raw;
  const imports = body.split('\n').filter((line) => line.startsWith('import '));
  const namedExports = extractNamedLiteralExports(body);
  const pageData = enrichPageData(extractPageData(body), body, namedExports);

  return {
    frontmatter: parseSimpleFrontmatter(frontmatterRaw),
    pageData,
    namedExports,
    imports,
    body,
    raw,
  };
}

function enrichPageData(pageData, body, namedExports) {
  const base = pageData && typeof pageData === 'object' ? { ...pageData } : {};
  const brandPathSection = extractBrandPathSection(body, namedExports);
  if (brandPathSection && !base.brandPathSection) {
    base.brandPathSection = brandPathSection;
  }
  return base;
}

function extractPageData(body) {
  const marker = 'export const pageData = ';
  const start = body.indexOf(marker);
  if (start === -1) {
    return {};
  }
  const objectStart = body.indexOf('{', start);
  if (objectStart === -1) {
    return {};
  }
  const objectEnd = findBalancedObjectEnd(body, objectStart);
  if (objectEnd === -1) {
    return {};
  }
  const objectLiteral = body.slice(objectStart, objectEnd + 1);
  try {
    return Function(`"use strict"; return (${objectLiteral});`)();
  } catch {
    return {};
  }
}

function findBalancedObjectEnd(input, startIndex) {
  return findBalancedExpressionEnd(input, startIndex, '{', '}');
}

function findBalancedExpressionEnd(input, startIndex, openChar, closeChar) {
  let depth = 0;
  let inString = false;
  let stringQuote = '';
  let escaped = false;

  for (let index = startIndex; index < input.length; index += 1) {
    const char = input[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === stringQuote) {
        inString = false;
        stringQuote = '';
      }
      continue;
    }

    if (char === '"' || char === '\'' || char === '`') {
      inString = true;
      stringQuote = char;
      continue;
    }

    if (char === openChar) {
      depth += 1;
    } else if (char === closeChar) {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function extractNamedLiteralExports(body) {
  const output = {};
  const pattern = /export const ([A-Za-z0-9_]+)\s*=\s*/g;
  let match = pattern.exec(body);
  while (match) {
    const [, name] = match;
    const valueStart = match.index + match[0].length;
    const firstChar = body[valueStart];
    if (firstChar !== '{' && firstChar !== '[') {
      match = pattern.exec(body);
      continue;
    }
    const valueEnd = findBalancedExpressionEnd(body, valueStart, firstChar, firstChar === '{' ? '}' : ']');
    if (valueEnd === -1) {
      match = pattern.exec(body);
      continue;
    }
    const literal = body.slice(valueStart, valueEnd + 1);
    try {
      output[name] = Function(`"use strict"; return (${literal});`)();
    } catch {
      // Ignore non-literal exports that cannot be safely evaluated.
    }
    match = pattern.exec(body);
  }
  return output;
}

function extractBrandPathSection(body, namedExports) {
  const match = body.match(/<BrandPathSection([\s\S]*?)\/>/m);
  if (!match) {
    return null;
  }

  const propsText = match[1] || '';
  const cardsRefMatch = propsText.match(/cards=\{([A-Za-z0-9_]+)\}/);
  const titleMatch = propsText.match(/title="([^"]*)"/);
  const introMatch = propsText.match(/intro="([^"]*)"/);
  const ctaFallbackMatch = propsText.match(/ctaFallbackToTitle=\{(true|false)\}/);
  const cardsRef = cardsRefMatch?.[1] || '';
  const cards = Array.isArray(namedExports?.[cardsRef]) ? namedExports[cardsRef] : [];
  if (!cards.length) {
    return null;
  }

  return pruneEmptyValues({
    title: toNullableString(titleMatch?.[1]),
    intro: toNullableString(introMatch?.[1]),
    ctaFallbackToTitle: ctaFallbackMatch?.[1] === 'true',
    cards: normalizeObjectArray(cards, ['title', 'description', 'href', 'label'])
  });
}

function parseSimpleFrontmatter(frontmatterRaw) {
  const result = {};
  const lines = frontmatterRaw.split('\n');
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const arrayMatch = line.match(/^([A-Za-z0-9_]+):\s*$/);
    if (arrayMatch) {
      const key = arrayMatch[1];
      const items = [];
      index += 1;
      while (index < lines.length && /^\s*-\s+/.test(lines[index])) {
        const item = {};
        let currentLine = lines[index].replace(/^\s*-\s+/, '');
        const inlineMatch = currentLine.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
        if (inlineMatch) {
          item[inlineMatch[1]] = stripQuotes(inlineMatch[2]);
        }
        index += 1;
        while (index < lines.length && /^\s{2,}[A-Za-z0-9_]+:/.test(lines[index])) {
          const nestedMatch = lines[index].trim().match(/^([A-Za-z0-9_]+):\s*(.*)$/);
          if (nestedMatch) {
            item[nestedMatch[1]] = stripQuotes(nestedMatch[2]);
          }
          index += 1;
        }
        items.push(item);
      }
      result[key] = items;
      continue;
    }

    const match = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!match) {
      index += 1;
      continue;
    }

    const key = match[1];
    let value = match[2];
    if (!value && index + 1 < lines.length && /^\s+/.test(lines[index + 1])) {
      const buffer = [];
      index += 1;
      while (index < lines.length && /^\s+/.test(lines[index])) {
        buffer.push(lines[index].trim());
        index += 1;
      }
      result[key] = stripQuotes(buffer.join(' '));
      continue;
    }

    result[key] = parseScalarValue(value);
    index += 1;
  }

  return result;
}

function parseScalarValue(value) {
  const trimmed = String(value || '').trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  return stripQuotes(trimmed);
}

function stripQuotes(value) {
  const trimmed = String(value || '').trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith('\'') && trimmed.endsWith('\''))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function buildContentHtml(parsed) {
  const bodyWithoutImports = parsed.body
    .replace(/^import\s.+$/gm, '')
    .replace(/^export const [A-Za-z0-9_]+\s*=\s*[\s\S]*?;\n?/gm, '')
    .replace(/<StructuredInfoPage[^>]*>/g, '')
    .replace(/<\/StructuredInfoPage>/g, '')
    .replace(/<ProductDetailPage[^>]*>/g, '')
    .replace(/<\/ProductDetailPage>/g, '')
    .replace(/<ProductCategoryPage[^>]*>/g, '')
    .replace(/<\/ProductCategoryPage>/g, '')
    .replace(/<BrandPathSection[^>]*\/>/g, '')
    .replace(/<([A-Z][A-Za-z0-9_]*)[^>]*\/>/g, '')
    .replace(/<([A-Z][A-Za-z0-9_]*)[^>]*>/g, '')
    .replace(/<\/([A-Z][A-Za-z0-9_]*)>/g, '')
    .trim();

  const sections = [];
  const infoSectionPattern = /<InfoSection(?:\s+title="([^"]*)")?[^>]*>([\s\S]*?)<\/InfoSection>/g;
  let lastIndex = 0;
  let match = infoSectionPattern.exec(bodyWithoutImports);

  while (match) {
    const leading = bodyWithoutImports.slice(lastIndex, match.index).trim();
    if (leading) {
      sections.push(renderRichTextBlock(leading));
    }

    const [, title, content] = match;
    const rendered = renderInfoSection(title, content);
    if (rendered) {
      sections.push(rendered);
    }
    lastIndex = infoSectionPattern.lastIndex;
    match = infoSectionPattern.exec(bodyWithoutImports);
  }

  const trailing = bodyWithoutImports.slice(lastIndex).trim();
  if (trailing) {
    sections.push(renderRichTextBlock(trailing));
  }

  return sections.filter(Boolean).join('\n');
}

function normalizeImageArray(coverImages) {
  if (!Array.isArray(coverImages)) {
    return [];
  }
  return coverImages
    .map((item) => String(item?.src || '').trim())
    .filter(Boolean);
}

function normalizePrimaryPicture(coverImages, fallback) {
  return normalizeImageArray(coverImages)[0] || toNullableString(fallback) || '/UploadFile/nopicture.gif';
}

function copyReferencedAssets(parsed) {
  const assetPaths = new Set([
    ...normalizeImageArray(parsed.frontmatter.coverImages),
    ...extractAssetPaths(parsed.raw),
  ]);

  for (const assetPath of assetPaths) {
    const normalized = String(assetPath || '').trim();
    if (!normalized.startsWith('/')) {
      continue;
    }
    const sourcePath = path.join(publicRoot, normalized);
    const targetPath = path.join(contentRoot, normalized);
    if (!fs.existsSync(sourcePath)) {
      continue;
    }
    if (dryRun) {
      report.copiedAssets += 1;
      continue;
    }
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    if (!fs.existsSync(targetPath)) {
      fs.copyFileSync(sourcePath, targetPath);
      report.copiedAssets += 1;
    }
  }
}

function extractAssetPaths(raw) {
  const matches = raw.match(/\/(?:images|pdfs|uploadfile|UploadFile)\/[^"')\s]+/g) || [];
  return matches;
}

function normalizeDate(value) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return null;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return `${normalized}T00:00:00.000Z`;
  }
  return normalized;
}

function toColumnRoutePath(routeSegments) {
  const normalized = `/${routeSegments.join('/')}`.replace(/\/{2,}/g, '/');
  if (normalized === '/') {
    return '/';
  }
  const lastSegment = routeSegments.at(-1) || '';
  if (lastSegment.includes('.')) {
    return normalized;
  }
  return `${normalized}/`;
}

function toNullableString(value) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function normalizeCategoryPageKind(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (normalized === 'collection') {
    return 'category';
  }
  return normalized;
}

function titleizeSlug(value) {
  return String(value || '')
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function buildLegacyExtraKey(key) {
  return JSON.stringify({ import_source: 'spirax-global', key });
}

function extractSerializableCategoryPageData(pageData, frontmatter) {
  const raw = pageData && typeof pageData === 'object' ? pageData : {};
  const clean = {
    title: toNullableString(raw.title || frontmatter?.title),
    summary: toNullableString(raw.summary || frontmatter?.description),
    pageKind: normalizeCategoryPageKind(raw.pageKind || raw.kind),
    mastheadImage: toNullableString(raw.mastheadImage || raw.heroImage),
    categoryNavTitle: toNullableString(raw.categoryNavTitle),
    intro: normalizeStringArray(raw.intro),
    overview: normalizeStringArray(raw.overview),
    benefits: normalizeObjectArray(raw.benefits, ['icon', 'title']),
    cards: normalizeObjectArray(raw.cards, ['title', 'description', 'link', 'href', 'label', 'image', 'imageAlt']),
    models: normalizeObjectArray(raw.models, ['title', 'description', 'link', 'href', 'label', 'image', 'imageAlt']),
    downloads: normalizeDownloadGroups(raw.downloads),
    supplementalSections: normalizeSupplementalSections(raw.supplementalSections),
    brandPathSection: normalizeBrandPathSection(raw.brandPathSection),
    browseByTopicSection: normalizeBrowseByTopicSection(raw.browseByTopicSection),
    topPanel: normalizeTopPanelData(raw.topPanel),
    seo: normalizePlainObject(raw.seo, ['category', 'model', 'sku', 'mpn'])
  };

  return pruneEmptyValues(clean);
}

function extractSerializableProductPageData(pageData, frontmatter) {
  const raw = pageData && typeof pageData === 'object' ? pageData : {};
  const clean = {
    title: toNullableString(raw.title || frontmatter?.title),
    summary: toNullableString(raw.summary || frontmatter?.description),
    mastheadImage: toNullableString(raw.mastheadImage || raw.heroImage),
    intro: normalizeStringArray(raw.intro),
    overview: normalizeStringArray(raw.overview),
    benefits: normalizeObjectArray(raw.benefits, ['icon', 'title']),
    downloads: normalizeDownloadGroups(raw.downloads),
    supplementalSections: normalizeSupplementalSections(raw.supplementalSections),
    brandPathSection: normalizeBrandPathSection(raw.brandPathSection),
    topPanel: normalizeTopPanelData(raw.topPanel),
    seo: normalizePlainObject(raw.seo, ['category', 'model', 'sku', 'mpn'])
  };

  return pruneEmptyValues(clean);
}

function extractSerializableManualPageData(pageData, frontmatter, routePath) {
  const raw = pageData && typeof pageData === 'object' ? pageData : {};
  const mergedCalloutCards = [
    ...(Array.isArray(raw.calloutCards) ? raw.calloutCards : []),
    ...(Array.isArray(raw.cardLinks) ? raw.cardLinks : [])
  ];
  const clean = {
    title: toNullableString(raw.title || frontmatter?.title),
    summary: toNullableString(raw.summary || frontmatter?.description),
    heroImage: toNullableString(raw.heroImage || raw.image || raw.featureImage),
    mastheadImage: toNullableString(raw.mastheadImage || raw.heroImage || raw.image || raw.featureImage),
    pageKind: normalizeCategoryPageKind(raw.pageKind || raw.kind),
    intro: normalizeLooseStringContent(raw?.intro?.paragraphs ?? raw.intro),
    overview: normalizeLooseStringContent(raw.overview),
    contents: normalizeObjectArray(raw.contents, ['href', 'title']),
    sections: normalizeManualSections(raw.sections),
    items: normalizeManualItems(raw.items),
    cards: normalizeObjectArray(raw.cards, ['title', 'description', 'link', 'href', 'label', 'image', 'imageAlt', 'cta']),
    resources: normalizeObjectArray(raw.resources, ['title', 'description', 'link', 'href', 'label', 'image', 'imageAlt', 'cta']),
    products: normalizeObjectArray(raw.products, ['title', 'description', 'link', 'href', 'label', 'image', 'imageAlt', 'cta']),
    features: normalizeObjectArray(raw.features, ['icon', 'title', 'description', 'href', 'label']),
    brandPathSection: normalizeBrandPathSection(raw.brandPathSection),
    browseByTopicSection: normalizeBrowseByTopicSection(raw.browseByTopicSection),
    goals: normalizeGoalsData(raw.goals),
    featureHeading: normalizeManualContentBlock(raw.featureHeading),
    introBlock: normalizeManualContentBlock(raw.intro),
    partnerHeading: normalizeManualContentBlock(raw.partnerHeading),
    advice: normalizeManualContentBlock(raw.advice),
    supportList: normalizeManualListBlock(raw.supportList),
    calloutCards: normalizeObjectArray(mergedCalloutCards, ['title', 'description', 'href', 'label', 'image']),
    promoCards: normalizeObjectArray(raw.promoCards, ['title', 'description', 'href', 'label', 'image']),
    filterGroups: normalizeManualFilterGroups(raw.filterGroups),
    jobs: normalizeManualJobs(raw.jobs),
    jobsSummary: toNullableString(raw.jobsSummary),
    hero: normalizePlainObject(raw.hero, ['title', 'summary', 'image']),
    frame: raw.frame && typeof raw.frame === 'object'
      ? pruneEmptyValues({
        src: toNullableString(raw.frame.src),
        height: raw.frame.height ?? null
      })
      : null,
    promo: normalizePlainObject(raw.promo, ['href', 'label', 'text', 'title']),
    spotlight: raw.spotlight && typeof raw.spotlight === 'object'
      ? pruneEmptyValues(normalizePlainObject(raw.spotlight, ['caption', 'description', 'posterImage', 'videoUrl']))
      : null,
    legacyRoutePath: routePath
  };

  return pruneEmptyValues(clean);
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => toNullableString(item))
    .filter(Boolean);
}

function normalizeObjectArray(value, keys) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => normalizePlainObject(item, keys))
    .map((item) => pruneEmptyValues(item))
    .filter((item) => item && Object.keys(item).length > 0);
}

function normalizeDownloadGroups(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((group) => ({
      title: toNullableString(group?.title),
      entries: Array.isArray(group?.entries)
        ? group.entries
          .map((entry) => pruneEmptyValues(normalizePlainObject(entry, ['href', 'language', 'name', 'reference'])))
          .filter((entry) => entry && Object.keys(entry).length > 0)
        : []
    }))
    .map((group) => pruneEmptyValues(group))
    .filter((group) => group && Object.keys(group).length > 0);
}

function normalizeSupplementalSections(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((section) => pruneEmptyValues({
      title: toNullableString(section?.title),
      paragraphs: normalizeStringArray(section?.paragraphs),
      htmlBlocks: normalizeStringArray(section?.htmlBlocks)
    }))
    .filter((section) => section && Object.keys(section).length > 0);
}

function normalizeBrandPathSection(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return pruneEmptyValues({
    title: toNullableString(value.title),
    intro: toNullableString(value.intro),
    cards: normalizeObjectArray(value.cards, ['title', 'description', 'href', 'label'])
  });
}

function normalizeManualContentBlock(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return pruneEmptyValues({
    title: toNullableString(value.title),
    body: toNullableString(value.body),
    statement: toNullableString(value.statement),
    image: toNullableString(value.image),
    paragraphs: normalizeLooseStringContent(value.paragraphs),
    action: value.action && typeof value.action === 'object'
      ? pruneEmptyValues(normalizePlainObject(value.action, ['href', 'label']))
      : null
  });
}

function normalizeManualListBlock(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return pruneEmptyValues({
    title: toNullableString(value.title),
    items: normalizeStringArray(value.items)
  });
}

function normalizeManualSections(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((section) => pruneEmptyValues({
      title: toNullableString(section?.title),
      description: toNullableString(section?.description),
      links: normalizeObjectArray(section?.links, ['title', 'description', 'href', 'label']),
      items: normalizeObjectArray(section?.items, ['title', 'description', 'href', 'label'])
    }))
    .filter((section) => section && Object.keys(section).length > 0);
}

function normalizeManualItems(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => pruneEmptyValues({
      title: toNullableString(item?.title),
      description: toNullableString(item?.description),
      href: toNullableString(item?.href),
      label: toNullableString(item?.label),
      image: toNullableString(item?.image),
      groups: normalizeManualSections(item?.groups)
    }))
    .filter((item) => item && Object.keys(item).length > 0);
}

function normalizeGoalsData(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return pruneEmptyValues({
    items: normalizeObjectArray(value.items, ['title', 'description', 'href', 'cta', 'icon', 'image'])
  });
}

function normalizeManualFilterGroups(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((group) => pruneEmptyValues({
      title: toNullableString(group?.title),
      items: normalizeStringArray(group?.items)
    }))
    .filter((group) => group && Object.keys(group).length > 0);
}

function normalizeManualJobs(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((job) => pruneEmptyValues({
      title: toNullableString(job?.title),
      summary: toNullableString(job?.summary),
      href: toNullableString(job?.href),
      businessArea: toNullableString(job?.businessArea),
      location: toNullableString(job?.location),
      postedDate: toNullableString(job?.postedDate),
      closingDate: toNullableString(job?.closingDate)
    }))
    .filter((job) => job && Object.keys(job).length > 0);
}

function normalizeLooseStringContent(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') {
          return toNullableString(item);
        }
        if (item && typeof item === 'object') {
          if (Array.isArray(item.paragraphs)) {
            return item.paragraphs
              .map((entry) => toNullableString(entry))
              .filter(Boolean);
          }
          return toNullableString(item.body || item.statement || item.description || item.title);
        }
        return toNullableString(item);
      })
      .flat()
      .filter(Boolean);
  }
  if (value && typeof value === 'object') {
    if (Array.isArray(value.paragraphs)) {
      return value.paragraphs
        .map((item) => toNullableString(item))
        .filter(Boolean);
    }
    const objectText = toNullableString(value.body || value.statement || value.description || value.title);
    return objectText ? [objectText] : [];
  }
  const single = toNullableString(value);
  return single ? [single] : [];
}

function normalizeBrowseByTopicSection(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return pruneEmptyValues({
    cards: normalizeObjectArray(value.cards, ['title', 'description', 'href', 'label'])
  });
}

function normalizeTopPanelData(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return pruneEmptyValues({
    eyebrow: toNullableString(value.eyebrow),
    description: toNullableString(value.description),
    ctaHref: toNullableString(value.ctaHref),
    ctaLabel: toNullableString(value.ctaLabel),
    specLabel: toNullableString(value.specLabel),
    quantityLabel: toNullableString(value.quantityLabel),
    quantityDefault: value.quantityDefault ?? null,
    highlights: normalizeStringArray(value.highlights),
    quickFacts: normalizeObjectArray(value.quickFacts, ['label', 'value']),
    specOptions: normalizeObjectArray(value.specOptions, ['label', 'value'])
  });
}

function normalizePlainObject(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const output = {};
  for (const key of keys) {
    const normalized = toNullableString(value[key]);
    if (normalized) {
      output[key] = normalized;
    }
  }
  return output;
}

function pruneEmptyValues(value) {
  if (Array.isArray(value)) {
    const next = value
      .map((item) => pruneEmptyValues(item))
      .filter((item) => {
        if (item == null) {
          return false;
        }
        if (Array.isArray(item)) {
          return item.length > 0;
        }
        if (typeof item === 'object') {
          return Object.keys(item).length > 0;
        }
        return item !== '';
      });
    return next;
  }

  if (!value || typeof value !== 'object') {
    return value ?? null;
  }

  const output = {};
  for (const [key, raw] of Object.entries(value)) {
    const normalized = pruneEmptyValues(raw);
    if (normalized == null) {
      continue;
    }
    if (Array.isArray(normalized) && normalized.length === 0) {
      continue;
    }
    if (typeof normalized === 'object' && !Array.isArray(normalized) && Object.keys(normalized).length === 0) {
      continue;
    }
    if (normalized === '') {
      continue;
    }
    output[key] = normalized;
  }
  return output;
}

function buildLegacyExtraMatchKey(key) {
  return `"key":"${String(key || '').replaceAll('"', '\\"')}"`;
}

function mergeLegacyExtra(existingValue, nextValues) {
  const base = parseLegacyExtra(existingValue);
  return JSON.stringify({
    ...base,
    ...nextValues
  });
}

function parseLegacyExtra(value) {
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

function escapeSqlLike(value) {
  return String(value || '').replaceAll('%', '\\%').replaceAll('_', '\\_');
}

function pseudoId(key) {
  const hash = createHash('md5').update(key).digest('hex').slice(0, 8);
  return Number.parseInt(hash, 16);
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function renderInfoSection(title, content) {
  const inner = renderRichTextBlock(content);
  if (!title && !inner) {
    return '';
  }

  if (!title) {
    return `<section class="cms-import-block">\n${inner}\n</section>`;
  }

  return `<section class="cms-import-block">\n<h2>${escapeHtml(title)}</h2>\n${inner}\n</section>`;
}

function renderRichTextBlock(input) {
  const normalized = normalizeMdxText(input);
  if (!normalized) {
    return '';
  }

  const lines = normalized.split('\n');
  const blocks = [];
  let paragraphLines = [];
  let listItems = [];

  const flushParagraph = () => {
    if (paragraphLines.length === 0) {
      return;
    }
    const html = renderInlineMarkdown(paragraphLines.join(' ').trim());
    if (html) {
      blocks.push(`<p>${html}</p>`);
    }
    paragraphLines = [];
  };

  const flushList = () => {
    if (listItems.length === 0) {
      return;
    }
    blocks.push(`<ul>${listItems.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join('')}</ul>`);
    listItems = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      const level = Math.min(6, headingMatch[1].length);
      const headingText = renderInlineMarkdown(headingMatch[2].trim());
      if (headingText) {
        blocks.push(`<h${level}>${headingText}</h${level}>`);
      }
      continue;
    }

    const imageOnlyMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imageOnlyMatch) {
      flushParagraph();
      flushList();
      const [, alt, src] = imageOnlyMatch;
      blocks.push(`<p><img src="${escapeAttribute(src.trim())}" alt="${escapeAttribute(alt.trim())}" loading="lazy" /></p>`);
      continue;
    }

    const listMatch = line.match(/^[-*]\s+(.*)$/);
    if (listMatch) {
      flushParagraph();
      listItems.push(listMatch[1].trim());
      continue;
    }

    if (listItems.length > 0) {
      const continuation = line.replace(/^\s+/, '');
      listItems[listItems.length - 1] = `${listItems[listItems.length - 1]} ${continuation}`.trim();
      continue;
    }

    paragraphLines.push(line);
  }

  flushParagraph();
  flushList();

  return blocks.join('\n');
}

function normalizeMdxText(input) {
  return String(input || '')
    .replace(/\r\n?/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?Fragment>/g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/<\/?(?:ProductDetailPage|ProductCategoryPage|StructuredInfoPage)[^>]*>/g, '')
    .replace(/\{pageData\.[^}]+\}/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function renderInlineMarkdown(input) {
  const imageTokens = [];
  let html = escapeHtml(input);

  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => {
    const token = `__CMS_IMAGE_${imageTokens.length}__`;
    imageTokens.push(`<img src="${escapeAttribute(String(src || '').trim())}" alt="${escapeAttribute(String(alt || '').trim())}" loading="lazy" />`);
    return token;
  });

  html = html
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/_([^_]+)_/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');

  for (let index = 0; index < imageTokens.length; index += 1) {
    html = html.replace(`__CMS_IMAGE_${index}__`, imageTokens[index]);
  }

  return html;
}

function escapeAttribute(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
