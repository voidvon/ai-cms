import { execute, queryAll } from '../db.mjs';

const PAGE_ASSET_EXTENSIONS = new Set([
  '.avif',
  '.bmp',
  '.css',
  '.csv',
  '.eot',
  '.gif',
  '.ico',
  '.jpeg',
  '.jpg',
  '.js',
  '.json',
  '.map',
  '.pdf',
  '.png',
  '.svg',
  '.swf',
  '.ttf',
  '.txt',
  '.webp',
  '.woff',
  '.woff2',
  '.xml'
]);
const REAL_USER_EXCLUDED_REFERER_KEYWORD = 'spiraxsteam';
const REAL_USER_REFERER_FILTERS = [
  { operator: 'not_empty', value: '' },
  { operator: 'not_contains', value: REAL_USER_EXCLUDED_REFERER_KEYWORD }
];
export const ACCESS_LOG_RETENTION_DAYS = 3;
const ACCESS_LOG_TIME_ZONE_OFFSET_MINUTES = 8 * 60;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
let lastAutomaticCleanupDayKey = '';
let accessLogDeviceKindsBackfilled = false;

export function ensureAccessLogsSchema() {
  execute(`
    CREATE TABLE IF NOT EXISTS access_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page_path TEXT NOT NULL,
      page_url TEXT NOT NULL DEFAULT '',
      client_ip TEXT NOT NULL,
      client_ip_visit_count INTEGER NOT NULL DEFAULT 0,
      method TEXT NOT NULL,
      status_code INTEGER NOT NULL,
      referer TEXT NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT '',
      user_agent_kind TEXT NOT NULL DEFAULT 'other',
      visited_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  execute(`
    CREATE INDEX IF NOT EXISTS idx_access_logs_visited_at
    ON access_logs (visited_at DESC)
  `);

  execute(`
    CREATE INDEX IF NOT EXISTS idx_access_logs_page_path
    ON access_logs (page_path)
  `);

  execute(`
    CREATE INDEX IF NOT EXISTS idx_access_logs_client_ip
    ON access_logs (client_ip)
  `);

  addColumnIfMissing('access_logs', 'client_ip_visit_count', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('access_logs', 'user_agent_kind', `TEXT NOT NULL DEFAULT 'other'`);
  addColumnIfMissing('access_logs', 'device_kind', `TEXT NOT NULL DEFAULT 'other'`);
  addColumnIfMissing('access_logs', 'page_url', `TEXT NOT NULL DEFAULT ''`);

  execute(`
    CREATE INDEX IF NOT EXISTS idx_access_logs_client_ip_visit_count
    ON access_logs (client_ip, client_ip_visit_count DESC)
  `);

  execute(`
    CREATE INDEX IF NOT EXISTS idx_access_logs_user_agent_kind
    ON access_logs (user_agent_kind)
  `);

  execute(`
    CREATE INDEX IF NOT EXISTS idx_access_logs_device_kind
    ON access_logs (device_kind)
  `);

  cleanupExpiredAccessLogsOncePerDay();
  backfillAccessLogVisitCounts();
  backfillAccessLogUserAgentKinds();
  backfillAccessLogDeviceKinds();
  backfillAccessLogPageUrls();
}

export function getAccessLogRetentionCutoff(now = new Date()) {
  const normalizedNow = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(normalizedNow.getTime())) {
    throw new TypeError('Invalid access log retention date');
  }

  const localNow = new Date(
    normalizedNow.getTime() + ACCESS_LOG_TIME_ZONE_OFFSET_MINUTES * 60 * 1000
  );
  const retainedStartAsUtc = Date.UTC(
    localNow.getUTCFullYear(),
    localNow.getUTCMonth(),
    localNow.getUTCDate()
  ) - (ACCESS_LOG_RETENTION_DAYS - 1) * MILLISECONDS_PER_DAY;
  const cutoff = new Date(
    retainedStartAsUtc - ACCESS_LOG_TIME_ZONE_OFFSET_MINUTES * 60 * 1000
  );

  return {
    dayKey: localNow.toISOString().slice(0, 10),
    cutoff: cutoff.toISOString().slice(0, 19).replace('T', ' ')
  };
}

export function cleanupExpiredAccessLogs(now = new Date()) {
  const { cutoff } = getAccessLogRetentionCutoff(now);
  const result = execute(
    'DELETE FROM access_logs WHERE datetime(visited_at) < datetime(?)',
    [cutoff]
  );
  return Number(result.changes || 0);
}

function cleanupExpiredAccessLogsOncePerDay(now = new Date()) {
  const { dayKey } = getAccessLogRetentionCutoff(now);
  if (lastAutomaticCleanupDayKey === dayKey) {
    return 0;
  }

  const deletedCount = cleanupExpiredAccessLogs(now);
  lastAutomaticCleanupDayKey = dayKey;
  return deletedCount;
}

export function recordAccessLog(input = {}) {
  ensureAccessLogsSchema();

  const pagePath = normalizePagePath(input.pagePath);
  const pageUrl = normalizePageUrl(input.pageUrl, pagePath);
  const clientIp = normalizeText(input.clientIp);
  const method = normalizeMethod(input.method);
  const statusCode = normalizeStatusCode(input.statusCode);
  const userAgent = normalizeText(input.userAgent);
  const userAgentSummary = summarizeUserAgent(userAgent);

  if (!pagePath || !pageUrl || !clientIp || !method || !Number.isInteger(statusCode)) {
    return false;
  }

  const previousVisitRow = queryAll(
    `
      SELECT client_ip_visit_count
      FROM access_logs
      WHERE client_ip = ?
      ORDER BY client_ip_visit_count DESC, datetime(visited_at) DESC, id DESC
      LIMIT 1
    `,
    [clientIp]
  )[0] || { client_ip_visit_count: 0 };

  const nextVisitCount = Number(previousVisitRow.client_ip_visit_count || 0) + 1;

  execute(
    `
      INSERT INTO access_logs (
        page_path,
        page_url,
        client_ip,
        client_ip_visit_count,
        method,
        status_code,
        referer,
        user_agent,
        user_agent_kind,
        device_kind
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      pagePath,
      pageUrl,
      clientIp,
      nextVisitCount,
      method,
      statusCode,
      normalizeText(input.referer),
      userAgent,
      userAgentSummary.kind,
      userAgentSummary.deviceKind
    ]
  );

  return true;
}

export function listAccessLogs(options = {}) {
  ensureAccessLogsSchema();

  const page = normalizePositiveInteger(options.page, 1);
  const limit = Math.min(normalizePositiveInteger(options.limit, 50), 200);
  const offset = (page - 1) * limit;
  const { whereClause, params } = buildAccessLogFilterSql(options, 'non_bot');

  const totalRow = queryAll(
    `SELECT COUNT(*) AS total FROM access_logs l ${whereClause}`,
    params
  )[0] || { total: 0 };

  const items = queryAll(
    `
      SELECT
        l.id,
        l.page_path,
        l.page_url,
        l.client_ip,
        l.client_ip_visit_count,
        l.method,
        l.status_code,
        l.referer,
        l.user_agent,
        l.user_agent_kind,
        l.device_kind,
        l.visited_at
      FROM access_logs l
      ${whereClause}
      ORDER BY datetime(l.visited_at) DESC, l.id DESC
      LIMIT ? OFFSET ?
    `,
    [...params, limit, offset]
  ).map(hydrateAccessLogRow);

  return {
    items,
    pagination: {
      page,
      limit,
      total: Number(totalRow.total || 0)
    }
  };
}

function buildAccessLogFilterSql(options = {}, defaultUserAgentKind = 'non_bot') {
  const pathKeyword = normalizeText(options.path);
  const ipKeyword = normalizeText(options.ip);
  const userAgentKind = normalizeAccessLogUserAgentKindFilter(options.userAgentKind, defaultUserAgentKind);
  const refererFilters = normalizeAccessLogRefererFilters(options);
  const statusMode = normalizeAccessLogStatusFilter(options.statusMode);
  const statusOperator = normalizeAccessLogStatusOperator(options.statusOperator);
  const where = [];
  const params = [];

  if (pathKeyword) {
    where.push('(l.page_path LIKE ? OR l.page_url LIKE ?)');
    params.push(`%${pathKeyword}%`, `%${pathKeyword}%`);
  }

  if (ipKeyword) {
    where.push('l.client_ip LIKE ?');
    params.push(`%${ipKeyword}%`);
  }

  if (userAgentKind === 'bot') {
    where.push('l.user_agent_kind = ?');
    params.push('bot');
  } else if (userAgentKind === 'non_bot') {
    where.push('l.user_agent_kind != ?');
    params.push('bot');
  }

  for (const filter of refererFilters) {
    appendRefererFilterSql(where, params, filter);
  }

  appendStatusFilterSql(where, statusMode, statusOperator);

  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  return { whereClause, params };
}

export function getAccessLogDashboardSummary() {
  ensureAccessLogsSchema();

  const todayVisitsRow = queryAll(`
    SELECT COUNT(*) AS total
    FROM access_logs
    WHERE datetime(visited_at) >= datetime('now', 'start of day')
  `)[0] || { total: 0 };

  const realUserFilter = buildAccessLogFilterSql(
    {
      userAgentKind: 'non_bot',
      refererFilters: REAL_USER_REFERER_FILTERS
    },
    'non_bot'
  );
  const recentRealUsersWhereClause = realUserFilter.whereClause
    ? `${realUserFilter.whereClause} AND datetime(l.visited_at) >= datetime('now', '-24 hours') AND COALESCE(TRIM(l.client_ip), '') != ''`
    : `WHERE datetime(l.visited_at) >= datetime('now', '-24 hours') AND COALESCE(TRIM(l.client_ip), '') != ''`;
  const recentRealUsersRow = queryAll(
    `
      SELECT COUNT(DISTINCT TRIM(l.client_ip)) AS total
      FROM access_logs l
      ${recentRealUsersWhereClause}
    `,
    realUserFilter.params
  )[0] || { total: 0 };

  const recentDeviceUsersRow = queryAll(
    `
      SELECT
        COUNT(DISTINCT CASE WHEN l.device_kind = 'desktop' THEN TRIM(l.client_ip) END) AS desktop_total,
        COUNT(DISTINCT CASE WHEN l.device_kind = 'mobile' THEN TRIM(l.client_ip) END) AS mobile_total
      FROM access_logs l
      ${recentRealUsersWhereClause}
    `,
    realUserFilter.params
  )[0] || { desktop_total: 0, mobile_total: 0 };

  const totalPagesRow = queryAll(`
    SELECT COUNT(DISTINCT CASE
      WHEN COALESCE(TRIM(page_url), '') != '' THEN page_url
      ELSE page_path
    END) AS total
    FROM access_logs
  `)[0] || { total: 0 };

  const recentVisitsRow = queryAll(`
    SELECT COUNT(*) AS total
    FROM access_logs
    WHERE datetime(visited_at) >= datetime('now', '-24 hours')
  `)[0] || { total: 0 };

  const totalNotFoundRow = queryAll(`
    SELECT COUNT(*) AS total
    FROM access_logs
    WHERE status_code = 404
  `)[0] || { total: 0 };

  const topPages = queryAll(`
    SELECT
      CASE
        WHEN COALESCE(TRIM(page_url), '') != '' THEN page_url
        ELSE page_path
      END AS page_url,
      page_path,
      COUNT(*) AS visits,
      COUNT(DISTINCT client_ip) AS unique_ips,
      MAX(visited_at) AS last_visited_at
    FROM access_logs
    GROUP BY CASE
      WHEN COALESCE(TRIM(page_url), '') != '' THEN page_url
      ELSE page_path
    END
    ORDER BY visits DESC, last_visited_at DESC
    LIMIT 10
  `);

  return {
    metrics: {
      today_visits: Number(todayVisitsRow.total || 0),
      recent_real_users: Number(recentRealUsersRow.total || 0),
      recent_pc_users: Number(recentDeviceUsersRow.desktop_total || 0),
      recent_mobile_users: Number(recentDeviceUsersRow.mobile_total || 0),
      total_pages: Number(totalPagesRow.total || 0),
      recent_visits: Number(recentVisitsRow.total || 0),
      total_404_errors: Number(totalNotFoundRow.total || 0)
    },
    top_pages: topPages.map((item) => ({
      page_path: item.page_path,
      page_url: normalizePageUrl(item.page_url, item.page_path),
      visits: Number(item.visits || 0),
      unique_ips: Number(item.unique_ips || 0),
      last_visited_at: item.last_visited_at || ''
    }))
  };
}

export function clearAccessLogs(options = {}) {
  ensureAccessLogsSchema();
  const { whereClause, params } = buildAccessLogFilterSql(options, 'all');
  const result = whereClause
    ? execute(
        `DELETE FROM access_logs WHERE id IN (SELECT l.id FROM access_logs l ${whereClause})`,
        params
      )
    : execute('DELETE FROM access_logs');
  return Number(result.changes || 0);
}

export function shouldRecordPageAccess(request, reply) {
  const method = normalizeMethod(request?.method);
  if (method !== 'GET') {
    return false;
  }

  const pathname = normalizePagePath(request?.raw?.url || request?.url || '');
  if (!pathname) {
    return false;
  }

  if (shouldIgnoreProbeRequest(request)) {
    return false;
  }

  if (pathname.startsWith('/api/')) {
    return false;
  }

  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    return false;
  }

  if (isKnownAssetPath(pathname)) {
    return false;
  }

  const contentType = String(reply?.getHeader?.('content-type') || '').toLowerCase();
  if (contentType && !contentType.startsWith('text/html')) {
    return false;
  }

  return true;
}

function shouldIgnoreProbeRequest(request) {
  const userAgent = normalizeText(request?.headers?.['user-agent']);
  const clientIp = normalizeClientIpForFilter(request);

  if (isLoopbackIp(clientIp) && isCliProbeUserAgent(userAgent)) {
    return true;
  }

  if (isHealthCheckUserAgent(userAgent)) {
    return true;
  }

  return false;
}

function isKnownAssetPath(pathname) {
  if (
    pathname.startsWith('/upload/')
    || pathname.startsWith('/uploads/')
    || pathname.startsWith('/skin/')
    || pathname.startsWith('/css/')
    || pathname.startsWith('/js/')
    || pathname.startsWith('/assets/')
  ) {
    return true;
  }

  const match = pathname.match(/\.([a-z0-9]+)$/i);
  if (!match) {
    return false;
  }

  return PAGE_ASSET_EXTENSIONS.has(`.${match[1].toLowerCase()}`);
}

function normalizePagePath(value) {
  const normalized = String(value || '').trim().split('?')[0] || '';
  if (!normalized) {
    return '';
  }
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

function normalizePageUrl(value, fallbackPath = '') {
  const normalized = String(value || '').trim();
  if (normalized) {
    return normalized;
  }

  return normalizePagePath(fallbackPath);
}

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeClientIpForFilter(request) {
  const headerCandidates = [
    request?.headers?.['cf-connecting-ip'],
    request?.headers?.['x-real-ip'],
    request?.headers?.['x-forwarded-for']
  ];

  for (const headerValue of headerCandidates) {
    const normalized = normalizeHeaderIp(headerValue);
    if (normalized) {
      return normalized;
    }
  }

  return normalizeText(request?.ip || request?.socket?.remoteAddress || '');
}

function normalizeHeaderIp(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .find(Boolean) || '';
}

function normalizeMethod(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return normalized || '';
}

function normalizeStatusCode(value) {
  const normalized = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(normalized) ? normalized : null;
}

function normalizePositiveInteger(value, fallback) {
  const normalized = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    return fallback;
  }
  return normalized;
}

function normalizeAccessLogUserAgentKindFilter(value, fallback = 'non_bot') {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'all' || normalized === 'bot' || normalized === 'non_bot') {
    return normalized;
  }

  return fallback;
}

function normalizeAccessLogRefererOperator(value, legacyMode = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (
    normalized === 'all'
    || normalized === 'none_of'
    || normalized === 'contains'
    || normalized === 'not_contains'
    || normalized === 'empty'
    || normalized === 'not_empty'
  ) {
    return normalized;
  }

  if (normalizeText(legacyMode).toLowerCase() === 'with_referer') {
    return 'not_empty';
  }

  return 'all';
}

function normalizeAccessLogRefererFilters(options = {}) {
  let rawFilters = [];

  if (Array.isArray(options.refererFilters)) {
    rawFilters = options.refererFilters;
  } else if (typeof options.refererFilters === 'string' && options.refererFilters.trim()) {
    try {
      const parsed = JSON.parse(options.refererFilters);
      rawFilters = Array.isArray(parsed) ? parsed : [];
    } catch {
      rawFilters = [];
    }
  }

  const normalizedFilters = rawFilters
    .slice(0, 10)
    .map((filter) => ({
      operator: normalizeAccessLogRefererOperator(filter?.operator),
      value: normalizeText(filter?.value)
    }))
    .filter((filter) => (
      filter.operator !== 'all'
      && (!refererOperatorNeedsValue(filter.operator) || Boolean(filter.value))
    ));

  if (normalizedFilters.length > 0 || rawFilters.length > 0) {
    return normalizedFilters;
  }

  const legacyOperator = normalizeAccessLogRefererOperator(options.refererOperator, options.refererMode);
  const legacyValue = normalizeText(options.refererValue);
  if (legacyOperator === 'all' || (refererOperatorNeedsValue(legacyOperator) && !legacyValue)) {
    return [];
  }

  return [{ operator: legacyOperator, value: legacyValue }];
}

function refererOperatorNeedsValue(operator) {
  return operator !== 'empty' && operator !== 'not_empty';
}

function appendRefererFilterSql(where, params, filter) {
  if (filter.operator === 'empty') {
    where.push(`COALESCE(TRIM(l.referer), '') = ''`);
  } else if (filter.operator === 'not_empty') {
    where.push(`COALESCE(TRIM(l.referer), '') != ''`);
  } else if (filter.operator === 'contains') {
    where.push(`l.referer LIKE ? ESCAPE '\\'`);
    params.push(`%${escapeSqlLikePattern(filter.value)}%`);
  } else if (filter.operator === 'not_contains') {
    where.push(`l.referer NOT LIKE ? ESCAPE '\\'`);
    params.push(`%${escapeSqlLikePattern(filter.value)}%`);
  } else if (filter.operator === 'none_of') {
    const excludedReferers = normalizeRefererFilterValues(filter.value);
    if (excludedReferers.length > 0) {
      where.push(`TRIM(l.referer) NOT IN (${excludedReferers.map(() => '?').join(', ')})`);
      params.push(...excludedReferers);
    }
  }
}

function normalizeRefererFilterValues(value) {
  return [...new Set(
    normalizeText(value)
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 50)
  )];
}

function escapeSqlLikePattern(value) {
  return value.replace(/[\\%_]/g, '\\$&');
}

function normalizeAccessLogStatusFilter(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (
    normalized === 'all'
    || normalized === '2xx'
    || normalized === '3xx'
    || normalized === '4xx'
    || normalized === '404'
    || normalized === '5xx'
  ) {
    return normalized;
  }

  return 'all';
}

function normalizeAccessLogStatusOperator(value) {
  return normalizeText(value).toLowerCase() === 'is_not' ? 'is_not' : 'is';
}

function appendStatusFilterSql(where, statusMode, statusOperator) {
  const statusConditions = {
    '2xx': 'l.status_code >= 200 AND l.status_code < 300',
    '3xx': 'l.status_code >= 300 AND l.status_code < 400',
    '4xx': 'l.status_code >= 400 AND l.status_code < 500',
    '404': 'l.status_code = 404',
    '5xx': 'l.status_code >= 500 AND l.status_code < 600'
  };
  const condition = statusConditions[statusMode];
  if (!condition) {
    return;
  }

  where.push(statusOperator === 'is_not' ? `NOT (${condition})` : `(${condition})`);
}

function normalizeStoredUserAgentKind(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'browser' || normalized === 'bot' || normalized === 'other') {
    return normalized;
  }

  return '';
}

function normalizeStoredDeviceKind(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'desktop' || normalized === 'mobile' || normalized === 'other') {
    return normalized;
  }

  return 'other';
}

function hydrateAccessLogRow(row = {}) {
  const userAgent = normalizeText(row.user_agent);
  const userAgentSummary = summarizeUserAgent(userAgent);
  const userAgentKind = normalizeStoredUserAgentKind(row.user_agent_kind) || userAgentSummary.kind;

  return {
    ...row,
    client_ip_visit_count: Number(row.client_ip_visit_count || 0),
    page_url: normalizePageUrl(row.page_url, row.page_path),
    user_agent: userAgent,
    user_agent_kind: userAgentKind,
    device_kind: normalizeStoredDeviceKind(row.device_kind),
    user_agent_label: userAgentSummary.label
  };
}

function addColumnIfMissing(tableName, columnName, definition) {
  const columns = new Set(queryAll(`PRAGMA table_info(${tableName})`).map((column) => String(column.name || '')));
  if (columns.has(columnName)) {
    return;
  }

  execute(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

function backfillAccessLogVisitCounts() {
  const needsBackfill = queryAll(`
    SELECT 1 AS value
    FROM access_logs
    WHERE COALESCE(client_ip_visit_count, 0) <= 0
    LIMIT 1
  `)[0];

  if (!needsBackfill) {
    return;
  }

  execute(`
    WITH sequenced_logs AS (
      SELECT
        id,
        ROW_NUMBER() OVER (
          PARTITION BY client_ip
          ORDER BY datetime(visited_at) ASC, id ASC
        ) AS visit_count
      FROM access_logs
    )
    UPDATE access_logs
    SET client_ip_visit_count = (
      SELECT sequenced_logs.visit_count
      FROM sequenced_logs
      WHERE sequenced_logs.id = access_logs.id
    )
    WHERE id IN (SELECT id FROM sequenced_logs)
  `);
}

function backfillAccessLogUserAgentKinds() {
  const rows = queryAll(`
    SELECT id, user_agent
    FROM access_logs
    WHERE COALESCE(user_agent_kind, '') NOT IN ('browser', 'bot', 'other')
  `);

  for (const row of rows) {
    const userAgent = normalizeText(row.user_agent);
    const userAgentSummary = summarizeUserAgent(userAgent);
    execute(
      'UPDATE access_logs SET user_agent_kind = ? WHERE id = ?',
      [userAgentSummary.kind, row.id]
    );
  }
}

function backfillAccessLogDeviceKinds() {
  if (accessLogDeviceKindsBackfilled) {
    return;
  }

  const rows = queryAll('SELECT id, user_agent, device_kind FROM access_logs');
  for (const row of rows) {
    const deviceKind = detectDeviceKind(normalizeText(row.user_agent));
    if (normalizeStoredDeviceKind(row.device_kind) === deviceKind) {
      continue;
    }

    execute(
      'UPDATE access_logs SET device_kind = ? WHERE id = ?',
      [deviceKind, row.id]
    );
  }
  accessLogDeviceKindsBackfilled = true;
}

function backfillAccessLogPageUrls() {
  execute(`
    UPDATE access_logs
    SET page_url = page_path
    WHERE COALESCE(TRIM(page_url), '') = ''
  `);
}

export function summarizeUserAgent(userAgent) {
  if (!userAgent) {
    return {
      kind: 'other',
      label: '未知客户端',
      deviceKind: 'other'
    };
  }

  const knownClientLabel = detectKnownClientLabel(userAgent);
  if (knownClientLabel) {
    return {
      kind: 'other',
      label: knownClientLabel,
      deviceKind: 'other'
    };
  }

  const botLabel = detectBotLabel(userAgent);
  if (botLabel) {
    return {
      kind: 'bot',
      label: botLabel,
      deviceKind: 'other'
    };
  }

  const browserLabel = detectBrowserLabel(userAgent);
  if (browserLabel) {
    return {
      kind: 'browser',
      label: browserLabel,
      deviceKind: detectDeviceKind(userAgent)
    };
  }

  return {
    kind: 'other',
    label: userAgent,
    deviceKind: detectDeviceKind(userAgent)
  };
}

function detectDeviceKind(userAgent) {
  if (!userAgent) {
    return 'other';
  }

  if (/(?:android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile|tablet)/i.test(userAgent)) {
    return 'mobile';
  }

  if (/(?:windows nt|macintosh|x11; linux|cros|ubuntu|freebsd)/i.test(userAgent)) {
    return 'desktop';
  }

  return 'other';
}

function detectKnownClientLabel(userAgent) {
  const knownClientMatchers = [
    { pattern: /\bChatGPT-User\/[\d.]+\b/i, label: 'ChatGPT-User' }
  ];

  const matched = knownClientMatchers.find((item) => item.pattern.test(userAgent));
  if (matched) {
    return matched.label;
  }

  return '';
}

function detectBotLabel(userAgent) {
  const botMatchers = [
    { pattern: /\bGooglebot\b/i, label: 'Googlebot' },
    { pattern: /\bGoogleOther(?:-Image|-Video)?\b/i, label: 'GoogleOther' },
    { pattern: /\bGoogle-InspectionTool\b/i, label: 'Google-InspectionTool' },
    { pattern: /\bStorebot-Google\b/i, label: 'Storebot-Google' },
    { pattern: /\bAdsBot-Google(?:-Mobile)?\b/i, label: 'AdsBot-Google' },
    { pattern: /\bMJ12bot\b/i, label: 'MJ12bot' },
    { pattern: /\bBaiduspider\b/i, label: 'Baiduspider' },
    { pattern: /\bbingbot\b/i, label: 'bingbot' },
    { pattern: /\bClaudeBot\b/i, label: 'ClaudeBot' },
    { pattern: /\bPetalBot\b/i, label: 'PetalBot' },
    { pattern: /\bSogou web spider\b/i, label: 'Sogou web spider' },
    { pattern: /\bSogou.*spider\b/i, label: 'Sogou web spider' },
    { pattern: /\bYandexBot\b/i, label: 'YandexBot' },
    { pattern: /\bDuckDuckBot\b/i, label: 'DuckDuckBot' },
    { pattern: /\bBytespider\b/i, label: 'Bytespider' },
    { pattern: /\bAhrefsBot\b/i, label: 'AhrefsBot' },
    { pattern: /\bSemrushBot\b/i, label: 'SemrushBot' }
  ];

  const matched = botMatchers.find((item) => item.pattern.test(userAgent));
  if (matched) {
    return matched.label;
  }

  return '';
}

function detectBrowserLabel(userAgent) {
  const browserMatchers = [
    { pattern: /\bEdg\/([\d.]+)/i, label: 'Edge' },
    { pattern: /\bOPR\/([\d.]+)/i, label: 'Opera' },
    { pattern: /\bChrome\/([\d.]+)/i, label: 'Chrome' },
    { pattern: /\bFirefox\/([\d.]+)/i, label: 'Firefox' },
    { pattern: /\bVersion\/([\d.]+).*Safari\//i, label: 'Safari' },
    { pattern: /\bMSIE ([\d.]+)/i, label: 'Internet Explorer' },
    { pattern: /\bTrident\/.*rv:([\d.]+)/i, label: 'Internet Explorer' }
  ];

  for (const matcher of browserMatchers) {
    const match = userAgent.match(matcher.pattern);
    if (match?.[1]) {
      return `${matcher.label} ${match[1]}`;
    }
  }

  return '';
}

function isLoopbackIp(value) {
  const normalized = normalizeText(value).toLowerCase();
  return normalized === '127.0.0.1'
    || normalized === '::1'
    || normalized === '::ffff:127.0.0.1';
}

function isCliProbeUserAgent(userAgent) {
  if (!userAgent) {
    return false;
  }

  return /\bcurl\/[\d.]+\b/i.test(userAgent)
    || /\bwget\/[\d.]+\b/i.test(userAgent)
    || /\bhttpie\/[\d.]+\b/i.test(userAgent);
}

function isHealthCheckUserAgent(userAgent) {
  if (!userAgent) {
    return false;
  }

  return /\b(kube-probe|healthcheck|uptimerobot|statuscake|headlesschrome health check)\b/i.test(userAgent);
}
