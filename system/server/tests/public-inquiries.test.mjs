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
test.before(() => {
  globalThis.fetch = async (url, options) => {
    turnstileRequests.push({ url, options });
    const token = new URLSearchParams(String(options?.body || '')).get('response');
    return new Response(JSON.stringify({ success: token !== 'failed-token' }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };
});
test.after(() => {
  globalThis.fetch = originalFetch;
});

const [{ createApp }, { listInquiries }, { verifyTurnstileToken }] = await Promise.all([
  import('../src/app.mjs'),
  import('../src/services/inquiries.mjs'),
  import('../src/services/turnstile.mjs')
]);

test('accepts public inquiries and applies spam controls', async (t) => {
  const app = await createApp({ logger: false });
  t.after(() => app.close());

  const payload = {
    inquiry_type: 'product',
    contact_name: '测试客户',
    company: '测试公司',
    email: 'customer@example.com',
    phone: '',
    requirements: '请提供产品报价。',
    language_code: 'zh-CN',
    'cf-turnstile-response': 'valid-token'
  };
  const headers = {
    host: 'example.test',
    origin: 'http://example.test',
    'x-real-ip': '192.0.2.10'
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
  assert.match(accepted.headers['content-security-policy'], /script-src[^;]*https:\/\/challenges\.cloudflare\.com/);
  assert.match(accepted.headers['content-security-policy'], /frame-src[^;]*https:\/\/challenges\.cloudflare\.com/);
  assert.equal(listInquiries().pagination.total, 1);

  const trapped = await app.inject({
    method: 'POST',
    url: '/api/public/inquiries',
    headers: { ...headers, 'x-real-ip': '192.0.2.11' },
    payload: { ...payload, website: 'https://spam.example' }
  });
  assert.equal(trapped.statusCode, 200);
  assert.equal(trapped.json().success, true);
  assert.equal(listInquiries().pagination.total, 1);

  for (let index = 0; index < 4; index += 1) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/public/inquiries',
      headers,
      payload: { ...payload, requirements: `第 ${index + 2} 次询价` }
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
  assert.equal(turnstileRequests.length, 5);
});

test('requires a valid Turnstile token before creating an inquiry', async (t) => {
  const app = await createApp({ logger: false });
  t.after(() => app.close());
  const headers = {
    host: 'example.test',
    origin: 'http://example.test',
    'x-real-ip': '192.0.2.20'
  };
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

  const failed = await app.inject({
    method: 'POST',
    url: '/api/public/inquiries',
    headers,
    payload: { ...payload, 'cf-turnstile-response': 'failed-token' }
  });
  assert.equal(failed.statusCode, 400);
  assert.match(failed.json().message, /人机验证未通过/);
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

test('fails closed when the Turnstile secret is not configured', async () => {
  const configuredSecret = process.env.TURNSTILE_SECRET_KEY;
  delete process.env.TURNSTILE_SECRET_KEY;
  try {
    await assert.rejects(
      () => verifyTurnstileToken('non-empty-token'),
      (error) => error?.code === 'TURNSTILE_NOT_CONFIGURED' && error?.statusCode === 503
    );
  } finally {
    process.env.TURNSTILE_SECRET_KEY = configuredSecret;
  }
});
