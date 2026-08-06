import { getSiteConfig } from './site.mjs';

const DEFAULT_SECURITY_HEADERS = Object.freeze({
  'Content-Security-Policy': [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "form-action 'self'",
    "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: http: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://challenges.cloudflare.com",
    "frame-src 'self' https://challenges.cloudflare.com",
    "media-src 'self' http: https:",
    "worker-src 'self' blob:"
  ].join('; '),
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Frame-Options': 'SAMEORIGIN',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()'
});

export function applySecurityHeaders(reply, options = {}) {
  const headers = resolveSecurityHeaders(options);
  for (const [name, value] of Object.entries(headers)) {
    if (!name || !value) {
      continue;
    }
    reply.header(name, value);
  }
}

export function resolveSecurityHeaders(options = {}) {
  const site = options.site || getSiteConfig(options.languageCode || null);
  const securityConfig = site?.template_data?.security || {};
  if (securityConfig?.enabled === false) {
    return {};
  }

  const configuredHeaders = securityConfig?.headers && typeof securityConfig.headers === 'object'
    ? securityConfig.headers
    : {};
  const headers = { ...DEFAULT_SECURITY_HEADERS };

  for (const [rawName, rawValue] of Object.entries(configuredHeaders)) {
    const name = normalizeHeaderName(rawName);
    if (!name) {
      continue;
    }
    if (rawValue === false || rawValue === null) {
      delete headers[name];
      continue;
    }
    const value = String(rawValue || '').trim();
    if (value) {
      headers[name] = value;
    }
  }

  return headers;
}

function normalizeHeaderName(value) {
  const normalized = String(value || '').trim();
  if (!normalized || /[\r\n:]/.test(normalized)) {
    return '';
  }
  return normalized
    .split('-')
    .map((part) => part ? `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}` : '')
    .join('-');
}
