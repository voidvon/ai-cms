import { execute, getDb, queryAll, queryOne } from '../db.mjs';
import { detachTemplateFromAllThemeVariants, getSelectedTemplateVariant, listTemplateVariantComponents } from './template-variants.mjs';
import { compileBrowserCompatibleCss, compileBrowserCompatibleJs } from '../template-browser-compat.mjs';
import { createTsxTemplateElement, getTsxTemplateModuleExports, renderTsxTemplate } from '../tsx-template-renderer.mjs';
import { getTsxTemplateStyleAsset } from '../tsx-template-styles.mjs';
import { escapeHtml } from '../utils/html.mjs';
import { listColumns } from './columns.mjs';
import { listContentItems } from './content-items.mjs';
import { listColumnNodes, listColumnNodesByRoot } from './column-nodes.mjs';
import { buildColumnPublicUrl, buildSectionColumnPublicUrl, resolvePublicSectionContext } from './public-sections.mjs';
import { buildSectionContentContext, getSectionTopLevelCategories } from './section-content.mjs';
import { buildContentDetailUrlFromColumn } from './column-paths.mjs';
import { normalizeUploadedRelativePath } from './uploads.mjs';
import { getSiteConfig, normalizeLanguageSitePathPrefix, prefixLanguageSitePath } from './site.mjs';

export const TEMPLATE_TYPES = ['home', 'list', 'content', 'single', 'not_found', 'topic', 'component'];
export const TEMPLATE_ENGINES = ['tsx'];
const MAX_TEMPLATE_VERSIONS = 10;
const CONTENT_TYPE_PRODUCT_ID = 1;
const CONTENT_TYPE_ARTICLE_ID = 2;
const CONTENT_TYPE_CONTACT_ID = 4;
const CONTENT_TYPE_CORPORATION_ID = 6;

const TEMPLATE_SELECT_FIELDS = `
  id,
  theme_id,
  name,
  type,
  code,
  engine,
  tsx_source,
  css_source,
  published_tsx_source,
  published_css_source,
  status,
  is_default,
  sort_order,
  created_at,
  updated_at
`;

const TEMPLATE_VERSION_SELECT_FIELDS = `
  id,
  template_id,
  version_no,
  engine,
  tsx_source,
  css_source,
  note,
  created_at
`;

const TEMPLATES_TABLE_SCHEMA = `
  CREATE TABLE templates (
    id INTEGER PRIMARY KEY,
    theme_id INTEGER,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('home', 'list', 'content', 'single', 'not_found', 'topic', 'component')),
    code TEXT NOT NULL,
    engine TEXT NOT NULL DEFAULT 'tsx' CHECK (engine IN ('tsx')),
    tsx_source TEXT NOT NULL DEFAULT '',
    css_source TEXT NOT NULL DEFAULT '',
    published_tsx_source TEXT,
    published_css_source TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
    is_default INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (theme_id, code)
  );
`;

const TEMPLATE_VERSIONS_TABLE_SCHEMA = `
  CREATE TABLE template_versions (
    id INTEGER PRIMARY KEY,
    template_id INTEGER NOT NULL,
    version_no INTEGER NOT NULL,
    engine TEXT NOT NULL DEFAULT 'tsx' CHECK (engine IN ('tsx')),
    tsx_source TEXT NOT NULL DEFAULT '',
    css_source TEXT NOT NULL DEFAULT '',
    note TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE
  );
`;

let schemaEnsured = false;

const PREVIEW_FALLBACK_SITE_COLUMNS = [
  {
    id: 1,
    name: '示例列表栏目',
    parentId: 0,
    columnType: 'list',
    modelCode: '',
    url: '/example-list/',
    children: [
      {
        id: 11,
        name: '示例子栏目',
        parentId: 1,
        columnType: 'list',
        modelCode: '',
        url: '/example-list/example-child/'
      }
    ]
  },
  {
    id: 2,
    name: '示例单页栏目',
    parentId: 0,
    columnType: 'single',
    modelCode: '',
    url: '/example-page.html',
    children: []
  },
  {
    id: 3,
    name: '示例链接栏目',
    parentId: 0,
    columnType: 'link',
    modelCode: '',
    url: '/example-link/',
    children: []
  }
];

export function ensureTemplatesSchema() {
  if (schemaEnsured) {
    return;
  }

  getDb().exec(`
    CREATE TABLE IF NOT EXISTS templates (
      id INTEGER PRIMARY KEY,
      theme_id INTEGER,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('home', 'list', 'content', 'single', 'not_found', 'topic', 'component')),
      code TEXT NOT NULL,
      engine TEXT NOT NULL DEFAULT 'tsx' CHECK (engine IN ('tsx')),
      tsx_source TEXT NOT NULL DEFAULT '',
      css_source TEXT NOT NULL DEFAULT '',
      published_tsx_source TEXT,
      published_css_source TEXT,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
      is_default INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (theme_id, code)
    );

    CREATE TABLE IF NOT EXISTS template_bindings (
      id INTEGER PRIMARY KEY,
      theme_id INTEGER NOT NULL,
      target_type TEXT NOT NULL,
      target_id INTEGER,
      template_type TEXT NOT NULL CHECK (template_type IN ('home', 'list', 'content', 'single', 'not_found', 'topic')),
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
      engine TEXT NOT NULL DEFAULT 'tsx' CHECK (engine IN ('tsx')),
      tsx_source TEXT NOT NULL DEFAULT '',
      css_source TEXT NOT NULL DEFAULT '',
      note TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE
    );
  `);

  addColumnIfMissing('templates', 'theme_id', 'INTEGER');
  addColumnIfMissing('templates', 'engine', "TEXT NOT NULL DEFAULT 'tsx'");
  addColumnIfMissing('templates', 'tsx_source', "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing('templates', 'css_source', "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing('templates', 'published_tsx_source', 'TEXT');
  addColumnIfMissing('templates', 'published_css_source', 'TEXT');
  addColumnIfMissing('template_bindings', 'theme_id', 'INTEGER');
  addColumnIfMissing('template_versions', 'engine', "TEXT NOT NULL DEFAULT 'tsx'");
  addColumnIfMissing('template_versions', 'tsx_source', "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing('template_versions', 'css_source', "TEXT NOT NULL DEFAULT ''");
  ensureTemplateThemeOwnership();
  ensureTemplateBindingsThemeValues();
  ensureTemplateCodeThemeScope();
  ensureTemplatesEngineConstraint();
  ensureTemplateVersionsForeignKey();
  ensureTemplateVersionsEngineConstraint();
  ensureTemplateBindingsThemeScope();
  reconcileThemeOwnedTemplateAssets();
  ensureThemeNotFoundTemplates();
  collapseLegacyGlobalCssSources();
  collapseLegacyInlineTsxStyleSources();
  ensureSingleCssSourceSchema();

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
      SELECT
        ${TEMPLATE_SELECT_FIELDS}
      FROM templates
      ${where}
      ORDER BY type ASC, sort_order ASC, id ASC
    `,
    params
  ).map(hydrateTemplateRecord);
}

export function getTemplateById(id) {
  ensureTemplatesSchema();
  const row = queryOne(
    `
      SELECT
        ${TEMPLATE_SELECT_FIELDS}
      FROM templates
      WHERE id = ?
    `,
    [id]
  );
  return row ? hydrateTemplateRecord(row) : null;
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
  const row = queryOne(
    `
      SELECT
        ${TEMPLATE_SELECT_FIELDS}
      FROM templates
      WHERE code = ? AND status = 'published' ${whereTheme}
      LIMIT 1
    `,
    params
  );
  return row ? hydratePublishedTemplateRecord(row) : null;
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
  const row = queryOne(
    `
      SELECT
        ${TEMPLATE_SELECT_FIELDS}
      FROM templates
      WHERE id = ? AND status = 'published' ${whereTheme}
      LIMIT 1
    `,
    params
  );
  return row ? hydratePublishedTemplateRecord(row) : null;
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
      SELECT
        code,
        engine,
        tsx_source,
        css_source,
        published_tsx_source,
        published_css_source
      FROM templates
      WHERE type = 'component' AND status = 'published' ${whereTheme}
      ORDER BY sort_order ASC, id ASC
    `,
    params
  ).map(hydratePublishedTemplateRecord);
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
  if (payload.status === 'published') {
    validateTemplateForPublish(payload);
  }
  assertTemplateCodeAvailable(payload.theme_id, payload.code);
  const now = new Date().toISOString();
  const result = execute(
    `
      INSERT INTO templates (
        theme_id,
        name,
        type,
        code,
        engine,
        tsx_source,
        css_source,
        published_tsx_source,
        published_css_source,
        status,
        is_default,
        sort_order,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      payload.theme_id,
      payload.name,
      payload.type,
      payload.code,
      payload.engine,
      payload.tsx_source,
      payload.css_source,
      payload.status === 'published' ? payload.tsx_source : null,
      payload.status === 'published' ? payload.css_source : null,
      payload.status,
      payload.is_default,
      payload.sort_order,
      now,
      now
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
      SET
        theme_id = ?,
        name = ?,
        type = ?,
        code = ?,
        engine = ?,
        tsx_source = ?,
        css_source = ?,
        is_default = ?,
        sort_order = ?,
        updated_at = ?
      WHERE id = ?
    `,
    [
      payload.theme_id,
      payload.name,
      payload.type,
      payload.code,
      payload.engine,
      payload.tsx_source,
      payload.css_source,
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
  if (existing.published_tsx_source != null || existing.published_css_source != null) {
    execute(
      `
        INSERT INTO template_versions (
          template_id,
          version_no,
          engine,
          tsx_source,
          css_source,
          note,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        id,
        nextVersion,
        existing.engine || 'tsx',
        existing.published_tsx_source || '',
        existing.published_css_source || '',
        note || '发布前版本',
        new Date().toISOString()
      ]
    );
    pruneTemplateVersions(id);
  }

  const now = new Date().toISOString();
  execute(
    `
      UPDATE templates
      SET
        published_tsx_source = ?,
        published_css_source = ?,
        status = 'published',
        updated_at = ?
      WHERE id = ?
    `,
    [
      existing.tsx_source || '',
      existing.css_source || '',
      now,
      id
    ]
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
  if (existing.type === 'home' || existing.type === 'not_found') {
    throw new Error('特殊模板不能删除');
  }
  detachTemplateFromAllThemeVariants(existing);
  execute('DELETE FROM templates WHERE id = ?', [id]);
  return existing;
}

export function listTemplateVersions(templateId) {
  ensureTemplatesSchema();
  return queryAll(
    `
      SELECT
        ${TEMPLATE_VERSION_SELECT_FIELDS}
      FROM template_versions
      WHERE template_id = ?
      ORDER BY version_no DESC, id DESC
    `,
    [templateId]
  ).map(hydrateTemplateVersionRecord);
}

export function restoreTemplateVersion(templateId, versionId) {
  const template = getTemplateById(templateId);
  if (!template) {
    return null;
  }

  const version = queryOne(
    `
      SELECT
        ${TEMPLATE_VERSION_SELECT_FIELDS}
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
    tsx_source: version.tsx_source || '',
    css_source: version.css_source || ''
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
  const references = extractLiteralComponentReferences(template.tsx_source).map((code) => {
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
    const refs = extractLiteralComponentReferences(item.tsx_source);
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
  const tsxSource = normalizedTemplate.tsx_source || '';
  const errors = [];

  for (const componentCode of extractLiteralComponentReferences(tsxSource)) {
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
    renderTsxTemplate(tsxSource, buildTemplateValidationProps(normalizedTemplate));
    const templateStyleSource = buildTemplateStyleSource(normalizedTemplate);
    if (templateStyleSource) {
      getTsxTemplateStyleAsset(templateStyleSource, {
        templateCode: normalizedTemplate.code
      });
    }
    validateRenderedTemplateBrowserCompatibility(normalizedTemplate);
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
  const html = finalizePreviewHtmlOutput(
    ensurePreviewBaseHref(injectPreviewTsxStyles(
      renderPreviewTemplate(template, props, components, 0, previewState),
      previewState.styleAssets
    )),
    props.site
  );
  return { html };
}

function buildPreviewComponentMap(currentTemplate) {
  const components = new Map();
  const selectedTheme = getSelectedTemplateVariant();
  const componentRows = selectedTheme?.id
    ? listTemplateVariantComponents(selectedTheme.id, { publishedOnly: false })
    : [];

  for (const item of componentRows) {
    const hydrated = hydrateTemplateRecord(item);
    components.set(normalizeCode(item.code), {
      code: hydrated.code,
      engine: hydrated.engine || 'tsx',
      tsx_source: hydrated.tsx_source || '',
      css_source: hydrated.css_source || ''
    });
  }

  if (currentTemplate.type === 'component') {
    components.set(currentTemplate.code, {
      code: currentTemplate.code,
      engine: currentTemplate.engine,
      tsx_source: currentTemplate.tsx_source || '',
      css_source: currentTemplate.css_source || ''
    });
  }

  return components;
}

function validateRenderedTemplateBrowserCompatibility(template) {
  const components = buildPreviewComponentMap(template);
  const props = buildTemplatePreviewProps(template);
  const previewState = {
    styleAssets: new Map()
  };
  const html = renderPreviewTemplate(template, props, components, 0, previewState);

  for (const asset of previewState.styleAssets.values()) {
    compileBrowserCompatibleCss(asset.cssText, {
      filename: `${asset.code || template.code || 'template'}.css`
    });
  }

  const inlineScripts = extractPreviewInlineScripts(html);
  inlineScripts.forEach((scriptSource) => {
    compileBrowserCompatibleJs(scriptSource, { minify: false });
  });
}

function extractPreviewInlineScripts(html) {
  const sources = [];
  String(html || '').replace(
    /<script\b(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi,
    (_, rawAttrs = '', scriptContent = '') => {
      const typeMatch = rawAttrs.match(/\btype\s*=\s*["']([^"']+)["']/i);
      const scriptType = String(typeMatch?.[1] || '').trim().toLowerCase();
      if (scriptType === 'application/ld+json') {
        return '';
      }
      const normalizedScriptContent = String(scriptContent || '').trim();
      if (normalizedScriptContent) {
        sources.push(normalizedScriptContent);
      }
      return '';
    }
  );
  return sources;
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
  const tsxSource = String(input.tsx_source ?? '');
  const cssSource = String(input.css_source ?? '');
  return {
    theme_id,
    name,
    type,
    code,
    engine,
    tsx_source: tsxSource,
    css_source: cssSource,
    status: input.status === 'published' ? 'published' : 'draft',
    is_default: 0,
    sort_order: toInteger(input.sort_order, 0)
  };
}

function buildTemplatePreviewProps(template, previewContext = {}) {
  const mode = normalizePreviewMode(previewContext?.mode);
  const languageCode = String(previewContext?.language_code || previewContext?.languageCode || '').trim() || null;
  const site = getSiteConfig(languageCode);
  const props = buildTemplateValidationProps(template, site);
  const effectiveMode = mode === 'auto' ? inferPreviewMode(template) : mode;

  if (effectiveMode === 'home') {
    return {
      ...props,
      currentPage: { type: 'home', title: '首页', url: prefixPreviewSitePath('/index.html', site) },
      secondaryMenuItems: buildPreviewRootColumnMenuItems(site),
      newsIndexHtml: '',
      featuredManagedItemsHtml: buildPreviewManagedContentCardsHtml(site),
      featuredManagedItemLinksHtml: buildPreviewManagedContentLinksHtml(8, null, site),
      serviceIndexHtml: ''
    };
  }

  if (effectiveMode === 'not_found') {
    const notFoundUrl = prefixPreviewSitePath('/404.html', site);
    return {
      ...props,
      ...buildPreviewPageContext({
        pageType: 'not_found',
        title: '404',
        url: notFoundUrl,
        section: { type: 'system', name: '404', url: notFoundUrl },
        column: null,
        content: null
      }),
      title: '404',
      itemDescription: '',
      contentHtml: '',
      bodyHtml: '',
      primaryMenuItems: buildPreviewPrimaryMenuItems('home', site),
      secondaryMenuItems: buildPreviewRootColumnMenuItems(site),
    };
  }

  if (effectiveMode === 'list') {
    const managedRootColumn = getPreviewManagedRootColumn();
    const managedRootUrl = getPreviewManagedRootPublicUrl(managedRootColumn, site);
    const managedRootLabel = getPreviewManagedRootLabel(managedRootColumn);
    const columnNode = getPreviewColumnNode({
      rootColumn: managedRootColumn,
      fallbackName: '示例列表栏目'
    });
    const managedContentItems = getPreviewManagedContentItems(8, managedRootColumn);
    const pagination = buildPreviewPaginationData(buildPreviewColumnUrl(columnNode, new Map(), site), {
      pageNumber: 2,
      pageCount: 8,
      totalRecords: 108,
      pageSize: 14
    });
    return {
      ...props,
      ...buildPreviewPageContext({
        pageType: 'list',
        title: columnNode.name,
        url: buildPreviewColumnUrl(columnNode, new Map(), site),
        section: { type: 'managed-column', name: managedRootLabel, url: managedRootUrl },
        column: columnNode,
        content: null
      }),
      smallName: columnNode.name,
      primaryMenuItems: buildPreviewPrimaryMenuItems(managedRootUrl, site),
      bigId: columnNode.parent_id || columnNode.id,
      bigName: columnNode.name,
      collectionCategoryHtml: `<span class="abv">【<a href="${escapeHtml(buildPreviewColumnUrl(columnNode, new Map(), site))}">${escapeHtml(columnNode.name)}</a>】</span>`,
      secondaryMenuItems: buildPreviewColumnMenuItems({
        rootColumn: managedRootColumn,
        column: columnNode,
        baseUrl: managedRootUrl,
        site
      }),
      items: managedContentItems.map((item) => ({
        id: item.id,
        name: item.name || '',
        url: buildPreviewManagedContentUrl(item, managedRootColumn, site),
        image: normalizeUploadedRelativePath(String(item.primary_image || '').trim()),
        summary: item.summary || ''
      })),
      pagerHtml: '',
      pagination: pagination.pagination,
      pagerText: pagination.pagerText
    };
  }

  if (effectiveMode === 'content') {
    const managedRootColumn = getPreviewManagedRootColumn();
    const managedRootUrl = getPreviewManagedRootPublicUrl(managedRootColumn, site);
    const managedRootLabel = getPreviewManagedRootLabel(managedRootColumn);
    const managedContentItem = getPreviewManagedContentItem(managedRootColumn);
    const columnNode = getPreviewColumnNode({
      rootColumn: managedRootColumn,
      id: managedContentItem.column_id,
      fallbackName: '示例列表栏目'
    });
    const managedContentUrl = buildPreviewManagedContentUrl(managedContentItem, managedRootColumn, site);
    return {
      ...props,
      ...buildPreviewPageContext({
        pageType: 'content',
        title: managedContentItem.name,
        url: managedContentUrl,
        section: { type: 'managed-column', name: managedRootLabel, url: managedRootUrl },
        column: columnNode,
        content: { id: managedContentItem.id, title: managedContentItem.name, name: managedContentItem.name, type: 'managed-content', url: managedContentUrl }
      }),
      title: managedContentItem.name,
      primaryMenuItems: buildPreviewPrimaryMenuItems(managedRootUrl, site),
      itemDescription: managedContentItem.summary || '',
      image: normalizeUploadedRelativePath(String(managedContentItem.primary_image || '').trim()),
      code: managedContentItem.code || '',
      relatedItemsHtml: buildPreviewManagedContentLinksHtml(4, managedRootColumn, site),
      bodyHtml: managedContentItem.content_html || managedContentItem.summary || '',
      secondaryMenuItems: buildPreviewColumnMenuItems({
        rootColumn: managedRootColumn,
        column: columnNode,
        baseUrl: managedRootUrl,
        site
      })
    };
  }

  if (effectiveMode === 'single') {
    const pageTreeRootColumn = template.type === 'single'
      ? getPreviewRootColumnByDriver('single_page')
      : getPreviewRootColumnByDriver('page_tree');
    const columnNode = getPreviewColumnNode({
      rootColumn: pageTreeRootColumn,
      fallbackName: '示例单页栏目',
      fallbackContentHtml: '单页栏目内容预览'
    });
    return {
      ...props,
      ...buildPreviewPageContext({
        pageType: 'content',
        title: columnNode.name,
        url: template.type === 'single'
          ? prefixPreviewSitePath('/example-page.html', site)
          : prefixPreviewSitePath(`/about/about-${columnNode.id}.html`, site),
        section: template.type === 'single'
          ? { type: 'content', name: '单页栏目', url: prefixPreviewSitePath('/example-page.html', site) }
          : { type: 'corporation', name: '公司栏目', url: prefixPreviewSitePath('/about/', site) },
        column: columnNode,
        content: null
      }),
      primaryMenuItems: buildPreviewPrimaryMenuItems(template.type === 'single' ? 'contact' : 'corporation', site),
      title: columnNode.name,
      contentHtml: columnNode.content_html || '公司栏目内容预览',
      secondaryMenuItems: template.type === 'single'
        ? []
        : buildPreviewColumnMenuItems({
            rootColumn: pageTreeRootColumn,
            activeId: columnNode.id,
            baseUrl: prefixPreviewSitePath('/about/', site),
            detailPattern: prefixPreviewSitePath('/about/about-{id}.html', site),
            site,
            fallbackName: '示例单页栏目'
          })
    };
  }

  return props;
}

function inferPreviewMode(template) {
  if (template.type === 'home') {
    return 'home';
  }
  if (template.type === 'list') {
    return 'list';
  }
  if (template.type === 'content') {
    return 'content';
  }
  if (template.type === 'single') {
    return 'single';
  }
  if (template.type === 'not_found') {
    return 'not_found';
  }
  return 'generic';
}

function normalizePreviewMode(value) {
  const mode = String(value || 'auto').trim();
  const legacyToGenericMap = new Map([
    ['product-list', 'list'],
    ['column-list', 'list'],
    ['article-list', 'list'],
    ['section-list', 'list'],
    ['service-list', 'list'],
    ['knowledge-list', 'list'],
    ['product-detail', 'content'],
    ['content-detail', 'content'],
    ['article-detail', 'content'],
    ['section-detail', 'content'],
    ['service-detail', 'content'],
    ['knowledge-detail', 'content'],
    ['contact', 'single'],
    ['contact-page', 'single'],
    ['single-page', 'single'],
    ['404', 'not_found'],
    ['not-found', 'not_found'],
    ['not_found', 'not_found']
  ]);
  return legacyToGenericMap.get(mode) || mode || 'auto';
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

function buildPreviewPageContext({ pageType, title, url, section, column, content }) {
  const normalizedColumn = column ? {
    id: toInteger(column.id, 0),
    type: section?.type || '',
    name: column.name || '',
    url: column.url || url || '',
    parentId: toInteger(column.parent_id, 0),
    parentName: '',
    seoDescription: column.seo_description || ''
  } : null;

  return {
    currentPage: { type: pageType || '', title: title || '', url: url || '' },
    currentSection: section ? { type: section.type || '', name: section.name || '', url: section.url || '' } : null,
    currentColumn: normalizedColumn ? [normalizedColumn] : [],
    currentColumnItem: normalizedColumn,
    parentColumn: null,
    currentContent: content ? {
      id: toInteger(content.id, 0),
      type: content.type || '',
      title: content.title || content.name || '',
      name: content.name || content.title || '',
      url: content.url || ''
    } : null
  };
}

function getPreviewManagedRootColumn() {
  return getPreviewRootColumnByDriver('managed_column');
}

function prefixPreviewSitePath(url, site = null, options = {}) {
  return prefixLanguageSitePath(url, normalizeLanguageSitePathPrefix(site?.language_site_path_prefix), {
    allowApi: false,
    allowAssets: false,
    ...options
  });
}

function getPreviewManagedRootPublicUrl(rootColumn = null, site = null) {
  const routePath = String(rootColumn?.route_path || '').trim();
  if (!routePath) {
    const firstPublicUrl = buildPreviewSiteColumns(site).find((item) => String(item?.url || '').trim())?.url || prefixPreviewSitePath('/example-list/', site);
    return normalizePreviewDirectoryUrl(firstPublicUrl);
  }
  return normalizePreviewDirectoryUrl(prefixPreviewSitePath(routePath, site));
}

function getPreviewManagedRootLabel(rootColumn = null) {
  return String(rootColumn?.name || '').trim() || '托管内容';
}

function getPreviewManagedContentItem(rootColumn = null) {
  const rows = getPreviewManagedContentItems(1, rootColumn);
  return rows[0] || {
    id: 1,
    column_id: 1,
    name: '示例内容',
    code: 'DEMO',
    summary: '示例内容摘要',
    content_html: '示例内容正文',
    images: [],
    primary_image: ''
  };
}

function getPreviewManagedContentItems(limit = 8, rootColumn = null) {
  const resolvedRootColumn = rootColumn || getPreviewManagedRootColumn();
  const modelCode = String(resolvedRootColumn?.model_code || '').trim();
  const rows = modelCode
    ? listContentItems(modelCode, { visibleOnly: false, limit })
    : [];
  return rows.length > 0 ? rows : [getPreviewManagedContentItemFallback()];
}

function getPreviewManagedContentItemFallback() {
  return {
    id: 1,
    column_id: 1,
    name: '示例内容',
    code: 'DEMO',
    summary: '示例内容摘要',
    content_html: '示例内容正文',
    images: [],
    primary_image: ''
  };
}

function getPreviewSectionEntry(sectionConfig = null) {
  return getPreviewSectionEntries(1, sectionConfig)[0] || {
    id: 1,
    column_id: 1,
    title: '示例文章',
    summary: '示例文章摘要',
    content_html: '示例文章正文',
    created_at: new Date().toISOString()
  };
}

function getPreviewSectionEntries(limit = 6, sectionConfig = null) {
  const previewSection = resolvePreviewSectionData(sectionConfig);
  const rows = previewSection.entries.slice(0, Math.max(toInteger(limit, 6), 1));
  return rows.length > 0 ? rows : [getPreviewSectionEntryFallback()];
}

function getPreviewSectionEntryFallback() {
  return {
    id: 1,
    column_id: 1,
    title: '示例文章',
    summary: '示例文章摘要',
    content_html: '示例文章正文',
    created_at: new Date().toISOString()
  };
}

function getPreviewRootColumnByDriver(renderDriver) {
  return listColumns().find((item) => (
    item?.column_semantics?.is_root
    && String(item?.column_semantics?.render_driver || '') === String(renderDriver || '')
  )) || null;
}

function getPreviewColumnNode({
  rootColumn = null,
  rootColumnId = null,
  id = null,
  fallbackName = '示例栏目',
  fallbackContentHtml = ''
} = {}) {
  const resolvedRootColumnId = toInteger(rootColumnId || rootColumn?.id, 0);
  const rows = resolvedRootColumnId > 0
    ? listColumnNodesByRoot(resolvedRootColumnId)
    : [];
  const row = id
    ? rows.find((item) => toInteger(item.id, 0) === toInteger(id, 0))
    : rows[0];

  if (row) {
    return {
      ...row,
      id: toInteger(row.id, 0),
      name: row.name || getPreviewColumnFallback({ fallbackName, fallbackContentHtml }).name,
      parent_id: toInteger(row.parent_id, 0),
      seo_description: row.seo_description || getPreviewColumnFallback({ fallbackName, fallbackContentHtml }).seo_description || '',
      content_html: String(row.content_html ?? getPreviewColumnFallback({ fallbackName, fallbackContentHtml }).content_html ?? '')
    };
  }

  return getPreviewColumnFallback({ fallbackName, fallbackContentHtml });
}

function getPreviewColumnFallback({
  fallbackName = '示例栏目',
  fallbackContentHtml = ''
} = {}) {
  return {
    id: 1,
    name: fallbackName,
    parent_id: 0,
    seo_description: '',
    content_html: fallbackContentHtml
  };
}

function buildPreviewRootColumnMenuItems(site = null) {
  return buildPreviewSiteColumns(site).map((item) => ({
    label: item.name || '',
    url: item.url || '',
    active: false
  })).filter((item) => item.url);
}

function buildPreviewSiteColumns(site = null) {
  const rows = listColumns();

  if (rows.length === 0) {
    return PREVIEW_FALLBACK_SITE_COLUMNS.map((item) => ({
      ...item,
      url: prefixPreviewSitePath(item.url || '', site),
      children: Array.isArray(item.children)
        ? item.children.map((child) => ({ ...child, url: prefixPreviewSitePath(child.url || '', site) }))
        : []
    }));
  }

  const publicSections = resolvePublicSectionContext(rows);
  const normalizedRows = rows.map((item) => ({
    id: toInteger(item.id, 0),
    name: item.name || '',
    parentId: toInteger(item.parent_id, 0),
    columnType: item.column_type || '',
    modelCode: item.model_code || '',
    url: buildPreviewColumnUrl(item, publicSections, site)
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
      columnType: item.columnType,
      modelCode: item.modelCode,
      url: item.url
    });
  }

  return normalizedRows
    .filter((item) => item.parentId === 0)
    .map((item) => ({
      ...item,
      children: childrenByParentId.get(item.id) || []
    }))
    .filter((item) => item.url);
}

function buildPreviewPrimaryMenuItems(activeKey = '', site = null) {
  const items = buildPreviewRootColumnMenuItems(site);
  return items.map((item) => ({
    ...item,
    active: !activeKey ? Boolean(item.active) : item.url === activeKey || item.key === activeKey
  }));
}

function buildPreviewColumnUrl(column, rowsById = new Map(), site = null) {
  return prefixPreviewSitePath(buildColumnPublicUrl(column, rowsById), site);
}

function resolvePreviewSections() {
  const rows = listColumns();
  return resolvePublicSectionContext(rows);
}

function buildPreviewColumnMenuItems(options = {}) {
  const resolvedRootColumnId = toInteger(options.rootColumnId || options.rootColumn?.id, 0);
  const rows = resolvedRootColumnId > 0
    ? resolvePreviewSectionData({ rootId: resolvedRootColumnId, section: options.section || null }).rootColumns
    : [];
  const currentColumn = options.column || null;
  const fallbackItem = {
    id: options.activeId || currentColumn?.id || 1,
    name: options.fallbackName || currentColumn?.name || '示例栏目'
  };
  const items = rows.length > 0 ? rows : [fallbackItem];
  const baseUrl = String(options.baseUrl || '').trim();
  const detailPattern = String(options.detailPattern || '').trim();

  return items.map((item) => ({
    label: item.name || '',
    url: detailPattern
      ? detailPattern.replace('{id}', String(toInteger(item.id, 0)))
      : (options.section
          ? prefixPreviewSitePath(buildSectionColumnPublicUrl(options.section, item), options.site)
          : `${baseUrl}${toInteger(item.id, 0)}.html`),
    active: toInteger(item.id, 0) === toInteger(options.activeId, currentColumn?.id || 0)
  }));
}

function buildPreviewSectionColumnUrl(sectionConfig, columnNode) {
  if (sectionConfig?.section && columnNode) {
    return prefixPreviewSitePath(buildSectionColumnPublicUrl(sectionConfig.section, columnNode), sectionConfig?.site);
  }
  return prefixPreviewSitePath(`/${String(sectionConfig?.sectionDir || 'news').replace(/^\/+|\/+$/g, '')}/${toInteger(columnNode?.id, 0)}.html`, sectionConfig?.site);
}

function resolvePreviewSectionData(sectionConfig = null) {
  const columns = listColumns();
  const publicSections = resolvePublicSectionContext(columns);
  const sectionContent = buildSectionContentContext({
    columns,
    publicSections,
    limit: 10000,
    visibleOnly: true
  });
  const section = sectionConfig?.section
    || (sectionConfig?.rootId
      ? publicSections.sections.find((item) => toInteger(item.rootColumnId, 0) === toInteger(sectionConfig.rootId, 0)) || null
      : null)
    || publicSections.getSectionByDirName?.(String(sectionConfig?.sectionDir || '').trim())
    || publicSections.getSectionByType?.(String(sectionConfig?.sectionType || '').trim())
    || null;
  const rootColumns = section ? getSectionTopLevelCategories(sectionContent, section) : [];
  const entries = section
    ? (sectionContent.sectionEntriesByRootId.get(toInteger(section.rootColumnId, 0)) || []).slice()
    : [];
  return {
    section,
    rootColumns,
    entries
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

function buildPreviewManagedContentUrl(contentItem, fallbackColumn = null, site = null) {
  const contentId = toInteger(contentItem?.id, 0);
  const resolvedColumn = listColumns().find((item) => toInteger(item?.id, 0) === toInteger(contentItem?.column_id, 0))
    || fallbackColumn
    || null;

  if (!resolvedColumn) {
    const managedRootUrl = getPreviewManagedRootPublicUrl(getPreviewManagedRootColumn(), site);
    return `${managedRootUrl}detail/${contentId}.html`;
  }

  return prefixPreviewSitePath(buildContentDetailUrlFromColumn(contentItem, resolvedColumn), site);
}

function buildPreviewManagedContentCardsHtml(site = null, rootColumn = null) {
  return getPreviewManagedContentItems(8, rootColumn).map((item) => (
    `<li><img src="${escapeHtml(normalizeUploadedRelativePath(String(item.primary_image || '').trim()))}" width="120" height="120" border="0" alt="${escapeHtml(item.name || '')}"><li><a href="${escapeHtml(buildPreviewManagedContentUrl(item, rootColumn, site))}" target="_blank">${escapeHtml(item.name || '')}</a></li><li class="tvjpnr">${escapeHtml(item.summary || '')}</li></li>`
  )).join('');
}

function buildPreviewManagedContentLinksHtml(limit = 8, rootColumn = null, site = null) {
  return getPreviewManagedContentItems(limit, rootColumn).map((item) => `<li><a href="${escapeHtml(buildPreviewManagedContentUrl(item, rootColumn, site))}">${escapeHtml(item.name || '')}</a></li>`).join('');
}

function buildPreviewSectionEntryLinks(sectionConfig = null, limit = 10) {
  return getPreviewSectionEntries(limit, sectionConfig).map((item) => (
    `<li><a href="${escapeHtml(buildPreviewSectionEntryUrl(item, sectionConfig))}">${escapeHtml(item.title || '')}</a></li>`
  )).join('');
}

function buildPreviewSectionEntryUrl(item, sectionConfig = null) {
  const resolvedSection = sectionConfig?.section || resolvePreviewSectionData(sectionConfig).section || null;
  if (resolvedSection?.rootColumn) {
    return prefixPreviewSitePath(buildContentDetailUrlFromColumn(item, resolvedSection.rootColumn), sectionConfig?.site);
  }
  const dirName = String(sectionConfig?.sectionDir || 'section').replace(/^\/+|\/+$/g, '');
  return prefixPreviewSitePath(`/${dirName}/detail/${toInteger(item?.id, 0)}.html`, sectionConfig?.site);
}

function normalizePreviewDirectoryUrl(publicUrl) {
  const normalizedUrl = String(publicUrl || '').trim();
  if (!normalizedUrl) {
    return '/';
  }
  if (normalizedUrl.endsWith('/')) {
    return normalizedUrl;
  }
  if (/\.html?$/i.test(normalizedUrl)) {
    return normalizedUrl;
  }
  return `${normalizedUrl}/`;
}

function buildPreviewPaginationHrefs(publicUrl, pageNumber = 2, pageCount = 8) {
  const normalizedUrl = String(publicUrl || '').trim();
  const safePageCount = Math.max(toInteger(pageCount, 1), 1);
  const safePageNumber = Math.min(Math.max(toInteger(pageNumber, 1), 1), safePageCount);
  const isDirectoryStyle = normalizedUrl.endsWith('/');
  const buildPageHref = (targetPageNumber) => {
    if (isDirectoryStyle) {
      return targetPageNumber <= 1 ? normalizedUrl : `${normalizedUrl}index-${targetPageNumber}.html`;
    }
    const match = normalizedUrl.match(/^(.*?)(\.html?)$/i);
    if (!match) {
      return targetPageNumber <= 1 ? normalizedUrl : `${normalizedUrl}/index-${targetPageNumber}.html`;
    }
    const [, prefix, extension] = match;
    return targetPageNumber <= 1 ? normalizedUrl : `${prefix}-${targetPageNumber}${extension}`;
  };

  return {
    firstHref: buildPageHref(1),
    previousHref: safePageNumber > 1 ? buildPageHref(safePageNumber - 1) : '',
    nextHref: safePageNumber < safePageCount ? buildPageHref(safePageNumber + 1) : '',
    lastHref: buildPageHref(safePageCount)
  };
}

function buildPreviewPaginationData(publicUrl, {
  pageNumber = 2,
  pageCount = 8,
  totalRecords = 108,
  pageSize = 14
} = {}) {
  const hrefs = buildPreviewPaginationHrefs(publicUrl, pageNumber, pageCount);
  return {
    pagination: {
      pageNumber,
      pageCount,
      totalRecords,
      pageSize,
      ...hrefs
    },
    pagerText: {
      first: '首页',
      previous: '上一页',
      next: '下一页',
      last: '末页',
      recordsPrefix: '共',
      recordsSuffix: '条信息',
      pageLabel: '页次：',
      perPageSuffix: '条信息/页',
    }
  };
}

function formatPreviewDate(value) {
  return String(value || '').slice(0, 10);
}

function renderPreviewTemplate(template, props, components, depth, previewState) {
  collectPreviewTemplateStyle(template, previewState);
  return renderTsxTemplate(template.tsx_source || '', props, {
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
  if (!component?.tsx_source) {
    return null;
  }
  collectPreviewTemplateStyle(component, previewState);
  return createTsxTemplateElement(component.tsx_source || '', props, {
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
  if (!component?.tsx_source) {
    return `<!-- missing component: ${escapeHtml(code)} -->`;
  }
  collectPreviewTemplateStyle(component, previewState);
  return renderTsxTemplate(component.tsx_source || '', props, {
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
  if (!previewState?.styleAssets || !template) {
    return;
  }
  const templateStyleSource = buildTemplateStyleSource(template);
  const asset = template.engine === 'tsx' && templateStyleSource
    ? getTsxTemplateStyleAsset(templateStyleSource, {
      templateCode: template.code
    })
    : null;
  if (!asset) {
    return;
  }
  previewState.styleAssets.set(asset.code, asset);
}

function injectPreviewTsxStyles(html, styleAssets) {
  const assets = Array.from(styleAssets?.values?.() || []);

  if (assets.length === 0) {
    return html;
  }
  const styleHtml = assets
    .map((asset) => `<style data-cms-template-style="${escapeHtml(asset.code)}">\n${asset.cssText}\n</style>`)
    .join('\n');

  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${styleHtml}\n</head>`);
  }
  return `${styleHtml}\n${html}`;
}

function mergePreviewComponentProps(baseProps, extraProps) {
  const restBaseProps = pickPreviewComponentContextProps(baseProps);
  return {
    ...restBaseProps,
    ...(extraProps || {})
  };
}

function pickPreviewComponentContextProps(source) {
  if (!source || typeof source !== 'object') {
    return {};
  }

  const keys = [
    'site',
    'siteColumns',
    'utilityColumns',
    'footerColumns',
    'footerMeta',
    'footerManagedColumnCategories',
    'columnTag',
    'fragments',
    'currentPage',
    'currentSection',
    'currentColumn',
    'currentColumnItem',
    'parentColumn',
    'currentContent',
    'currentManagedItem',
    'currentArticle',
    'currentColumnDescription',
    'currentColumnPageData',
    'currentColumnHeroImage',
    'currentManagedItemPageData',
    'sectionNavItems',
    'seoMeta',
    'jsonLd',
    'faviconLinks',
    'themeColorMetas',
    'hreflangLinks',
    'component',
    'raw',
    'Raw'
  ];

  const next = {};
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      next[key] = source[key];
    }
  }
  return next;
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
  const row = queryOne(
    `
      SELECT
        ${TEMPLATE_SELECT_FIELDS}
      FROM templates
      WHERE code = ? ${whereTheme}
      LIMIT 1
    `,
    params
  );
  return row ? hydrateTemplateRecord(row) : null;
}

function hydrateTemplateRecord(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    tsx_source: String(row.tsx_source ?? ''),
    css_source: String(row.css_source ?? ''),
    published_tsx_source: row.published_tsx_source == null ? null : String(row.published_tsx_source ?? ''),
    published_css_source: row.published_css_source == null ? null : String(row.published_css_source ?? '')
  };
}

function hydratePublishedTemplateRecord(row) {
  const template = hydrateTemplateRecord(row);
  if (!template) {
    return null;
  }
  return {
    ...template,
    tsx_source: template.published_tsx_source ?? template.tsx_source,
    css_source: template.published_css_source ?? template.css_source
  };
}

function hydrateTemplateVersionRecord(row) {
  if (!row) {
    return null;
  }
  return {
    ...row,
    tsx_source: String(row.tsx_source ?? ''),
    css_source: String(row.css_source ?? '')
  };
}

function buildTemplateStyleSource(template) {
  if (!template) {
    return '';
  }
  const cssSource = String(template.css_source ?? '');
  return cssSource ? buildStyleCarrierSource(cssSource) : '';
}

function collapseLegacyInlineTsxStyleSources() {
  const templateRows = queryAll(`
    SELECT id, code, tsx_source, css_source, published_tsx_source, published_css_source
    FROM templates
    WHERE instr(coalesce(tsx_source, ''), 'export const scss') > 0
       OR instr(coalesce(tsx_source, ''), 'export const css') > 0
       OR instr(coalesce(published_tsx_source, ''), 'export const scss') > 0
       OR instr(coalesce(published_tsx_source, ''), 'export const css') > 0
  `);

  for (const row of templateRows) {
    const draftParts = extractInlineTemplateStyleParts(row.tsx_source, `${row.code || row.id}:draft`);
    const publishedParts = row.published_tsx_source == null
      ? null
      : extractInlineTemplateStyleParts(row.published_tsx_source, `${row.code || row.id}:published`);

    const nextCssSource = mergeTemplateStyleText(row.css_source, draftParts.css_source);
    const nextPublishedCssSource = publishedParts
      ? mergeTemplateStyleText(row.published_css_source, publishedParts.css_source)
      : row.published_css_source;

    if (
      draftParts.migrated
      || (publishedParts && publishedParts.migrated)
      || nextCssSource !== String(row.css_source ?? '')
      || nextPublishedCssSource !== row.published_css_source
    ) {
      execute(
        `
          UPDATE templates
          SET
            tsx_source = ?,
            css_source = ?,
            published_tsx_source = ?,
            published_css_source = ?
          WHERE id = ?
        `,
        [
          draftParts.tsx_source,
          nextCssSource,
          publishedParts ? publishedParts.tsx_source : row.published_tsx_source,
          nextPublishedCssSource == null ? null : nextPublishedCssSource,
          row.id
        ]
      );
    }
  }

  const versionRows = queryAll(`
    SELECT id, template_id, version_no, tsx_source, css_source
    FROM template_versions
    WHERE instr(coalesce(tsx_source, ''), 'export const scss') > 0
       OR instr(coalesce(tsx_source, ''), 'export const css') > 0
  `);

  for (const row of versionRows) {
    const parts = extractInlineTemplateStyleParts(
      row.tsx_source,
      `template-version-${row.template_id}-${row.version_no}`
    );
    const nextCssSource = mergeTemplateStyleText(row.css_source, parts.css_source);
    if (parts.migrated || nextCssSource !== String(row.css_source ?? '')) {
      execute(
        `
          UPDATE template_versions
          SET tsx_source = ?, css_source = ?
          WHERE id = ?
        `,
        [parts.tsx_source, nextCssSource, row.id]
      );
    }
  }
}

function collapseLegacyGlobalCssSources() {
  const templateColumns = new Set(queryAll('PRAGMA table_info(templates)').map((column) => String(column.name || '')));
  const versionColumns = new Set(queryAll('PRAGMA table_info(template_versions)').map((column) => String(column.name || '')));

  const hasTemplateGlobalCssColumns = templateColumns.has('global_css_source') && templateColumns.has('published_global_css_source');
  const hasVersionGlobalCssColumn = versionColumns.has('global_css_source');

  if (!hasTemplateGlobalCssColumns && !hasVersionGlobalCssColumn) {
    return;
  }

  const templateRows = queryAll(`
    SELECT id, css_source, global_css_source, published_css_source, published_global_css_source
    FROM templates
    WHERE trim(coalesce(global_css_source, '')) <> ''
       OR trim(coalesce(published_global_css_source, '')) <> ''
  `);

  if (hasTemplateGlobalCssColumns) {
    for (const row of templateRows) {
      const nextCssSource = mergeTemplateCssSources(row.css_source, row.global_css_source);
      const nextPublishedCssSource = mergeTemplateCssSources(row.published_css_source, row.published_global_css_source);
      execute(
        `
          UPDATE templates
          SET css_source = ?, global_css_source = '', published_css_source = ?, published_global_css_source = ''
          WHERE id = ?
        `,
        [nextCssSource, nextPublishedCssSource || null, row.id]
      );
    }
  }

  if (hasVersionGlobalCssColumn) {
    const versionRows = queryAll(`
      SELECT id, css_source, global_css_source
      FROM template_versions
      WHERE trim(coalesce(global_css_source, '')) <> ''
    `);

    for (const row of versionRows) {
      const nextCssSource = mergeTemplateCssSources(row.css_source, row.global_css_source);
      execute(
        `
          UPDATE template_versions
          SET css_source = ?, global_css_source = ''
          WHERE id = ?
        `,
        [nextCssSource, row.id]
      );
    }
  }
}

function ensureSingleCssSourceSchema() {
  const templateColumns = queryAll('PRAGMA table_info(templates)');
  const versionColumns = queryAll('PRAGMA table_info(template_versions)');
  const templatesNeedRebuild = templateColumns.some((column) => (
    column.name === 'global_css_source' || column.name === 'published_global_css_source'
  ));
  const versionsNeedRebuild = versionColumns.some((column) => column.name === 'global_css_source');

  if (!templatesNeedRebuild && !versionsNeedRebuild) {
    return;
  }

  getDb().exec(`
    PRAGMA foreign_keys = OFF;
    BEGIN TRANSACTION;
  `);

  if (templatesNeedRebuild) {
    getDb().exec(`
      ALTER TABLE templates RENAME TO templates__old_single_css_migration;
      ${TEMPLATES_TABLE_SCHEMA}

      INSERT INTO templates (
        id, theme_id, name, type, code, engine, tsx_source, css_source, published_tsx_source, published_css_source, status, is_default, sort_order, created_at, updated_at
      )
      SELECT
        id, theme_id, name, type, code, coalesce(engine, 'tsx'), tsx_source, css_source, published_tsx_source, published_css_source, status, is_default, sort_order, created_at, updated_at
      FROM templates__old_single_css_migration;

      DROP TABLE templates__old_single_css_migration;
    `);
  }

  if (versionsNeedRebuild) {
    getDb().exec(`
      ALTER TABLE template_versions RENAME TO template_versions__old_single_css_migration;
      ${TEMPLATE_VERSIONS_TABLE_SCHEMA}

      INSERT INTO template_versions (
        id, template_id, version_no, engine, tsx_source, css_source, note, created_at
      )
      SELECT
        id, template_id, version_no, coalesce(engine, 'tsx'), tsx_source, css_source, note, created_at
      FROM template_versions__old_single_css_migration;

      DROP TABLE template_versions__old_single_css_migration;
    `);
  }

  getDb().exec(`
    COMMIT;
    PRAGMA foreign_keys = ON;
  `);
}

function buildStyleCarrierSource(styleSource) {
  return [
    `export const scss = String.raw\`${escapeTemplateLiteral(styleSource)}\`;`,
    '',
    'export default function TemplateStyleCarrier() {',
    '  return null;',
    '}',
    ''
  ].join('\n');
}

function extractInlineTemplateStyleParts(source, templateCode = '') {
  const normalizedSource = String(source ?? '');
  const declarationMatch = /export const (scss|css)\s*=\s*/.exec(normalizedSource);
  if (!declarationMatch) {
    return {
      tsx_source: normalizedSource,
      css_source: '',
      migrated: false
    };
  }

  const declarationStart = declarationMatch.index ?? -1;
  if (declarationStart < 0) {
    return {
      tsx_source: normalizedSource,
      css_source: '',
      migrated: false
    };
  }

  const declarationEnd = findInlineTemplateStyleDeclarationEnd(
    normalizedSource,
    declarationStart + declarationMatch[0].length
  );
  if (declarationEnd < 0) {
    return {
      tsx_source: normalizedSource,
      css_source: '',
      migrated: false
    };
  }

  const moduleExports = getTsxTemplateModuleExports(normalizedSource, { templateCode });
  const cssSource = pickInlineTemplateStyleValue(moduleExports?.css, moduleExports?.scss);
  if (!cssSource) {
    return {
      tsx_source: normalizedSource,
      css_source: '',
      migrated: false
    };
  }

  return {
    tsx_source: `${normalizedSource.slice(0, declarationStart)}${normalizedSource.slice(declarationEnd)}`.trim(),
    css_source: cssSource,
    migrated: true
  };
}

function findInlineTemplateStyleDeclarationEnd(source, declarationValueStart) {
  let index = skipWhitespace(source, declarationValueStart);
  if (source.startsWith('String.raw', index)) {
    index += 'String.raw'.length;
    index = skipWhitespace(source, index);
  }

  const quote = source[index];
  if (quote !== '`' && quote !== '"' && quote !== '\'') {
    return -1;
  }

  const literalEnd = findInlineTemplateStyleLiteralEnd(source, index, quote);
  if (literalEnd < 0) {
    return -1;
  }

  index = literalEnd + 1;
  index = skipWhitespace(source, index);
  if (source[index] === ';') {
    index += 1;
  }
  return skipWhitespace(source, index);
}

function findInlineTemplateStyleLiteralEnd(source, startIndex, quote) {
  for (let index = startIndex + 1; index < source.length; index += 1) {
    const char = source[index];
    if (char === '\\') {
      index += 1;
      continue;
    }
    if (quote === '`' && char === '$' && source[index + 1] === '{') {
      return -1;
    }
    if (char === quote) {
      return index;
    }
  }
  return -1;
}

function pickInlineTemplateStyleValue(cssValue, scssValue) {
  const cssSource = String(cssValue ?? '').trim();
  const scssSource = String(scssValue ?? '').trim();
  if (cssSource && scssSource) {
    throw new Error('TSX 模板不能同时导出 css 和 scss，请只保留一种。');
  }
  return scssSource || cssSource;
}

function mergeTemplateStyleText(existingSource, nextSource) {
  const existing = String(existingSource ?? '').trim();
  const next = String(nextSource ?? '').trim();
  if (!existing) {
    return next;
  }
  if (!next || existing === next) {
    return existing;
  }
  return `${existing}\n\n${next}`;
}

function skipWhitespace(source, startIndex) {
  let index = startIndex;
  while (index < source.length && /\s/.test(source[index])) {
    index += 1;
  }
  return index;
}

function escapeTemplateLiteral(value) {
  return String(value ?? '')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${');
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

function buildTemplateValidationProps(template, siteConfig = null) {
  const scopedHomeUrl = prefixPreviewSitePath('/', siteConfig);
  const scopedParentUrl = prefixPreviewSitePath('/parent.html', siteConfig);
  const scopedCurrentUrl = prefixPreviewSitePath('/current.html', siteConfig);
  const scopedDetailUrl = prefixPreviewSitePath('/detail.html', siteConfig);
  const siteTemplateData = siteConfig?.template_data && typeof siteConfig.template_data === 'object' && !Array.isArray(siteConfig.template_data)
    ? siteConfig.template_data
    : {};
  const common = {
    site: {
      web_name: siteConfig?.web_name || '示例网站',
      company_name: siteConfig?.company_name || '示例公司',
      company_phone: siteConfig?.company_phone || '021-00000000',
      company_fax: siteConfig?.company_fax || '021-00000001',
      web_mobile: siteConfig?.web_mobile || '13800000000',
      company_email: siteConfig?.company_email || 'demo@example.com',
      company_address: siteConfig?.company_address || '示例地址',
      web_url: scopedHomeUrl,
      base_web_url: siteConfig?.base_web_url || '',
      resolved_web_url: siteConfig?.resolved_web_url || scopedHomeUrl,
      requested_language_code: siteConfig?.requested_language_code || siteConfig?.current_language_code || '',
      current_language_code: siteConfig?.current_language_code || siteConfig?.requested_language_code || '',
      resolved_language_code: siteConfig?.resolved_language_code || siteConfig?.current_language_code || siteConfig?.requested_language_code || '',
      icp_number: siteConfig?.icp_number || '',
      web_qq: siteConfig?.web_qq || '',
      template_data: siteTemplateData,
      language_site_path_prefix: normalizeLanguageSitePathPrefix(siteConfig?.language_site_path_prefix)
    },
    fragments: {
      indextopHtml: '',
      topHtml: '',
      bottomHtml: '',
      indexFootHtml: '',
      aboutHtml: '',
      managedMenuHtml: '',
      managedMenuCompactHtml: '',
      aboutCategoryHtml: '',
      newsCategoryHtml: '',
      serviceCategoryHtml: ''
    },
    currentPage: { type: template.type || '', title: template.name || '', url: scopedHomeUrl },
    currentSection: { type: '', name: '', url: '' },
    currentColumn: [
      { id: 1, type: 'demo', name: '父级分类', url: scopedParentUrl, parentId: 0, parentName: '', seoDescription: '' },
      { id: 2, type: 'demo', name: '当前分类', url: scopedCurrentUrl, parentId: 1, parentName: '父级分类', seoDescription: '' }
    ],
    currentColumnItem: { id: 2, type: 'demo', name: '当前分类', url: scopedCurrentUrl, parentId: 1, parentName: '父级分类', seoDescription: '' },
    parentColumn: { id: 1, type: 'demo', name: '父级分类', url: scopedParentUrl, parentId: 0, parentName: '', seoDescription: '' },
    currentContent: { id: 1, type: 'demo', title: '示例内容', name: '示例内容', url: scopedDetailUrl },
    siteColumns: buildPreviewSiteColumns(siteConfig),
    component: () => null,
    primaryMenuItems: buildPreviewPrimaryMenuItems('home', siteConfig),
    item: {
      id: 1,
      name: '示例产品',
      title: '示例标题',
      url: scopedDetailUrl,
      image: '',
      summary: '示例摘要',
      summaryClassName: '',
      openings: '1',
      address: '上海',
      date: '2026-06-09'
    },
    items: [],
    pagerHtml: '',
    pagination: {
      pageNumber: 1,
      pageCount: 1,
      totalRecords: 0,
      pageSize: 0,
      firstHref: '',
      previousHref: '',
      nextHref: '',
      lastHref: '',
    },
    pagerText: {
      first: '首页',
      previous: '上一页',
      next: '下一页',
      last: '末页',
      recordsPrefix: '共',
      recordsSuffix: '条信息',
      pageLabel: '页次：',
      perPageSuffix: '条信息/页',
    },
    title: '示例标题',
    bodyHtml: '',
    contentHtml: '',
    contactTableHtml: '',
    relatedItemsHtml: '',
    previousHtml: '',
    nextHtml: '',
    sectionCategoryHtml: '',
    newsIndexHtml: '',
    featuredManagedItemsHtml: '',
    featuredManagedItemLinksHtml: '',
    serviceIndexHtml: '',
    collectionCategoryHtml: '',
    primaryMenuLabel: '站点导航',
    secondaryMenuItems: [],
    smallName: '示例分类',
    bigId: 1,
    bigName: '示例父级分类',
    itemDescription: '示例描述',
    image: '',
    code: 'DEMO',
    section: 'news',
    sectionDir: 'news',
    sectionLabel: '公司新闻',
    columnId: 1,
    itemDescription: '示例描述',
    columnName: '示例分类',
    address: '上海',
    openings: '1',
    requirementsHtml: '',
    contactPerson: '联系人',
    phone: '021-00000000',
    date: '2026-06-09'
  };

  return common;
}

function finalizePreviewHtmlOutput(html, siteConfig = null) {
  const output = String(html || '');
  const pathPrefix = normalizeLanguageSitePathPrefix(siteConfig?.language_site_path_prefix);
  if (!output || pathPrefix === '/') {
    return output;
  }

  return output.replace(/(\b(?:href|action|content|data-search-api-url)=["'])(\/[^"']*)(["'])/gi, (match, prefix, url, suffix) => {
    const rewritten = prefixLanguageSitePath(url, pathPrefix, {
      allowApi: false,
      allowAssets: false
    });
    return `${prefix}${rewritten}${suffix}`;
  });
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
  if (!['site', 'content_type', 'column'].includes(normalizedTargetType)) {
    throw new Error('invalid binding target type');
  }
  if (!['home', 'list', 'content', 'single', 'not_found', 'topic'].includes(templateType)) {
    throw new Error('invalid binding template type');
  }

  return {
    theme_id: normalizedThemeId,
    target_type: normalizedTargetType,
    target_id: targetId == null || String(targetId).trim() === '' ? null : toInteger(targetId, null),
    template_type: templateType
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
  ensureThemeBindingByCode(defaultThemeId, 'content_type', CONTENT_TYPE_PRODUCT_ID, 'list', 'default_managed_list_tsx');
  ensureThemeBindingByCode(defaultThemeId, 'content_type', CONTENT_TYPE_PRODUCT_ID, 'content', 'default_managed_detail_tsx');
  ensureThemeBindingByCode(defaultThemeId, 'content_type', CONTENT_TYPE_ARTICLE_ID, 'list', 'default_article_list_tsx');
  ensureThemeBindingByCode(defaultThemeId, 'content_type', CONTENT_TYPE_ARTICLE_ID, 'content', 'default_article_detail_tsx');
  ensureThemeBindingByCode(defaultThemeId, 'content_type', CONTENT_TYPE_CORPORATION_ID, 'content', 'default_content_tsx');
  ensureThemeBindingByCode(defaultThemeId, 'content_type', CONTENT_TYPE_CONTACT_ID, 'content', 'default_contact_tsx');
}

function ensureThemeNotFoundTemplates() {
  const themes = queryAll(
    `
      SELECT id
      FROM template_variants
      ORDER BY id ASC
    `
  );

  for (const theme of themes) {
    ensureThemeNotFoundTemplate(theme);
  }
}

function ensureThemeNotFoundTemplate(theme) {
  const themeId = toInteger(theme?.id, null);
  if (!themeId) {
    return;
  }

  const existing = queryOne(
    `
      SELECT id
      FROM templates
      WHERE theme_id = ? AND type = 'not_found'
      ORDER BY sort_order ASC, id ASC
      LIMIT 1
    `,
    [themeId]
  );
  if (existing?.id) {
    const tsxSource = buildDefaultNotFoundTsxSource();
    const cssSource = buildDefaultNotFoundCssSource();
    execute(
      `
        UPDATE templates
        SET
          code = 'not_found',
          tsx_source = ?,
          css_source = ?,
          published_tsx_source = ?,
          published_css_source = ?,
          updated_at = ?
        WHERE id = ?
      `,
      [tsxSource, cssSource, tsxSource, cssSource, new Date().toISOString(), existing.id]
    );
    return;
  }

  const tsxSource = buildDefaultNotFoundTsxSource();
  const cssSource = buildDefaultNotFoundCssSource();
  const now = new Date().toISOString();
  execute(
    `
      INSERT INTO templates (
        theme_id,
        name,
        type,
        code,
        engine,
        tsx_source,
        css_source,
        published_tsx_source,
        published_css_source,
        status,
        is_default,
        sort_order,
        created_at,
        updated_at
      )
      VALUES (?, ?, 'not_found', 'not_found', 'tsx', ?, ?, ?, ?, 'published', 0, 0, ?, ?)
    `,
    [
      themeId,
      '404 页面模板',
      tsxSource,
      cssSource,
      tsxSource,
      cssSource,
      now,
      now
    ]
  );
}

function buildDefaultNotFoundTsxSource() {
  return [
    'export default function NotFoundTemplate(props) {',
    '  const languageCode = String(props?.site?.requested_language_code || props?.site?.current_language_code || "en").trim();',
    '  const dictionaries = {',
    '    en: { title: "Page not found", description: "The page you requested does not exist or has been removed.", section: "Error page", homeLabel: "Home" },',
    '    "zh-CN": { title: "页面未找到", description: "您访问的页面不存在或已被移除。", section: "错误页面", homeLabel: "首页" },',
    '    ru: { title: "Страница не найдена", description: "Запрошенная страница не существует или была удалена.", section: "Страница ошибки", homeLabel: "Главная" },',
    '    ar: { title: "الصفحة غير موجودة", description: "الصفحة التي طلبتها غير موجودة أو تمت إزالتها.", section: "صفحة الخطأ", homeLabel: "الرئيسية" },',
    '    "ar-me": { title: "الصفحة غير موجودة", description: "الصفحة التي طلبتها غير موجودة أو تمت إزالتها.", section: "صفحة الخطأ", homeLabel: "الرئيسية" },',
    '    es: { title: "Página no encontrada", description: "La página solicitada no existe o ha sido eliminada.", section: "Página de error", homeLabel: "Inicio" },',
    '    id: { title: "Halaman tidak ditemukan", description: "Halaman yang Anda minta tidak ada atau telah dihapus.", section: "Halaman error", homeLabel: "Beranda" },',
    '    pt: { title: "Página não encontrada", description: "A página solicitada não existe ou foi removida.", section: "Página de erro", homeLabel: "Início" },',
    '    fr: { title: "Page introuvable", description: "La page demandée n existe pas ou a été supprimée.", section: "Page d erreur", homeLabel: "Accueil" },',
    '    tr: { title: "Sayfa bulunamadı", description: "İstediğiniz sayfa mevcut değil veya kaldırılmış.", section: "Hata sayfası", homeLabel: "Ana sayfa" },',
    '    th: { title: "ไม่พบหน้า", description: "หน้าที่คุณร้องขอไม่มีอยู่หรือถูกลบออกแล้ว", section: "หน้าข้อผิดพลาด", homeLabel: "หน้าแรก" },',
    '    vi: { title: "Không tìm thấy trang", description: "Trang bạn yêu cầu không tồn tại hoặc đã bị xóa.", section: "Trang lỗi", homeLabel: "Trang chủ" }',
    '  };',
    '  const exactCopy = dictionaries[languageCode];',
    '  const baseCopy = dictionaries[String(languageCode).split("-")[0]];',
    '  const copy = exactCopy || baseCopy || dictionaries.en;',
    '  const title = copy.title;',
    '  const description = copy.description;',
    '  const sectionLabel = copy.section;',
    '  const canonicalUrl = "/404.html";',
    '  const headChildren = (',
    '    <>',
    '      <title>{`404 - ${title}`}</title>',
    '      <meta name="description" content={description} />',
    '      <meta name="robots" content="noindex, nofollow" />',
    '    </>',
    '  );',
    '  const content = (',
    '    <section className="cms-not-found-placeholder">',
    '      <div className="cms-not-found-placeholder__inner">',
    '        <p className="cms-not-found-placeholder__code">404</p>',
    '        <h1>{title}</h1>',
    '        <p>{description}</p>',
    '      </div>',
    '    </section>',
    '  );',
    '',
    '  if (typeof props.component === "function") {',
    '    return props.component("spirax_shell", {',
    '      ...props,',
    '      title: "404",',
    '      currentPage: { ...(props.currentPage || {}), title, url: canonicalUrl },',
    '      currentSection: { ...(props.currentSection || {}), name: sectionLabel, url: canonicalUrl },',
    '      itemDescription: description,',
    '      headChildren,',
    '      children: content,',
    '      content,',
    '      body: content,',
    '      bodyContent: content,',
    '      mainContent: content,',
    '    });',
    '  }',
    '',
    '  return content;',
    '}',
    ''
  ].join('\n');
}

function buildDefaultNotFoundCssSource() {
  return [
    '.cms-not-found-placeholder {',
    '  padding: 72px 20px 96px;',
    '}',
    '',
    '.cms-not-found-placeholder__inner {',
    '  max-width: 720px;',
    '  margin: 0 auto;',
    '  text-align: center;',
    '}',
    '',
    '.cms-not-found-placeholder__code {',
    '  margin: 0;',
    '  font-size: 14px;',
    '  font-weight: 700;',
    '  letter-spacing: 0.2em;',
    '  text-transform: uppercase;',
    '  color: #b91c1c;',
    '}',
    '',
    '.cms-not-found-placeholder h1 {',
    '  margin: 0;',
    '  padding-top: 12px;',
    '  font-size: clamp(32px, 6vw, 56px);',
    '  line-height: 1.1;',
    '}',
    '',
    '.cms-not-found-placeholder p {',
    '  margin: 16px auto 0;',
    '  max-width: 32rem;',
    '  line-height: 1.7;',
    '  color: #334155;',
    '}',
    ''
  ].join('\n');
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
    && String(sql).includes("CHECK (template_type IN ('home', 'list', 'content', 'single', 'not_found', 'topic'))")
    && String(sql).includes('REFERENCES templates(id)')
    && !String(sql).includes('templates__old_theme_code_scope')
    && !String(sql).includes('templates__old_engine_check')
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
      template_type TEXT NOT NULL CHECK (template_type IN ('home', 'list', 'content', 'single', 'not_found', 'topic')),
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
    && String(sql).includes("CHECK (type IN ('home', 'list', 'content', 'single', 'not_found', 'topic', 'component'))")
  ) {
    return;
  }

  reconcileDuplicateTemplateCodesByTheme();

  getDb().exec(`
    PRAGMA foreign_keys = OFF;
    BEGIN TRANSACTION;

    ALTER TABLE templates RENAME TO templates__old_theme_code_scope;

    ${TEMPLATES_TABLE_SCHEMA}

    INSERT INTO templates (
      id, theme_id, name, type, code, engine, tsx_source, css_source, published_tsx_source, published_css_source, status, is_default, sort_order, created_at, updated_at
    )
    SELECT
      id, theme_id, name, type, code, 'tsx', tsx_source, css_source, published_tsx_source, published_css_source, status, is_default, sort_order, created_at, updated_at
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
    && String(sql).includes("CHECK (type IN ('home', 'list', 'content', 'single', 'not_found', 'topic', 'component'))")
  ) {
    return;
  }

  getDb().exec(`
    PRAGMA foreign_keys = OFF;
    BEGIN TRANSACTION;

    ALTER TABLE templates RENAME TO templates__old_engine_check;

    ${TEMPLATES_TABLE_SCHEMA}

    INSERT INTO templates (
      id, theme_id, name, type, code, engine, tsx_source, css_source, published_tsx_source, published_css_source, status, is_default, sort_order, created_at, updated_at
    )
    SELECT
      id, theme_id, name, type, code, 'tsx', tsx_source, css_source, published_tsx_source, published_css_source, status, is_default, sort_order, created_at, updated_at
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

    ${TEMPLATE_VERSIONS_TABLE_SCHEMA}

    INSERT INTO template_versions (
      id, template_id, version_no, engine, tsx_source, css_source, note, created_at
    )
    SELECT
      id, template_id, version_no, 'tsx', tsx_source, css_source, note, created_at
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

    ${TEMPLATE_VERSIONS_TABLE_SCHEMA}

    INSERT INTO template_versions (
      id, template_id, version_no, engine, tsx_source, css_source, note, created_at
    )
    SELECT
      id, template_id, version_no, 'tsx', tsx_source, css_source, note, created_at
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
