import { execute, getDb, queryAll, queryOne } from '../db.mjs';
import { detachTemplateFromAllThemeVariants, getSelectedTemplateVariant, listTemplateVariantComponents } from './template-variants.mjs';
import { createTsxTemplateElement, renderTsxTemplate } from '../tsx-template-renderer.mjs';
import { getTsxTemplateStyleAsset } from '../tsx-template-styles.mjs';
import { escapeHtml } from '../utils/html.mjs';
import { listProducts } from './products.mjs';
import { listNews } from './news.mjs';
import { listColumnCategories } from './column-categories.mjs';
import { buildColumnPublicUrl, resolvePublicSectionContext } from './public-sections.mjs';

export const TEMPLATE_TYPES = ['home', 'list', 'content', 'component'];
export const TEMPLATE_ENGINES = ['tsx'];
const MAX_TEMPLATE_VERSIONS = 10;
const CONTENT_TYPE_PRODUCT_ID = 1;
const CONTENT_TYPE_ARTICLE_ID = 2;
const CONTENT_TYPE_CONTACT_ID = 4;
const CONTENT_TYPE_CORPORATION_ID = 6;

let schemaEnsured = false;

export function ensureTemplatesSchema() {
  if (schemaEnsured) {
    return;
  }

  getDb().exec(`
    CREATE TABLE IF NOT EXISTS templates (
      id INTEGER PRIMARY KEY,
      theme_id INTEGER,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('home', 'list', 'content', 'component')),
      code TEXT NOT NULL,
      engine TEXT NOT NULL DEFAULT 'tsx' CHECK (engine IN ('tsx')),
      content TEXT NOT NULL DEFAULT '',
      published_content TEXT,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
      is_default INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      published_at TEXT,
      UNIQUE (theme_id, code)
    );

    CREATE TABLE IF NOT EXISTS template_bindings (
      id INTEGER PRIMARY KEY,
      theme_id INTEGER NOT NULL,
      target_type TEXT NOT NULL,
      target_id INTEGER,
      template_type TEXT NOT NULL CHECK (template_type IN ('home', 'list', 'content')),
      template_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (theme_id, target_type, target_id, template_type),
      FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS template_versions (
      id INTEGER PRIMARY KEY,
      template_id INTEGER NOT NULL,
      version_no INTEGER NOT NULL,
      engine TEXT NOT NULL DEFAULT 'tsx',
      content TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE
    );
  `);

  addColumnIfMissing('templates', 'theme_id', 'INTEGER');
  addColumnIfMissing('templates', 'engine', "TEXT NOT NULL DEFAULT 'tsx'");
  addColumnIfMissing('template_bindings', 'theme_id', 'INTEGER');
  addColumnIfMissing('template_versions', 'engine', "TEXT NOT NULL DEFAULT 'tsx'");
  ensureTemplateThemeOwnership();
  ensureTemplateBindingsThemeValues();
  ensureTemplateCodeThemeScope();
  ensureTemplatesEngineConstraint();
  ensureTemplateVersionsForeignKey();
  ensureTemplateVersionsEngineConstraint();
  ensureTemplateBindingsThemeScope();
  reconcileThemeOwnedTemplateAssets();

  getDb().exec(`
    CREATE INDEX IF NOT EXISTS idx_templates_theme_type_sort ON templates(theme_id, type, sort_order, id);
    CREATE INDEX IF NOT EXISTS idx_templates_status ON templates(status);
    CREATE INDEX IF NOT EXISTS idx_template_bindings_theme_target ON template_bindings(theme_id, target_type, target_id, template_type);
    CREATE INDEX IF NOT EXISTS idx_template_versions_template_id ON template_versions(template_id, version_no);
  `);

  schemaEnsured = true;
}

export function listTemplates({ type, themeId } = {}) {
  ensureTemplatesSchema();
  const params = [];
  const whereClauses = [];
  if (type) {
    if (!TEMPLATE_TYPES.includes(type)) {
      throw new Error('invalid template type');
    }
    whereClauses.push('type = ?');
    params.push(type);
  }
  const normalizedThemeId = toInteger(themeId, null);
  if (normalizedThemeId) {
    whereClauses.push('theme_id = ?');
    params.push(normalizedThemeId);
  }
  const where = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  return queryAll(
    `
      SELECT id, theme_id, name, type, code, engine, content, published_content, status, is_default, sort_order, created_at, updated_at, published_at
      FROM templates
      ${where}
      ORDER BY type ASC, sort_order ASC, id ASC
    `,
    params
  );
}

export function getTemplateById(id) {
  ensureTemplatesSchema();
  return queryOne(
    `
      SELECT id, theme_id, name, type, code, engine, content, published_content, status, is_default, sort_order, created_at, updated_at, published_at
      FROM templates
      WHERE id = ?
    `,
    [id]
  ) || null;
}

export function getPublishedTemplateByCode(code, themeId = null) {
  ensureTemplatesSchema();
  const normalizedThemeId = toInteger(themeId, null) || toInteger(getSelectedTemplateVariant()?.id, null);
  const params = [normalizeCode(code)];
  let whereTheme = '';
  if (normalizedThemeId) {
    whereTheme = 'AND theme_id = ?';
    params.push(normalizedThemeId);
  }
  return queryOne(
    `
      SELECT id, theme_id, name, type, code, engine, coalesce(published_content, content) AS content
      FROM templates
      WHERE code = ? AND status = 'published' ${whereTheme}
      LIMIT 1
    `,
    params
  ) || null;
}

export function getPublishedTemplateById(id, themeId = null) {
  ensureTemplatesSchema();
  const normalizedThemeId = toInteger(themeId, null);
  const params = [id];
  let whereTheme = '';
  if (normalizedThemeId) {
    whereTheme = 'AND theme_id = ?';
    params.push(normalizedThemeId);
  }
  return queryOne(
    `
      SELECT id, theme_id, name, type, code, engine, coalesce(published_content, content) AS content
      FROM templates
      WHERE id = ? AND status = 'published' ${whereTheme}
      LIMIT 1
    `,
    params
  ) || null;
}

export function resolvePublishedTemplate({ templateType, targets = [], fallbackCode, fallbackCodes = [] }) {
  ensureTemplatesSchema();
  const selectedTheme = getSelectedTemplateVariant();
  const currentThemeId = toInteger(selectedTheme?.id, null);

  for (const target of targets) {
    const binding = getTemplateBinding(currentThemeId, target.target_type, target.target_id ?? null, templateType);
    if (!binding?.template_id) {
      continue;
    }
    const template = getPublishedTemplateById(binding.template_id, currentThemeId);
    if (template) {
      return template;
    }
  }

  const candidates = [
    ...fallbackCodes,
    fallbackCode
  ].filter(Boolean);

  for (const code of candidates) {
    const template = getPublishedTemplateByCode(code, currentThemeId);
    if (template) {
      return template;
    }
  }

  return null;
}

export function listPublishedComponents() {
  ensureTemplatesSchema();
  const selectedTheme = getSelectedTemplateVariant();
  const currentThemeId = toInteger(selectedTheme?.id, null);
  const params = [];
  const whereTheme = currentThemeId ? 'AND theme_id = ?' : '';
  if (currentThemeId) {
    params.push(currentThemeId);
  }
  return queryAll(
    `
      SELECT code, engine, coalesce(published_content, content) AS content
      FROM templates
      WHERE type = 'component' AND status = 'published' ${whereTheme}
      ORDER BY sort_order ASC, id ASC
    `,
    params
  );
}

export function listTemplateBindings(themeId = null) {
  ensureTemplatesSchema();
  const normalizedThemeId = toInteger(themeId, null);
  const params = [];
  const whereTheme = normalizedThemeId ? 'WHERE b.theme_id = ?' : '';
  if (normalizedThemeId) {
    params.push(normalizedThemeId);
  }
  return queryAll(
    `
      SELECT
        b.id,
        b.theme_id,
        b.target_type,
        b.target_id,
        b.template_type,
        b.template_id,
        b.created_at,
        b.updated_at,
        t.name AS template_name,
        t.code AS template_code
      FROM template_bindings b
      LEFT JOIN templates t ON t.id = b.template_id
      ${whereTheme}
      ORDER BY b.target_type ASC, coalesce(b.target_id, 0) ASC, b.template_type ASC
    `,
    params
  );
}

export function getTemplateBinding(themeId, targetType, targetId, templateType) {
  ensureTemplatesSchema();
  const normalized = normalizeBindingTarget(themeId, targetType, targetId, templateType);
  const whereTargetId = normalized.target_id == null ? 'target_id IS NULL' : 'target_id = ?';
  const params = normalized.target_id == null
    ? [normalized.theme_id, normalized.target_type, normalized.template_type]
    : [normalized.theme_id, normalized.target_type, normalized.target_id, normalized.template_type];

  return queryOne(
    `
      SELECT id, theme_id, target_type, target_id, template_type, template_id, created_at, updated_at
      FROM template_bindings
      WHERE theme_id = ? AND target_type = ? AND ${whereTargetId} AND template_type = ?
      LIMIT 1
    `,
    params
  ) || null;
}

export function upsertTemplateBinding(input) {
  ensureTemplatesSchema();
  const payload = normalizeBindingInput(input);
  const existing = getTemplateBinding(payload.theme_id, payload.target_type, payload.target_id, payload.template_type);
  const now = new Date().toISOString();

  if (existing) {
    execute(
      `
        UPDATE template_bindings
        SET template_id = ?, updated_at = ?
        WHERE id = ?
      `,
      [payload.template_id, now, existing.id]
    );
    return getTemplateBinding(payload.theme_id, payload.target_type, payload.target_id, payload.template_type);
  }

  const result = execute(
    `
      INSERT INTO template_bindings (theme_id, target_type, target_id, template_type, template_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [payload.theme_id, payload.target_type, payload.target_id, payload.template_type, payload.template_id, now, now]
  );
  return queryOne(
    `
      SELECT id, theme_id, target_type, target_id, template_type, template_id, created_at, updated_at
      FROM template_bindings
      WHERE id = ?
    `,
    [result.lastInsertRowid]
  );
}

export function deleteTemplateBinding(id) {
  ensureTemplatesSchema();
  const existing = queryOne(
    'SELECT id, theme_id, target_type, target_id, template_type, template_id FROM template_bindings WHERE id = ?',
    [id]
  );
  if (!existing) {
    return null;
  }
  execute('DELETE FROM template_bindings WHERE id = ?', [id]);
  return existing;
}

export function createTemplate(input) {
  ensureTemplatesSchema();
  const payload = normalizeTemplateInput(input);
  assertTemplateCodeAvailable(payload.theme_id, payload.code);
  const now = new Date().toISOString();
  const result = execute(
    `
      INSERT INTO templates (theme_id, name, type, code, engine, content, published_content, status, is_default, sort_order, created_at, updated_at, published_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      payload.theme_id,
      payload.name,
      payload.type,
      payload.code,
      payload.engine,
      payload.content,
      payload.status === 'published' ? payload.content : null,
      payload.status,
      payload.is_default,
      payload.sort_order,
      now,
      now,
      payload.status === 'published' ? now : null
    ]
  );
  return getTemplateById(result.lastInsertRowid);
}

export function updateTemplate(id, input) {
  const existing = getTemplateById(id);
  if (!existing) {
    return null;
  }

  const payload = normalizeTemplateInput({ ...existing, ...input }, { existing });
  assertTemplateCodeAvailable(payload.theme_id, payload.code, id);
  execute(
    `
      UPDATE templates
      SET theme_id = ?, name = ?, type = ?, code = ?, engine = ?, content = ?, is_default = ?, sort_order = ?, updated_at = ?
      WHERE id = ?
    `,
    [
      payload.theme_id,
      payload.name,
      payload.type,
      payload.code,
      payload.engine,
      payload.content,
      payload.is_default,
      payload.sort_order,
      new Date().toISOString(),
      id
    ]
  );
  return getTemplateById(id);
}

export function publishTemplate(id, note = null) {
  const existing = getTemplateById(id);
  if (!existing) {
    return null;
  }
  validateTemplateForPublish(existing);

  const nextVersion = (queryOne('SELECT coalesce(max(version_no), 0) + 1 AS next_version FROM template_versions WHERE template_id = ?', [id])?.next_version) || 1;
  if (existing.published_content != null) {
    execute(
      'INSERT INTO template_versions (template_id, version_no, engine, content, note, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, nextVersion, existing.engine || 'tsx', existing.published_content, note || '发布前版本', new Date().toISOString()]
    );
    pruneTemplateVersions(id);
  }

  const now = new Date().toISOString();
  execute(
    `
      UPDATE templates
      SET published_content = ?, status = 'published', published_at = ?, updated_at = ?
      WHERE id = ?
    `,
    [existing.content || '', now, now, id]
  );
  return getTemplateById(id);
}

export function deleteTemplate(id) {
  const existing = getTemplateById(id);
  if (!existing) {
    return null;
  }
  const dependencyInfo = getTemplateDependencyInfo(id);
  if (dependencyInfo.referenced_by.length > 0) {
    const names = dependencyInfo.referenced_by.map((item) => item.code).join(', ');
    throw new Error(`模板正在被其他模板引用，不能删除：${names}`);
  }
  if (dependencyInfo.bindings.length > 0) {
    throw new Error('模板已绑定到分类或站点，不能删除，请先取消模板绑定');
  }
  detachTemplateFromAllThemeVariants(existing);
  execute('DELETE FROM templates WHERE id = ?', [id]);
  return existing;
}

export function listTemplateVersions(templateId) {
  ensureTemplatesSchema();
  return queryAll(
    `
      SELECT id, template_id, version_no, engine, content, note, created_at
      FROM template_versions
      WHERE template_id = ?
      ORDER BY version_no DESC, id DESC
    `,
    [templateId]
  );
}

export function restoreTemplateVersion(templateId, versionId) {
  const template = getTemplateById(templateId);
  if (!template) {
    return null;
  }

  const version = queryOne(
    `
      SELECT id, template_id, version_no, engine, content, note, created_at
      FROM template_versions
      WHERE id = ? AND template_id = ?
      LIMIT 1
    `,
    [versionId, template.id]
  );
  if (!version) {
    return null;
  }

  const updated = updateTemplate(template.id, {
    ...template,
    engine: version.engine || template.engine || 'tsx',
    content: version.content || ''
  });
  return publishTemplate(updated.id, `恢复版本 #${version.version_no}`);
}

export function getTemplateDependencyInfo(templateId) {
  ensureTemplatesSchema();
  const template = getTemplateById(templateId);
  if (!template) {
    return null;
  }

  const allTemplates = listTemplates({ themeId: template.theme_id });
  const byCode = new Map(allTemplates.map((item) => [normalizeCode(item.code), item]));
  const targetCode = normalizeCode(template.code);
  const references = extractLiteralComponentReferences(template.content).map((code) => {
    const referenced = byCode.get(code);
    return {
      code,
      exists: Boolean(referenced),
      template_id: referenced?.id || null,
      name: referenced?.name || '',
      type: referenced?.type || '',
      status: referenced?.status || ''
    };
  });

  const referencedBy = [];
  for (const item of allTemplates) {
    if (item.id === template.id) {
      continue;
    }
    const refs = extractLiteralComponentReferences(item.content);
    if (!refs.includes(targetCode)) {
      continue;
    }
    referencedBy.push({
      id: item.id,
      code: item.code,
      name: item.name,
      type: item.type,
      status: item.status
    });
  }

  const bindings = queryAll(
    `
      SELECT id, target_type, target_id, template_type, template_id, created_at, updated_at
      FROM template_bindings
      WHERE template_id = ?
      ORDER BY target_type ASC, coalesce(target_id, 0) ASC, template_type ASC
    `,
    [template.id]
  );

  return {
    template: {
      id: template.id,
      code: template.code,
      name: template.name,
      type: template.type,
      status: template.status
    },
    references,
    referenced_by: referencedBy,
    bindings
  };
}

export function validateTemplateForPublish(template) {
  ensureTemplatesSchema();
  const normalizedTemplate = normalizeTemplateInput(template);
  const content = normalizedTemplate.content || '';
  const errors = [];

  for (const componentCode of extractLiteralComponentReferences(content)) {
    const component = getTemplateByCode(componentCode, normalizedTemplate.theme_id);
    const isSelf = normalizeCode(componentCode) === normalizedTemplate.code;
    if (!component) {
      errors.push(`组件不存在：${componentCode}`);
      continue;
    }
    if (component.type !== 'component') {
      errors.push(`引用的不是组件模板：${componentCode}`);
      continue;
    }
    if (!isSelf && component.status !== 'published') {
      errors.push(`组件未发布：${componentCode}`);
    }
  }

  try {
    renderTsxTemplate(content, buildTemplateValidationProps(normalizedTemplate));
    getTsxTemplateStyleAsset(content, {
      templateCode: normalizedTemplate.code
    });
  } catch (error) {
    errors.push(`TSX 编译或渲染失败：${formatTemplateValidationError(error)}`);
  }

  if (errors.length > 0) {
    throw new Error(`模板发布校验失败：${errors.join('；')}`);
  }

  return { valid: true };
}

export function renderTemplatePreview(input) {
  ensureTemplatesSchema();
  const template = normalizeTemplateInput(input);
  validateTemplateForPublish(template);
  const components = buildPreviewComponentMap(template);
  const props = buildTemplatePreviewProps(template, input?.preview_context);
  const previewState = {
    styleAssets: new Map()
  };
  const html = ensurePreviewBaseHref(injectPreviewTsxStyles(
    renderPreviewTemplate(template, props, components, 0, previewState),
    previewState.styleAssets
  ));
  return { html };
}

function buildTemplatePreviewProps(template, previewContext = {}) {
  const mode = String(previewContext?.mode || 'auto').trim();
  const props = buildTemplateValidationProps(template);
  const effectiveMode = mode === 'auto' ? inferPreviewMode(template) : mode;

  if (effectiveMode === 'home') {
    return {
      ...props,
      currentPage: { type: 'home', title: '首页', url: '/index.html' },
      secondaryMenuItems: buildPreviewRootColumnMenuItems(),
      newsIndexHtml: buildPreviewArticleLinks('/news/detail', 10),
      featuredProductsHtml: buildPreviewFeaturedProductsHtml(),
      featuredProductLinksHtml: buildPreviewProductLinksHtml(),
      serviceIndexHtml: buildPreviewArticleLinks('/service/detail', 10)
    };
  }

  if (effectiveMode === 'product-list') {
    const category = getPreviewProductCategory();
    const products = getPreviewProducts(8);
    return {
      ...props,
      ...buildPreviewPageContext({
        pageType: 'product-list',
        title: category.name,
        url: `/valve/${category.id}.html`,
        section: { type: 'product', name: '产品', url: '/valve/' },
        category,
        content: null,
        breadcrumbItems: [
          { label: '产品', url: '/valve/' },
          { label: category.name, url: '' }
        ]
      }),
      smallName: category.name,
      primaryMenuItems: buildPreviewPrimaryMenuItems('product'),
      bigId: category.parent_id || category.id,
      bigName: category.name,
      prodKeywords: category.seo_keywords || category.name,
      productsSmallCatHtml: `<span class="abv">【<a href="/valve/${category.id}.html">${escapeHtml(category.name)}</a>】</span>`,
      secondaryMenuItems: buildPreviewProductMenuItems(category),
      items: products.map((item) => ({
        id: item.id,
        name: item.name || '',
        url: `/product/${item.id}.html`,
        image: item.primary_image || '/skin/dfpic.gif',
        summary: item.summary || ''
      })),
      pagerHtml: '<div class="page_list">共 8 条信息 1/1 页</div>'
    };
  }

  if (effectiveMode === 'product-detail') {
    const product = getPreviewProduct();
    const category = getPreviewProductCategory(product.column_id);
    return {
      ...props,
      ...buildPreviewPageContext({
        pageType: 'product-detail',
        title: product.name,
        url: `/product/${product.id}.html`,
        section: { type: 'product', name: '产品', url: '/valve/' },
        category,
        content: { id: product.id, title: product.name, name: product.name, type: 'product', url: `/product/${product.id}.html` },
        breadcrumbItems: [
          { label: '产品', url: '/valve/' },
          { label: category.name, url: `/valve/${category.id}.html` },
          { label: product.name, url: '' }
        ]
      }),
      title: product.name,
      primaryMenuItems: buildPreviewPrimaryMenuItems('product'),
      prodKeywords: product.keywords || product.name,
      prodDescription: product.summary || '',
      image: product.primary_image || '/skin/dfpic.gif',
      code: product.code || '',
      relatedProductsHtml: buildPreviewProductLinksHtml(4),
      bodyHtml: product.content_html || product.summary || '',
      secondaryMenuItems: buildPreviewProductMenuItems(category)
    };
  }

  if (effectiveMode === 'article-list' || effectiveMode === 'service-list') {
    const sectionConfig = buildPreviewArticleSectionConfig(effectiveMode, template);
    const category = getPreviewNewsCategory();
    const articles = getPreviewArticles(6);
    return {
      ...props,
      ...buildPreviewPageContext({
        pageType: sectionConfig.pageType,
        title: category.name,
        url: `/${sectionConfig.sectionDir}/${category.id}.html`,
        section: { type: sectionConfig.sectionType, name: sectionConfig.sectionLabel, url: `/${sectionConfig.sectionDir}/` },
        category,
        content: null,
        breadcrumbItems: [
          { label: sectionConfig.sectionLabel, url: `/${sectionConfig.sectionDir}/` },
          { label: category.name, url: '' }
        ]
      }),
      section: sectionConfig.sectionType,
      primaryMenuItems: buildPreviewPrimaryMenuItems(sectionConfig.sectionType),
      sectionDir: sectionConfig.sectionDir,
      sectionLabel: sectionConfig.sectionLabel,
      sectionCategoryHtml: `<a href="/${sectionConfig.sectionDir}/${category.id}.html">${escapeHtml(category.name)}</a>`,
      secondaryMenuItems: buildPreviewNewsMenuItems(sectionConfig.rootId, sectionConfig.sectionDir, category.id),
      categoryId: category.id,
      title: category.name,
      items: articles.map((item) => ({
        id: item.id,
        title: item.title || '',
        url: `detail/${item.id}.html`,
        date: formatPreviewDate(item.created_at),
        summary: item.summary || '',
        summaryClassName: 'Font_000000_a'
      })),
      pagerHtml: '<div class="page_list">共 6 条信息 1/1 页</div>'
    };
  }

  if (effectiveMode === 'article-detail' || effectiveMode === 'service-detail') {
    const sectionConfig = buildPreviewArticleSectionConfig(effectiveMode, template);
    const article = getPreviewArticle();
    const category = getPreviewNewsCategory(article.column_id);
    return {
      ...props,
      ...buildPreviewPageContext({
        pageType: sectionConfig.detailPageType,
        title: article.title,
        url: `/${sectionConfig.sectionDir}/detail/${article.id}.html`,
        section: { type: sectionConfig.sectionType, name: sectionConfig.sectionLabel, url: `/${sectionConfig.sectionDir}/` },
        category,
        content: {
          id: article.id,
          title: article.title,
          name: article.title,
          type: sectionConfig.contentType,
          url: `/${sectionConfig.sectionDir}/detail/${article.id}.html`
        },
        breadcrumbItems: [
          { label: sectionConfig.sectionLabel, url: `/${sectionConfig.sectionDir}/` },
          { label: category.name, url: `/${sectionConfig.sectionDir}/${category.id}.html` },
          { label: article.title, url: '' }
        ]
      }),
      section: sectionConfig.sectionType,
      primaryMenuItems: buildPreviewPrimaryMenuItems(sectionConfig.sectionType),
      sectionDir: sectionConfig.sectionDir,
      sectionLabel: sectionConfig.sectionLabel,
      sectionCategoryHtml: `<a href="/${sectionConfig.sectionDir}/${category.id}.html">${escapeHtml(category.name)}</a>`,
      secondaryMenuItems: buildPreviewNewsMenuItems(sectionConfig.rootId, sectionConfig.sectionDir, category.id),
      title: article.title,
      newsKeywords: article.keywords || article.title,
      newsDescription: article.summary || '',
      typeId: article.column_id || category.id,
      catName: category.name,
      bodyHtml: article.content_html || article.summary || '',
      previousHtml: '<span class="Font_2e4690_a">没有上一篇</span>',
      nextHtml: '<span class="Font_2e4690_a">没有下一篇</span>'
    };
  }

  if (effectiveMode === 'content') {
    const category = getPreviewCorporationCategory();
    return {
      ...props,
      ...buildPreviewPageContext({
        pageType: 'content',
        title: category.name,
        url: `/about/about-${category.id}.html`,
        section: { type: 'corporation', name: '公司栏目', url: '/about/' },
        category,
        content: null,
        breadcrumbItems: [{ label: category.name, url: '' }]
      }),
      primaryMenuItems: buildPreviewPrimaryMenuItems('corporation'),
      title: category.name,
      contentHtml: category.content_html || '公司栏目内容预览',
      secondaryMenuItems: buildPreviewCorporationMenuItems(category.id)
    };
  }

  if (effectiveMode === 'contact') {
    return {
      ...props,
      ...buildPreviewPageContext({
        pageType: 'contact',
        title: '联系我们',
        url: '/contact.html',
        section: { type: 'content', name: '联系我们', url: '/contact.html' },
        category: null,
        content: null,
        breadcrumbItems: [{ label: '联系我们', url: '' }]
      }),
      primaryMenuItems: buildPreviewPrimaryMenuItems('contact'),
      contactTableHtml: '<table><tr><td>电话</td><td>021-00000000</td></tr><tr><td>地址</td><td>示例地址</td></tr></table>'
    };
  }

  return props;
}

function inferPreviewMode(template) {
  const code = String(template.code || '').toLowerCase();
  if (template.type === 'home') {
    return 'home';
  }
  if (template.code === 'list_product' || (template.type === 'list' && code.includes('product'))) {
    return 'product-list';
  }
  if (template.code === 'list_article' || (template.type === 'list' && (code.includes('article') || code.includes('news') || code.includes('service')))) {
    return 'article-list';
  }
  if (template.code === 'content_product' || (template.type === 'content' && code.includes('product'))) {
    return 'product-detail';
  }
  if (template.code === 'content_article' || (template.type === 'content' && (code.includes('article') || code.includes('news') || code.includes('service')))) {
    return 'article-detail';
  }
  if (template.code === 'content_contact' || code.includes('contact')) {
    return 'contact';
  }
  if (template.type === 'content') {
    return 'content';
  }
  return 'generic';
}

function ensurePreviewBaseHref(html) {
  const markup = String(html || '');
  if (/<base\b/i.test(markup)) {
    return markup.replace(/<base\b(?![^>]*\bhref=)/i, '<base href="/"');
  }
  if (/<head[^>]*>/i.test(markup)) {
    return markup.replace(/<head[^>]*>/i, (head) => `${head}<base href="/" />`);
  }
  return markup;
}

function buildPreviewPageContext({ pageType, title, url, section, category, content, breadcrumbItems }) {
  const normalizedCategory = category ? {
    id: toInteger(category.id, 0),
    type: section?.type || '',
    name: category.name || '',
    url: category.url || url || '',
    parentId: toInteger(category.parent_id, 0),
    parentName: '',
    seoKeywords: category.seo_keywords || '',
    seoDescription: category.seo_description || ''
  } : null;
  const normalizedItems = [
    { label: '公司主页', url: '/index.html' },
    ...(breadcrumbItems || [])
  ];

  return {
    currentPage: { type: pageType || '', title: title || '', url: url || '' },
    currentSection: section ? { type: section.type || '', name: section.name || '', url: section.url || '' } : null,
    currentCategory: normalizedCategory ? [normalizedCategory] : [],
    currentCategoryItem: normalizedCategory,
    parentCategory: null,
    currentContent: content ? {
      id: toInteger(content.id, 0),
      type: content.type || '',
      title: content.title || content.name || '',
      name: content.name || content.title || '',
      url: content.url || ''
    } : null,
    breadcrumb: {
      prefixHtml: '<span>当前位置 : </span>',
      separatorHtml: ' - ',
      html: normalizedItems.map((item) => item.url ? `<a href="${escapeHtml(item.url)}">${escapeHtml(item.label)}</a>` : escapeHtml(item.label)).join(' - '),
      items: normalizedItems
    }
  };
}

function getPreviewProduct() {
  return listProducts({ visibleOnly: false, limit: 1 })[0] || {
    id: 1,
    column_id: 1,
    name: '示例产品',
    code: 'DEMO',
    summary: '示例产品摘要',
    content_html: '示例产品正文',
    images: [],
    primary_image: '/skin/dfpic.gif',
    keywords: '示例关键词'
  };
}

function getPreviewProducts(limit = 8) {
  const rows = listProducts({ visibleOnly: false, limit });
  return rows.length > 0 ? rows : [getPreviewProduct()];
}

function getPreviewProductCategory(id = null) {
  const rows = queryAll(
    `
      SELECT id, parent_id, name, seo_keywords, seo_description
      FROM columns
      WHERE model_code = 'product'
        AND source_type = 'product_category'
      ORDER BY parent_id ASC, sort_order ASC, id ASC
    `
  );
  const row = id
    ? rows.find((item) => toInteger(item.id, 0) === toInteger(id, 0))
    : rows[0];
  return row
    ? {
        id: toInteger(row.id, 0),
        name: row.name || '产品',
        parent_id: toInteger(row.parent_id, 0),
        seo_keywords: row.seo_keywords || row.name || '产品',
        seo_description: row.seo_description || ''
      }
    : { id: 1, name: '产品', parent_id: 0, seo_keywords: '产品', seo_description: '' };
}

function getPreviewArticle() {
  return listNews({ limit: 1 })[0] || {
    id: 1,
    column_id: 1,
    title: '示例文章',
    summary: '示例文章摘要',
    content_html: '示例文章正文',
    keywords: '示例关键词',
    created_at: new Date().toISOString()
  };
}

function getPreviewArticles(limit = 6) {
  const rows = listNews({ limit });
  return rows.length > 0 ? rows : [getPreviewArticle()];
}

function getPreviewNewsCategory(id = null) {
  const rows = queryAll(
    `
      SELECT id, parent_id, name
      FROM columns
      WHERE model_code = 'news'
        AND source_type = 'news_category'
      ORDER BY parent_id ASC, sort_order ASC, id ASC
    `
  );
  const row = id
    ? rows.find((item) => toInteger(item.id, 0) === toInteger(id, 0))
    : rows[0];
  return row
    ? {
        id: toInteger(row.id, 0),
        name: row.name || '公司新闻',
        parent_id: toInteger(row.parent_id, 0)
      }
    : { id: 1, name: '公司新闻', parent_id: 0 };
}

function getPreviewCorporationCategory() {
  const row = listColumnCategories('corporation').find((item) => toInteger(item.is_external, 0) === 0);
  if (!row) {
    return { id: 1, name: '关于我们', parent_id: 0, content_html: '公司栏目内容预览' };
  }
  return {
    ...row,
    content_html: String(row.content_html ?? '公司栏目内容预览')
  };
}

function buildPreviewArticleSectionConfig(mode, template) {
  const isService = mode === 'service-list'
    || mode === 'service-detail'
    || String(template?.code || '').toLowerCase().includes('service');
  const sections = resolvePreviewSections();
  const resolved = isService
    ? sections.getNewsSectionByDirName('service') || sections.getNewsSectionByType('service')
    : sections.getNewsSectionByDirName('news') || sections.getNewsSectionByType('news');

  return resolved
    ? {
        rootId: resolved.rootColumnId,
        sectionType: resolved.sectionType,
        sectionDir: resolved.dirName,
        sectionLabel: resolved.sectionLabel,
        pageType: isService ? 'service-list' : 'article-list',
        detailPageType: isService ? 'service-detail' : 'article-detail',
        contentType: isService ? 'service-article' : 'news-article'
      }
    : {
        rootId: 0,
        sectionType: isService ? 'service' : 'news',
        sectionDir: isService ? 'service' : 'news',
        sectionLabel: isService ? '服务' : '公司新闻',
        pageType: isService ? 'service-list' : 'article-list',
        detailPageType: isService ? 'service-detail' : 'article-detail',
        contentType: isService ? 'service-article' : 'news-article'
      };
}

function buildPreviewCorporationMenuItems(activeId = 0) {
  const rows = listColumnCategories('corporation')
    .filter((item) => toInteger(item.parent_id, 0) === 0 && toInteger(item.is_external, 0) === 0);
  const items = rows.length > 0
    ? rows
    : [{ id: activeId || 1, name: '关于我们', is_external: 0, external_url: '' }];

  return items.map((item) => ({
    label: item.name || '',
    url: item.external_url || `/about/about-${toInteger(item.id, 0)}.html`,
    active: toInteger(item.id, 0) === toInteger(activeId, 0)
  }));
}

function buildPreviewRootColumnMenuItems() {
  return buildPreviewSiteColumns().map((item) => ({
    label: item.name || '',
    url: item.url || '',
    active: false
  })).filter((item) => item.url);
}

function buildPreviewSiteColumns() {
  const rows = queryAll(
    `
      SELECT id, name, parent_id, model_code, source_type, source_id, column_kind, custom_url, route_path, open_in_new_tab
      FROM columns
      ORDER BY coalesce(parent_id, 0) ASC, sort_order ASC, id ASC
    `
  );

  if (rows.length === 0) {
    return [
      { id: 1, name: '产品', parentId: 0, modelCode: 'product', sourceType: 'product_root', sourceId: 0, url: '/valve/', children: [] },
      { id: 2, name: '公司新闻', parentId: 0, modelCode: 'news', sourceType: 'news_category', sourceId: 0, url: '/news/', children: [] },
      { id: 3, name: '服务', parentId: 0, modelCode: 'news', sourceType: 'news_category', sourceId: 0, url: '/service/', children: [] },
      { id: 4, name: '公司信息', parentId: 0, modelCode: 'corporation', sourceType: 'corporation_root', sourceId: 0, url: '/about/', children: [] }
    ];
  }

  const publicSections = resolvePublicSectionContext(rows);
  const normalizedRows = rows.map((item) => ({
    id: toInteger(item.id, 0),
    name: item.name || '',
    parentId: toInteger(item.parent_id, 0),
    modelCode: item.model_code || '',
    sourceType: item.source_type || '',
    sourceId: toInteger(item.source_id, 0),
    openInNewTab: toInteger(item.open_in_new_tab, 0),
    url: buildPreviewColumnUrl(item, publicSections)
  })).filter((item) => item.id !== 0);

  const childrenByParentId = new Map();
  for (const item of normalizedRows) {
    if (item.parentId === 0 || !item.url) {
      continue;
    }
    if (!childrenByParentId.has(item.parentId)) {
      childrenByParentId.set(item.parentId, []);
    }
    childrenByParentId.get(item.parentId).push({
      id: item.id,
      name: item.name,
      parentId: item.parentId,
      modelCode: item.modelCode,
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      openInNewTab: item.openInNewTab,
      url: item.url
    });
  }

  return normalizedRows
    .filter((item) => item.parentId === 0)
    .filter((item) => String(item?.sourceType || '') !== 'contact_page')
    .map((item) => ({
      ...item,
      children: childrenByParentId.get(item.id) || []
    }))
    .filter((item) => item.url);
}

function buildPreviewPrimaryMenuItems(activeKey = '') {
  const items = [
    { key: 'home', label: '首页', url: '/index.html' },
    { key: 'corporation', label: '公司栏目', url: '/about/' },
    { key: 'product', label: '产品', url: '/valve/' },
    { key: 'news', label: '公司新闻', url: '/news/' },
    { key: 'service', label: '阀门知识', url: '/service/' },
    { key: 'contact', label: '联系我们', url: '/contact.html' }
  ];

  return items.map((item) => ({
    label: item.label,
    url: item.url,
    active: item.key === activeKey
  }));
}

function buildPreviewColumnUrl(column, rowsById = new Map()) {
  return buildColumnPublicUrl(column, rowsById)
    .replace(/^\/products\//, '/valve/')
    .replace(/\/products\/(\d+)\.html$/, '/valve/$1.html');
}

function buildPreviewNewsMenuItems(rootId, dirName, activeId = 0) {
  const section = resolvePreviewSections().getNewsSectionByDirName(dirName);
  const rows = section ? queryAll(
    `
      SELECT id, name
      FROM columns
      WHERE parent_id = ?
        AND model_code = 'news'
        AND source_type = 'news_category'
      ORDER BY sort_order ASC, id ASC
    `,
    [section.rootColumnId]
  ) : [];
  const items = rows.length > 0
    ? rows
    : [{ id: activeId || 1, name: '示例分类' }];

  return items.map((item) => ({
    label: item.name || '',
    url: `/${dirName}/${toInteger(item.id, 0)}.html`,
    active: toInteger(item.id, 0) === toInteger(activeId, 0)
  }));
}

function resolvePreviewSections() {
  const rows = queryAll(
    `
      SELECT id, name, parent_id, model_code, source_type, source_id, sort_order, route_path, slug, legacy_extra
      FROM columns
      ORDER BY coalesce(parent_id, 0) ASC, sort_order ASC, id ASC
    `
  );
  return resolvePublicSectionContext(rows);
}

function buildPreviewProductMenuItems(category) {
  const currentCategory = category || getPreviewProductCategory();
  const rootColumn = queryOne(
    `
      SELECT id
      FROM columns
      WHERE model_code = 'product'
        AND source_type = 'product_root'
      LIMIT 1
    `
  );
  const rows = rootColumn ? queryAll(
    `
      SELECT id, name, 0 AS parent_id
      FROM columns
      WHERE parent_id = ?
        AND model_code = 'product'
        AND source_type = 'product_category'
      ORDER BY sort_order ASC, id ASC
    `,
    [rootColumn.id]
  ) : [];
  const items = rows.length > 0
    ? rows
    : [currentCategory].filter(Boolean);

  return items.map((item) => ({
    label: item.name || '',
    url: `/valve/${toInteger(item.id, 0)}.html`,
    active: toInteger(item.id, 0) === toInteger(currentCategory?.id, 0)
  }));
}

function parsePreviewLegacyExtra(value) {
  if (!value) {
    return {};
  }
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function buildPreviewFeaturedProductsHtml() {
  return getPreviewProducts(8).map((item) => (
    `<li><img src="${escapeHtml(item.primary_image || '/skin/dfpic.gif')}" width="120" height="120" border="0" alt="${escapeHtml(item.name || '')}"><li><a href="/product/${item.id}.html" target="_blank">${escapeHtml(item.name || '')}</a></li><li class="tvjpnr">${escapeHtml(item.summary || '')}</li></li>`
  )).join('');
}

function buildPreviewProductLinksHtml(limit = 8) {
  return getPreviewProducts(limit).map((item) => `<li><a href="/product/${item.id}.html">${escapeHtml(item.name || '')}</a></li>`).join('');
}

function buildPreviewArticleLinks(prefix, limit = 10) {
  return getPreviewArticles(limit).map((item) => `<li><a href="${prefix}/${item.id}.html">${escapeHtml(item.title || '')}</a></li>`).join('');
}

function formatPreviewDate(value) {
  return String(value || '').slice(0, 10);
}

function buildPreviewComponentMap(currentTemplate) {
  const components = new Map();
  const selectedTheme = getSelectedTemplateVariant();
  const componentRows = selectedTheme?.id
    ? listTemplateVariantComponents(selectedTheme.id, { publishedOnly: false })
    : [];

  for (const item of componentRows) {
    components.set(normalizeCode(item.code), {
      code: item.code,
      engine: item.engine || 'tsx',
      content: item.content || ''
    });
  }

  if (currentTemplate.type === 'component') {
    components.set(currentTemplate.code, {
      code: currentTemplate.code,
      engine: currentTemplate.engine,
      content: currentTemplate.content
    });
  }

  return components;
}

function renderPreviewTemplate(template, props, components, depth, previewState) {
  collectPreviewTemplateStyle(template, previewState);
  return renderTsxTemplate(template.content, props, {
    templateCode: template.code,
    componentResolver: ({ code, props: extraProps, helpers }) => {
      return renderPreviewComponentElement(
        code,
        components,
        mergePreviewComponentProps(props, extraProps),
        depth + 1,
        previewState,
        helpers
      );
    }
  });
}

function renderPreviewComponentElement(code, components, props, depth, previewState, helpers) {
  if (depth > 10) {
    return null;
  }
  const component = components.get(normalizeCode(code));
  if (!component?.content) {
    return null;
  }
  collectPreviewTemplateStyle(component, previewState);
  return createTsxTemplateElement(component.content, props, {
    templateCode: component.code,
    componentResolver: ({ code: nestedCode, props: nestedProps, helpers: nestedHelpers }) => {
      return renderPreviewComponentElement(
        nestedCode,
        components,
        mergePreviewComponentProps(props, nestedProps),
        depth + 1,
        previewState,
        nestedHelpers
      );
    }
  }, helpers?.runtimeContext);
}

function renderPreviewComponentMarkup(code, components, props, depth, previewState) {
  if (depth > 10) {
    return '';
  }
  const component = components.get(normalizeCode(code));
  if (!component?.content) {
    return `<!-- missing component: ${escapeHtml(code)} -->`;
  }
  collectPreviewTemplateStyle(component, previewState);
  return renderTsxTemplate(component.content, props, {
    templateCode: component.code,
    componentResolver: ({ code: nestedCode, props: nestedProps, helpers }) => {
      return renderPreviewComponentElement(
        nestedCode,
        components,
        mergePreviewComponentProps(props, nestedProps),
        depth + 1,
        previewState,
        helpers
      );
    }
  });
}

function collectPreviewTemplateStyle(template, previewState) {
  if (!previewState?.styleAssets || !template?.content) {
    return;
  }
  const asset = template.engine === 'tsx'
    ? getTsxTemplateStyleAsset(template.content, {
      templateCode: template.code
    })
    : null;
  if (!asset) {
    return;
  }
  previewState.styleAssets.set(asset.code, asset);
}

function injectPreviewTsxStyles(html, styleAssets) {
  if (!styleAssets || styleAssets.size === 0) {
    return html;
  }
  const styleHtml = Array.from(styleAssets.values())
    .map((asset) => `<style data-cms-template-style="${escapeHtml(asset.code)}">\n${asset.cssText}\n</style>`)
    .join('\n');

  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${styleHtml}\n</head>`);
  }
  return `${styleHtml}\n${html}`;
}

function mergePreviewComponentProps(baseProps, extraProps) {
  const { children: _children, slots: _slots, ...restBaseProps } = baseProps || {};
  return {
    ...restBaseProps,
    ...(extraProps || {})
  };
}

function getTemplateByCode(code, themeId = null) {
  ensureTemplatesSchema();
  const normalizedThemeId = toInteger(themeId, null) || toInteger(getSelectedTemplateVariant()?.id, null);
  const params = [normalizeCode(code)];
  let whereTheme = '';
  if (normalizedThemeId) {
    whereTheme = 'AND theme_id = ?';
    params.push(normalizedThemeId);
  }
  return queryOne(
    `
      SELECT id, theme_id, name, type, code, engine, content, published_content, status, is_default, sort_order, created_at, updated_at, published_at
      FROM templates
      WHERE code = ? ${whereTheme}
      LIMIT 1
    `,
    params
  ) || null;
}

function extractLiteralComponentReferences(content) {
  const refs = new Set();
  const source = String(content || '');
  const patterns = [
    /#component\(\s*["']([A-Za-z0-9_-]+)["']\s*\)#/g,
    /\bcomponent\(\s*["']([A-Za-z0-9_-]+)["']/g
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source)) !== null) {
      refs.add(normalizeCode(match[1]));
    }
  }

  return Array.from(refs).filter(Boolean);
}

function buildTemplateValidationProps(template) {
  const common = {
    site: {
      web_name: '示例网站',
      company_name: '示例公司',
      company_phone: '021-00000000',
      company_fax: '021-00000001',
      web_mobile: '13800000000',
      company_email: 'demo@example.com',
      company_address: '示例地址',
      web_url: '/',
      icp_number: '',
      web_qq: '',
      web_author: '',
      web_copyright: ''
    },
    fragments: {
      indextopHtml: '',
      topHtml: '',
      bottomHtml: '',
      indexFootHtml: '',
      aboutHtml: '',
      productsMenuHtml: '',
      productsMenuCompactHtml: '',
      aboutCategoryHtml: '',
      newsCategoryHtml: '',
      serviceCategoryHtml: ''
    },
    currentPage: { type: template.type || '', title: template.name || '', url: '/' },
    currentSection: { type: '', name: '', url: '' },
    currentCategory: [
      { id: 1, type: 'demo', name: '父级分类', url: '/parent.html', parentId: 0, parentName: '', seoKeywords: '', seoDescription: '' },
      { id: 2, type: 'demo', name: '当前分类', url: '/current.html', parentId: 1, parentName: '父级分类', seoKeywords: '', seoDescription: '' }
    ],
    currentCategoryItem: { id: 2, type: 'demo', name: '当前分类', url: '/current.html', parentId: 1, parentName: '父级分类', seoKeywords: '', seoDescription: '' },
    parentCategory: { id: 1, type: 'demo', name: '父级分类', url: '/parent.html', parentId: 0, parentName: '', seoKeywords: '', seoDescription: '' },
    currentContent: { id: 1, type: 'demo', title: '示例内容', name: '示例内容', url: '/detail.html' },
    breadcrumb: {
      prefixHtml: '<span>当前位置 : </span>',
      separatorHtml: ' - ',
      html: '<a href="/index.html">公司主页</a> - 示例内容',
      items: [
        { label: '公司主页', url: '/index.html' },
        { label: '示例内容', url: '' }
      ]
    },
    siteColumns: buildPreviewSiteColumns(),
    component: () => null,
    primaryMenuItems: buildPreviewPrimaryMenuItems('home'),
    item: {
      id: 1,
      name: '示例产品',
      title: '示例标题',
      url: '/detail.html',
      image: '/skin/dfpic.gif',
      summary: '示例摘要',
      summaryClassName: '',
      openings: '1',
      address: '上海',
      date: '2026-06-09'
    },
    items: [],
    pagerHtml: '',
    title: '示例标题',
    bodyHtml: '',
    contentHtml: '',
    contactTableHtml: '',
    relatedProductsHtml: '',
    previousHtml: '',
    nextHtml: '',
    sectionCategoryHtml: '',
    newsIndexHtml: '',
    featuredProductsHtml: '',
    featuredProductLinksHtml: '',
    serviceIndexHtml: '',
    productsSmallCatHtml: '',
    primaryMenuLabel: '站点导航',
    secondaryMenuItems: [],
    smallName: '示例分类',
    bigId: 1,
    bigName: '示例父级分类',
    prodKeywords: '示例关键词',
    prodDescription: '示例描述',
    image: '/skin/dfpic.gif',
    code: 'DEMO',
    section: 'news',
    sectionDir: 'news',
    sectionLabel: '公司新闻',
    categoryId: 1,
    newsKeywords: '示例关键词',
    newsDescription: '示例描述',
    typeId: 1,
    catName: '示例分类',
    address: '上海',
    openings: '1',
    requirementsHtml: '',
    contactPerson: '联系人',
    phone: '021-00000000',
    date: '2026-06-09'
  };

  return common;
}

function formatTemplateValidationError(error) {
  const message = String(error?.message || error || '未知错误').replace(/\s+/g, ' ').trim();
  return message || '未知错误';
}

function normalizeBindingInput(input) {
  const payload = normalizeBindingTarget(input.theme_id, input.target_type, input.target_id ?? null, input.template_type);
  const templateId = toInteger(input.template_id, 0);
  if (!templateId) {
    throw new Error('template_id is required');
  }
  const template = getTemplateById(templateId);
  if (!template) {
    throw new Error('template does not exist');
  }
  if (template.theme_id !== payload.theme_id) {
    throw new Error('template does not belong to current theme');
  }
  if (template.type !== payload.template_type) {
    throw new Error('template type does not match binding type');
  }

  return {
    ...payload,
    template_id: templateId
  };
}

function normalizeBindingTarget(themeId, targetType, targetId, templateType) {
  const normalizedThemeId = resolveThemeId(themeId);
  const normalizedTargetType = String(targetType || '').trim().toLowerCase();
  if (!['site', 'product_category', 'news_category', 'corporation_category', 'content_type', 'column'].includes(normalizedTargetType)) {
    throw new Error('invalid binding target type');
  }
  if (!['home', 'list', 'content'].includes(templateType)) {
    throw new Error('invalid binding template type');
  }

  return {
    theme_id: normalizedThemeId,
    target_type: normalizedTargetType,
    target_id: targetId == null || String(targetId).trim() === '' ? null : toInteger(targetId, null),
    template_type: templateType
  };
}

function normalizeTemplateInput(input) {
  const type = String(input.type || '').trim();
  if (!TEMPLATE_TYPES.includes(type)) {
    throw new Error('invalid template type');
  }
  const name = String(input.name || '').trim();
  if (!name) {
    throw new Error('name is required');
  }
  const code = normalizeCode(input.code);
  if (!code) {
    throw new Error('code is required');
  }

  const engine = normalizeTemplateEngine(input.engine);
  const theme_id = resolveThemeId(input.theme_id);
  return {
    theme_id,
    name,
    type,
    code,
    engine,
    content: String(input.content ?? ''),
    status: input.status === 'published' ? 'published' : 'draft',
    is_default: 0,
    sort_order: toInteger(input.sort_order, 0)
  };
}

function normalizeTemplateEngine(value) {
  if (value == null || String(value).trim() === '') {
    return 'tsx';
  }
  const engine = String(value).trim().toLowerCase();
  if (engine !== 'tsx') {
    throw new Error('only tsx template engine is allowed');
  }
  return 'tsx';
}

function resolveThemeId(value) {
  const normalizedThemeId = toInteger(value, null);
  if (normalizedThemeId) {
    return normalizedThemeId;
  }
  const selectedTheme = getSelectedTemplateVariant();
  const fallbackThemeId = toInteger(selectedTheme?.id, null);
  if (!fallbackThemeId) {
    throw new Error('theme_id is required');
  }
  return fallbackThemeId;
}

function pruneTemplateVersions(templateId) {
  const staleRows = queryAll(
    `
      SELECT id
      FROM template_versions
      WHERE template_id = ?
      ORDER BY version_no DESC, id DESC
      LIMIT -1 OFFSET ?
    `,
    [templateId, MAX_TEMPLATE_VERSIONS]
  );
  for (const row of staleRows) {
    execute('DELETE FROM template_versions WHERE id = ?', [row.id]);
  }
}

function addColumnIfMissing(tableName, columnName, definition) {
  const columns = queryAll(`PRAGMA table_info(${tableName})`);
  if (columns.some((column) => column.name === columnName)) {
    return;
  }
  getDb().exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

function ensureTemplateThemeOwnership() {
  const fallbackThemeId = getSelectedThemeIdDirect();
  if (!fallbackThemeId) {
    return;
  }
  execute('UPDATE templates SET theme_id = ? WHERE theme_id IS NULL OR theme_id = 0', [fallbackThemeId]);
}

function ensureTemplateBindingsThemeValues() {
  const fallbackThemeId = getSelectedThemeIdDirect();
  if (!fallbackThemeId) {
    return;
  }
  execute('UPDATE template_bindings SET theme_id = ? WHERE theme_id IS NULL OR theme_id = 0', [fallbackThemeId]);
}

function getSelectedThemeIdDirect() {
  return toInteger(queryOne(
    `
      SELECT id
      FROM template_variants
      WHERE is_selected = 1
      ORDER BY id ASC
      LIMIT 1
    `
  )?.id, null);
}

function reconcileThemeOwnedTemplateAssets() {
  migrateDefaultThemeAssets();
  migrateThemeSuffixedAssets();
  cleanupCrossThemeBindings();
}

function migrateDefaultThemeAssets() {
  const defaultThemeId = toInteger(queryOne(
    `
      SELECT id
      FROM template_variants
      WHERE template_name LIKE '%默认%'
      ORDER BY id ASC
      LIMIT 1
    `
  )?.id, null);
  if (!defaultThemeId) {
    return;
  }

  const defaultTemplates = queryAll(
    `
      SELECT id, code, name, theme_id
      FROM templates
      WHERE code LIKE 'default_%' OR name LIKE '默认模板-%'
      ORDER BY id ASC
    `
  );

  for (const template of defaultTemplates) {
    if (toInteger(template.theme_id, null) === defaultThemeId) {
      continue;
    }
    migrateTemplateToTheme(template.id, defaultThemeId, template.code);
  }

  ensureThemeBindingByCode(defaultThemeId, 'site', null, 'home', 'default_home_tsx');
  ensureThemeBindingByCode(defaultThemeId, 'content_type', CONTENT_TYPE_PRODUCT_ID, 'list', 'default_product_list_tsx');
  ensureThemeBindingByCode(defaultThemeId, 'content_type', CONTENT_TYPE_PRODUCT_ID, 'content', 'default_product_detail_tsx');
  ensureThemeBindingByCode(defaultThemeId, 'content_type', CONTENT_TYPE_ARTICLE_ID, 'list', 'default_article_list_tsx');
  ensureThemeBindingByCode(defaultThemeId, 'content_type', CONTENT_TYPE_ARTICLE_ID, 'content', 'default_article_detail_tsx');
  ensureThemeBindingByCode(defaultThemeId, 'content_type', CONTENT_TYPE_CORPORATION_ID, 'content', 'default_content_tsx');
  ensureThemeBindingByCode(defaultThemeId, 'content_type', CONTENT_TYPE_CONTACT_ID, 'content', 'default_contact_tsx');
}

function migrateThemeSuffixedAssets() {
  const suffixedTemplates = queryAll(
    `
      SELECT id, theme_id, code
      FROM templates
      WHERE code LIKE '%__theme_%'
      ORDER BY id ASC
    `
  );

  for (const template of suffixedTemplates) {
    const match = String(template.code || '').match(/^(.*)__theme_(\d+)$/);
    if (!match) {
      continue;
    }
    const targetThemeId = toInteger(match[2], null);
    if (!targetThemeId) {
      continue;
    }
    const targetThemeExists = queryOne('SELECT id FROM template_variants WHERE id = ? LIMIT 1', [targetThemeId]);
    if (!targetThemeExists?.id) {
      execute('DELETE FROM templates WHERE id = ?', [template.id]);
      continue;
    }

    const baseCode = normalizeCode(match[1]);
    const duplicate = queryOne(
      'SELECT id FROM templates WHERE theme_id = ? AND code = ? AND id <> ? LIMIT 1',
      [targetThemeId, baseCode, template.id]
    );
    if (duplicate?.id) {
      execute('DELETE FROM templates WHERE id = ?', [template.id]);
      continue;
    }

    migrateTemplateToTheme(template.id, targetThemeId, baseCode);
  }
}

function cleanupCrossThemeBindings() {
  execute(
    `
      DELETE FROM template_bindings
      WHERE id IN (
        SELECT b.id
        FROM template_bindings b
        LEFT JOIN templates t ON t.id = b.template_id
        WHERE t.id IS NULL OR coalesce(t.theme_id, 0) <> coalesce(b.theme_id, 0)
      )
    `
  );
}

function migrateTemplateToTheme(templateId, targetThemeId, nextCode) {
  const normalizedThemeId = toInteger(targetThemeId, null);
  const normalizedCode = normalizeCode(nextCode);
  if (!normalizedThemeId || !normalizedCode) {
    return;
  }

  const duplicate = queryOne(
    'SELECT id FROM templates WHERE theme_id = ? AND code = ? AND id <> ? LIMIT 1',
    [normalizedThemeId, normalizedCode, templateId]
  );
  if (duplicate?.id) {
    execute('DELETE FROM templates WHERE id = ?', [templateId]);
    return;
  }

  execute(
    'UPDATE templates SET theme_id = ?, code = ?, updated_at = ? WHERE id = ?',
    [normalizedThemeId, normalizedCode, new Date().toISOString(), templateId]
  );
}

function ensureThemeBindingByCode(themeId, targetType, targetId, templateType, templateCode) {
  const template = queryOne(
    `
      SELECT id
      FROM templates
      WHERE theme_id = ? AND code = ?
      LIMIT 1
    `,
    [themeId, normalizeCode(templateCode)]
  );
  if (!template?.id) {
    return;
  }

  const normalizedTargetId = targetId == null ? null : toInteger(targetId, null);
  const whereTargetId = normalizedTargetId == null ? 'target_id IS NULL' : 'target_id = ?';
  const params = normalizedTargetId == null
    ? [themeId, targetType, templateType]
    : [themeId, targetType, normalizedTargetId, templateType];
  const existing = queryOne(
    `
      SELECT id
      FROM template_bindings
      WHERE theme_id = ? AND target_type = ? AND ${whereTargetId} AND template_type = ?
      LIMIT 1
    `,
    params
  );

  const now = new Date().toISOString();
  if (existing?.id) {
    execute('UPDATE template_bindings SET template_id = ?, updated_at = ? WHERE id = ?', [template.id, now, existing.id]);
    return;
  }

  execute(
    `
      INSERT INTO template_bindings (theme_id, target_type, target_id, template_type, template_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [themeId, targetType, normalizedTargetId, templateType, template.id, now, now]
  );
}

function ensureTemplateBindingsThemeScope() {
  const sql = queryOne(
    `
      SELECT sql
      FROM sqlite_master
      WHERE type = 'table' AND name = 'template_bindings'
      LIMIT 1
    `
  )?.sql || '';

  if (
    String(sql).includes('theme_id INTEGER NOT NULL')
    && String(sql).includes('UNIQUE (theme_id, target_type, target_id, template_type)')
  ) {
    return;
  }

  getDb().exec(`
    PRAGMA foreign_keys = OFF;
    BEGIN TRANSACTION;

    ALTER TABLE template_bindings RENAME TO template_bindings__old_theme_scope;

    CREATE TABLE template_bindings (
      id INTEGER PRIMARY KEY,
      theme_id INTEGER NOT NULL,
      target_type TEXT NOT NULL,
      target_id INTEGER,
      template_type TEXT NOT NULL CHECK (template_type IN ('home', 'list', 'content')),
      template_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (theme_id, target_type, target_id, template_type),
      FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE
    );

    INSERT INTO template_bindings (
      id, theme_id, target_type, target_id, template_type, template_id, created_at, updated_at
    )
    SELECT
      id,
      coalesce(theme_id, 0),
      target_type,
      target_id,
      template_type,
      template_id,
      created_at,
      updated_at
    FROM template_bindings__old_theme_scope;

    DROP TABLE template_bindings__old_theme_scope;

    COMMIT;
    PRAGMA foreign_keys = ON;
  `);
}

function ensureTemplateCodeThemeScope() {
  const sql = queryOne(
    `
      SELECT sql
      FROM sqlite_master
      WHERE type = 'table' AND name = 'templates'
      LIMIT 1
    `
  )?.sql || '';

  if (
    String(sql).includes('theme_id INTEGER')
    && String(sql).includes('UNIQUE (theme_id, code)')
    && !String(sql).includes('code TEXT NOT NULL UNIQUE')
  ) {
    return;
  }

  reconcileDuplicateTemplateCodesByTheme();

  getDb().exec(`
    PRAGMA foreign_keys = OFF;
    BEGIN TRANSACTION;

    ALTER TABLE templates RENAME TO templates__old_theme_code_scope;

    CREATE TABLE templates (
      id INTEGER PRIMARY KEY,
      theme_id INTEGER,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('home', 'list', 'content', 'component')),
      code TEXT NOT NULL,
      engine TEXT NOT NULL DEFAULT 'tsx' CHECK (engine IN ('tsx')),
      content TEXT NOT NULL DEFAULT '',
      published_content TEXT,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
      is_default INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      published_at TEXT,
      UNIQUE (theme_id, code)
    );

    INSERT INTO templates (
      id, theme_id, name, type, code, engine, content, published_content, status, is_default, sort_order, created_at, updated_at, published_at
    )
    SELECT
      id, theme_id, name, type, code, 'tsx', content, published_content, status, is_default, sort_order, created_at, updated_at, published_at
    FROM templates__old_theme_code_scope;

    DROP TABLE templates__old_theme_code_scope;

    COMMIT;
    PRAGMA foreign_keys = ON;
  `);
}

function ensureTemplatesEngineConstraint() {
  const sql = queryOne(
    `
      SELECT sql
      FROM sqlite_master
      WHERE type = 'table' AND name = 'templates'
      LIMIT 1
    `
  )?.sql || '';

  if (
    String(sql).includes("DEFAULT 'tsx'")
    && String(sql).includes("CHECK (engine IN ('tsx'))")
  ) {
    return;
  }

  getDb().exec(`
    PRAGMA foreign_keys = OFF;
    BEGIN TRANSACTION;

    ALTER TABLE templates RENAME TO templates__old_engine_check;

    CREATE TABLE templates (
      id INTEGER PRIMARY KEY,
      theme_id INTEGER,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('home', 'list', 'content', 'component')),
      code TEXT NOT NULL,
      engine TEXT NOT NULL DEFAULT 'tsx' CHECK (engine IN ('tsx')),
      content TEXT NOT NULL DEFAULT '',
      published_content TEXT,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
      is_default INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      published_at TEXT,
      UNIQUE (theme_id, code)
    );

    INSERT INTO templates (
      id, theme_id, name, type, code, engine, content, published_content, status, is_default, sort_order, created_at, updated_at, published_at
    )
    SELECT
      id, theme_id, name, type, code, 'tsx', content, published_content, status, is_default, sort_order, created_at, updated_at, published_at
    FROM templates__old_engine_check;

    DROP TABLE templates__old_engine_check;

    COMMIT;
    PRAGMA foreign_keys = ON;
  `);
}

function reconcileDuplicateTemplateCodesByTheme() {
  const duplicateGroups = queryAll(
    `
      SELECT theme_id, code
      FROM templates
      GROUP BY theme_id, code
      HAVING COUNT(*) > 1
    `
  );

  for (const group of duplicateGroups) {
    const rows = queryAll(
      `
        SELECT id, code
        FROM templates
        WHERE ${group.theme_id == null ? 'theme_id IS NULL' : 'theme_id = ?'} AND code = ?
        ORDER BY id ASC
      `,
      group.theme_id == null ? [group.code] : [group.theme_id, group.code]
    );

    rows.slice(1).forEach((row, index) => {
      const nextCode = buildMigratedDuplicateTemplateCode(group.theme_id, row.code, row.id, index + 1);
      execute(
        'UPDATE templates SET code = ?, updated_at = ? WHERE id = ?',
        [nextCode, new Date().toISOString(), row.id]
      );
    });
  }
}

function buildMigratedDuplicateTemplateCode(themeId, baseCode, templateId, offset) {
  const normalizedBase = normalizeCode(baseCode) || 'template';
  let candidate = `${normalizedBase}_${templateId}`;
  let attempt = 0;

  while (queryOne(
    `
      SELECT id
      FROM templates
      WHERE ${themeId == null ? 'theme_id IS NULL' : 'theme_id = ?'} AND code = ?
      LIMIT 1
    `,
    themeId == null ? [candidate] : [themeId, candidate]
  )) {
    attempt += 1;
    candidate = `${normalizedBase}_${templateId}_${offset + attempt}`;
  }

  return candidate;
}

function assertTemplateCodeAvailable(themeId, code, excludeId = null) {
  const normalizedThemeId = toInteger(themeId, null);
  const normalizedCode = normalizeCode(code);
  const params = [];
  let whereTheme = 'theme_id IS NULL';
  if (normalizedThemeId != null) {
    whereTheme = 'theme_id = ?';
    params.push(normalizedThemeId);
  }
  params.push(normalizedCode);
  let whereExclude = '';
  if (toInteger(excludeId, null)) {
    whereExclude = 'AND id <> ?';
    params.push(toInteger(excludeId, null));
  }
  const existing = queryOne(
    `
      SELECT id
      FROM templates
      WHERE ${whereTheme} AND code = ? ${whereExclude}
      LIMIT 1
    `,
    params
  );
  if (existing?.id) {
    throw new Error('当前主题下模板标识 code 已存在');
  }
}

function ensureTemplateVersionsForeignKey() {
  const sql = queryOne(
    `
      SELECT sql
      FROM sqlite_master
      WHERE type = 'table' AND name = 'template_versions'
      LIMIT 1
    `
  )?.sql || '';

  if (
    !String(sql).includes('templates__old_engine_check')
    && String(sql).includes('REFERENCES templates(id)')
  ) {
    return;
  }

  getDb().exec(`
    PRAGMA foreign_keys = OFF;
    BEGIN TRANSACTION;

    ALTER TABLE template_versions RENAME TO template_versions__old_fk_fix;

    CREATE TABLE template_versions (
      id INTEGER PRIMARY KEY,
      template_id INTEGER NOT NULL,
      version_no INTEGER NOT NULL,
      engine TEXT NOT NULL DEFAULT 'tsx',
      content TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE
    );

    INSERT INTO template_versions (
      id, template_id, version_no, engine, content, note, created_at
    )
    SELECT
      id, template_id, version_no, 'tsx', content, note, created_at
    FROM template_versions__old_fk_fix;

    DROP TABLE template_versions__old_fk_fix;

    COMMIT;
    PRAGMA foreign_keys = ON;
  `);
}

function ensureTemplateVersionsEngineConstraint() {
  const sql = queryOne(
    `
      SELECT sql
      FROM sqlite_master
      WHERE type = 'table' AND name = 'template_versions'
      LIMIT 1
    `
  )?.sql || '';

  if (
    String(sql).includes("DEFAULT 'tsx'")
    && String(sql).includes("CHECK (engine IN ('tsx'))")
  ) {
    return;
  }

  getDb().exec(`
    PRAGMA foreign_keys = OFF;
    BEGIN TRANSACTION;

    ALTER TABLE template_versions RENAME TO template_versions__old_engine_fix;

    CREATE TABLE template_versions (
      id INTEGER PRIMARY KEY,
      template_id INTEGER NOT NULL,
      version_no INTEGER NOT NULL,
      engine TEXT NOT NULL DEFAULT 'tsx' CHECK (engine IN ('tsx')),
      content TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE
    );

    INSERT INTO template_versions (
      id, template_id, version_no, engine, content, note, created_at
    )
    SELECT
      id, template_id, version_no, 'tsx', content, note, created_at
    FROM template_versions__old_engine_fix
    WHERE coalesce(engine, 'tsx') = 'tsx';

    DROP TABLE template_versions__old_engine_fix;

    COMMIT;
    PRAGMA foreign_keys = ON;
  `);
}

function normalizeCode(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function toInteger(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}
