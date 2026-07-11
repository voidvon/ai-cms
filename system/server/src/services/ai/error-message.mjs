const NETWORK_ERROR_CODES = new Set([
  'ECONNABORTED',
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EPIPE',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
]);

const SAFE_LOCAL_MESSAGE_PATTERNS = [
  /^缺少权限[：:]/,
  /^需要登录/,
  /^语言不存在[：:]/,
  /^(专题配置|栏目|内容)不存在/,
  /不能为空$/,
  /^至少需要/,
  /^没有可更新/,
  /^缺少(专题栏目 ID|内容 ID|内容模型编码|语言编码)/,
];

export function formatAiUserError(error) {
  const facts = collectErrorFacts(error);
  const primaryMessage = facts.messages[0] || '';

  if (SAFE_LOCAL_MESSAGE_PATTERNS.some((pattern) => pattern.test(primaryMessage))) {
    return primaryMessage;
  }

  if (facts.text.includes('openai_api_key') || facts.text.includes('api key is not set')) {
    return 'AI 服务尚未完成供应商配置，请联系管理员处理。';
  }

  if (
    facts.statuses.has(401)
    || facts.statuses.has(403)
    || facts.text.includes('invalid_api_key')
    || facts.text.includes('incorrect api key')
    || facts.text.includes('authentication failed')
    || facts.text.includes('unauthorized')
  ) {
    return 'AI 供应商认证失败，请联系管理员检查供应商凭据。';
  }

  if (facts.statuses.has(429) || facts.text.includes('rate limit') || facts.text.includes('too many requests')) {
    return 'AI 供应商当前请求繁忙，请稍后重试。';
  }

  if (
    facts.codes.some((code) => NETWORK_ERROR_CODES.has(code))
    || Array.from(NETWORK_ERROR_CODES).some((code) => facts.text.includes(code.toLowerCase()))
    || facts.text.includes('connection error')
    || facts.text.includes('fetch failed')
    || facts.text.includes('network error')
    || facts.text.includes('socket hang up')
  ) {
    return 'AI 供应商连接失败，请稍后重试。若持续出现，请联系管理员检查供应商配置与网络。';
  }

  if (facts.text.includes('timeout') || facts.text.includes('timed out')) {
    return 'AI 供应商响应超时，请稍后重试。';
  }

  if ([502, 503, 504].some((status) => facts.statuses.has(status))) {
    return 'AI 供应商连接失败，请稍后重试。若持续出现，请联系管理员检查供应商服务状态。';
  }

  if (Array.from(facts.statuses).some((status) => status >= 500)) {
    return 'AI 供应商暂时不可用，请稍后重试。';
  }

  if (facts.statuses.has(400) || facts.statuses.has(404) || facts.statuses.has(422)) {
    return 'AI 供应商未能处理当前请求，请稍后重试或联系管理员检查模型配置。';
  }

  return 'AI 服务请求失败，请稍后重试。';
}

function collectErrorFacts(error) {
  const queue = [error];
  const visited = new Set();
  const messages = [];
  const codes = [];
  const statuses = new Set();

  while (queue.length > 0 && visited.size < 12) {
    const current = queue.shift();
    if (current === null || current === undefined) {
      continue;
    }
    if (typeof current === 'string') {
      messages.push(current.trim());
      continue;
    }
    if (typeof current !== 'object' || visited.has(current)) {
      continue;
    }
    visited.add(current);

    addString(messages, current.message);
    addString(messages, current.type);
    addString(codes, current.code, { upperCase: true });
    addStatus(statuses, current.status);
    addStatus(statuses, current.statusCode);
    addStatus(statuses, current.response?.status);

    queue.push(current.cause, current.error, current.response?.data?.error);
  }

  const normalizedMessages = messages.filter(Boolean);
  return {
    messages: normalizedMessages,
    codes: codes.filter(Boolean),
    statuses,
    text: [...normalizedMessages, ...codes].join('\n').toLowerCase(),
  };
}

function addString(target, value, { upperCase = false } = {}) {
  const text = String(value || '').trim();
  if (text) {
    target.push(upperCase ? text.toUpperCase() : text);
  }
}

function addStatus(target, value) {
  const status = Number.parseInt(String(value || ''), 10);
  if (Number.isFinite(status) && status >= 100 && status <= 599) {
    target.add(status);
  }
}
