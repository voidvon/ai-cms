export function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8'
  });
  response.end(JSON.stringify(payload, null, 2));
}

export function sendApi(response, statusCode, data, meta = undefined) {
  const payload = { ok: statusCode >= 200 && statusCode < 300, data };
  if (meta !== undefined) {
    payload.meta = meta;
  }
  sendJson(response, statusCode, payload);
}

export function sendApiError(response, statusCode, error, details = undefined) {
  const payload = { ok: false, error };
  if (details !== undefined) {
    payload.details = details;
  }
  sendJson(response, statusCode, payload);
}

export function sendHtml(response, statusCode, html) {
  response.writeHead(statusCode, {
    'Content-Type': 'text/html; charset=utf-8'
  });
  response.end(html);
}

export async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  const body = Buffer.concat(chunks).toString('utf8');
  return JSON.parse(body);
}

export async function readFormBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const body = Buffer.concat(chunks).toString('utf8');
  const form = new URLSearchParams(body);
  const result = {};
  for (const [key, value] of form.entries()) {
    if (key in result) {
      if (Array.isArray(result[key])) {
        result[key].push(value);
      } else {
        result[key] = [result[key], value];
      }
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function getClientIp(request) {
  const forwardedFor = request.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.length > 0) {
    return forwardedFor.split(',')[0].trim();
  }

  return request.socket.remoteAddress || '';
}
