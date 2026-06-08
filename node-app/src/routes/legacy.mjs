import { searchProductsPaged } from '../services/products.mjs';

export default async function legacyRoutes(app) {
  // 搜索页面
  app.get('/search', async (request, reply) => {
    const keyword = request.query.keyword || request.query.q || '';
    const page = parseInt(request.query.page || '1');
    const pageSize = 20;

    let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>搜索结果 - ${keyword}</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; }
    .search-box { margin: 20px 0; }
    .search-box input { padding: 8px; width: 300px; }
    .search-box button { padding: 8px 20px; }
    .result { margin: 20px 0; padding: 15px; background: #f9f9f9; border-left: 4px solid #007bff; }
    .result h3 { margin: 0 0 10px 0; }
    .result a { color: #007bff; text-decoration: none; }
    .result a:hover { text-decoration: underline; }
    .pagination { margin: 20px 0; }
    .pagination a { padding: 5px 10px; margin: 0 2px; background: #007bff; color: white; text-decoration: none; border-radius: 3px; }
    .pagination .current { background: #666; }
  </style>
</head>
<body>
  <h1>搜索结果</h1>
  <div class="search-box">
    <form method="GET" action="/search">
      <input type="text" name="keyword" value="${keyword}" placeholder="输入关键词搜索">
      <button type="submit">搜索</button>
    </form>
  </div>`;

    if (keyword) {
      const result = searchProductsPaged({ keyword, page, pageSize });

      html += `<p>找到 ${result.total} 个结果</p>`;

      if (result.items.length > 0) {
        for (const product of result.items) {
          html += `<div class="result">
            <h3><a href="/product/${product.id}.html">${product.name}</a></h3>
            <p>${product.summary || ''}</p>
          </div>`;
        }

        // 分页
        if (result.totalPages > 1) {
          html += '<div class="pagination">';
          for (let i = 1; i <= result.totalPages; i++) {
            const className = i === result.page ? 'current' : '';
            html += `<a href="/search?keyword=${encodeURIComponent(keyword)}&page=${i}" class="${className}">${i}</a>`;
          }
          html += '</div>';
        }
      } else {
        html += '<p>没有找到相关结果</p>';
      }
    }

    html += `</body></html>`;

    return reply.type('text/html; charset=utf-8').send(html);
  });

  // 前台留言提交（兼容旧 ASP 路径）
  app.post('/ajaxcode/msg', async (request, reply) => {
    const { action } = request.query;

    if (action === 'msgadd' || action === 'add') {
      const { createMessage } = await import('../services/messages.mjs');

      try {
        const message = createMessage(request.body);
        return { success: true, message: '留言提交成功', data: message };
      } catch (error) {
        return reply.code(400).send({ success: false, message: error.message });
      }
    }

    return reply.badRequest('无效的操作');
  });

  // 产品留言提交
  app.post('/ajaxcode/prodmsg', async (request, reply) => {
    const { action } = request.query;

    if (action === 'add') {
      const { createMessage } = await import('../services/messages.mjs');

      try {
        const message = createMessage({
          ...request.body,
          type: 'product'
        });
        return { success: true, message: '咨询提交成功', data: message };
      } catch (error) {
        return reply.code(400).send({ success: false, message: error.message });
      }
    }

    return reply.badRequest('无效的操作');
  });
}
