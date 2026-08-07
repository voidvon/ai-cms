import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const testDirectory = mkdtempSync(path.join(tmpdir(), 'ai-cms-public-inquiries-'));
process.env.DATABASE_PATH = path.join(testDirectory, 'site.sqlite');
process.env.COOKIE_SECRET = 'public-inquiry-test-secret';
process.env.TURNSTILE_SECRET_KEY = 'turnstile-test-secret';

const originalFetch = globalThis.fetch;
const turnstileRequests = [];
const unexpectedFetches = [];
test.before(() => {
  globalThis.fetch = async (url, options) => {
    if (String(url) === 'https://challenges.cloudflare.com/turnstile/v0/siteverify') {
      turnstileRequests.push({ url, options });
      const payload = new URLSearchParams(String(options?.body || ''));
      return new Response(JSON.stringify({ success: payload.get('response') !== 'failed-token' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }

    unexpectedFetches.push({ url, options });
    throw new Error(`Unexpected external request: ${String(url)}`);
  };
});
test.after(() => {
  globalThis.fetch = originalFetch;
});

const [{ createApp }, { listInquiries }, { execute, queryOne }] = await Promise.all([
  import('../src/app.mjs'),
  import('../src/services/inquiries.mjs'),
  import('../src/db.mjs')
]);

test('creates and consumes local slider captcha challenges for Chinese inquiries', async (t) => {
  const app = await createApp({ logger: false });
  t.after(() => app.close());

  const headers = buildHeaders('192.0.2.10');
  const before = listInquiries().pagination.total;
  const captcha = await solveCaptcha(app, headers);
  const payload = {
    inquiry_type: 'product',
    contact_name: '测试客户',
    company: '测试公司',
    email: 'customer@example.com',
    phone: '',
    requirements: '请提供产品报价。',
    language_code: 'zh-CN',
    captcha_token: captcha.token
  };

  const accepted = await app.inject({
    method: 'POST',
    url: '/api/public/inquiries',
    headers,
    payload
  });
  assert.equal(accepted.statusCode, 201);
  assert.equal(accepted.json().success, true);
  assert.match(accepted.json().data.reference_no, /^INQ-/);
  assert.doesNotMatch(accepted.headers['content-security-policy'], /turing\.captcha\.qcloud\.com|captcha\.tencentcloudapi\.com/);
  assert.match(accepted.headers['content-security-policy'], /script-src[^;]*https:\/\/challenges\.cloudflare\.com/);
  assert.equal(listInquiries().pagination.total, before + 1);

  const reused = await app.inject({
    method: 'POST',
    url: '/api/public/inquiries',
    headers,
    payload: { ...payload, requirements: '重复使用令牌' }
  });
  assert.equal(reused.statusCode, 400);
  assert.match(reused.json().message, /人机验证/);
  assert.equal(listInquiries().pagination.total, before + 1);

  const trapped = await app.inject({
    method: 'POST',
    url: '/api/public/inquiries',
    headers: buildHeaders('192.0.2.11'),
    payload: { ...payload, website: 'https://spam.example' }
  });
  assert.equal(trapped.statusCode, 200);
  assert.equal(trapped.json().success, true);
  assert.equal(listInquiries().pagination.total, before + 1);

  for (let index = 0; index < 4; index += 1) {
    const nextCaptcha = await solveCaptcha(app, headers);
    const response = await app.inject({
      method: 'POST',
      url: '/api/public/inquiries',
      headers,
      payload: {
        ...payload,
        captcha_token: nextCaptcha.token,
        requirements: `第 ${index + 2} 次询价`
      }
    });
    assert.equal(response.statusCode, 201);
  }

  const rateLimited = await app.inject({
    method: 'POST',
    url: '/api/public/inquiries',
    headers,
    payload
  });
  assert.equal(rateLimited.statusCode, 429);
  assert.equal(rateLimited.json().success, false);
  assert.match(rateLimited.json().message, /频繁/);
  assert.equal(unexpectedFetches.length, 0);
});

test('validates slider coordinates, expiry, IP binding, and one-time verification', async (t) => {
  const app = await createApp({ logger: false });
  t.after(() => app.close());

  const headers = buildHeaders('192.0.2.20');
  const challenge = await createCaptcha(app, headers);
  const wrongX = challenge.solutionX > 160 ? challenge.solutionX - 100 : challenge.solutionX + 100;
  const wrong = await verifyCaptcha(app, challenge, headers, {
    x: wrongX,
    duration: 700,
    trail: [[2, 3], [80, 3], [wrongX, 3]]
  });
  assert.equal(wrong.statusCode, 400);
  assert.match(wrong.json().message, /未通过/);

  const shortGesture = await verifyCaptcha(app, challenge, headers, {
    duration: 20,
    trail: [[2, 3]]
  });
  assert.equal(shortGesture.statusCode, 400);
  assert.match(shortGesture.json().message, /未通过/);

  const correct = await verifyCaptcha(app, challenge, headers);
  assert.equal(correct.statusCode, 200);
  assert.equal(correct.json().success, true);
  const token = correct.json().data.token;

  const repeated = await verifyCaptcha(app, challenge, headers);
  assert.equal(repeated.statusCode, 400);
  assert.match(repeated.json().message, /已使用/);

  const ipBoundChallenge = await createCaptcha(app, headers);
  const differentIp = await verifyCaptcha(app, ipBoundChallenge, buildHeaders('192.0.2.21'));
  assert.equal(differentIp.statusCode, 400);
  const sameIp = await verifyCaptcha(app, ipBoundChallenge, headers);
  assert.equal(sameIp.statusCode, 200);

  const expired = await createCaptcha(app, headers);
  execute(
    `UPDATE inquiry_captcha_challenges SET expires_at = ? WHERE id = ?`,
    [new Date(Date.now() - 1000).toISOString(), expired.id]
  );
  const expiredResponse = await verifyCaptcha(app, expired, headers);
  assert.equal(expiredResponse.statusCode, 400);
  assert.match(expiredResponse.json().message, /过期/);

  assert.match(token, /^[A-Za-z0-9_-]{40,}$/);
});

test('keeps Turnstile for non-Chinese inquiry callers', async (t) => {
  const app = await createApp({ logger: false });
  t.after(() => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/api/public/inquiries',
    headers: buildHeaders('192.0.2.30'),
    payload: {
      inquiry_type: 'product',
      contact_name: 'English customer',
      email: 'english@example.com',
      requirements: 'Test the existing non-Chinese verification flow.',
      language_code: 'en',
      'cf-turnstile-response': 'valid-token'
    }
  });

  assert.equal(response.statusCode, 201);
  assert.equal(response.json().success, true);
  assert.equal(turnstileRequests.length, 1);
  assert.equal(unexpectedFetches.length, 0);
});

test('requires a valid local captcha token for Chinese inquiry submissions', async (t) => {
  const app = await createApp({ logger: false });
  t.after(() => app.close());

  const headers = buildHeaders('192.0.2.40');
  const payload = {
    inquiry_type: 'technical',
    contact_name: '安全测试',
    email: 'security@example.com',
    requirements: '测试人机验证。',
    language_code: 'zh-CN'
  };
  const totalBefore = listInquiries().pagination.total;

  const missing = await app.inject({
    method: 'POST',
    url: '/api/public/inquiries',
    headers,
    payload
  });
  assert.equal(missing.statusCode, 400);
  assert.match(missing.json().message, /人机验证/);

  const invalid = await app.inject({
    method: 'POST',
    url: '/api/public/inquiries',
    headers,
    payload: { ...payload, captcha_token: 'invalid-token' }
  });
  assert.equal(invalid.statusCode, 400);
  assert.match(invalid.json().message, /人机验证/);
  assert.equal(listInquiries().pagination.total, totalBefore);
});

test('rejects cross-origin public inquiry submissions', async (t) => {
  const app = await createApp({ logger: false });
  t.after(() => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/api/public/inquiries',
    headers: { host: 'example.test', origin: 'https://attacker.example' },
    payload: {}
  });

  assert.equal(response.statusCode, 403);
});

async function createCaptcha(app, headers) {
  const response = await app.inject({
    method: 'GET',
    url: '/api/public/inquiry-captcha?width=320',
    headers
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().success, true);
  const data = response.json().data;
  assert.match(data.bg_url, /^data:image\/jpeg;base64,/);
  assert.match(data.puzzle_url, /^data:image\/png;base64,/);
  const row = queryOne(
    `SELECT solution_x FROM inquiry_captcha_challenges WHERE id = ?`,
    [data.captcha_id]
  );
  assert.ok(row);
  return {
    id: data.captcha_id,
    solutionX: Number(row.solution_x)
  };
}

async function solveCaptcha(app, headers) {
  const challenge = await createCaptcha(app, headers);
  const response = await verifyCaptcha(app, challenge, headers);
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().success, true);
  return { ...challenge, token: response.json().data.token };
}

async function verifyCaptcha(app, challenge, headers, overrides = {}) {
  return app.inject({
    method: 'POST',
    url: '/api/public/inquiry-captcha/verify',
    headers,
    payload: {
      captcha_id: challenge.id,
      x: challenge.solutionX,
      duration: 900,
      trail: [[2, 3], [80, 3], [challenge.solutionX, 3]],
      ...overrides
    }
  });
}

function buildHeaders(ip) {
  return {
    host: 'example.test',
    origin: 'http://example.test',
    'x-real-ip': ip
  };
}
