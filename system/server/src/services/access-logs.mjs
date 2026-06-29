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

export function ensureAccessLogsSchema() {
  execute(`
    CREATE TABLE IF NOT EXISTS access_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page_path TEXT NOT NULL,
      client_ip TEXT NOT NULL,
      client_ip_visit_count INTEGER NOT NULL DEFAULT 0,
      method TEXT NOT NULL,
      status_code INTEGER NOT NULL,
      referer TEXT NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT '',
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

  execute(`
    CREATE INDEX IF NOT EXISTS idx_access_logs_client_ip_visit_count
    ON access_logs (client_ip, client_ip_visit_count DESC)
  `);

  backfillAccessLogVisitCounts();
}

export function recordAccessLog(input = {}) {
  ensureAccessLogsSchema();

  const pagePath = normalizePagePath(input.pagePath);
  const clientIp = normalizeText(input.clientIp);
  const method = normalizeMethod(input.method);
  const statusCode = normalizeStatusCode(input.statusCode);

  if (!pagePath || !clientIp || !method || !Number.isInteger(statusCode)) {
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
        client_ip,
        client_ip_visit_count,
        method,
        status_code,
        referer,
        user_agent
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      pagePath,
      clientIp,
      nextVisitCount,
      method,
      statusCode,
      normalizeText(input.referer),
      normalizeText(input.userAgent)
    ]
  );

  return true;
}

export function listAccessLogs(options = {}) {
  ensureAccessLogsSchema();

  const page = normalizePositiveInteger(options.page, 1);
  const limit = Math.min(normalizePositiveInteger(options.limit, 50), 200);
  const offset = (page - 1) * limit;
  const pathKeyword = normalizeText(options.path);
  const ipKeyword = normalizeText(options.ip);
  const where = [];
  const params = [];

  if (pathKeyword) {
    where.push('l.page_path LIKE ?');
    params.push(`%${pathKeyword}%`);
  }

  if (ipKeyword) {
    where.push('l.client_ip LIKE ?');
    params.push(`%${ipKeyword}%`);
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const totalRow = queryAll(
    `SELECT COUNT(*) AS total FROM access_logs l ${whereClause}`,
    params
  )[0] || { total: 0 };

  const items = queryAll(
    `
      SELECT
        l.id,
        l.page_path,
        l.client_ip,
        l.client_ip_visit_count,
        l.method,
        l.status_code,
        l.referer,
        l.user_agent,
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

export function getAccessLogDashboardSummary() {
  ensureAccessLogsSchema();

  const todayVisitsRow = queryAll(`
    SELECT COUNT(*) AS total
    FROM access_logs
    WHERE datetime(visited_at) >= datetime('now', 'start of day')
  `)[0] || { total: 0 };

  const recentAccessRows = queryAll(`
    SELECT client_ip, user_agent
    FROM access_logs
    WHERE datetime(visited_at) >= datetime('now', '-24 hours')
  `);

  const recentUniqueIps = new Set(
    recentAccessRows
      .filter((row) => summarizeUserAgent(normalizeText(row.user_agent)).kind !== 'bot')
      .map((row) => normalizeText(row.client_ip))
      .filter(Boolean)
  );

  const totalPagesRow = queryAll(`
    SELECT COUNT(DISTINCT page_path) AS total
    FROM access_logs
  `)[0] || { total: 0 };

  const recentVisitsRow = queryAll(`
    SELECT COUNT(*) AS total
    FROM access_logs
    WHERE datetime(visited_at) >= datetime('now', '-24 hours')
  `)[0] || { total: 0 };

  const topPages = queryAll(`
    SELECT
      page_path,
      COUNT(*) AS visits,
      COUNT(DISTINCT client_ip) AS unique_ips,
      MAX(visited_at) AS last_visited_at
    FROM access_logs
    GROUP BY page_path
    ORDER BY visits DESC, last_visited_at DESC
    LIMIT 10
  `);

  return {
    metrics: {
      today_visits: Number(todayVisitsRow.total || 0),
      recent_unique_ips: recentUniqueIps.size,
      total_pages: Number(totalPagesRow.total || 0),
      recent_visits: Number(recentVisitsRow.total || 0)
    },
    top_pages: topPages.map((item) => ({
      page_path: item.page_path,
      visits: Number(item.visits || 0),
      unique_ips: Number(item.unique_ips || 0),
      last_visited_at: item.last_visited_at || ''
    }))
  };
}

export function clearAccessLogs() {
  ensureAccessLogsSchema();
  execute('DELETE FROM access_logs');
  return true;
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

function normalizeText(value) {
  return String(value || '').trim();
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

function hydrateAccessLogRow(row = {}) {
  const userAgent = normalizeText(row.user_agent);
  const userAgentSummary = summarizeUserAgent(userAgent);

  return {
    ...row,
    client_ip_visit_count: Number(row.client_ip_visit_count || 0),
    user_agent: userAgent,
    user_agent_kind: userAgentSummary.kind,
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

function summarizeUserAgent(userAgent) {
  if (!userAgent) {
    return {
      kind: 'other',
      label: '未知客户端'
    };
  }

  const knownClientLabel = detectKnownClientLabel(userAgent);
  if (knownClientLabel) {
    return {
      kind: 'other',
      label: knownClientLabel
    };
  }

  const botLabel = detectBotLabel(userAgent);
  if (botLabel) {
    return {
      kind: 'bot',
      label: botLabel
    };
  }

  const browserLabel = detectBrowserLabel(userAgent);
  if (browserLabel) {
    return {
      kind: 'browser',
      label: browserLabel
    };
  }

  return {
    kind: 'other',
    label: userAgent
  };
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
