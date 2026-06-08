import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb } from '../src/db.mjs';
import { CONTENT_ROOT } from '../src/config.mjs';
import { getSiteConfig } from '../src/services/site.mjs';
import { looksLikeLegacyMojibake, repairLegacyMojibake } from '../src/utils/legacy-text.mjs';

const CATEGORY_KEYWORD_FALLBACKS = new Map([
  [505, '不锈钢100目过滤器|100目过滤器价格|100目过滤器生产厂家']
]);
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

export function runLegacyEncodingRepair({ write = false, logger = console.log } = {}) {
  const db = getDb();
  const state = {
    changedRows: 0,
    changedFields: 0,
    write,
    logger
  };

  repairSiteConfig(db, state);
  repairProductsFromLegacyHtml(db, state);
  repairProductMetadata(db, state);
  repairProductCategories(db, state);
  repairNewsMetadata(db, state);
  repairCustomLabels(db, state);

  const summary = state.changedFields === 0
    ? 'No legacy-encoding issues detected.'
    : (
      write
        ? `Applied legacy-encoding repairs to ${state.changedFields} fields across ${state.changedRows} rows.`
        : `Dry run complete. ${state.changedFields} fields across ${state.changedRows} rows can be repaired. Re-run with --write to apply changes.`
    );

  logger(summary);
  return {
    changedFields: state.changedFields,
    changedRows: state.changedRows,
    summary
  };
}

const entryFilePath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === entryFilePath) {
  runLegacyEncodingRepair({ write: process.argv.includes('--write') });
}

function repairSiteConfig(db, state) {
  const row = db.prepare('SELECT id, icp_number FROM site_config WHERE id = 1').get();
  if (!row || typeof row.icp_number !== 'string') {
    return;
  }

  const repaired = repairLegacyMojibake(row.icp_number);
  if (repaired === row.icp_number) {
    return;
  }

  recordUpdate(state, 'site_config', row.id, 'icp_number', row.icp_number, repaired);
  if (state.write) {
    db.prepare('UPDATE site_config SET icp_number = ? WHERE id = ?').run(repaired, row.id);
  }
}

function repairProductsFromLegacyHtml(db, state) {
  const rows = db.prepare(`
    SELECT id, name, code, keywords
    FROM products
    ORDER BY id ASC
  `).all();

  for (const row of rows) {
    if (!looksLikeLegacyMojibake(row.name) && !looksLikeLegacyMojibake(row.code) && !looksLikeLegacyMojibake(row.keywords)) {
      continue;
    }

    const html = readLegacyProductHtml(row.id);
    if (!html) {
      continue;
    }

    const updates = [];
    const name = extractMeta(html, 'classification');
    const code = extractProductModel(html);
    const keywords = extractMeta(html, 'keywords');

    if (name && name !== row.name) {
      updates.push({ column: 'name', before: row.name, after: name });
    }
    if (code && code !== row.code) {
      updates.push({ column: 'code', before: row.code, after: code });
    }
    if (keywords && keywords !== row.keywords) {
      updates.push({ column: 'keywords', before: row.keywords, after: keywords });
    }

    applyRowUpdates(db, state, 'products', 'id', row.id, updates);
  }
}

function repairProductCategories(db, state) {
  const categories = db.prepare(`
    SELECT id, name, seo_keywords, seo_description
    FROM product_categories
    ORDER BY id ASC
  `).all();

  for (const category of categories) {
    const updates = [];

    if (looksLikeLegacyMojibake(category.name)) {
      const repairedName = repairLegacyMojibake(category.name);
      if (repairedName !== category.name) {
        updates.push({ column: 'name', before: category.name, after: repairedName });
      }
    }

    if (looksLikeLegacyMojibake(category.seo_keywords) || looksLikeLegacyMojibake(category.seo_description)) {
      const featuredProduct = findCategoryFeaturedProduct(db, category.id);

      if (looksLikeLegacyMojibake(category.seo_keywords) && featuredProduct?.keywords) {
        updates.push({
          column: 'seo_keywords',
          before: category.seo_keywords,
          after: featuredProduct.keywords
        });
      } else if (looksLikeLegacyMojibake(category.seo_keywords) && CATEGORY_KEYWORD_FALLBACKS.has(category.id)) {
        updates.push({
          column: 'seo_keywords',
          before: category.seo_keywords,
          after: CATEGORY_KEYWORD_FALLBACKS.get(category.id)
        });
      }

      if (looksLikeLegacyMojibake(category.seo_description) && featuredProduct?.summary) {
        updates.push({
          column: 'seo_description',
          before: category.seo_description,
          after: featuredProduct.summary
        });
      }
    }

    applyRowUpdates(db, state, 'product_categories', 'id', category.id, dedupeUpdates(updates));
  }
}

function repairProductMetadata(db, state) {
  const rows = db.prepare(`
    SELECT id, name, code, summary, keywords
    FROM products
    ORDER BY id ASC
  `).all();

  for (const row of rows) {
    if (!needsProductMetadataRepair(row)) {
      continue;
    }

    const updates = [];
    const name = normalizeProductName(row.name);
    const code = normalizeProductCode(row.code);
    const summary = resolveProductSummary(row);
    const keywords = resolveProductKeywords(row, summary);

    if (name && name !== row.name) {
      updates.push({ column: 'name', before: row.name, after: name });
    }
    if (code && code !== row.code) {
      updates.push({ column: 'code', before: row.code, after: code });
    }
    if (summary && summary !== row.summary) {
      updates.push({ column: 'summary', before: row.summary, after: summary });
    }
    if (keywords && keywords !== row.keywords) {
      updates.push({ column: 'keywords', before: row.keywords, after: keywords });
    }

    applyRowUpdates(db, state, 'products', 'id', row.id, dedupeUpdates(updates));
  }
}

function repairNewsMetadata(db, state) {
  const rows = db.prepare(`
    SELECT id, title, summary, keywords, content_html
    FROM news
    ORDER BY id ASC
  `).all();

  for (const row of rows) {
    if (!needsNewsMetadataRepair(row)) {
      continue;
    }

    const updates = [];
    const summary = resolveNewsSummary(row);
    const keywords = resolveNewsKeywords(row, summary);

    if (summary && summary !== row.summary) {
      updates.push({ column: 'summary', before: row.summary, after: summary });
    }
    if (keywords && keywords !== row.keywords) {
      updates.push({ column: 'keywords', before: row.keywords, after: keywords });
    }

    applyRowUpdates(db, state, 'news', 'id', row.id, dedupeUpdates(updates));
  }
}

function repairCustomLabels(db, state) {
  const site = getSiteConfig();
  const rows = db.prepare(`
    SELECT id, name, content
    FROM custom_labels
    WHERE coalesce(content, '') <> ''
    ORDER BY id ASC
  `).all();

  for (const row of rows) {
    const normalized = normalizeCustomLabelContent(row.content, site);
    if (!normalized || normalized === row.content) {
      continue;
    }

    applyRowUpdates(db, state, 'custom_labels', 'id', row.id, [
      { column: 'content', before: row.content, after: normalized }
    ]);
  }
}

function applyRowUpdates(db, state, table, keyColumn, keyValue, updates) {
  if (updates.length === 0) {
    return;
  }

  state.changedRows += 1;
  state.changedFields += updates.length;

  for (const update of updates) {
    recordUpdate(state, table, keyValue, update.column, update.before, update.after);
  }

  if (!state.write) {
    return;
  }

  const setClause = updates.map(({ column }) => `${column} = ?`).join(', ');
  const values = updates.map(({ after }) => after);
  db.prepare(`UPDATE ${table} SET ${setClause} WHERE ${keyColumn} = ?`).run(...values, keyValue);
}

function findCategoryFeaturedProduct(db, categoryId) {
  return db.prepare(`
    WITH RECURSIVE category_tree(id) AS (
      SELECT id
      FROM product_categories
      WHERE id = ?
      UNION ALL
      SELECT child.id
      FROM product_categories child
      INNER JOIN category_tree parent ON child.parent_id = parent.id
    )
    SELECT keywords, summary
    FROM products
    WHERE category_id IN (SELECT id FROM category_tree)
      AND coalesce(keywords, '') <> ''
    ORDER BY sort_order ASC, id ASC
    LIMIT 1
  `).get(categoryId);
}

function recordUpdate(state, table, keyValue, column, before, after) {
  state.logger(`${table}.${column}#${keyValue}: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
}

function needsNewsMetadataRepair(row) {
  return (
    looksLikeLegacyMojibake(row.summary) ||
    looksLikeLegacyMojibake(row.keywords) ||
    hasLegacyMarketingText(row.summary) ||
    hasLegacyMarketingText(row.keywords)
  );
}

function needsProductMetadataRepair(row) {
  return (
    hasLegacyMarketingText(row.name) ||
    hasLegacyMarketingText(row.code) ||
    hasLegacyMarketingText(row.summary) ||
    hasLegacyMarketingText(row.keywords) ||
    hasLegacyProductBrandText(row.name) ||
    hasLegacyProductBrandText(row.code) ||
    hasLegacyProductBrandText(row.summary) ||
    hasLegacyProductBrandText(row.keywords)
  );
}

function normalizeProductName(value) {
  const normalized = normalizePlainText(value, { stripProductBrand: true });
  return normalized && !looksLikeLegacyMojibake(normalized) ? normalized : null;
}

function normalizeProductCode(value) {
  const normalized = normalizePlainText(value, { stripProductBrand: true });
  return normalized && !looksLikeLegacyMojibake(normalized) ? normalized : null;
}

function resolveProductSummary(row) {
  const summary = normalizePlainText(row.summary, { stripProductBrand: true });
  if (summary && !looksLikeLegacyMojibake(summary)) {
    return truncateText(summary, 220);
  }

  const keywords = normalizeProductKeywordList(row.keywords);
  if (keywords) {
    return truncateText(keywords.replace(/[|]+/g, '，'), 220);
  }

  return truncateText(normalizeProductName(row.name), 220);
}

function resolveProductKeywords(row, fallbackSummary) {
  const keywords = normalizeProductKeywordList(row.keywords);
  if (keywords) {
    return truncateText(keywords, 220);
  }

  const summary = normalizePlainText(row.summary, { stripProductBrand: true });
  if (summary && !looksLikeLegacyMojibake(summary)) {
    return truncateText(summary, 220);
  }

  if (fallbackSummary) {
    return truncateText(fallbackSummary, 220);
  }

  return truncateText(normalizeProductName(row.name), 220);
}

function normalizeProductKeywordList(value) {
  if (looksLikeLegacyMojibake(value)) {
    return null;
  }
  const parts = String(value || '')
    .split(/[|,，]+/)
    .map((item) => normalizePlainText(item, { stripProductBrand: true }))
    .filter(Boolean);

  return parts.length > 0 ? Array.from(new Set(parts)).join('|') : null;
}

function resolveNewsSummary(row) {
  const summary = normalizePlainText(row.summary);
  if (summary && !looksLikeLegacyMojibake(row.summary)) {
    return truncateText(summary, 220);
  }

  const keywords = normalizePlainText(row.keywords);
  if (keywords && !looksLikeLegacyMojibake(row.keywords)) {
    return truncateText(keywords, 220);
  }

  const title = normalizePlainText(row.title);
  if (title && !looksLikeLegacyMojibake(row.title)) {
    return truncateText(title, 220);
  }

  const contentSummary = extractHtmlPlainText(row.content_html);
  if (contentSummary) {
    return truncateText(contentSummary, 220);
  }

  return truncateText(title, 220);
}

function resolveNewsKeywords(row, fallbackSummary) {
  const keywords = normalizePlainText(row.keywords);
  if (keywords && !looksLikeLegacyMojibake(row.keywords)) {
    return truncateText(keywords, 220);
  }

  const summary = normalizePlainText(row.summary);
  if (summary && !looksLikeLegacyMojibake(row.summary)) {
    return truncateText(summary, 220);
  }

  const title = normalizePlainText(row.title);
  if (title && !looksLikeLegacyMojibake(row.title)) {
    return truncateText(title, 220);
  }

  if (fallbackSummary) {
    return truncateText(fallbackSummary, 220);
  }

  return truncateText(title, 220);
}

function readLegacyProductHtml(id) {
  const filePath = path.join(CONTENT_ROOT, 'product', `${id}.html`);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return fs.readFileSync(filePath, 'utf8');
}

function extractMeta(html, name) {
  const pattern = new RegExp(`<meta\\s+name="${escapeRegExp(name)}"\\s+content="([^"]*)"`, 'i');
  const match = html.match(pattern);
  return cleanHtmlText(match?.[1] || '');
}

function extractProductModel(html) {
  const match = html.match(/产品型号：<\/td><td[^>]*>([\s\S]*?)<\/td>/i);
  return cleanHtmlText(match?.[1] || '');
}

function cleanHtmlText(value) {
  return decodeEntities(String(value))
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractHtmlPlainText(value) {
  const normalized = normalizePlainText(
    String(value || '')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/p>/gi, ' ')
      .replace(/<\/div>/gi, ' ')
      .replace(/<\/li>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  );
  return normalized && !looksLikeLegacyMojibake(normalized) ? normalized : null;
}

function normalizePlainText(value, { stripProductBrand = false } = {}) {
  let output = decodeEntities(String(value || ''))
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  for (const pattern of LEGACY_MARKETING_PATTERNS) {
    output = output.replace(pattern, ' ');
  }
  if (stripProductBrand) {
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

function truncateText(value, maxLength = 220) {
  if (!value) {
    return null;
  }
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function decodeEntities(value) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&');
}

function dedupeUpdates(updates) {
  const seen = new Set();
  return updates.filter((update) => {
    const key = `${update.column}:${update.after}`;
    if (seen.has(key) || update.before === update.after || !update.after) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasLegacyMarketingText(value) {
  const text = String(value || '');
  return LEGACY_MARKETING_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });
}

function hasLegacyProductBrandText(value) {
  const text = String(value || '');
  return LEGACY_PRODUCT_BRAND_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });
}

function normalizeCustomLabelContent(value, site) {
  const companyName = site.company_name || site.web_name || '';
  const companyPhone = site.company_phone || '';
  const companyFax = site.company_fax || '';
  const companyMobile = site.web_mobile || '';
  const companyEmail = site.company_email || '';
  const siteUrl = site.web_url || '/';

  return String(value || '')
    .replace(/https?:\/\/(?:www\.)?bilvie\.com\/?/gi, siteUrl)
    .replace(/https?:\/\/(?:www\.)?bilwe\.com\/?/gi, siteUrl)
    .replace(/彪维阀门品牌/gi, '斯派莎克阀门品牌')
    .replace(/彪维流体设备/gi, companyName)
    .replace(/彪维流体设备（上海）有限公司|彪维流体设备\(上海\)有限公司|彪维阀门有限公司/gi, companyName)
    .replace(/全国服务电话：\s*021-51602737/gi, companyPhone ? `全国服务电话：${companyPhone}` : '')
    .replace(/TEL:\s*021-51602737\s*18121314445/gi, buildLegacyTelText(companyPhone, companyMobile))
    .replace(/电话:\s*021-51602737/gi, companyPhone ? `电话:${companyPhone}` : '')
    .replace(/传真:\s*021-51062757/gi, companyFax ? `传真:${companyFax}` : '')
    .replace(/info@(?:<strong>)?spiraxsarcocn(?:<\/strong>)?\.com/gi, companyEmail);
}

function buildLegacyTelText(companyPhone, companyMobile) {
  if (companyPhone && companyMobile) {
    return `TEL:${companyPhone} ${companyMobile}`;
  }
  if (companyPhone) {
    return `TEL:${companyPhone}`;
  }
  if (companyMobile) {
    return `TEL:${companyMobile}`;
  }
  return '';
}
