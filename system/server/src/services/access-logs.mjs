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

  execute(
    `
      INSERT INTO access_logs (
        page_path,
        client_ip,
        method,
        status_code,
        referer,
        user_agent
      ) VALUES (?, ?, ?, ?, ?, ?)
    `,
    [
      pagePath,
      clientIp,
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
    where.push('page_path LIKE ?');
    params.push(`%${pathKeyword}%`);
  }

  if (ipKeyword) {
    where.push('client_ip LIKE ?');
    params.push(`%${ipKeyword}%`);
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const totalRow = queryAll(
    `SELECT COUNT(*) AS total FROM access_logs ${whereClause}`,
    params
  )[0] || { total: 0 };

  const items = queryAll(
    `
      SELECT
        id,
        page_path,
        client_ip,
        method,
        status_code,
        referer,
        user_agent,
        visited_at
      FROM access_logs
      ${whereClause}
      ORDER BY datetime(visited_at) DESC, id DESC
      LIMIT ? OFFSET ?
    `,
    [...params, limit, offset]
  );

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

  const recentUniqueIpRow = queryAll(`
    SELECT COUNT(DISTINCT client_ip) AS total
    FROM access_logs
    WHERE datetime(visited_at) >= datetime('now', '-24 hours')
  `)[0] || { total: 0 };

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
      recent_unique_ips: Number(recentUniqueIpRow.total || 0),
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
