import assert from 'node:assert/strict';
import { createApp } from '../src/app.mjs';
import { listContentItems } from '../src/services/content-items.mjs';

async function main() {
  const sampleManagedItem = listContentItems('product', { visibleOnly: false, limit: 1 })[0];
  assert(sampleManagedItem?.name, '缺少可搜索内容数据，无法执行搜索接口回归。');
  const searchKeyword = String(sampleManagedItem.name).trim();

  const app = await createApp({ logger: false });

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

    const removedSearchPage = await app.inject({
      method: 'GET',
      url: '/search',
      headers: { host: 'localhost' }
    });
    assert.equal(removedSearchPage.statusCode, 404);

    const legacySearch = await app.inject({
      method: 'GET',
      url: '/search.asp?action=search',
      headers: { host: 'localhost' }
    });
    assert.equal(legacySearch.statusCode, 404);

    const removedLegacyManagedItemUrl = await app.inject({
      method: 'GET',
      url: '/product/1.html',
      headers: { host: 'localhost' }
    });
    assert.equal(removedLegacyManagedItemUrl.statusCode, 404);

    const legacyAdminLogin = await app.inject({
      method: 'GET',
      url: '/spck/login.asp',
      headers: { host: 'localhost' }
    });
    assert.equal(legacyAdminLogin.statusCode, 404);

    console.log('runtime smoke passed');
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
