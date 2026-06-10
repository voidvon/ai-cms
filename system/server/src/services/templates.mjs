import { execute, getDb, queryAll, queryOne } from '../db.mjs';
import { renderTsxTemplate } from '../tsx-template-renderer.mjs';
import { escapeHtml } from '../utils/html.mjs';

export const TEMPLATE_TYPES = ['home', 'list', 'content', 'component'];
export const TEMPLATE_ENGINES = ['html', 'tsx'];
const MAX_TEMPLATE_VERSIONS = 10;

let schemaEnsured = false;

export function ensureTemplatesSchema() {
  if (schemaEnsured) {
    return;
  }

  getDb().exec(`
    CREATE TABLE IF NOT EXISTS templates (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('home', 'list', 'content', 'component')),
      code TEXT NOT NULL UNIQUE,
      engine TEXT NOT NULL DEFAULT 'html' CHECK (engine IN ('html', 'tsx')),
      content TEXT NOT NULL DEFAULT '',
      published_content TEXT,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
      is_default INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      published_at TEXT
    );

    CREATE TABLE IF NOT EXISTS template_bindings (
      id INTEGER PRIMARY KEY,
      target_type TEXT NOT NULL,
      target_id INTEGER,
      template_type TEXT NOT NULL CHECK (template_type IN ('home', 'list', 'content')),
      template_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (target_type, target_id, template_type),
      FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS template_versions (
      id INTEGER PRIMARY KEY,
      template_id INTEGER NOT NULL,
      version_no INTEGER NOT NULL,
      engine TEXT NOT NULL DEFAULT 'html',
      content TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_templates_type_sort ON templates(type, sort_order, id);
    CREATE INDEX IF NOT EXISTS idx_templates_status ON templates(status);
    CREATE INDEX IF NOT EXISTS idx_template_bindings_target ON template_bindings(target_type, target_id, template_type);
    CREATE INDEX IF NOT EXISTS idx_template_versions_template_id ON template_versions(template_id, version_no);
  `);

  addColumnIfMissing('templates', 'engine', "TEXT NOT NULL DEFAULT 'html'");
  addColumnIfMissing('template_versions', 'engine', "TEXT NOT NULL DEFAULT 'html'");

  schemaEnsured = true;
}

export function listTemplates({ type } = {}) {
  ensureTemplatesSchema();
  const params = [];
  let where = '';
  if (type) {
    if (!TEMPLATE_TYPES.includes(type)) {
      throw new Error('invalid template type');
    }
    where = 'WHERE type = ?';
    params.push(type);
  }

  return queryAll(
    `
      SELECT id, name, type, code, engine, content, published_content, status, is_default, sort_order, created_at, updated_at, published_at
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
      SELECT id, name, type, code, engine, content, published_content, status, is_default, sort_order, created_at, updated_at, published_at
      FROM templates
      WHERE id = ?
    `,
    [id]
  ) || null;
}

export function getPublishedTemplateByCode(code) {
  ensureTemplatesSchema();
  return queryOne(
    `
      SELECT id, name, type, code, engine, coalesce(published_content, content) AS content
      FROM templates
      WHERE code = ? AND status = 'published'
      LIMIT 1
    `,
    [normalizeCode(code)]
  ) || null;
}

export function getPublishedTemplateById(id) {
  ensureTemplatesSchema();
  return queryOne(
    `
      SELECT id, name, type, code, engine, coalesce(published_content, content) AS content
      FROM templates
      WHERE id = ? AND status = 'published'
      LIMIT 1
    `,
    [id]
  ) || null;
}

export function resolvePublishedTemplate({ templateType, targets = [], fallbackCode }) {
  ensureTemplatesSchema();

  for (const target of targets) {
    const binding = getTemplateBinding(target.target_type, target.target_id ?? null, templateType);
    if (!binding?.template_id) {
      continue;
    }
    const template = getPublishedTemplateById(binding.template_id);
    if (template) {
      return template;
    }
  }

  return getPublishedTemplateByCode(fallbackCode);
}

export function listPublishedComponents() {
  ensureTemplatesSchema();
  return queryAll(
    `
      SELECT code, engine, coalesce(published_content, content) AS content
      FROM templates
      WHERE type = 'component' AND status = 'published'
      ORDER BY sort_order ASC, id ASC
    `
  );
}

export function listTemplateBindings() {
  ensureTemplatesSchema();
  return queryAll(
    `
      SELECT
        b.id,
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
      ORDER BY b.target_type ASC, coalesce(b.target_id, 0) ASC, b.template_type ASC
    `
  );
}

export function getTemplateBinding(targetType, targetId, templateType) {
  ensureTemplatesSchema();
  const normalized = normalizeBindingTarget(targetType, targetId, templateType);
  const whereTargetId = normalized.target_id == null ? 'target_id IS NULL' : 'target_id = ?';
  const params = normalized.target_id == null
    ? [normalized.target_type, normalized.template_type]
    : [normalized.target_type, normalized.target_id, normalized.template_type];

  return queryOne(
    `
      SELECT id, target_type, target_id, template_type, template_id, created_at, updated_at
      FROM template_bindings
      WHERE target_type = ? AND ${whereTargetId} AND template_type = ?
      LIMIT 1
    `,
    params
  ) || null;
}

export function upsertTemplateBinding(input) {
  ensureTemplatesSchema();
  const payload = normalizeBindingInput(input);
  const existing = getTemplateBinding(payload.target_type, payload.target_id, payload.template_type);
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
    return getTemplateBinding(payload.target_type, payload.target_id, payload.template_type);
  }

  const result = execute(
    `
      INSERT INTO template_bindings (target_type, target_id, template_type, template_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    [payload.target_type, payload.target_id, payload.template_type, payload.template_id, now, now]
  );
  return queryOne(
    `
      SELECT id, target_type, target_id, template_type, template_id, created_at, updated_at
      FROM template_bindings
      WHERE id = ?
    `,
    [result.lastInsertRowid]
  );
}

export function deleteTemplateBinding(id) {
  ensureTemplatesSchema();
  const existing = queryOne(
    'SELECT id, target_type, target_id, template_type, template_id FROM template_bindings WHERE id = ?',
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
  const now = new Date().toISOString();
  const result = execute(
    `
      INSERT INTO templates (name, type, code, engine, content, published_content, status, is_default, sort_order, created_at, updated_at, published_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
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
  execute(
    `
      UPDATE templates
      SET name = ?, type = ?, code = ?, engine = ?, content = ?, is_default = ?, sort_order = ?, updated_at = ?
      WHERE id = ?
    `,
    [
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
      [id, nextVersion, existing.engine || 'html', existing.published_content, note || '发布前版本', new Date().toISOString()]
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
    engine: version.engine || template.engine || 'html',
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

  const allTemplates = listTemplates();
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
    const component = getTemplateByCode(componentCode);
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

  if (normalizedTemplate.engine === 'html') {
    validateHtmlTemplateContent(content, errors);
  }

  if (normalizedTemplate.engine === 'tsx') {
    try {
      renderTsxTemplate(content, buildTemplateValidationProps(normalizedTemplate));
    } catch (error) {
      errors.push(`TSX 编译或渲染失败：${formatTemplateValidationError(error)}`);
    }
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
  const html = ensurePreviewBaseHref(renderPreviewTemplate(template, props, components, 0));
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
        section: { type: 'product', name: '产品展示', url: '/valve/' },
        category,
        content: null,
        breadcrumbItems: [
          { label: '产品展示', url: '/valve/' },
          { label: category.name, url: '' }
        ]
      }),
      smallName: category.name,
      bigId: category.parent_id || category.id,
      bigName: category.name,
      prodKeywords: category.seo_keywords || category.name,
      productsSmallCatHtml: `<span class="abv">【<a href="/products/${category.id}.html">${escapeHtml(category.name)}</a>】</span>`,
      items: products.map((item) => ({
        id: item.id,
        name: item.name || '',
        url: `/Product/${item.id}.html`,
        image: item.small_image || '/skin/dfpic.gif',
        summary: item.summary || ''
      })),
      pagerHtml: '<div class="page_list">共 8 条信息 1/1 页</div>'
    };
  }

  if (effectiveMode === 'product-detail') {
    const product = getPreviewProduct();
    const category = getPreviewProductCategory(product.category_id);
    return {
      ...props,
      ...buildPreviewPageContext({
        pageType: 'product-detail',
        title: product.name,
        url: `/product/${product.id}.html`,
        section: { type: 'product', name: '产品展示', url: '/valve/' },
        category,
        content: { id: product.id, title: product.name, name: product.name, type: 'product', url: `/product/${product.id}.html` },
        breadcrumbItems: [
          { label: '产品展示', url: '/valve/' },
          { label: category.name, url: `/valve/${category.id}.html` },
          { label: product.name, url: '' }
        ]
      }),
      title: product.name,
      prodKeywords: product.keywords || product.name,
      prodDescription: product.summary || '',
      image: product.small_image || '/skin/dfpic.gif',
      code: product.code || '',
      relatedProductsHtml: buildPreviewProductLinksHtml(4),
      bodyHtml: product.content_html || product.summary || ''
    };
  }

  if (effectiveMode === 'article-list') {
    const category = getPreviewNewsCategory();
    const articles = getPreviewArticles(6);
    return {
      ...props,
      ...buildPreviewPageContext({
        pageType: 'article-list',
        title: category.name,
        url: `/news/${category.id}.html`,
        section: { type: 'news', name: '新闻资讯', url: '/news/' },
        category,
        content: null,
        breadcrumbItems: [
          { label: '新闻资讯', url: '/news/' },
          { label: category.name, url: '' }
        ]
      }),
      section: 'news',
      sectionDir: 'news',
      sectionLabel: '新闻资讯',
      sectionCategoryHtml: `<a href="/news/${category.id}.html">${escapeHtml(category.name)}</a>`,
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

  if (effectiveMode === 'article-detail') {
    const article = getPreviewArticle();
    const category = getPreviewNewsCategory(article.category_id);
    return {
      ...props,
      ...buildPreviewPageContext({
        pageType: 'article-detail',
        title: article.title,
        url: `/news/detail/${article.id}.html`,
        section: { type: 'news', name: '新闻资讯', url: '/news/' },
        category,
        content: { id: article.id, title: article.title, name: article.title, type: 'news-article', url: `/news/detail/${article.id}.html` },
        breadcrumbItems: [
          { label: '新闻资讯', url: '/news/' },
          { label: category.name, url: `/news/${category.id}.html` },
          { label: article.title, url: '' }
        ]
      }),
      section: 'news',
      sectionDir: 'news',
      sectionLabel: '新闻资讯',
      sectionCategoryHtml: `<a href="/news/${category.id}.html">${escapeHtml(category.name)}</a>`,
      title: article.title,
      newsKeywords: article.keywords || article.title,
      newsDescription: article.summary || '',
      typeId: article.category_id || category.id,
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
      title: category.name,
      contentHtml: category.content_html || '公司栏目内容预览'
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
      contactTableHtml: '<table><tr><td>电话</td><td>021-00000000</td></tr><tr><td>地址</td><td>示例地址</td></tr></table>'
    };
  }

  if (effectiveMode === 'message') {
    return {
      ...props,
      ...buildPreviewPageContext({
        pageType: 'message',
        title: '在线留言',
        url: '/msg.html',
        section: { type: 'content', name: '在线留言', url: '/msg.html' },
        category: null,
        content: null,
        breadcrumbItems: [{ label: '在线留言', url: '' }]
      }),
      messageSidebarProductsHtml: buildPreviewProductLinksHtml(4)
    };
  }

  return props;
}

function inferPreviewMode(template) {
  if (template.type === 'home') {
    return 'home';
  }
  if (template.code === 'list_product') {
    return 'product-list';
  }
  if (template.code === 'list_article') {
    return 'article-list';
  }
  if (template.code === 'content_product') {
    return 'product-detail';
  }
  if (template.code === 'content_article') {
    return 'article-detail';
  }
  if (template.code === 'content_contact') {
    return 'contact';
  }
  if (template.code === 'content_message') {
    return 'message';
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
  return queryOne(
    `
      SELECT id, category_id, name, code, summary, content_html, small_image, keywords
      FROM products
      ORDER BY is_featured_home DESC, sort_order ASC, id DESC
      LIMIT 1
    `
  ) || {
    id: 1,
    category_id: 1,
    name: '示例产品',
    code: 'DEMO',
    summary: '示例产品摘要',
    content_html: '示例产品正文',
    small_image: '/skin/dfpic.gif',
    keywords: '示例关键词'
  };
}

function getPreviewProducts(limit = 8) {
  const rows = queryAll(
    `
      SELECT id, category_id, name, code, summary, content_html, small_image, keywords
      FROM products
      ORDER BY is_featured_home DESC, sort_order ASC, id DESC
      LIMIT ?
    `,
    [limit]
  );
  return rows.length > 0 ? rows : [getPreviewProduct()];
}

function getPreviewProductCategory(id = null) {
  const row = id ? queryOne(
    `
      SELECT id, name, parent_id, seo_keywords, seo_description
      FROM product_categories
      WHERE id = ?
      LIMIT 1
    `,
    [id]
  ) : queryOne(
    `
      SELECT id, name, parent_id, seo_keywords, seo_description
      FROM product_categories
      ORDER BY parent_id ASC, sort_order ASC, id ASC
      LIMIT 1
    `
  );
  return row || { id: 1, name: '产品展示', parent_id: 0, seo_keywords: '产品展示', seo_description: '' };
}

function getPreviewArticle() {
  return queryOne(
    `
      SELECT id, category_id, title, summary, content_html, keywords, created_at
      FROM news
      ORDER BY coalesce(created_at, '') DESC, id DESC
      LIMIT 1
    `
  ) || {
    id: 1,
    category_id: 1,
    title: '示例文章',
    summary: '示例文章摘要',
    content_html: '示例文章正文',
    keywords: '示例关键词',
    created_at: new Date().toISOString()
  };
}

function getPreviewArticles(limit = 6) {
  const rows = queryAll(
    `
      SELECT id, category_id, title, summary, content_html, keywords, created_at
      FROM news
      ORDER BY coalesce(created_at, '') DESC, id DESC
      LIMIT ?
    `,
    [limit]
  );
  return rows.length > 0 ? rows : [getPreviewArticle()];
}

function getPreviewNewsCategory(id = null) {
  const row = id ? queryOne(
    `
      SELECT id, name, parent_id
      FROM news_categories
      WHERE id = ?
      LIMIT 1
    `,
    [id]
  ) : queryOne(
    `
      SELECT id, name, parent_id
      FROM news_categories
      ORDER BY parent_id ASC, sort_order ASC, id ASC
      LIMIT 1
    `
  );
  return row || { id: 1, name: '新闻资讯', parent_id: 0 };
}

function getPreviewCorporationCategory() {
  const row = queryOne(
    `
      SELECT id, name, parent_id, legacy_extra
      FROM corporation_categories
      WHERE coalesce(is_external, 0) = 0
      ORDER BY parent_id ASC, sort_order ASC, id ASC
      LIMIT 1
    `
  );
  if (!row) {
    return { id: 1, name: '关于我们', parent_id: 0, content_html: '公司栏目内容预览' };
  }
  const legacyExtra = parsePreviewLegacyExtra(row.legacy_extra);
  return {
    ...row,
    content_html: String(legacyExtra.Centern ?? legacyExtra.content_html ?? '公司栏目内容预览')
  };
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
    `<li><img src="${escapeHtml(item.small_image || '/skin/dfpic.gif')}" width="120" height="120" border="0" alt="${escapeHtml(item.name || '')}"><li><a href="/Product/${item.id}.html" target="_blank">${escapeHtml(item.name || '')}</a></li><li class="tvjpnr">${escapeHtml(item.summary || '')}</li></li>`
  )).join('');
}

function buildPreviewProductLinksHtml(limit = 8) {
  return getPreviewProducts(limit).map((item) => `<li><a href="/Product/${item.id}.html">${escapeHtml(item.name || '')}</a></li>`).join('');
}

function buildPreviewArticleLinks(prefix, limit = 10) {
  return getPreviewArticles(limit).map((item) => `<li><a href="${prefix}/${item.id}.html">${escapeHtml(item.title || '')}</a></li>`).join('');
}

function formatPreviewDate(value) {
  return String(value || '').slice(0, 10);
}

function buildPreviewComponentMap(currentTemplate) {
  const components = new Map();
  for (const item of listTemplates({ type: 'component' })) {
    components.set(normalizeCode(item.code), {
      code: item.code,
      engine: item.engine || 'html',
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

function renderPreviewTemplate(template, props, components, depth) {
  if (template.engine === 'tsx') {
    const templateProps = {
      ...props,
      component: (code, extraProps = {}) => renderPreviewComponent(code, components, { ...props, ...extraProps }, depth + 1)
    };
    return renderTsxTemplate(template.content, templateProps, {
      templateCode: template.code
    });
  }

  return renderPreviewHtmlContent(template.content, props, components, depth);
}

function renderPreviewComponent(code, components, props, depth) {
  if (depth > 10) {
    return '';
  }
  const component = components.get(normalizeCode(code));
  if (!component?.content) {
    return `<!-- missing component: ${escapeHtml(code)} -->`;
  }
  return renderPreviewTemplate(component, props, components, depth + 1);
}

function renderPreviewHtmlContent(content, props, components, depth) {
  const loopsExpanded = String(content || '').replace(/#loop\(([A-Za-z0-9_.-]+)\)#([\s\S]*?)#\/loop#/g, (_, pathName, rowTemplate) => {
    const items = resolvePreviewValue(props, pathName);
    if (!Array.isArray(items)) {
      return '';
    }
    return items.map((item) => renderPreviewHtmlContent(rowTemplate, { ...props, item }, components, depth + 1)).join('');
  });
  const componentExpanded = loopsExpanded.replace(/#component\(\s*["']([A-Za-z0-9_-]+)["']\s*\)#/g, (_, code) => {
    return renderPreviewComponent(code, components, props, depth + 1);
  });
  const rawExpanded = componentExpanded.replace(/\{\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}\}/g, (_, pathName) => {
    return stringifyPreviewValue(resolvePreviewValue(props, pathName));
  });
  return rawExpanded.replace(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g, (_, pathName) => {
    return escapeHtml(stringifyPreviewValue(resolvePreviewValue(props, pathName)));
  });
}

function resolvePreviewValue(source, pathName) {
  const parts = String(pathName || '').split('.').filter(Boolean);
  let current = source;
  for (const part of parts) {
    if (current == null) {
      return '';
    }
    current = current[part];
  }
  return current ?? '';
}

function stringifyPreviewValue(value) {
  if (value == null) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

function getTemplateByCode(code) {
  ensureTemplatesSchema();
  return queryOne(
    `
      SELECT id, name, type, code, engine, content, published_content, status, is_default, sort_order, created_at, updated_at, published_at
      FROM templates
      WHERE code = ?
      LIMIT 1
    `,
    [normalizeCode(code)]
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

function validateHtmlTemplateContent(content, errors) {
  const source = String(content || '');
  const loopStarts = source.match(/#loop\([A-Za-z0-9_.-]+\)#/g) || [];
  const loopEnds = source.match(/#\/loop#/g) || [];
  if (loopStarts.length !== loopEnds.length) {
    errors.push(`HTML 循环标签不匹配：开始 ${loopStarts.length} 个，结束 ${loopEnds.length} 个`);
  }
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
    component: () => '',
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
    messageSidebarProductsHtml: '',
    relatedProductsHtml: '',
    previousHtml: '',
    nextHtml: '',
    sectionCategoryHtml: '',
    newsIndexHtml: '',
    featuredProductsHtml: '',
    featuredProductLinksHtml: '',
    serviceIndexHtml: '',
    productsSmallCatHtml: '',
    smallName: '示例分类',
    bigId: 1,
    bigName: '示例父级分类',
    prodKeywords: '示例关键词',
    prodDescription: '示例描述',
    image: '/skin/dfpic.gif',
    code: 'DEMO',
    section: 'news',
    sectionDir: 'news',
    sectionLabel: '新闻资讯',
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
  const payload = normalizeBindingTarget(input.target_type, input.target_id ?? null, input.template_type);
  const templateId = toInteger(input.template_id, 0);
  if (!templateId) {
    throw new Error('template_id is required');
  }
  const template = getTemplateById(templateId);
  if (!template) {
    throw new Error('template does not exist');
  }
  if (template.type !== payload.template_type) {
    throw new Error('template type does not match binding type');
  }

  return {
    ...payload,
    template_id: templateId
  };
}

function normalizeBindingTarget(targetType, targetId, templateType) {
  const normalizedTargetType = String(targetType || '').trim().toLowerCase();
  if (!['site', 'product_category', 'news_category', 'corporation_category', 'content_type'].includes(normalizedTargetType)) {
    throw new Error('invalid binding target type');
  }
  if (!['home', 'list', 'content'].includes(templateType)) {
    throw new Error('invalid binding template type');
  }

  return {
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

  return {
    name,
    type,
    code,
    engine: normalizeTemplateEngine(input.engine),
    content: String(input.content ?? ''),
    status: input.status === 'published' ? 'published' : 'draft',
    is_default: 0,
    sort_order: toInteger(input.sort_order, 0)
  };
}

function normalizeTemplateEngine(value) {
  const engine = String(value || 'html').trim().toLowerCase();
  if (!TEMPLATE_ENGINES.includes(engine)) {
    throw new Error('invalid template engine');
  }
  return engine;
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
