function buildUrl(baseUrl, path, query = {}) {
  const url = new URL(path, `${baseUrl}/`);

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') {
      continue;
    }
    url.searchParams.set(key, String(value));
  }

  return url;
}

async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`CMS API returned non-JSON response with status ${response.status}`);
  }
}

function buildRequestHeaders(token, hasJsonBody) {
  return {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
    ...(hasJsonBody ? { 'Content-Type': 'application/json' } : {})
  };
}

function formatApiError(response, payload) {
  const message = payload?.message || payload?.error || `CMS API request failed with status ${response.status}`;
  return new Error(message);
}

export class CmsClient {
  constructor({ baseUrl, token, timeoutMs = 15000 }) {
    this.baseUrl = baseUrl;
    this.token = token;
    this.timeoutMs = timeoutMs;
  }

  async request(method, path, { query, body, timeoutMs } = {}) {
    const controller = new AbortController();
    const effectiveTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0
      ? timeoutMs
      : this.timeoutMs;
    const timeout = setTimeout(() => controller.abort(), effectiveTimeoutMs);

    try {
      const response = await fetch(buildUrl(this.baseUrl, path, query), {
        method,
        headers: buildRequestHeaders(this.token, body !== undefined),
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal
      });

      const payload = await parseJsonResponse(response);

      if (!response.ok) {
        throw formatApiError(response, payload);
      }

      return payload;
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new Error(`CMS API request timed out after ${effectiveTimeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  get(path, options) {
    return this.request('GET', path, options);
  }

  post(path, options) {
    return this.request('POST', path, options);
  }

  put(path, options) {
    return this.request('PUT', path, options);
  }

  delete(path, options) {
    return this.request('DELETE', path, options);
  }
}
