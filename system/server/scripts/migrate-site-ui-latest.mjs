import { queryAll } from '../src/db.mjs';
import { getSiteConfig, updateSiteConfig } from '../src/services/site.mjs';

function stringOr(...values) {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) {
      return text;
    }
  }
  return '';
}

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function migrateTemplateData(templateData) {
  if (!templateData || typeof templateData !== 'object' || Array.isArray(templateData)) {
    return templateData;
  }

  const ui = normalizeObject(templateData.ui);
  const nav = normalizeObject(ui.nav);
  const legacy = normalizeObject(ui.legacy);
  const llms = normalizeObject(ui.llms);
  const text = normalizeObject(ui.text);
  const footer = normalizeObject(ui.footer);
  const footerSections = normalizeObject(footer.sections);

  const nextText = {
    ...text,
    contactUs: stringOr(text.contactUs, legacy.contactUs, nav.contactLabel),
    pageTree: stringOr(text.pageTree, legacy.pageTree, '单页栏目'),
    managedRoot: stringOr(text.managedRoot, legacy.productRoot, '内容'),
    newsSection: stringOr(text.newsSection, legacy.newsSection, '公司新闻'),
    categoryDirectory: stringOr(text.categoryDirectory, legacy.categoryDirectory, '分类目录'),
    noPreviousArticle: stringOr(text.noPreviousArticle, legacy.noPreviousArticle, '没有上一篇'),
    noNextArticle: stringOr(text.noNextArticle, legacy.noNextArticle, '没有下一篇'),
    pagerFirst: stringOr(text.pagerFirst, legacy.pagerFirst, '首页'),
    pagerPrevious: stringOr(text.pagerPrevious, legacy.pagerPrevious, '上一页'),
    pagerNext: stringOr(text.pagerNext, legacy.pagerNext, '下一页'),
    pagerLast: stringOr(text.pagerLast, legacy.pagerLast, '末页'),
    pagerLastAlt: stringOr(text.pagerLastAlt, legacy.pagerLastAlt, legacy.pagerLast, '尾页'),
    pagerRecordsPrefix: stringOr(text.pagerRecordsPrefix, legacy.pagerRecordsPrefix, '共'),
    pagerRecordsSuffix: stringOr(text.pagerRecordsSuffix, legacy.pagerRecordsSuffix, '条信息'),
    pagerPageLabel: stringOr(text.pagerPageLabel, legacy.pagerPageLabel, '页次：'),
    pagerPerPageSuffix: stringOr(text.pagerPerPageSuffix, legacy.pagerPerPageSuffix, '条信息/页'),
    noRelatedItems: stringOr(text.noRelatedItems, legacy.noRelatedProducts, '暂无相关内容'),
    relatedItems: stringOr(text.relatedItems, legacy.relatedProducts, '相关内容')
  };

  const nextLlms = {
    ...llms,
    managedSection: stringOr(llms.managedSection, llms.productSection, '托管栏目'),
    managedDetailSection: stringOr(llms.managedDetailSection, llms.productDetailSection, '托管内容'),
    managedHub: stringOr(llms.managedHub, llms.productHub, nextText.managedRoot, '托管内容'),
    managedHubSummary: stringOr(llms.managedHubSummary, llms.productHubSummary),
    managedCategoryPrefix: stringOr(llms.managedCategoryPrefix, llms.productCategoryPrefix),
    managedDetailPrefix: stringOr(llms.managedDetailPrefix, llms.productDetailPrefix)
  };

  delete nextLlms.productSection;
  delete nextLlms.productDetailSection;
  delete nextLlms.productHub;
  delete nextLlms.productHubSummary;
  delete nextLlms.productCategoryPrefix;
  delete nextLlms.productDetailPrefix;

  const nextUi = {
    ...ui,
    footer: {
      ...footer,
      sections: {
        ...footerSections,
        managedRoot: stringOr(footerSections.managedRoot, footerSections.products, nextText.managedRoot)
      }
    },
    text: nextText,
    llms: nextLlms
  };

  delete nextUi.legacy;
  delete nextUi.product;
  if (nextUi.nav && typeof nextUi.nav === 'object' && !Array.isArray(nextUi.nav)) {
    const nextMainLabels = normalizeObject(nextUi.nav.mainLabels);
    delete nextMainLabels.products;
    nextUi.nav = {
      ...nextUi.nav,
      mainLabels: nextMainLabels
    };
  }
  if (nextUi.footer?.sections && typeof nextUi.footer.sections === 'object' && !Array.isArray(nextUi.footer.sections)) {
    delete nextUi.footer.sections.products;
  }

  return {
    ...templateData,
    ui: nextUi
  };
}

const languages = queryAll(`
  SELECT l.code
  FROM site_config_translations t
  INNER JOIN languages l ON l.id = t.language_id
  WHERE t.site_config_id = 1
  ORDER BY l.sort_order ASC, l.id ASC
`);

const current = getSiteConfig(null, { includeTranslations: true });
const translations = { ...(current.translations || {}) };

for (const row of languages) {
  const code = String(row.code || '').trim();
  if (!code || !translations[code]) {
    continue;
  }
  translations[code] = {
    ...translations[code],
    template_data_json: migrateTemplateData(translations[code].template_data || {})
  };
}

updateSiteConfig({
  ...current,
  translations
});

console.log(`Migrated latest site UI structure for ${languages.length} site translations.`);
