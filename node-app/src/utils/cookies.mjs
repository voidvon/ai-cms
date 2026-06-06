export function parseCookies(request) {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) {
    return {};
  }

  const result = {};
  for (const item of cookieHeader.split(';')) {
    const [rawName, ...rest] = item.trim().split('=');
    if (!rawName) {
      continue;
    }
    result[rawName] = decodeURIComponent(rest.join('=') || '');
  }
  return result;
}

export function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];

  if (options.path) {
    parts.push(`Path=${options.path}`);
  }
  if (options.httpOnly) {
    parts.push('HttpOnly');
  }
  if (options.sameSite) {
    parts.push(`SameSite=${options.sameSite}`);
  }
  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${options.maxAge}`);
  }
  if (options.expires) {
    parts.push(`Expires=${options.expires.toUTCString()}`);
  }

  return parts.join('; ');
}
