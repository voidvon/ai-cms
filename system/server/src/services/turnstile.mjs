const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export async function verifyTurnstileToken(token, options = {}) {
  const normalizedToken = String(token || '').trim();
  if (!normalizedToken) {
    throw createTurnstileError('请完成人机验证后再提交', 'TURNSTILE_TOKEN_REQUIRED', 400);
  }
  if (normalizedToken.length > 4096) {
    throw createTurnstileError('人机验证信息无效，请刷新后重试', 'TURNSTILE_TOKEN_INVALID', 400);
  }

  const secret = resolveTurnstileSecret(options.secret);
  const payload = new URLSearchParams({
    secret,
    response: normalizedToken
  });
  const remoteIp = String(options.remoteIp || '').trim();
  if (remoteIp) payload.set('remoteip', remoteIp);

  let response;
  try {
    response = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: payload,
      signal: AbortSignal.timeout(8000)
    });
  } catch {
    throw createTurnstileError('人机验证服务暂时不可用，请稍后重试', 'TURNSTILE_UNAVAILABLE', 503);
  }

  if (!response.ok) {
    throw createTurnstileError('人机验证服务暂时不可用，请稍后重试', 'TURNSTILE_UNAVAILABLE', 503);
  }

  const result = await response.json().catch(() => null);
  if (!result?.success) {
    throw createTurnstileError('人机验证未通过，请重试', 'TURNSTILE_VERIFICATION_FAILED', 400);
  }

  return result;
}

function resolveTurnstileSecret(override) {
  const configured = String(override || process.env.TURNSTILE_SECRET_KEY || '').trim();
  if (configured) return configured;
  throw createTurnstileError('人机验证服务尚未配置', 'TURNSTILE_NOT_CONFIGURED', 503);
}

function createTurnstileError(message, code, statusCode) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}
