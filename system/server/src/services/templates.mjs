import { execute, getDb, queryAll, queryOne } from '../db.mjs';

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
