import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../../src/app.mjs';
import { buildStaticSite } from '../../src/static-builder.mjs';
import { listContentItems } from '../../src/services/content-items.mjs';
import { formatAiUserError } from '../../src/services/ai/error-message.mjs';
import { clearTsxTemplateCache } from '../../src/tsx-template-renderer.mjs';

async function main() {
  assertAiErrorMessagesAreSanitized();
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cms-runtime-smoke-'));
  clearTsxTemplateCache();
  buildStaticSite({
    outputRoot,
    cleanExisting: true,
    languageCode: 'en',
    sections: ['index']
  });

  const sampleManagedItem = listContentItems('product', {
    visibleOnly: false,
    limit: 1,
    languageCode: 'en'
  })[0];
  assert(sampleManagedItem?.name, '缺少可搜索内容数据，无法执行搜索接口回归。');
  const searchKeyword = String(sampleManagedItem.name).trim();

  const app = await createApp({
    logger: false,
    publicSite: {
      contentRoot: outputRoot,
      languageCode: 'en'
    }
  });

  try {
    const emptySearch = await app.inject({
      method: 'GET',
      url: '/api/search',
      headers: { host: 'localhost' }
    });
    assert.equal(emptySearch.statusCode, 400);

    const keywordSearch = await app.inject({
      method: 'GET',
      url: `/api/search?q=${encodeURIComponent(searchKeyword)}&page=1&pageSize=12`,
      headers: {
        host: 'localhost',
        accept: 'application/json'
      }
    });
    assert.equal(keywordSearch.statusCode, 200);
    const keywordSearchPayload = keywordSearch.json();
    assert.equal(keywordSearchPayload.success, true);
    assert.ok(Array.isArray(keywordSearchPayload.items));
    assert.ok(keywordSearchPayload.items.length > 0);
    assert.ok(keywordSearchPayload.items.some((item) => typeof item.url === 'string' && item.url.length > 0));
    assertSecurityHeaders(keywordSearch.headers);

    const homePage = await app.inject({
      method: 'GET',
      url: '/',
      headers: { host: 'localhost' }
    });
    assert.equal(homePage.statusCode, 200);
    assert.match(homePage.headers['content-type'] || '', /text\/html/i);
    assertSecurityHeaders(homePage.headers);

    assertGeneratedJsonLdIsValid(outputRoot);

    console.log('runtime smoke passed');
  } finally {
    await app.close();
  }
}

function assertAiErrorMessagesAreSanitized() {
  assert.equal(
    formatAiUserError(new Error('Connection error.')),
    'AI 供应商连接失败，请稍后重试。若持续出现，请联系管理员检查供应商配置与网络。'
  );
  assert.equal(
    formatAiUserError({ message: 'request failed for https://secret-provider.example', cause: { code: 'ECONNREFUSED' } }),
    'AI 供应商连接失败，请稍后重试。若持续出现，请联系管理员检查供应商配置与网络。'
  );
  assert.equal(
    formatAiUserError({ status: 502, message: '<html>upstream gateway details</html>' }),
    'AI 供应商连接失败，请稍后重试。若持续出现，请联系管理员检查供应商服务状态。'
  );
  assert.equal(
    formatAiUserError({ status: 401, message: 'Incorrect API key sk-sensitive' }),
    'AI 供应商认证失败，请联系管理员检查供应商凭据。'
  );
  assert.equal(
    formatAiUserError({ status: 429, message: 'rate limit exceeded' }),
    'AI 供应商当前请求繁忙，请稍后重试。'
  );
  assert.equal(formatAiUserError(new Error('语言不存在：xx')), '语言不存在：xx');
  assert.equal(formatAiUserError(new Error('raw provider stack and secret')), 'AI 服务请求失败，请稍后重试。');
}

function assertSecurityHeaders(headers) {
  assert.ok(headers['content-security-policy'], '响应缺少 Content-Security-Policy。');
  assert.ok(headers['strict-transport-security'], '响应缺少 Strict-Transport-Security。');
  assert.equal(headers['x-frame-options'], 'SAMEORIGIN');
  assert.equal(headers['x-content-type-options'], 'nosniff');
  assert.equal(headers['referrer-policy'], 'strict-origin-when-cross-origin');
}

function assertGeneratedJsonLdIsValid(outputRoot) {
  const indexHtml = fs.readFileSync(path.join(outputRoot, 'index.html'), 'utf8');
  const whitespaceInsensitiveHtml = indexHtml.replace(
    /<(pre|textarea|script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,
    ''
  );
  assert.equal(
    />\s*\n\s*</.test(whitespaceInsensitiveHtml),
    false,
    '生成 HTML 不应保留普通标签之间的排版换行。'
  );
  const match = indexHtml.match(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/i);
  assert.ok(match, '生成首页缺少 application/ld+json。');
  assert.equal(match[1].includes('&quot;'), false, 'JSON-LD 不应输出 HTML 实体转义的双引号。');
  const parsed = JSON.parse(match[1]);
  assert.equal(parsed['@context'], 'https://schema.org');
  const graph = Array.isArray(parsed['@graph']) ? parsed['@graph'] : [parsed];
  const schemaTypes = new Set(graph.flatMap((node) => Array.isArray(node?.['@type']) ? node['@type'] : [node?.['@type']]).filter(Boolean));
  assert.ok(schemaTypes.has('Organization'), '首页 JSON-LD 应包含 Organization。');
  assert.ok(schemaTypes.has('WebSite'), '首页 JSON-LD 应包含 WebSite。');
  assert.ok(schemaTypes.has('WebPage'), '首页 JSON-LD 应包含 WebPage。');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
