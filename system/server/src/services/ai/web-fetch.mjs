import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';

const DEFAULT_TIMEOUT_MS = 12000;
const DEFAULT_MAX_BYTES = 1024 * 1024;
const DEFAULT_MAX_TEXT_CHARS = 12000;
const MAX_REDIRECTS = 3;

const ALLOWED_CONTENT_TYPES = [
  'text/html',
  'text/plain',
  'application/xhtml+xml',
  'application/xml',
  'text/xml',
  'application/json',
];

export async function fetchUrlForAi({
  url,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxBytes = DEFAULT_MAX_BYTES,
  maxTextChars = DEFAULT_MAX_TEXT_CHARS,
} = {}) {
  const startUrl = normalizeAndValidateUrl(url);
  const result = await fetchWithValidatedRedirects(startUrl, {
    timeoutMs: clampInteger(timeoutMs, 1000, 30000, DEFAULT_TIMEOUT_MS),
    maxBytes: clampInteger(maxBytes, 64 * 1024, 2 * 1024 * 1024, DEFAULT_MAX_BYTES),
  });

  const extracted = extractReadableText(result.body, result.contentType, maxTextChars);

  return {
    url: startUrl.href,
    final_url: result.finalUrl.href,
    status: result.status,
    ok: result.status >= 200 && result.status < 300,
    content_type: result.contentType,
    title: extracted.title,
    description: extracted.description,
    text: extracted.text,
    links: extracted.links,
    truncated: result.truncated || extracted.truncated,
    bytes_read: result.bytesRead,
    fetched_at: new Date().toISOString(),
  };
}

async function fetchWithValidatedRedirects(initialUrl, { timeoutMs, maxBytes }) {
  let currentUrl = initialUrl;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    await assertUrlCanBeFetched(currentUrl);

    const response = await requestUrl(currentUrl, { timeoutMs, maxBytes });
    const status = Number(response.status || 0);

    if ([301, 302, 303, 307, 308].includes(status)) {
      const location = response.headers.location;
      if (!location) {
        throw createFetchError('远程服务器返回重定向，但没有提供 Location 地址');
      }
      currentUrl = normalizeAndValidateUrl(location, currentUrl);
      continue;
    }

    const contentType = normalizeContentType(response.headers['content-type']);
    if (!isAllowedContentType(contentType)) {
      throw createFetchError(`不支持读取该内容类型：${contentType || 'unknown'}`);
    }

    return {
      finalUrl: currentUrl,
      status,
      contentType,
      body: response.body,
      bytesRead: response.bytesRead,
      truncated: response.truncated,
    };
  }

  throw createFetchError(`重定向次数超过限制：${MAX_REDIRECTS}`);
}

function normalizeAndValidateUrl(value, baseUrl = null) {
  let parsed;
  try {
    parsed = baseUrl ? new URL(String(value || ''), baseUrl) : new URL(String(value || '').trim());
  } catch {
    throw createFetchError('请输入有效的网址');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw createFetchError('只允许读取 http 或 https 网址');
  }

  if (parsed.username || parsed.password) {
    throw createFetchError('网址中不能包含用户名或密码');
  }

  parsed.hash = '';
  return parsed;
}

async function assertUrlCanBeFetched(parsedUrl) {
  const hostname = parsedUrl.hostname.toLowerCase();
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw createFetchError('不允许读取本机或 localhost 地址');
  }

  const literalIpVersion = net.isIP(hostname);
  const addresses = literalIpVersion
    ? [{ address: hostname, family: literalIpVersion }]
    : await lookupHostname(hostname);

  if (addresses.length === 0) {
    throw createFetchError('无法解析该网址的主机名');
  }

  for (const item of addresses) {
    if (isBlockedIpAddress(item.address)) {
      throw createFetchError('不允许读取内网、本机、链路本地或保留网段地址');
    }
  }
}

async function lookupHostname(hostname) {
  try {
    return await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw createFetchError('无法解析该网址的主机名');
  }
}

function isBlockedIpAddress(address) {
  const version = net.isIP(address);
  if (version === 4) {
    return isBlockedIpv4(address);
  }
  if (version === 6) {
    return isBlockedIpv6(address);
  }
  return true;
}

function isBlockedIpv4(address) {
  const parts = address.split('.').map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return true;
  }

  const [a, b] = parts;
  return a === 0
    || a === 10
    || a === 127
    || a === 169 && b === 254
    || a === 172 && b >= 16 && b <= 31
    || a === 192 && b === 168
    || a === 100 && b >= 64 && b <= 127
    || a >= 224
    || address === '255.255.255.255';
}

function isBlockedIpv6(address) {
  const normalized = address.toLowerCase();
  if (
    normalized === '::'
    || normalized === '::1'
    || normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || normalized.startsWith('fe80:')
    || normalized.startsWith('ff')
  ) {
    return true;
  }

  const mappedIpv4 = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  return mappedIpv4 ? isBlockedIpv4(mappedIpv4) : false;
}

function requestUrl(parsedUrl, { timeoutMs, maxBytes }) {
  return new Promise((resolve, reject) => {
    const client = parsedUrl.protocol === 'https:' ? https : http;
    const request = client.request(parsedUrl, {
      method: 'GET',
      timeout: timeoutMs,
      lookup: secureLookup,
      headers: {
        accept: 'text/html,text/plain,application/xhtml+xml,application/xml,application/json;q=0.8,*/*;q=0.3',
        'user-agent': 'AI-CMS fetch_url/1.0',
      },
    }, (response) => {
      const chunks = [];
      let bytesRead = 0;
      let truncated = false;

      response.on('data', (chunk) => {
        if (truncated) {
          return;
        }

        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        bytesRead += buffer.length;
        if (bytesRead > maxBytes) {
          truncated = true;
          const remaining = Math.max(0, maxBytes - (bytesRead - buffer.length));
          if (remaining > 0) {
            chunks.push(buffer.subarray(0, remaining));
          }
          response.destroy();
          return;
        }

        chunks.push(buffer);
      });

      response.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        resolve({
          status: response.statusCode,
          headers: response.headers || {},
          body,
          bytesRead: Buffer.byteLength(body),
          truncated,
        });
      });

      response.on('error', (error) => {
        if (truncated) {
          const body = Buffer.concat(chunks).toString('utf8');
          resolve({
            status: response.statusCode,
            headers: response.headers || {},
            body,
            bytesRead: Buffer.byteLength(body),
            truncated,
          });
          return;
        }
        reject(createFetchError(`读取网址失败：${error?.message || 'unknown error'}`));
      });
    });

    request.on('timeout', () => {
      request.destroy(createFetchError(`读取网址超时：${timeoutMs}ms`));
    });
    request.on('error', (error) => {
      reject(error?.statusCode ? error : createFetchError(`读取网址失败：${error?.message || 'unknown error'}`));
    });
    request.end();
  });
}

function secureLookup(hostname, options, callback) {
  const requestedAll = Boolean(options?.all);
  dns.lookup(hostname, { ...options, all: true, verbatim: true })
    .then((addresses) => {
      const allowed = addresses.filter((item) => !isBlockedIpAddress(item.address));
      if (allowed.length === 0) {
        callback(createFetchError('不允许读取内网、本机、链路本地或保留网段地址'));
        return;
      }
      if (requestedAll) {
        callback(null, allowed);
        return;
      }
      callback(null, allowed[0].address, allowed[0].family);
    })
    .catch(() => {
      callback(createFetchError('无法解析该网址的主机名'));
    });
}

function normalizeContentType(value) {
  return String(value || '').split(';')[0].trim().toLowerCase();
}

function isAllowedContentType(contentType) {
  if (!contentType) {
    return true;
  }
  return ALLOWED_CONTENT_TYPES.includes(contentType) || contentType.startsWith('text/');
}

function extractReadableText(source, contentType, maxTextChars) {
  const normalizedLimit = clampInteger(maxTextChars, 1000, 30000, DEFAULT_MAX_TEXT_CHARS);
  if (!String(contentType || '').includes('html')) {
    const text = collapseWhitespace(source);
    return {
      title: '',
      description: '',
      text: text.slice(0, normalizedLimit),
      links: [],
      truncated: text.length > normalizedLimit,
    };
  }

  const withoutNoise = source
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ');

  const title = decodeHtmlEntities(extractFirstMatch(withoutNoise, /<title[^>]*>([\s\S]*?)<\/title>/i));
  const description = decodeHtmlEntities(
    extractFirstMatch(withoutNoise, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["'][^>]*>/i)
    || extractFirstMatch(withoutNoise, /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["'][^>]*>/i)
  );
  const links = extractLinks(withoutNoise);
  const text = collapseWhitespace(decodeHtmlEntities(
    withoutNoise
      .replace(/<(br|p|div|section|article|header|footer|main|aside|li|tr|h[1-6])\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  ));

  return {
    title: title.trim(),
    description: description.trim(),
    text: text.slice(0, normalizedLimit),
    links,
    truncated: text.length > normalizedLimit,
  };
}

function extractLinks(html) {
  const links = [];
  const pattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = pattern.exec(html)) && links.length < 10) {
    const href = decodeHtmlEntities(match[1]).trim();
    const text = collapseWhitespace(decodeHtmlEntities(match[2].replace(/<[^>]+>/g, ' '))).slice(0, 120);
    if (href && !href.startsWith('#')) {
      links.push({ text, href });
    }
  }
  return links;
}

function extractFirstMatch(source, pattern) {
  return String(source || '').match(pattern)?.[1] || '';
}

function collapseWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => {
      const number = Number.parseInt(code, 10);
      return Number.isFinite(number) ? String.fromCodePoint(number) : _;
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => {
      const number = Number.parseInt(code, 16);
      return Number.isFinite(number) ? String.fromCodePoint(number) : _;
    });
}

function clampInteger(value, min, max, fallback) {
  const number = Number.parseInt(String(value), 10);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, number));
}

function createFetchError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}
