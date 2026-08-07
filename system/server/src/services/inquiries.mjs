import { createHash, randomUUID } from 'node:crypto';
import { execute, getDb, queryAll, queryOne } from '../db.mjs';

export const INQUIRY_TYPES = ['product', 'technical', 'service', 'other'];
export const INQUIRY_STATUSES = ['new', 'processing', 'quoted', 'closed', 'invalid'];

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
let schemaEnsured = false;

export function ensureInquiriesSchema() {
  if (schemaEnsured) return;

  getDb().exec(`
    CREATE TABLE IF NOT EXISTS inquiry_submissions (
      id INTEGER PRIMARY KEY,
      reference_no TEXT NOT NULL UNIQUE,
      inquiry_type TEXT NOT NULL CHECK (inquiry_type IN ('product', 'technical', 'service', 'other')),
      contact_name TEXT NOT NULL,
      company TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      requirements TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'processing', 'quoted', 'closed', 'invalid')),
      internal_note TEXT NOT NULL DEFAULT '',
      source_column_id INTEGER,
      language_code TEXT NOT NULL DEFAULT '',
      source_url TEXT NOT NULL DEFAULT '',
      submitter_ip_hash TEXT NOT NULL DEFAULT '',
      notification_status TEXT NOT NULL DEFAULT 'pending',
      notification_error TEXT NOT NULL DEFAULT '',
      notified_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS inquiry_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      feishu_webhook_url TEXT NOT NULL DEFAULT '',
      feishu_enabled INTEGER NOT NULL DEFAULT 0 CHECK (feishu_enabled IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    INSERT OR IGNORE INTO inquiry_settings (id) VALUES (1);

    CREATE INDEX IF NOT EXISTS idx_inquiry_submissions_status_created
    ON inquiry_submissions(status, created_at DESC, id DESC);

    CREATE INDEX IF NOT EXISTS idx_inquiry_submissions_type_created
    ON inquiry_submissions(inquiry_type, created_at DESC, id DESC);

  `);

  addColumnIfMissing('inquiry_submissions', 'notification_status', "TEXT NOT NULL DEFAULT 'pending'");
  addColumnIfMissing('inquiry_submissions', 'notification_error', "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing('inquiry_submissions', 'notified_at', 'TEXT');
  addColumnIfMissing('inquiry_submissions', 'submitter_ip_hash', "TEXT NOT NULL DEFAULT ''");
  execute(`
    CREATE INDEX IF NOT EXISTS idx_inquiry_submissions_ip_created
    ON inquiry_submissions(submitter_ip_hash, created_at DESC)
  `);

  schemaEnsured = true;
}

export async function createInquiry(input = {}) {
  ensureInquiriesSchema();
  const payload = normalizeInquiryInput(input);
  const now = new Date().toISOString();
  const referenceNo = createReferenceNo(now);
  const result = execute(
    `
      INSERT INTO inquiry_submissions (
        reference_no,
        inquiry_type,
        contact_name,
        company,
        email,
        phone,
        requirements,
        status,
        internal_note,
        source_column_id,
        language_code,
        source_url,
        submitter_ip_hash,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'new', '', ?, ?, ?, ?, ?, ?)
    `,
    [
      referenceNo,
      payload.inquiry_type,
      payload.contact_name,
      payload.company,
      payload.email,
      payload.phone,
      payload.requirements,
      payload.source_column_id,
      payload.language_code,
      payload.source_url,
      payload.submitter_ip_hash,
      now,
      now
    ]
  );

  const inquiry = getInquiryById(result.lastInsertRowid);
  await notifyInquiryCreated(inquiry);
  return getInquiryById(result.lastInsertRowid);
}

export function assertInquiryRateLimit(submitterIpHash, { maxSubmissions = 5, windowMinutes = 10 } = {}) {
  ensureInquiriesSchema();
  const normalizedHash = normalizeText(submitterIpHash, 128);
  if (!normalizedHash) return;
  const count = Number(queryOne(
    `
      SELECT COUNT(*) AS total
      FROM inquiry_submissions
      WHERE submitter_ip_hash = ?
        AND datetime(created_at) >= datetime('now', ?)
    `,
    [normalizedHash, `-${Math.max(1, Number(windowMinutes) || 10)} minutes`]
  )?.total || 0);
  if (count >= maxSubmissions) {
    const error = new Error('提交过于频繁，请稍后再试');
    error.code = 'INQUIRY_RATE_LIMIT';
    throw error;
  }
}

export function hashInquirySubmitterIp(ipAddress) {
  const secret = String(process.env.COOKIE_SECRET || 'ai-cms-inquiry-rate-limit').trim();
  return createHash('sha256').update(`${secret}:${String(ipAddress || '').trim()}`).digest('hex');
}

export function getInquirySettings() {
  ensureInquiriesSchema();
  return mapInquirySettings(queryOne(
    `
      SELECT feishu_webhook_url, feishu_enabled, created_at, updated_at
      FROM inquiry_settings
      WHERE id = 1
    `
  ));
}

export function updateInquirySettings(input = {}) {
  ensureInquiriesSchema();
  const current = getInquirySettings();
  const webhookUrl = input.feishu_webhook_url === undefined
    ? current.feishu_webhook_url
    : normalizeWebhookUrl(input.feishu_webhook_url, { allowEmpty: true });
  const enabled = input.feishu_enabled === undefined
    ? current.feishu_enabled
    : normalizeBooleanInt(input.feishu_enabled);

  if (enabled && !webhookUrl) {
    throw new Error('启用飞书通知前请填写 Webhook 地址');
  }

  execute(
    `
      UPDATE inquiry_settings
      SET feishu_webhook_url = ?, feishu_enabled = ?, updated_at = ?
      WHERE id = 1
    `,
    [webhookUrl, enabled, new Date().toISOString()]
  );

  return getInquirySettings();
}

export async function testInquiryFeishuWebhook(webhookUrl) {
  const normalizedUrl = normalizeWebhookUrl(webhookUrl, { allowEmpty: false });
  await sendFeishuText(normalizedUrl, '询价管理飞书通知测试成功。');
  return { success: true };
}

export function listInquiries(options = {}) {
  ensureInquiriesSchema();
  const page = Math.max(1, toInteger(options.page, 1));
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, toInteger(options.limit, DEFAULT_PAGE_SIZE)));
  const keyword = normalizeText(options.keyword, 200).toLowerCase();
  const status = normalizeOptionalEnum(options.status, INQUIRY_STATUSES, '询价状态');
  const inquiryType = normalizeOptionalEnum(options.inquiryType ?? options.inquiry_type, INQUIRY_TYPES, '询价类型');
  const conditions = [];
  const params = [];

  if (keyword) {
    conditions.push(`(
      lower(reference_no) LIKE ?
      OR lower(contact_name) LIKE ?
      OR lower(company) LIKE ?
      OR lower(email) LIKE ?
      OR lower(phone) LIKE ?
      OR lower(requirements) LIKE ?
    )`);
    const pattern = `%${escapeLike(keyword)}%`;
    params.push(pattern, pattern, pattern, pattern, pattern, pattern);
  }
  if (status) {
    conditions.push('status = ?');
    params.push(status);
  }
  if (inquiryType) {
    conditions.push('inquiry_type = ?');
    params.push(inquiryType);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const total = Number(queryOne(`SELECT COUNT(*) AS total FROM inquiry_submissions ${whereClause}`, params)?.total || 0);
  const offset = (page - 1) * limit;
  const items = queryAll(
    `
      SELECT ${INQUIRY_SELECT_FIELDS}
      FROM inquiry_submissions
      ${whereClause}
      ORDER BY created_at DESC, id DESC
      LIMIT ? OFFSET ?
    `,
    [...params, limit, offset]
  );

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit))
    }
  };
}

export function getInquiryById(id) {
  ensureInquiriesSchema();
  const inquiryId = toInteger(id, 0);
  if (inquiryId <= 0) return null;
  return queryOne(
    `SELECT ${INQUIRY_SELECT_FIELDS} FROM inquiry_submissions WHERE id = ?`,
    [inquiryId]
  ) || null;
}

export function updateInquiryManagement(id, input = {}) {
  ensureInquiriesSchema();
  const existing = getInquiryById(id);
  if (!existing) return null;

  const status = input.status === undefined
    ? existing.status
    : normalizeRequiredEnum(input.status, INQUIRY_STATUSES, '询价状态');
  const internalNote = input.internal_note === undefined
    ? existing.internal_note
    : normalizeText(input.internal_note, 5000);

  execute(
    `
      UPDATE inquiry_submissions
      SET status = ?, internal_note = ?, updated_at = ?
      WHERE id = ?
    `,
    [status, internalNote, new Date().toISOString(), existing.id]
  );

  return getInquiryById(existing.id);
}

export function deleteInquiry(id) {
  ensureInquiriesSchema();
  const inquiryId = toInteger(id, 0);
  if (inquiryId <= 0) return false;
  return Number(execute('DELETE FROM inquiry_submissions WHERE id = ?', [inquiryId]).changes || 0) > 0;
}

const INQUIRY_SELECT_FIELDS = `
  id,
  reference_no,
  inquiry_type,
  contact_name,
  company,
  email,
  phone,
  requirements,
  status,
  internal_note,
  source_column_id,
  language_code,
  source_url,
  notification_status,
  notification_error,
  notified_at,
  created_at,
  updated_at
`;

function normalizeInquiryInput(input) {
  const inquiryType = normalizeRequiredEnum(input.inquiry_type, INQUIRY_TYPES, '询价类型');
  const contactName = normalizeRequiredText(input.contact_name, 100, '姓名');
  const company = normalizeText(input.company, 200);
  const email = normalizeRequiredText(input.email, 254, '邮箱').toLowerCase();
  const phone = normalizeText(input.phone, 60);
  const requirements = normalizeRequiredText(input.requirements, 5000, '具体需求');

  if (!isValidEmail(email)) {
    throw new Error('邮箱格式不正确');
  }

  return {
    inquiry_type: inquiryType,
    contact_name: contactName,
    company,
    email,
    phone,
    requirements,
    source_column_id: normalizeOptionalPositiveInteger(input.source_column_id),
    language_code: normalizeText(input.language_code, 20),
    source_url: normalizeText(input.source_url, 2000),
    submitter_ip_hash: normalizeText(input.submitter_ip_hash, 128)
  };
}

function createReferenceNo(now) {
  const day = now.slice(0, 10).replaceAll('-', '');
  const suffix = randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase();
  return `INQ-${day}-${suffix}`;
}

function normalizeRequiredText(value, maxLength, label) {
  const normalized = normalizeText(value, maxLength);
  if (!normalized) throw new Error(`${label}不能为空`);
  return normalized;
}

function normalizeText(value, maxLength) {
  const normalized = String(value ?? '').trim();
  if (normalized.length > maxLength) {
    throw new Error(`字段内容不能超过 ${maxLength} 个字符`);
  }
  return normalized;
}

function normalizeRequiredEnum(value, allowedValues, label) {
  const normalized = String(value ?? '').trim();
  if (!allowedValues.includes(normalized)) {
    throw new Error(`${label}不正确`);
  }
  return normalized;
}

function normalizeOptionalEnum(value, allowedValues, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized || normalized === 'all') return '';
  return normalizeRequiredEnum(normalized, allowedValues, label);
}

function normalizeOptionalPositiveInteger(value) {
  if (value === undefined || value === null || value === '') return null;
  const normalized = toInteger(value, 0);
  if (normalized <= 0) throw new Error('来源栏目不正确');
  return normalized;
}

function toInteger(value, fallback) {
  const normalized = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(normalized) ? normalized : fallback;
}

function escapeLike(value) {
  return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function notifyInquiryCreated(inquiry) {
  if (!inquiry) return;
  const settings = getInquirySettings();
  if (!settings.feishu_enabled || !settings.feishu_webhook_url) {
    updateInquiryNotificationResult(inquiry.id, 'disabled');
    return;
  }

  try {
    await sendFeishuText(settings.feishu_webhook_url, buildInquiryNotificationText(inquiry));
    updateInquiryNotificationResult(inquiry.id, 'sent');
  } catch (error) {
    updateInquiryNotificationResult(inquiry.id, 'failed', normalizeNotificationError(error));
  }
}

async function sendFeishuText(webhookUrl, content) {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      msg_type: 'text',
      content: { text: content }
    }),
    signal: AbortSignal.timeout(8000)
  });

  if (!response.ok) {
    throw new Error(`飞书 Webhook 请求失败（HTTP ${response.status}）`);
  }

  const result = await response.json().catch(() => null);
  const code = result?.code ?? result?.StatusCode;
  if (code !== undefined && Number(code) !== 0) {
    throw new Error(`飞书 Webhook 返回错误（code ${code}）`);
  }
}

function buildInquiryNotificationText(inquiry) {
  const typeLabels = {
    product: '产品询价',
    technical: '技术咨询',
    service: '服务支持',
    other: '其他'
  };
  return [
    `【新询价】${inquiry.reference_no}`,
    `询价类型：${typeLabels[inquiry.inquiry_type] || inquiry.inquiry_type}`,
    `姓名：${inquiry.contact_name}`,
    `公司名称：${inquiry.company || '-'}`,
    `邮箱：${inquiry.email || '-'}`,
    `电话：${inquiry.phone || '-'}`,
    `具体需求：${truncateText(inquiry.requirements, 2000)}`
  ].join('\n');
}

function updateInquiryNotificationResult(id, status, errorMessage = '') {
  const sentAt = status === 'sent' ? new Date().toISOString() : null;
  execute(
    `
      UPDATE inquiry_submissions
      SET notification_status = ?, notification_error = ?, notified_at = ?, updated_at = ?
      WHERE id = ?
    `,
    [status, errorMessage, sentAt, new Date().toISOString(), id]
  );
}

function normalizeWebhookUrl(value, { allowEmpty }) {
  const normalized = normalizeText(value, 1000);
  if (!normalized && allowEmpty) return '';
  if (!normalized) throw new Error('飞书 Webhook 地址不能为空');

  let url;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error('飞书 Webhook 地址格式不正确');
  }

  const pathPrefix = '/open-apis/bot/v2/hook/';
  if (url.protocol !== 'https:' || url.hostname !== 'open.feishu.cn' || !url.pathname.startsWith(pathPrefix) || url.pathname.length <= pathPrefix.length) {
    throw new Error('请填写有效的飞书机器人 Webhook 地址');
  }
  url.search = '';
  url.hash = '';
  return url.toString();
}

function normalizeBooleanInt(value) {
  return value === true || value === 1 || value === '1' || value === 'true' ? 1 : 0;
}

function mapInquirySettings(row) {
  return {
    feishu_webhook_url: String(row?.feishu_webhook_url || ''),
    feishu_enabled: Number(row?.feishu_enabled || 0),
    created_at: row?.created_at || '',
    updated_at: row?.updated_at || ''
  };
}

function normalizeNotificationError(error) {
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return '飞书通知请求超时';
  const message = String(error?.message || '').trim();
  if (message.startsWith('飞书 Webhook ')) return truncateText(message, 500);
  return '飞书通知发送失败';
}

function truncateText(value, maxLength) {
  const normalized = String(value || '');
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

function addColumnIfMissing(tableName, columnName, definition) {
  const columns = queryAll(`PRAGMA table_info(${tableName})`);
  if (columns.some((column) => column.name === columnName)) return;
  execute(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}
