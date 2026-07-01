import { execute, getDb, queryAll, queryOne } from '../db.mjs';
import { createTemplate, ensureTemplatesSchema, getTemplateById, listTemplates, publishTemplate, updateTemplate } from './templates.mjs';
import { getSelectedTemplateVariant } from './template-variants.mjs';

let schemaEnsured = false;

const DOCUMENT_TYPES = ['quote', 'contract'];
const QUOTE_REMARKS_BG_BASE64 = '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';

const DEFAULT_DOCUMENT_TEMPLATE_DEFINITIONS = [
  {
    key: 'default_quote_workspace',
    name: '斯派莎克报价单',
    description: '适用于销售报价和后续打印导出。',
    document_type: 'quote',
    template_code: 'doc_quote_default',
    template_name: '文档模板-斯派莎克报价单',
    sort_order: 10,
    default_payload: buildDefaultDraftPayload('quote', {
      title: '斯派莎克报价单',
      documentNumberPrefix: 'SP',
      paymentText: '30%预付款，发货前70%',
    }),
    template_source: buildQuoteTemplateSource(),
    css_source: buildQuoteTemplateCss(),
  },
  {
    key: 'default_quote_workspace_en',
    name: '斯派莎克报价单（英文版）',
    description: '适用于英文销售报价和打印导出。',
    document_type: 'quote',
    template_code: 'doc_quote_default_en',
    template_name: '文档模板-斯派莎克报价单（英文版）',
    sort_order: 11,
    default_payload: buildDefaultDraftPayload('quote', {
      title: 'Spirax Sarco Quotation',
      documentNumberPrefix: 'SP',
      language: 'en-US',
      validityText: 'Valid for 30 days',
      paymentText: '30% advance payment, 70% before shipment',
    }),
    template_source: buildEnglishQuoteTemplateSource(),
    css_source: buildQuoteTemplateCss(),
  },
  {
    key: 'default_contract_workspace',
    name: '标准销售合同',
    description: '适用于销售合同起草、校对和打印导出。',
    document_type: 'contract',
    template_code: 'doc_contract_default',
    template_name: '文档模板-标准销售合同',
    sort_order: 20,
    default_payload: buildDefaultDraftPayload('contract'),
    template_source: buildContractTemplateSource(),
    css_source: buildContractTemplateCss(),
  },
];

export function ensureDocumentTemplatesSchema() {
  if (schemaEnsured) {
    return;
  }

  ensureTemplatesSchema();

  getDb().exec(`
    CREATE TABLE IF NOT EXISTS document_templates (
      id INTEGER PRIMARY KEY,
      theme_id INTEGER NOT NULL,
      key TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      document_type TEXT NOT NULL CHECK (document_type IN ('quote', 'contract')),
      template_id INTEGER NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      default_payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (theme_id, key),
      FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_document_templates_theme_type_sort
      ON document_templates(theme_id, document_type, sort_order, id);
  `);

  ensureDocumentTemplatesSchemaColumns();

  schemaEnsured = true;
}

export function listDocumentTemplates({ documentType, themeId } = {}) {
  ensureDocumentTemplatesSchema();
  const normalizedThemeId = resolveThemeId(themeId);
  ensureThemeDocumentTemplates(normalizedThemeId);

  const params = [normalizedThemeId];
  let where = 'WHERE dt.theme_id = ?';
  if (documentType) {
    const normalizedDocumentType = normalizeDocumentType(documentType);
    where += ' AND dt.document_type = ?';
    params.push(normalizedDocumentType);
  }

  return queryAll(
    `
      SELECT
        dt.id,
        dt.theme_id,
        dt.key,
        dt.name,
        dt.description,
        dt.document_type,
        dt.template_id,
        dt.sort_order,
        dt.default_payload_json,
        dt.created_at,
        dt.updated_at,
        t.code AS template_code,
        t.name AS template_name,
        t.status AS template_status
      FROM document_templates dt
      INNER JOIN templates t ON t.id = dt.template_id
      ${where}
      ORDER BY dt.document_type ASC, dt.sort_order ASC, dt.id ASC
    `,
    params
  ).map(hydrateDocumentTemplateRecord);
}

export function getDocumentTemplateById(id, { themeId } = {}) {
  ensureDocumentTemplatesSchema();
  const normalizedThemeId = resolveThemeId(themeId);
  ensureThemeDocumentTemplates(normalizedThemeId);

  const row = queryOne(
    `
      SELECT
        dt.id,
        dt.theme_id,
        dt.key,
        dt.name,
        dt.description,
        dt.document_type,
        dt.template_id,
        dt.sort_order,
        dt.default_payload_json,
        dt.created_at,
        dt.updated_at,
        t.code AS template_code,
        t.name AS template_name,
        t.status AS template_status
      FROM document_templates dt
      INNER JOIN templates t ON t.id = dt.template_id
      WHERE dt.id = ? AND dt.theme_id = ?
      LIMIT 1
    `,
    [id, normalizedThemeId]
  );

  return hydrateDocumentTemplateRecord(row);
}

export function getDocumentTemplateByKey(key, { themeId } = {}) {
  ensureDocumentTemplatesSchema();
  const normalizedThemeId = resolveThemeId(themeId);
  ensureThemeDocumentTemplates(normalizedThemeId);
  const normalizedKey = String(key || '').trim();
  if (!normalizedKey) {
    return null;
  }

  const row = queryOne(
    `
      SELECT
        dt.id,
        dt.theme_id,
        dt.key,
        dt.name,
        dt.description,
        dt.document_type,
        dt.template_id,
        dt.sort_order,
        dt.default_payload_json,
        dt.created_at,
        dt.updated_at,
        t.code AS template_code,
        t.name AS template_name,
        t.status AS template_status
      FROM document_templates dt
      INNER JOIN templates t ON t.id = dt.template_id
      WHERE dt.key = ? AND dt.theme_id = ?
      LIMIT 1
    `,
    [normalizedKey, normalizedThemeId]
  );

  return hydrateDocumentTemplateRecord(row);
}

export function resolveDocumentTemplateForType(documentType, { themeId } = {}) {
  const normalizedDocumentType = normalizeDocumentType(documentType);
  const templates = listDocumentTemplates({ documentType: normalizedDocumentType, themeId });
  return templates[0] || null;
}

export function updateDocumentTemplateMetadata(id, input = {}, { themeId } = {}) {
  ensureDocumentTemplatesSchema();
  const existing = getDocumentTemplateById(id, { themeId });
  if (!existing) {
    return null;
  }

  const defaultPayload = normalizeDocumentTemplateDefaultPayload(input.default_payload ?? input.defaultPayload, existing.default_payload);
  const now = new Date().toISOString();

  execute(
    `
      UPDATE document_templates
      SET
        name = ?,
        description = ?,
        sort_order = ?,
        default_payload_json = ?,
        updated_at = ?
      WHERE id = ? AND theme_id = ?
    `,
    [
      String(input.name || existing.name || '').trim() || existing.name,
      toNullableText(input.description ?? existing.description),
      toInteger(input.sort_order ?? existing.sort_order, existing.sort_order),
      JSON.stringify(defaultPayload),
      now,
      existing.id,
      existing.theme_id,
    ]
  );

  return getDocumentTemplateById(existing.id, { themeId: existing.theme_id });
}

function ensureThemeDocumentTemplates(themeId) {
  const normalizedThemeId = resolveThemeId(themeId);
  const availableTemplates = listTemplates({ themeId: normalizedThemeId });
  const templatesByCode = new Map(availableTemplates.map((item) => [String(item.code || '').trim(), item]));

  for (const definition of DEFAULT_DOCUMENT_TEMPLATE_DEFINITIONS) {
    let template = templatesByCode.get(definition.template_code) || null;

    if (!template) {
      template = createTemplate({
        theme_id: normalizedThemeId,
        name: definition.template_name,
        type: 'component',
        code: definition.template_code,
        engine: 'tsx',
        tsx_source: definition.template_source,
        css_source: definition.css_source,
        status: 'draft',
        sort_order: definition.sort_order,
      });
      publishTemplate(template.id, '初始化默认文档模板');
      template = getTemplateById(template.id);
      templatesByCode.set(definition.template_code, template);
    } else {
      const needsSync =
        String(template.tsx_source || '') !== definition.template_source
        || String(template.css_source || '') !== definition.css_source
        || String(template.published_tsx_source || '') !== definition.template_source
        || String(template.published_css_source || '') !== definition.css_source;

      if (needsSync) {
        updateTemplate(template.id, {
          ...template,
          tsx_source: definition.template_source,
          css_source: definition.css_source,
          sort_order: definition.sort_order,
        });
        publishTemplate(template.id, '同步默认文档模板');
        template = getTemplateById(template.id);
        templatesByCode.set(definition.template_code, template);
      }
    }

    upsertDocumentTemplateMetadata(normalizedThemeId, definition, template.id);
  }
}

function upsertDocumentTemplateMetadata(themeId, definition, templateId) {
  const existing = queryOne(
    `
      SELECT id, default_payload_json
      FROM document_templates
      WHERE theme_id = ? AND key = ?
      LIMIT 1
    `,
    [themeId, definition.key]
  );
  const now = new Date().toISOString();

  if (existing?.id) {
    const mergedDefaultPayload = normalizeDocumentTemplateDefaultPayload(
      safeParseJson(existing.default_payload_json, {}),
      definition.default_payload
    );
    execute(
      `
        UPDATE document_templates
        SET
          name = ?,
          description = ?,
          document_type = ?,
          template_id = ?,
          sort_order = ?,
          default_payload_json = ?,
          updated_at = ?
        WHERE id = ?
      `,
      [
        definition.name,
        definition.description,
        definition.document_type,
        templateId,
        definition.sort_order,
        JSON.stringify(mergedDefaultPayload),
        now,
        existing.id,
      ]
    );
    return;
  }

  execute(
    `
      INSERT INTO document_templates (
        theme_id,
        key,
        name,
        description,
        document_type,
        template_id,
        sort_order,
        default_payload_json,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      themeId,
      definition.key,
      definition.name,
      definition.description,
      definition.document_type,
      templateId,
      definition.sort_order,
      JSON.stringify(normalizeDocumentTemplateDefaultPayload(definition.default_payload, definition.default_payload)),
      now,
      now,
    ]
  );
}

function hydrateDocumentTemplateRecord(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    default_payload_json: String(row.default_payload_json || '{}'),
    default_payload: safeParseJson(row.default_payload_json, buildDefaultDraftPayload(row.document_type)),
  };
}

function normalizeDocumentTemplateDefaultPayload(input, fallbackPayload) {
  const fallback = isPlainObject(fallbackPayload) ? fallbackPayload : {};
  const source = isPlainObject(input) ? input : {};
  const merged = deepMerge(fallback, source);
  const meta = isPlainObject(merged.meta) ? merged.meta : {};
  return {
    ...merged,
    meta: {
      ...meta,
      companySlots: normalizeCompanySlots(meta.companySlots),
    },
  };
}

function normalizeCompanySlots(value) {
  const source = Array.isArray(value) ? value : [];
  return source
    .map((item, index) => {
      if (!isPlainObject(item)) {
        return null;
      }
      const key = String(item.key || `company-${index + 1}`).trim();
      const role = String(item.role || '').trim() || (index === 0 ? 'seller' : 'customer');
      const label = String(item.label || '').trim() || `公司 ${index + 1}`;
      if (!key) {
        return null;
      }
      return { key, role, label };
    })
    .filter(Boolean);
}

function ensureDocumentTemplatesSchemaColumns() {
  const columns = queryAll('PRAGMA table_info(document_templates)');
  const hasIsDefault = columns.some((column) => String(column.name || '').trim() === 'is_default');
  if (!hasIsDefault) {
    return;
  }

  getDb().exec(`
    BEGIN;
    ALTER TABLE document_templates RENAME TO document_templates__legacy_default_flag;
    CREATE TABLE document_templates (
      id INTEGER PRIMARY KEY,
      theme_id INTEGER NOT NULL,
      key TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      document_type TEXT NOT NULL CHECK (document_type IN ('quote', 'contract')),
      template_id INTEGER NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      default_payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (theme_id, key),
      FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE
    );
    INSERT INTO document_templates (
      id,
      theme_id,
      key,
      name,
      description,
      document_type,
      template_id,
      sort_order,
      default_payload_json,
      created_at,
      updated_at
    )
    SELECT
      id,
      theme_id,
      key,
      name,
      description,
      document_type,
      template_id,
      sort_order,
      default_payload_json,
      created_at,
      updated_at
    FROM document_templates__legacy_default_flag;
    DROP TABLE document_templates__legacy_default_flag;
    CREATE INDEX IF NOT EXISTS idx_document_templates_theme_type_sort
      ON document_templates(theme_id, document_type, sort_order, id);
    COMMIT;
  `);
}

export function buildDefaultDraftPayload(documentType, options = {}) {
  const normalizedDocumentType = normalizeDocumentType(documentType);
  const normalizedTitle = String(options.title || '').trim();
  const normalizedDocumentNumberPrefix = String(options.documentNumberPrefix || '').trim().toUpperCase();
  const normalizedLanguage = String(options.language || '').trim() || 'zh-CN';
  const normalizedValidityText = String(options.validityText || '').trim();
  const normalizedPaymentText = String(options.paymentText || '').trim();
  const isEnglish = normalizedLanguage.toLowerCase().startsWith('en');
  const base = {
    type: normalizedDocumentType,
    title: normalizedTitle || (
      normalizedDocumentType === 'quote'
        ? (isEnglish ? 'Quotation' : '报价单')
        : (isEnglish ? 'Sales Contract' : '销售合同')
    ),
    language: normalizedLanguage,
    quoteNumber: '',
    contractNumber: '',
    customer: {
      name: '',
      company: '',
      contact: '',
      address: '',
      email: '',
      phone: '',
    },
    seller: {
      company: 'Spirax Sarco',
      contact: '',
      address: '',
      email: '',
      phone: '',
    },
    items: [],
    pricing: {
      currency: 'CNY',
      subtotal: null,
      taxRate: null,
      taxAmount: null,
      shippingFee: null,
      total: null,
    },
    terms: {
      validity: normalizedDocumentType === 'quote'
        ? (normalizedValidityText || (isEnglish ? 'Valid for 30 days' : '有效期 30 天'))
        : '',
      delivery: '',
      payment: normalizedDocumentType === 'quote'
        ? (normalizedPaymentText || (isEnglish ? '30% advance payment, 70% before shipment' : '30%预付款，发货前70%'))
        : '',
      warranty: '',
      disputeResolution: normalizedDocumentType === 'contract' ? '双方协商解决，协商不成提交卖方所在地法院处理。' : '',
      breachLiability: normalizedDocumentType === 'contract' ? '违约方应承担相应违约责任。' : '',
      remarks: '',
    },
    signatures: {
      sellerSigner: '',
      buyerSigner: '',
    },
    meta: {
      documentNumberPrefix: normalizedDocumentNumberPrefix,
      companySlots: [
        {
          key: 'seller',
          role: 'seller',
          label: isEnglish ? 'Seller Company' : '我方公司',
        },
        {
          key: 'customer',
          role: 'customer',
          label: isEnglish ? 'Customer Company' : '对方公司',
        },
      ],
    },
  };

  return base;
}

function resolveThemeId(themeId) {
  const normalizedThemeId = toInteger(themeId, null);
  if (normalizedThemeId) {
    return normalizedThemeId;
  }

  const selectedTheme = getSelectedTemplateVariant();
  const fallbackThemeId = toInteger(selectedTheme?.id, null);
  if (!fallbackThemeId) {
    throw new Error('未找到已选主题，无法初始化文档模板');
  }
  return fallbackThemeId;
}

function normalizeDocumentType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!DOCUMENT_TYPES.includes(normalized)) {
    throw new Error('invalid document type');
  }
  return normalized;
}

function safeParseJson(value, fallbackValue) {
  try {
    const parsed = JSON.parse(String(value || '{}'));
    return parsed && typeof parsed === 'object' ? parsed : fallbackValue;
  } catch {
    return fallbackValue;
  }
}

function deepMerge(baseValue, overrideValue) {
  if (Array.isArray(baseValue) || Array.isArray(overrideValue)) {
    return Array.isArray(overrideValue) ? overrideValue : (Array.isArray(baseValue) ? baseValue : []);
  }

  if (!isPlainObject(baseValue) || !isPlainObject(overrideValue)) {
    return overrideValue == null ? baseValue : overrideValue;
  }

  const result = { ...baseValue };
  for (const key of Object.keys(overrideValue)) {
    result[key] = deepMerge(result[key], overrideValue[key]);
  }
  return result;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toNullableText(value) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function toInteger(value, fallbackValue = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallbackValue;
}

function buildQuoteTemplateSource() {
  return `
export default function QuoteTemplate(props) {
  const draft = props?.draft || {};
  const customer = draft.customer || {};
  const seller = draft.seller || {};
  const pricing = draft.pricing || {};
  const terms = draft.terms || {};
  const items = Array.isArray(draft.items) ? draft.items : [];
  const subtotal = items.reduce((sum, item) => sum + Number(item.amount || 0), 0) || Number(pricing.subtotal || 0);
  const shippingFee = Number(pricing.shippingFee || 0);
  const taxAmount = Number(pricing.taxAmount || 0);
  const total = Number(pricing.total || subtotal + shippingFee + taxAmount);
  const issueDate = draft.issueDate || new Date().toISOString().slice(0, 10);
  const quoteNumber = draft.quoteNumber || '待生成';
  const customerName = customer.company || customer.name || '-';
  const sellerName = seller.company || 'Spirax Sarco';
  const remarkText = terms.remarks || '本报价单所列价格、交期及商务条件以双方最终确认版本为准。';
  const minimumBodyRows = Math.max(9, items.length);
  const fillerRows = Array.from({ length: Math.max(0, minimumBodyRows - items.length) });
  const formatMoney = (value) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return '-';
    return number.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  const buyerFields = [
    ['公司', customerName],
    ['联系人', customer.contact || '-'],
    ['电话', customer.phone || '-'],
    ['邮箱', customer.email || '-'],
    ['地址', customer.address || '-'],
  ];
  const sellerFields = [
    ['公司', sellerName],
    ['联系人', seller.contact || '-'],
    ['电话', seller.phone || '-'],
    ['邮箱', seller.email || '-'],
    ['地址', seller.address || '-'],
  ];
  const termFields = [
    ['交期', terms.delivery || '-'],
    ['付款方式', terms.payment || '30%预付款，发货前70%'],
    ['有效期', terms.validity || '有效期 30 天'],
    ['备注', terms.extraNotes || '-'],
  ];

  function IconWrap(props) {
    return <span className="quote-icon-badge">{props.children}</span>;
  }

  function MetaIconTag() {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M11 3H6L3 8l8 8 10-10-8-3z" />
        <circle cx="7.5" cy="7.5" r="1" />
      </svg>
    );
  }

  function MetaIconCalendar() {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M8 3v4" />
        <path d="M16 3v4" />
        <path d="M3 10h18" />
      </svg>
    );
  }

  function MetaIconCurrency() {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v10" />
        <path d="M9 10h5a2 2 0 1 1 0 4H9" />
      </svg>
    );
  }

  function MetaIconClock() {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    );
  }

  function QuoteLogo() {
    return (
      <svg viewBox="0 0 171 50" aria-hidden="true">
        <defs>
          <path id="quote-logo-a" d="M0 44.488h176.994V0H0z" />
          <path id="quote-logo-c" d="M0 0h169v7H0z" />
        </defs>
        <g fill="none" fillRule="evenodd">
          <g transform="translate(-3 -3)">
            <path
              d="M9.392 17.957c.048.222.096.5.362.832.505.61 1.613.888 2.577.888 1.133 0 2.24-.36 2.24-1.276a.76.76 0 0 0-.168-.5c-.314-.416-1.205-.554-2.987-.86-1.012-.167-2-.361-2.988-.61-2.48-.665-4.167-1.387-4.167-4.162 0-4.69 6.24-4.745 7.973-4.745 3.686 0 7.276 1.027 8.094 4.884l-5.636.276c-.24-1.47-2.288-1.58-2.818-1.58-1.085 0-2.024.36-2.024 1.165 0 .472.337.72 1.084.943.699.222 4.288.694 5.106.832 1.927.361 4.313.833 4.313 3.802 0 1.443-.627 2.358-1.205 3.024-1.06 1.138-2.866 2.331-6.914 2.331-2.746 0-5.227-.555-6.576-1.36-1.47-.887-1.879-2.08-1.999-3.607l5.733-.277zm18.282-2.581c0 1.748 1.085 3.357 2.987 3.357 1.928 0 2.915-1.552 2.915-3.357 0-1.554-.867-3.413-3.084-3.274-2.336.139-2.818 2.165-2.818 3.274zm-.024-5.881c.65-.61 1.927-1.833 4.649-1.833 3.517 0 7.01 2.415 7.01 7.853 0 4.495-2.698 7.741-7.01 7.741-2.409 0-3.71-.998-4.65-1.748v6.383h-5.612V8.024h5.637v1.331l-.024.14z"
              fill="currentColor"
            />
            <mask id="quote-logo-b" fill="#fff">
              <use xlinkHref="#quote-logo-a" />
            </mask>
            <path
              d="M40.804 22.729h5.636V8.052h-5.636V22.73zm-.025-16.175h5.661V3.141h-5.66v3.413zm13.706 3.8a5.052 5.052 0 0 1 1.76-1.858c1.06-.667 1.926-.721 2.65-.75v5.799a10.21 10.21 0 0 0-1.35-.11c-1.518 0-2.12.387-2.48.776-.555.583-.58 1.277-.603 1.942v6.576h-5.661V8.024h5.684v2.33zm12.694 5.882c-.819.084-2.312.25-2.312 1.554 0 .444.29 1.47 2 1.47a4.81 4.81 0 0 0 2.697-.832c1.156-.749 1.35-1.637 1.518-2.44-.94.054-2.94.137-3.903.248zm-7.516-3.606c.145-.944.41-2.664 1.952-3.745 1.204-.833 3.42-1.36 6.432-1.36 2.553 0 4.986.25 6.384 1.054 2.07 1.137 2.07 3.329 2.07 4.327v7.686c.025 1.138.146 1.554.7 2.165h-5.903c-.144-.582-.167-.75-.216-1.415-1.47.721-3.662 1.831-6.336 1.831-1.446 0-2.964-.277-4.12-1.304-.986-.833-1.493-2.025-1.493-3.413 0-.86.217-1.831.675-2.552.41-.639 1.157-1.276 2.264-1.665 2.12-.75 6.143-.833 8.913-.888 0-.388 0-.776-.289-1.194-.216-.304-.699-.86-2.457-.86-.289 0-1.18.057-1.807.223-1.011.277-1.156.72-1.3 1.11h-5.469z"
              fill="currentColor"
              mask="url(#quote-logo-b)"
            />
            <path
              d="M85.185 8.135 87.845 12l3.29-3.865 6.576.03-6.485 6.983 6.664 7.623h-6.856l-2.926-4.047-15.846 20.912H61.614l23.413-24.197-6.724-7.304z"
              fill="currentColor"
              mask="url(#quote-logo-b)"
            />
            <path
              d="M92.84 34.863c.05.222.098.5.362.833.506.61 1.614.888 2.577.888 1.133 0 2.24-.361 2.24-1.276a.758.758 0 0 0-.168-.5c-.313-.416-1.204-.555-2.987-.86a35.483 35.483 0 0 1-2.986-.611c-2.482-.666-4.169-1.387-4.169-4.16 0-4.69 6.24-4.745 7.974-4.745 3.686 0 7.275 1.026 8.094 4.883l-5.637.277c-.24-1.47-2.289-1.58-2.818-1.58-1.084 0-2.023.36-2.023 1.164 0 .472.337.721 1.083.944.699.222 4.288.693 5.108.831 1.926.361 4.312.833 4.312 3.802 0 1.442-.627 2.357-1.205 3.023-1.06 1.138-2.866 2.332-6.914 2.332-2.745 0-5.228-.556-6.576-1.36-1.47-.888-1.879-2.081-2-3.607l5.734-.278zm20.064-1.72c-.82.084-2.312.25-2.312 1.554 0 .444.289 1.47 1.999 1.47a4.8 4.8 0 0 0 2.698-.832c1.156-.749 1.349-1.637 1.517-2.44-.94.054-2.939.138-3.902.248zm-7.516-3.606c.145-.943.41-2.664 1.951-3.745 1.204-.833 3.421-1.36 6.433-1.36 2.553 0 4.986.25 6.383 1.054 2.072 1.138 2.072 3.33 2.072 4.328V37.5c.024 1.138.144 1.554.698 2.165h-5.901c-.146-.583-.17-.75-.218-1.416-1.47.722-3.662 1.831-6.335 1.831-1.446 0-2.963-.276-4.119-1.303-.988-.833-1.494-2.025-1.494-3.414 0-.86.217-1.83.675-2.551.409-.639 1.156-1.276 2.263-1.664 2.121-.75 6.144-.833 8.914-.89 0-.387 0-.775-.29-1.192-.216-.305-.697-.86-2.456-.86-.29 0-1.18.055-1.807.222-1.012.277-1.156.722-1.301 1.11h-5.468zm24.93-2.275a5.055 5.055 0 0 1 1.76-1.86c1.06-.665 1.926-.72 2.65-.748v5.799a10.193 10.193 0 0 0-1.35-.112c-1.518 0-2.12.388-2.48.778-.555.582-.58 1.275-.603 1.941v6.576h-5.661V24.932h5.684v2.33zm10.84 4.938c0 2.359 1.397 4.05 3.734 4.05.65 0 1.542-.138 2.264-.72.7-.528.892-1.083 1.085-1.61l5.661.223c-.217.831-.674 2.385-2.168 3.745-2.144 1.969-5.155 2.22-7.251 2.22-2.795 0-6-.694-7.854-3.053-.891-1.11-1.541-2.857-1.541-4.743 0-2.998 1.541-4.94 2.6-5.855 1.929-1.692 4.651-2.192 7.204-2.192 2.987 0 5.686.916 7.324 2.83.915 1.11 1.18 2.08 1.349 2.636l-5.613.583c-.386-1.36-1.783-2.109-3.156-2.109-2.096 0-3.638 1.554-3.638 3.995m19.39 0c0 2.968 2 3.856 3.687 3.856 1.156 0 3.469-.666 3.469-3.856 0-2.413-1.445-3.884-3.83-3.8-2.555.082-3.325 2.163-3.325 3.8m13.009.055c0 5.19-4.168 7.77-9.443 7.77-4.481 0-9.444-1.943-9.444-7.713 0-5.522 4.505-7.686 9.034-7.77 7.492-.11 9.853 3.996 9.853 7.713"
              fill="currentColor"
              mask="url(#quote-logo-b)"
            />
          </g>
          <g transform="translate(1 43)">
            <mask id="quote-logo-d" fill="#fff">
              <use xlinkHref="#quote-logo-c" />
            </mask>
            <path
              d="M166.286 4.984c.14.037.381.093.381.353 0 .076-.017.382-.57.382-.126 0-.317-.009-.506-.046-.464-.095-.513-.354-.538-.503l-1.977.085c.033.222.075.455.158.64.222.512.958 1.04 2.514 1.04.62 0 1.1-.046 1.555-.176.811-.24 1.374-.734 1.374-1.551 0-.306-.1-.624-.273-.838-.297-.37-.794-.465-1.531-.604l-.927-.176c-.132-.029-.355-.104-.355-.309 0-.111.067-.39.63-.39.751 0 .95.279.95.55L169 3.366c-.034-.233-.067-.466-.15-.66-.19-.426-.653-.697-1.1-.846-.388-.13-.76-.14-1.15-.14-.852 0-1.513.048-2.068.354-.752.41-.835 1.05-.835 1.292 0 .269.099.548.256.753.322.41.877.54 1.324.642l1.009.223zm-8.397-3.124H156l-1.016 4.927h1.894l.488-2.38c.116-.428.323-1.21 1.083-1.21.58 0 .705.484.705.754a1.4 1.4 0 0 1-.042.326l-.514 2.51h1.911l.563-2.733a4.59 4.59 0 0 0 .083-.754c0-1.013-.638-1.57-1.588-1.57-.513 0-1.15.196-1.564.567a3.674 3.674 0 0 0-.257.26l.142-.697zm-7.984 1.182c.942-.011 1.108.742 1.108 1.115 0 .465-.256 1.421-1.357 1.421-.803 0-1.126-.548-1.126-1.106 0-.046 0-1.413 1.375-1.43zm.198-1.331c-.712-.01-1.424.067-2.068.381-.472.243-.919.613-1.176 1.116a2.581 2.581 0 0 0-.29 1.227c0 .557.158 1.143.489 1.553.256.334.62.548 1 .697.48.176.993.233 1.49.233 2.267 0 3.492-1.31 3.492-2.846 0-.465-.116-.93-.357-1.292-.686-1.05-2.084-1.06-2.58-1.07zm-8.414 5.076h1.901l1.01-4.927h-1.903l-1.008 4.927zm1.108-5.42h1.91l.232-1.143h-1.91l-.232 1.143zm-5.246.716h-.62l-.265 1.264h.621l-.396 1.98a2.62 2.62 0 0 0-.051.456c0 .901.662 1.022 1.58 1.022.306 0 .621-.008.935-.018l.272-1.347c-.43.009-.76.02-.76-.419 0-.064.016-.13.025-.204l.306-1.47h.743l.249-1.264h-.736l.282-1.376h-1.888l-.297 1.376zm-8.91 2.602a4.589 4.589 0 0 0-.05.568c0 .473.173.984.488 1.283.306.297.736.382 1.158.382.86 0 1.25-.336 1.779-.8l-.142.669h1.855l1.016-4.927h-1.844l-.438 2.12c-.142.539-.373 1.469-1.266 1.469-.265 0-.456-.112-.546-.223-.182-.213-.117-.67-.034-1.078l.464-2.288h-1.87l-.57 2.825zm-5.03 2.102h1.918l1.348-6.563h-1.919l-1.348 6.563zm-5.073-3.745c.945-.011 1.11.742 1.11 1.115 0 .465-.257 1.421-1.357 1.421-.804 0-1.127-.548-1.127-1.106 0-.046 0-1.413 1.374-1.43zm.199-1.331c-.712-.01-1.423.067-2.068.381-.473.243-.919.613-1.174 1.116-.2.363-.291.791-.291 1.227 0 .557.157 1.143.489 1.553.255.334.62.548 1 .697.48.176.992.233 1.489.233 2.267 0 3.491-1.31 3.491-2.846 0-.465-.115-.93-.355-1.292-.687-1.05-2.085-1.06-2.581-1.07zM106.73 4.779c0 .447.017.994.481 1.47.281.287 1.025.751 2.465.751.754 0 1.423-.1 1.994-.408 1.018-.549 1.232-1.45 1.232-1.933 0-.28-.058-.558-.182-.81-.265-.539-.753-.687-1.356-.909l-1.233-.392c-.307-.103-.72-.262-.72-.586 0-.252.273-.513.91-.513.687 0 1.076.243 1.027.652l1.877-.167c0-.457-.017-1.199-1.042-1.656-.506-.222-1.052-.278-1.606-.278-1.033 0-1.63.16-2.076.391-.662.344-1.083.966-1.083 1.775 0 .195.032.42.115.632.257.67.886.895 1.324 1.051l1.035.344c.62.206.966.28.966.68 0 .418-.363.66-.984.679-.339.01-.736-.038-.992-.252-.224-.194-.257-.436-.257-.614l-1.895.093zM93.534 1.86h-1.878L90.64 6.788h1.894l.497-2.399c.124-.548.264-1.2.927-1.2.504 0 .57.391.57.56 0 .111-.015.212-.066.417l-.538 2.622h1.904l.563-2.705c.074-.308.214-.894.835-.894.231 0 .587.066.587.567 0 .121-.025.26-.074.465l-.522 2.567h1.877l.53-2.595c.1-.53.141-.78.141-1.013 0-.984-.662-1.449-1.497-1.449-.975 0-1.506.577-1.755.836-.115-.231-.413-.845-1.38-.845-.911 0-1.464.548-1.722.799l.124-.66zM86.41 4.603c-.283 1.171-2.175 1.331-2.175.606 0-.615 1.413-.606 2.175-.606zM84.7 3.376c.14-.389.545-.42 1.008-.429.405-.007 1.027.085.894.747-1.49.073-3.143-.01-3.847.593a1.609 1.609 0 0 0-.545 1.19c0 .874.702 1.46 1.769 1.46 1.091 0 1.736-.429 2.148-.706a2.097 2.097 0 0 0-.008.557h2.046a1.426 1.426 0 0 1-.05-.836l.372-1.85c.058-.278.117-.568.117-.864 0-1.228-.887-1.526-2.633-1.526-.77 0-1.959.037-2.597.642-.322.28-.42.565-.56 1.022H84.7zm-8.705.42c.091-.224.207-.495.621-.662.165-.074.346-.102.528-.102.853 0 1.019.522 1.1.764h-2.25zm4.17.956c-.025-.5-.042-1.003-.216-1.451a2.414 2.414 0 0 0-.934-1.123c-.564-.363-1.233-.456-1.92-.456-.628 0-1.248.093-1.803.39-.868.465-1.448 1.358-1.448 2.351 0 .512.157 1.034.439 1.434.298.398.735.668 1.183.827.447.149.91.195 1.365.195.654 0 1.481-.085 2.158-.493.546-.334.72-.688.894-1.022l-2.01-.14c-.232.205-.43.39-.892.39a1.32 1.32 0 0 1-.68-.176c-.282-.187-.347-.391-.438-.726h4.302zM69.408 2.083h-.62l-.265 1.264h.621l-.398 1.98c-.024.15-.05.297-.05.456 0 .901.662 1.022 1.582 1.022.305 0 .62-.008.934-.018l.272-1.347c-.43.009-.76.02-.76-.419 0-.064.016-.13.024-.204l.306-1.47h.745l.248-1.264h-.736l.281-1.376h-1.885l-.299 1.376zm-9.307 2.696c0 .447.016.994.48 1.47.281.287 1.025.751 2.464.751.754 0 1.424-.1 1.995-.408 1.017-.549 1.231-1.45 1.231-1.933 0-.28-.057-.558-.182-.81-.264-.539-.752-.687-1.356-.909L63.5 2.548c-.307-.103-.72-.262-.72-.586 0-.252.273-.513.91-.513.686 0 1.075.243 1.026.652l1.878-.167c0-.457-.018-1.199-1.042-1.656C65.047.056 64.5 0 63.947 0c-1.034 0-1.629.16-2.076.391-.662.344-1.084.966-1.084 1.775 0 .195.033.42.115.632.257.67.886.895 1.325 1.051l1.034.344c.62.206.968.28.968.68 0 .418-.365.66-.985.679-.339.01-.736-.038-.993-.252-.223-.194-.256-.436-.256-.614l-1.894.093zM52.43 1.86h-1.903L49.52 6.788h1.91c.115-.62.38-1.936.504-2.383.076-.297.216-.807 1.035-.807.224 0 .43.049.636.095l.398-1.944c-.1-.008-.198-.027-.297-.027-.737 0-1.217.622-1.432.911l.157-.772zm-7.992 1.183c.943-.011 1.109.742 1.109 1.115 0 .465-.257 1.421-1.358 1.421-.803 0-1.125-.548-1.125-1.106 0-.046 0-1.413 1.374-1.43zm.198-1.331c-.71-.01-1.423.067-2.067.381-.472.243-.92.613-1.176 1.116a2.569 2.569 0 0 0-.289 1.227c0 .557.158 1.143.487 1.553.257.334.621.548 1.001.697.48.176.993.233 1.49.233 2.268 0 3.49-1.31 3.49-2.846 0-.465-.114-.93-.355-1.292-.685-1.05-2.085-1.06-2.58-1.07zM38.605.224c-.505-.02-.935.046-1.283.38-.157.158-.297.437-.371.763l-.175.734h-.662l-.256 1.264h.663l-.704 3.422h1.912l.701-3.43h.753l.265-1.256h-.827c.083-.426.132-.724.596-.724.123 0 .256.018.371.036l.24-1.189h-1.223zM26.64 2.083h-.62l-.265 1.264h.62l-.396 1.98c-.025.15-.05.297-.05.456 0 .901.662 1.022 1.58 1.022.306 0 .62-.008.935-.018l.272-1.347c-.43.009-.761.02-.761-.419 0-.064.016-.13.024-.204l.308-1.47h.744l.248-1.264h-.737l.282-1.376h-1.887l-.297 1.376zm-5.56 2.9c.14.038.38.094.38.354 0 .076-.016.382-.57.382-.124 0-.315-.009-.505-.046-.463-.095-.514-.354-.537-.503l-1.978.085c.033.222.075.455.158.64.223.512.96 1.04 2.513 1.04.621 0 1.102-.046 1.556-.176.81-.24 1.373-.734 1.373-1.551 0-.306-.099-.624-.272-.838-.298-.37-.795-.465-1.53-.604l-.927-.176c-.133-.029-.356-.104-.356-.309 0-.111.066-.39.628-.39.754 0 .952.279.952.55l1.828-.075c-.033-.233-.065-.466-.148-.66-.191-.426-.654-.697-1.102-.846-.389-.13-.76-.14-1.15-.14-.852 0-1.513.048-2.068.354-.752.41-.834 1.05-.834 1.292 0 .269.1.548.256.753.323.41.876.54 1.324.642l1.01.223zm-5.8-3.123h-1.903L12.37 6.787h1.91c.115-.62.38-1.936.504-2.383.076-.297.215-.807 1.035-.807.223 0 .43.049.637.095l.396-1.944c-.1-.008-.198-.027-.297-.027-.736 0-1.216.622-1.431.911l.157-.772zM7.794 6.787h1.901l1.011-4.927H8.803l-1.01 4.927zm1.108-5.42h1.91l.232-1.143h-1.91l-.232 1.143zM0 6.787h2.052l.487-2.343h3.334l.306-1.468H2.846l.264-1.275h3.533L6.949.224H1.357L0 6.787z"
              fill="currentColor"
              mask="url(#quote-logo-d)"
            />
          </g>
        </g>
      </svg>
    );
  }

  function IconUser() {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 19c0-3.3 3.1-5 7-5s7 1.7 7 5" />
      </svg>
    );
  }

  function IconCompany() {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 20h16" />
        <path d="M6 20V5h12v15" />
        <path d="M9 8h2" />
        <path d="M13 8h2" />
        <path d="M9 12h2" />
        <path d="M13 12h2" />
        <path d="M10 20v-3h4v3" />
      </svg>
    );
  }

  function IconFile() {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 3h7l5 5v13H7z" />
        <path d="M14 3v5h5" />
        <path d="M10 13h6" />
        <path d="M10 17h6" />
      </svg>
    );
  }

  function IconTerms() {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="5" y="3" width="14" height="18" rx="2" />
        <path d="M9 8h6" />
        <path d="M9 12h6" />
        <path d="M9 16h4" />
      </svg>
    );
  }

  function IconRemarks() {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 5h12a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H10l-4 3v-3H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />
        <path d="M9 10h6" />
      </svg>
    );
  }

  function SectionTitle(props) {
    return (
      <div className={['quote-section-title', props.className].filter(Boolean).join(' ')}>
        <div className="quote-section-title__main">
          <IconWrap>{props.icon}</IconWrap>
          <h2>
            <span className="quote-section-title__cn">{props.cn}</span>
            <span className="quote-section-title__en">{props.en}</span>
          </h2>
        </div>
        {props.trailing ? <div className="quote-section-title__trailing">{props.trailing}</div> : null}
      </div>
    );
  }

  function InfoRows(props) {
    return (
      <dl className="quote-info-list">
        {props.rows.map((entry, index) => (
          <div key={entry[0] + '-' + index} className="quote-info-list__row">
            <dt>{entry[0]}</dt>
            <dd>{entry[1]}</dd>
          </div>
        ))}
      </dl>
    );
  }

  return (
    <html lang="zh-CN">
      <head>
        <meta charSet="utf-8" />
        <title>{draft.title || '报价单'}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>
        <div className="quote-page">
          <div className="quote-page__top-accent" aria-hidden="true" />
          <div className="quote-page__top-dots" aria-hidden="true">
            <span /><span /><span /><span /><span /><span />
          </div>
          <div className="quote-page__bottom-slashes" aria-hidden="true">
            <span /><span /><span />
          </div>
          <div className="quote-page__bottom-fold" aria-hidden="true" />

          <header className="quote-hero">
            <div className="quote-hero__brand">
              <div className="quote-logo" aria-label="Spirax Sarco">
                <QuoteLogo />
              </div>
              <div className="quote-hero__titles">
                <p className="quote-hero__en">QUOTATION</p>
                <p className="quote-hero__cn">{draft.title || '报价单'}</p>
                <span className="quote-hero__underline" aria-hidden="true" />
              </div>
            </div>

            <div className="quote-hero__divider" aria-hidden="true" />

            <aside className="quote-meta-card">
              <div className="quote-meta-card__row quote-meta-card__row--primary">
                <span className="quote-meta-card__icon"><MetaIconTag /></span>
                <span className="quote-meta-card__label">报价编号</span>
                <strong className="quote-meta-card__value">{quoteNumber}</strong>
              </div>
              <div className="quote-meta-card__row">
                <span className="quote-meta-card__icon"><MetaIconCalendar /></span>
                <span className="quote-meta-card__label">发布日期</span>
                <strong className="quote-meta-card__value">{issueDate}</strong>
              </div>
              <div className="quote-meta-card__row">
                <span className="quote-meta-card__icon"><MetaIconCurrency /></span>
                <span className="quote-meta-card__label">币种</span>
                <strong className="quote-meta-card__value">{pricing.currency || 'CNY'}</strong>
              </div>
              <div className="quote-meta-card__row">
                <span className="quote-meta-card__icon"><MetaIconClock /></span>
                <span className="quote-meta-card__label">有效期</span>
                <strong className="quote-meta-card__value">{terms.validity || '有效期 30 天'}</strong>
              </div>
            </aside>
          </header>

          <section className="quote-party-grid">
            <article className="quote-panel">
              <SectionTitle cn="客户信息" en="BUYER INFORMATION" icon={<IconUser />} />
              <InfoRows rows={buyerFields} />
            </article>
            <article className="quote-panel">
              <SectionTitle cn="销售方信息" en="SELLER INFORMATION" icon={<IconCompany />} />
              <InfoRows rows={sellerFields} />
            </article>
          </section>

          <section className="quote-items">
            <SectionTitle className="quote-section-title--plain" cn="报价明细" en="QUOTATION ITEMS" icon={<IconFile />} trailing={<span>共 {items.length} 项</span>} />
            <div className="quote-items__table-wrap">
              <table className="quote-table">
                <colgroup>
                  <col style={{ width: '19%' }} />
                  <col style={{ width: '31%' }} />
                  <col style={{ width: '16%' }} />
                  <col style={{ width: '17%' }} />
                  <col style={{ width: '17%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>型号 / MODEL</th>
                    <th>描述 / DESCRIPTION</th>
                    <th>数量 / QTY</th>
                    <th>单价 / UNIT PRICE</th>
                    <th>金额 / AMOUNT</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr key={item.id || (item.model || 'item') + '-' + index}>
                      <td>{item.model || item.sku || '-'}</td>
                      <td>{item.description || item.notes || '-'}</td>
                      <td>{item.qty || 0}{item.unit ? ' ' + item.unit : ''}</td>
                      <td>{formatMoney(item.unitPrice)}</td>
                      <td>{formatMoney(item.amount)}</td>
                    </tr>
                  ))}
                  {fillerRows.map((_, index) => (
                    <tr key={'filler-' + index} className="quote-table__filler-row">
                      <td>&nbsp;</td>
                      <td>&nbsp;</td>
                      <td>&nbsp;</td>
                      <td>&nbsp;</td>
                      <td>&nbsp;</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  {shippingFee > 0 ? (
                    <tr className="quote-table__summary-row">
                      <td colSpan={4}>运费 / SHIPPING</td>
                      <td>{formatMoney(shippingFee)}</td>
                    </tr>
                  ) : null}
                  {taxAmount > 0 ? (
                    <tr className="quote-table__summary-row">
                      <td colSpan={4}>税额 / TAX</td>
                      <td>{formatMoney(taxAmount)}</td>
                    </tr>
                  ) : null}
                  <tr className="quote-table__total-row">
                    <td colSpan={4}>总金额 / TOTAL</td>
                    <td>{formatMoney(total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          <section className="quote-grid quote-grid--two quote-grid--bottom">
            <article className="quote-panel quote-panel--compact">
              <SectionTitle cn="商务条款" en="COMMERCIAL TERMS" icon={<IconTerms />} />
              <InfoRows rows={termFields} />
            </article>
            <article className="quote-panel quote-panel--remarks">
              <SectionTitle cn="报价说明" en="REMARKS" icon={<IconRemarks />} />
              <div className="quote-remarks">
                <p>{remarkText}</p>
                <img className="quote-remarks__art" src="data:image/jpeg;base64,${QUOTE_REMARKS_BG_BASE64}" alt="" />
              </div>
            </article>
          </section>

          <footer className="quote-footer">
            <div className="quote-footer__left">
              <p><span className="quote-footer__icon"><IconUser /></span><span>Prepared by {seller.contact || sellerName}</span></p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
`;
}

function buildEnglishQuoteTemplateSource() {
  let source = buildQuoteTemplateSource();

  const replacements = [
    ["const quoteNumber = draft.quoteNumber || '待生成';", "const quoteNumber = draft.quoteNumber || 'PENDING';"],
    ["const remarkText = terms.remarks || '本报价单所列价格、交期及商务条件以双方最终确认版本为准。';", "const remarkText = terms.remarks || 'Prices, lead times and commercial terms in this quotation are subject to the final confirmed version agreed by both parties.';"],
    ["return number.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });", "return number.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });"],
    ["['公司', customerName],", "['Company', customerName],"],
    ["['联系人', customer.contact || '-'],", "['Contact', customer.contact || '-'],"],
    ["['电话', customer.phone || '-'],", "['Phone', customer.phone || '-'],"],
    ["['邮箱', customer.email || '-'],", "['Email', customer.email || '-'],"],
    ["['地址', customer.address || '-'],", "['Address', customer.address || '-'],"],
    ["['公司', sellerName],", "['Company', sellerName],"],
    ["['联系人', seller.contact || '-'],", "['Contact', seller.contact || '-'],"],
    ["['电话', seller.phone || '-'],", "['Phone', seller.phone || '-'],"],
    ["['邮箱', seller.email || '-'],", "['Email', seller.email || '-'],"],
    ["['地址', seller.address || '-'],", "['Address', seller.address || '-'],"],
    ["['交期', terms.delivery || '-'],", "['Lead Time', terms.delivery || '-'],"],
    ["['付款方式', terms.payment || '30%预付款，发货前70%'],", "['Payment Terms', terms.payment || '30% advance payment, 70% before shipment'],"],
    ["['有效期', terms.validity || '有效期 30 天'],", "['Validity', terms.validity || 'Valid for 30 days'],"],
    ["['备注', terms.extraNotes || '-'],", "['Notes', terms.extraNotes || '-'],"],
    ['<html lang="zh-CN">', '<html lang="en">'],
    ["<title>{draft.title || '报价单'}</title>", "<title>{draft.title || 'Quotation'}</title>"],
    ["<p className=\"quote-hero__cn\">{draft.title || '报价单'}</p>", "<p className=\"quote-hero__cn\">{draft.title || 'Quotation'}</p>"],
    ['<span className="quote-meta-card__label">报价编号</span>', '<span className="quote-meta-card__label">Quote No.</span>'],
    ['<span className="quote-meta-card__label">发布日期</span>', '<span className="quote-meta-card__label">Issue Date</span>'],
    ['<span className="quote-meta-card__label">币种</span>', '<span className="quote-meta-card__label">Currency</span>'],
    ['<span className="quote-meta-card__label">有效期</span>', '<span className="quote-meta-card__label">Validity</span>'],
    ['<strong className="quote-meta-card__value">{terms.validity || \'有效期 30 天\'}</strong>', '<strong className="quote-meta-card__value">{terms.validity || \'Valid for 30 days\'}</strong>'],
    ['<SectionTitle cn="客户信息" en="BUYER INFORMATION" icon={<IconUser />} />', '<SectionTitle cn="Customer Information" en="" icon={<IconUser />} />'],
    ['<SectionTitle cn="销售方信息" en="SELLER INFORMATION" icon={<IconCompany />} />', '<SectionTitle cn="Seller Information" en="" icon={<IconCompany />} />'],
    ['<SectionTitle className="quote-section-title--plain" cn="报价明细" en="QUOTATION ITEMS" icon={<IconFile />} trailing={<span>共 {items.length} 项</span>} />', '<SectionTitle className="quote-section-title--plain" cn="Quotation Items" en="" icon={<IconFile />} trailing={<span>{items.length} items</span>} />'],
    ['<SectionTitle cn="商务条款" en="COMMERCIAL TERMS" icon={<IconTerms />} />', '<SectionTitle cn="Commercial Terms" en="" icon={<IconTerms />} />'],
    ['<SectionTitle cn="报价说明" en="REMARKS" icon={<IconRemarks />} />', '<SectionTitle cn="Remarks" en="" icon={<IconRemarks />} />'],
    ['<th>型号 / MODEL</th>', '<th>MODEL</th>'],
    ['<th>描述 / DESCRIPTION</th>', '<th>DESCRIPTION</th>'],
    ['<th>数量 / QTY</th>', '<th>QTY</th>'],
    ['<th>单价 / UNIT PRICE</th>', '<th>UNIT PRICE</th>'],
    ['<th>金额 / AMOUNT</th>', '<th>AMOUNT</th>'],
    ['<td colSpan={4}>运费 / SHIPPING</td>', '<td colSpan={4}>SHIPPING</td>'],
    ['<td colSpan={4}>税额 / TAX</td>', '<td colSpan={4}>TAX</td>'],
    ['<td colSpan={4}>总金额 / TOTAL</td>', '<td colSpan={4}>TOTAL</td>'],
  ];

  for (const [from, to] of replacements) {
    source = source.replaceAll(from, to);
  }

  return source;
}

function buildQuoteTemplateCss() {
  return `
:root {
  --quote-navy: #0f2f6e;
  --quote-navy-deep: #13284f;
  --quote-ink: #13284f;
  --quote-muted: #4d5d7a;
  --quote-line: #d7dfec;
  --quote-line-soft: #e9eef6;
  --quote-panel: #ffffff;
  --quote-paper: #ffffff;
}

* { box-sizing: border-box; }
html, body {
  margin: 0;
  padding: 0;
  color: var(--quote-ink);
  font-family: "PingFang SC", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.quote-page {
  position: relative;
  width: 210mm;
  min-height: 297mm;
  margin: 0 auto;
  padding: 14mm 12mm 11mm;
  background: var(--quote-paper);
  box-shadow: 0 14px 42px rgba(15, 47, 110, 0.08);
  overflow: hidden;
}

.quote-page__top-accent {
  position: absolute;
  top: 0;
  right: 0;
  width: 74mm;
  height: 12mm;
  background: linear-gradient(135deg, transparent 0 14%, var(--quote-navy-deep) 14% 100%);
}

.quote-page__top-dots {
  position: absolute;
  top: 6mm;
  right: 62mm;
  display: flex;
  gap: 1mm;
}

.quote-page__top-dots span,
.quote-page__bottom-slashes span {
  display: block;
}

.quote-page__top-dots span {
  width: 1.3mm;
  height: 1.3mm;
  border-radius: 50%;
  background: #d7deeb;
}

.quote-page__bottom-slashes {
  position: absolute;
  right: 14mm;
  bottom: 12mm;
  display: flex;
  gap: 1.3mm;
  align-items: flex-end;
}

.quote-page__bottom-slashes span {
  width: 1.8mm;
  height: 6.4mm;
  transform: skewX(-28deg);
  background: var(--quote-navy);
}

.quote-page__bottom-slashes::after {
  content: "";
  width: 11mm;
  height: 6.4mm;
  margin-left: 0.8mm;
  background: var(--quote-navy);
  transform: skewX(-28deg);
  transform-origin: left bottom;
}

.quote-page__bottom-fold {
  position: absolute;
  left: 0;
  bottom: 0;
  width: 0;
  height: 0;
  border-right: 4.8mm solid transparent;
  border-top: 11.6mm solid #e5e8ed;
}

.quote-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 0.3mm 74mm;
  gap: 8mm;
  align-items: center;
}

.quote-hero__brand {
  display: grid;
  gap: 4mm;
}

.quote-logo {
  display: inline-flex;
  align-items: center;
  color: #0a3578;
  width: 45mm;
}

.quote-logo svg {
  display: block;
  width: 45mm;
  height: auto;
}

.quote-hero__titles {
  display: grid;
  gap: 1mm;
  align-content: start;
}

.quote-hero__en,
.quote-hero__cn {
  margin: 0;
}

.quote-hero__en {
  font-size: 26pt;
  line-height: 0.94;
  letter-spacing: 0.03em;
  color: var(--quote-navy-deep);
  font-weight: 300;
}

.quote-hero__cn {
  font-size: 25pt;
  line-height: 1.08;
  color: #1143a6;
  font-weight: 700;
}

.quote-hero__underline {
  display: block;
  width: 13mm;
  height: 1mm;
  margin-top: 1mm;
  background: #1a4fb5;
}

.quote-hero__divider {
  width: 0.3mm;
  align-self: stretch;
  background: linear-gradient(180deg, transparent 0, #d5dcea 18%, #d5dcea 82%, transparent 100%);
}

.quote-meta-card {
  display: grid;
  gap: 1.6mm;
  padding: 0;
  background: transparent;
}

.quote-meta-card__row {
  display: grid;
  grid-template-columns: 4.8mm 15mm minmax(0, 1fr);
  gap: 2mm;
  align-items: center;
  padding: 0;
}

.quote-meta-card__row:first-child {
  padding-top: 0;
}

.quote-meta-card__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #1d52ba;
}

.quote-meta-card__icon svg {
  width: 4mm;
  height: 4mm;
  stroke: currentColor;
  stroke-width: 1.75;
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.quote-meta-card__label {
  font-size: 8.5pt;
  color: var(--quote-ink);
  font-weight: 600;
}

.quote-meta-card__value {
  justify-self: end;
  text-align: right;
  font-size: 7.5pt;
  color: #111827;
  font-weight: 500;
}

.quote-meta-card__row--primary .quote-meta-card__value {
  font-size: 8.5pt;
  font-weight: 700;
}

.quote-grid {
  display: grid;
  gap: 8mm;
}

.quote-grid--two {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.quote-party-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6mm;
  margin-top: 4mm;
}

.quote-grid--bottom {
  margin-top: 4mm;
}

.quote-panel {
  break-inside: avoid;
  page-break-inside: avoid;
}

.quote-section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 3mm;
  border-bottom: 0.5mm solid #2053b8;
  padding-bottom: 0.8mm;
}

.quote-section-title--plain {
  border-bottom: 0;
  padding-bottom: 0;
}

.quote-section-title__main {
  display: flex;
  align-items: center;
  gap: 2.6mm;
  min-width: 0;
}

.quote-section-title h2 {
  margin: 0;
  display: flex;
  align-items: baseline;
  gap: 2.6mm;
  flex-wrap: wrap;
}

.quote-section-title__cn,
.quote-section-title__en {
  display: inline-block;
}

.quote-section-title__cn {
  font-size: 9pt;
  color: var(--quote-ink);
  font-weight: 700;
}

.quote-section-title__en {
  font-size: 8.5pt;
  color: var(--quote-ink);
  letter-spacing: 0.02em;
}

.quote-section-title__trailing {
  font-size: 8.5pt;
  color: var(--quote-ink);
  white-space: nowrap;
}

.quote-icon-badge {
  width: 8.5mm;
  height: 6.4mm;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1d57c1 0, #123a8d 100%);
  color: #fff;
  clip-path: polygon(0 0, 100% 0, 82% 100%, 0 100%);
  flex: 0 0 auto;
  padding-right: 1mm;
  border-radius: 1mm;
}

.quote-icon-badge svg,
.quote-footer__icon svg {
  width: 4.8mm;
  height: 4.8mm;
  stroke: currentColor;
  stroke-width: 1.75;
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.quote-info-list {
  margin: 0;
  padding: 1.5mm 0 0;
}

.quote-info-list__row {
  display: grid;
  grid-template-columns: 14mm minmax(0, 1fr);
  gap: 2mm;
  align-items: center;
  min-height: 6mm;
  padding: 0;
}

.quote-info-list__row:first-child {
  border-top: 0;
}

.quote-info-list dt,
.quote-info-list dd {
  margin: 0;
}

.quote-info-list dt {
  font-size: 8.5pt;
  color: var(--quote-ink);
  font-weight: 600;
}

.quote-info-list dd {
  font-size: 8.5pt;
  color: #1f2937;
  line-height: 1.5;
  min-width: 0;
}

.quote-items {
  margin-top: 4mm;
  break-inside: avoid;
}

.quote-items__table-wrap {
  position: relative;
  overflow: hidden;
  margin-top: 2mm;
  border-left: 0.3mm solid var(--quote-line);
  border-right: 0.3mm solid var(--quote-line);
  border-bottom: 0.3mm solid var(--quote-line);
}

.quote-table {
  position: relative;
  z-index: 1;
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.quote-table th {
  padding: 2.8mm 2.6mm;
  background: linear-gradient(90deg, #152f60 0, #14294f 100%);
  color: #fff;
  font-size: 7.5pt;
  font-weight: 600;
  text-align: center;
  letter-spacing: 0.02em;
  border-right: 0.3mm solid rgba(255, 255, 255, 0.28);
}

.quote-table th:last-child {
  border-right: 0;
}

.quote-table td {
  height: 10mm;
  padding: 2.6mm;
  vertical-align: top;
  font-size: 8.5pt;
  color: #1f2937;
  border-top: 0.3mm dashed var(--quote-line);
  border-right: 0.3mm solid var(--quote-line-soft);
  background: transparent;
}

.quote-table td:last-child {
  border-right: 0;
}

.quote-table tbody tr:first-child td {
  border-top: 0;
}

.quote-table__filler-row td {
  color: transparent;
}

.quote-table tfoot td {
  height: auto;
  padding: 2.4mm 2.6mm;
  border-top: 0.3mm solid var(--quote-line);
  background: #fafcff;
  font-weight: 600;
}

.quote-table__summary-row td:first-child,
.quote-table__total-row td:first-child {
  text-align: right;
  color: var(--quote-ink);
}

.quote-table__summary-row td:last-child,
.quote-table__total-row td:last-child {
  text-align: right;
}

.quote-table__total-row td {
  background: #f2f6fc;
  color: var(--quote-navy-deep);
  font-weight: 700;
}

.quote-panel--compact .quote-info-list__row {
  min-height: 5.5mm;
}

.quote-panel--remarks {
  position: relative;
}

.quote-remarks {
  position: relative;
  min-height: 33mm;
  padding: 3.6mm;
  border-left: 0.3mm solid var(--quote-line);
  border-right: 0.3mm solid var(--quote-line);
  border-bottom: 0.3mm solid var(--quote-line);
  overflow: hidden;
}

.quote-remarks p {
  position: relative;
  z-index: 1;
  width: 62%;
  margin: 0;
  font-size: 8.5pt;
  line-height: 1.85;
  color: var(--quote-ink);
  white-space: pre-wrap;
}

.quote-remarks__art {
  position: absolute;
  right: -6%;
  bottom: 0;
  width: 58%;
  opacity: 0.24;
}

.quote-footer {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 3mm;
  margin-top: 9mm;
  padding-top: 5mm;
  border-top: 0.5mm solid #1d4fae;
  break-inside: avoid;
}

.quote-footer__left,
.quote-footer__right {
  display: grid;
  gap: 1.5mm;
}

.quote-footer__left p,
.quote-footer__right p {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 2mm;
  font-size: 8.5pt;
  color: var(--quote-ink);
}

.quote-footer__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #1d52ba;
}

@media print {
  @page {
    size: A4;
    margin: 0;
  }

  html, body {
    background: #fff;
  }

  body {
    padding: 0;
  }

  .quote-page {
    margin: 0;
    box-shadow: none;
  }

  .quote-panel,
  .quote-items,
  .quote-footer {
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .quote-table thead {
    display: table-header-group;
  }

  .quote-table tfoot {
    display: table-footer-group;
  }

  .quote-table tr {
    break-inside: avoid;
    page-break-inside: avoid;
  }
}
`;
}

function buildContractTemplateSource() {
  return [
    'export default function ContractTemplate(props) {',
    '  const draft = props?.draft || {};',
    '  const customer = draft.customer || {};',
    '  const seller = draft.seller || {};',
    '  const pricing = draft.pricing || {};',
    '  const terms = draft.terms || {};',
    '  const signatures = draft.signatures || {};',
    '  const items = Array.isArray(draft.items) ? draft.items : [];',
    '  const formatMoney = (value) => {',
    '    const number = Number(value);',
    '    if (!Number.isFinite(number)) return "-";',
    '    return number.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });',
    '  };',
    '  const sections = [',
    '    { title: "一、合同主体", content: `买方：${customer.company || customer.name || "-"}；卖方：${seller.company || "-"}` },',
    '    { title: "二、标的物", content: items.length > 0 ? items.map((item, index) => `${index + 1}. ${item.model || item.sku || "-"} / 数量 ${item.qty || 0}${item.unit ? item.unit : ""} / 金额 ${formatMoney(item.amount)}`).join("\\n") : "待在右侧 AI 对话中补充产品明细。" },',
    '    { title: "三、价款与结算", content: `币种：${pricing.currency || "CNY"}；总金额：${formatMoney(pricing.total)}；付款方式：${terms.payment || "-"}` },',
    '    { title: "四、交付与验收", content: terms.delivery || "-" },',
    '    { title: "五、质保与售后", content: terms.warranty || "-" },',
    '    { title: "六、违约责任", content: terms.breachLiability || "-" },',
    '    { title: "七、争议解决", content: terms.disputeResolution || "-" },',
    '    { title: "八、补充说明", content: terms.remarks || "-" },',
    '  ];',
    '  return (',
    '    <html lang="zh-CN">',
    '      <head>',
    '        <meta charSet="utf-8" />',
    '        <title>{draft.title || "销售合同"}</title>',
    '        <meta name="viewport" content="width=device-width, initial-scale=1" />',
    '      </head>',
    '      <body>',
    '        <div className="contract-shell">',
    '          <header className="contract-header">',
    '            <p className="contract-kicker">Sales Contract</p>',
    '            <h1>{draft.title || "销售合同"}</h1>',
    '            <div className="contract-meta">',
    '              <span>合同编号：{draft.contractNumber || "-"}</span>',
    '              <span>币种：{pricing.currency || "CNY"}</span>',
    '            </div>',
    '          </header>',
    '          <section className="contract-party-grid">',
    '            <article className="contract-box">',
    '              <h2>买方信息</h2>',
    '              <p><strong>{customer.company || customer.name || "-"}</strong></p>',
    '              <p>联系人：{customer.contact || "-"}</p>',
    '              <p>电话：{customer.phone || "-"}</p>',
    '              <p>地址：{customer.address || "-"}</p>',
    '            </article>',
    '            <article className="contract-box">',
    '              <h2>卖方信息</h2>',
    '              <p><strong>{seller.company || "-"}</strong></p>',
    '              <p>联系人：{seller.contact || "-"}</p>',
    '              <p>电话：{seller.phone || "-"}</p>',
    '              <p>地址：{seller.address || "-"}</p>',
    '            </article>',
    '          </section>',
    '          <section className="contract-section">',
    '            <h2>标的物明细</h2>',
    '            <table className="contract-table">',
    '              <thead><tr><th>型号</th><th>说明</th><th>数量</th><th>金额</th></tr></thead>',
    '              <tbody>',
    '                {items.length > 0 ? items.map((item, index) => (',
    '                  <tr key={item.id || `${item.model || "item"}-${index}`}>',
    '                    <td>{item.model || item.sku || "-"}</td>',
    '                    <td>{item.description || item.notes || "-"}</td>',
    '                    <td>{item.qty || 0}{item.unit ? ` ${item.unit}` : ""}</td>',
    '                    <td>{formatMoney(item.amount)}</td>',
    '                  </tr>',
    '                )) : <tr><td colSpan={4} className="contract-empty">待补充合同产品明细</td></tr>}',
    '              </tbody>',
    '            </table>',
    '          </section>',
    '          <section className="contract-clauses">',
    '            {sections.map((section) => (',
    '              <article className="contract-clause" key={section.title}>',
    '                <h3>{section.title}</h3>',
    '                <p>{section.content}</p>',
    '              </article>',
    '            ))}',
    '          </section>',
    '          <section className="contract-signature-grid">',
    '            <div className="contract-signature-box">',
    '              <p>卖方签署：{signatures.sellerSigner || "________________"}</p>',
    '            </div>',
    '            <div className="contract-signature-box">',
    '              <p>买方签署：{signatures.buyerSigner || "________________"}</p>',
    '            </div>',
    '          </section>',
    '        </div>',
    '      </body>',
    '    </html>',
    '  );',
    '}',
    '',
  ].join('\n');
}

function buildContractTemplateCss() {
  return [
    ':root {',
    '  color-scheme: light;',
    '  --contract-bg: #ebe6dc;',
    '  --contract-paper: #fffefa;',
    '  --contract-ink: #1f2937;',
    '  --contract-muted: #6b7280;',
    '  --contract-line: #d8d1c6;',
    '  --contract-accent: #16324f;',
    '}',
    'html, body { margin: 0; padding: 0; background: radial-gradient(circle at top, #f4efe5 0%, var(--contract-bg) 72%); color: var(--contract-ink); font-family: "Songti SC", "STSong", serif; }',
    'body { padding: 28px; }',
    '.contract-shell { max-width: 920px; margin: 0 auto; background: var(--contract-paper); padding: 42px; box-shadow: 0 22px 60px rgba(15, 23, 42, 0.08); }',
    '.contract-header { text-align: center; border-bottom: 1px solid var(--contract-line); padding-bottom: 22px; }',
    '.contract-kicker { margin: 0 0 8px; text-transform: uppercase; letter-spacing: 0.3em; font-size: 12px; color: var(--contract-accent); }',
    '.contract-header h1 { margin: 0; font-size: 36px; }',
    '.contract-meta { display: flex; gap: 18px; justify-content: center; margin-top: 14px; color: var(--contract-muted); }',
    '.contract-party-grid, .contract-signature-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; margin-top: 24px; }',
    '.contract-box, .contract-clause, .contract-signature-box { border: 1px solid var(--contract-line); background: #fff; padding: 18px; }',
    '.contract-box h2, .contract-section h2, .contract-clause h3 { margin: 0 0 12px; }',
    '.contract-box p, .contract-clause p, .contract-signature-box p { margin: 8px 0 0; line-height: 1.8; white-space: pre-line; }',
    '.contract-section, .contract-clauses { margin-top: 26px; }',
    '.contract-table { width: 100%; border-collapse: collapse; }',
    '.contract-table th, .contract-table td { border-bottom: 1px solid var(--contract-line); padding: 12px 10px; text-align: left; vertical-align: top; }',
    '.contract-table thead th { font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--contract-muted); }',
    '.contract-empty { text-align: center; color: var(--contract-muted); padding: 26px 10px; }',
    '.contract-clauses { display: grid; gap: 16px; }',
    '@media print {',
    '  @page { size: A4; margin: 14mm; }',
    '  html, body { background: #fff; }',
    '  body { padding: 0; }',
    '  .contract-shell { box-shadow: none; max-width: none; padding: 0; }',
    '  .contract-box, .contract-clause, .contract-signature-box, .contract-section { break-inside: avoid; page-break-inside: avoid; }',
    '  .contract-table thead { display: table-header-group; }',
    '  .contract-table tr { break-inside: avoid; page-break-inside: avoid; }',
    '  .contract-clause h3 { break-after: avoid; }',
    '}',
    '',
  ].join('\n');
}
