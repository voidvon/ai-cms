import { queryAll } from '../src/db.mjs';
import { getSiteConfig, updateSiteConfig } from '../src/services/site.mjs';

const GROUP_RENAMES = new Map([
  ['产品栏目', '托管栏目'],
  ['产品详情', '托管内容'],
  ['Product categories', 'Managed categories'],
  ['Product details', 'Managed details']
]);

const VALUE_RENAMES = new Map([
  ['产品栏目', '托管栏目'],
  ['产品详情', '托管内容'],
  ['产品中心', '托管内容中心'],
  ['产品分类导航与产品列表入口。', '托管内容分类导航与列表入口。'],
  ['产品分类：', '托管内容分类：'],
  ['产品详情：', '托管内容详情：'],
  ['Product categories', 'Managed categories'],
  ['Product details', 'Managed details'],
  ['Product hub', 'Managed content hub'],
  ['Product category navigation and product listing entry.', 'Managed content category navigation and listing entry.'],
  ['Product category:', 'Managed content category:'],
  ['Product detail:', 'Managed content detail:']
]);

function renameValue(value) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return value;
  }
  return VALUE_RENAMES.get(normalized) || value;
}

function renameArray(values) {
  if (!Array.isArray(values)) {
    return values;
  }
  return values.map((item) => GROUP_RENAMES.get(String(item || '').trim()) || item);
}

function migrateLlmsConfig(templateData) {
  if (!templateData || typeof templateData !== 'object') {
    return templateData;
  }

  const ui = templateData.ui;
  if (!ui || typeof ui !== 'object') {
    return templateData;
  }

  const llms = ui.llms;
  if (!llms || typeof llms !== 'object') {
    return templateData;
  }

  const nextLlms = { ...llms };
  for (const key of ['productSection', 'productDetailSection', 'productHub', 'productHubSummary', 'productCategoryPrefix', 'productDetailPrefix']) {
    if (Object.prototype.hasOwnProperty.call(nextLlms, key)) {
      nextLlms[key] = renameValue(nextLlms[key]);
    }
  }
  if (Object.prototype.hasOwnProperty.call(nextLlms, 'groupOrder')) {
    nextLlms.groupOrder = renameArray(nextLlms.groupOrder);
  }
  if (Object.prototype.hasOwnProperty.call(nextLlms, 'listSections')) {
    nextLlms.listSections = renameArray(nextLlms.listSections);
  }
  if (Object.prototype.hasOwnProperty.call(nextLlms, 'detailSections')) {
    nextLlms.detailSections = renameArray(nextLlms.detailSections);
  }

  return {
    ...templateData,
    ui: {
      ...ui,
      llms: nextLlms
    }
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
    template_data_json: migrateLlmsConfig(translations[code].template_data || {})
  };
}

await updateSiteConfig({
  ...current,
  translations
});

console.log(`Updated LLMS managed labels for ${languages.length} site translations.`);
