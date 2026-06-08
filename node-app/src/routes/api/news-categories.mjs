import { requireAuth } from '../../middleware/auth.mjs';
import { queryAll, queryOne, execute } from '../../db.mjs';

export default async function newsCategoriesRoutes(app) {
  // 公开 API：获取所有新闻分类
  app.get('/news-categories', async (request, reply) => {
    const categories = queryAll(`
      SELECT id, name, parent_id, sort_order
      FROM news_categories
      ORDER BY sort_order ASC, id ASC
    `);
    return { success: true, data: categories };
  });

  // 管理 API：获取所有新闻分类
  app.get('/news-categories/admin', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const categories = queryAll(`
      SELECT id, name, parent_id, sort_order
      FROM news_categories
      ORDER BY parent_id ASC, sort_order ASC, id ASC
    `);
    return { success: true, data: categories };
  });

  // 管理 API：获取单个新闻分类
  app.get('/news-categories/:id', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const category = queryOne(
      'SELECT id, name, parent_id, sort_order FROM news_categories WHERE id = ?',
      [request.params.id]
    );
    if (!category) {
      reply.code(404);
      return { success: false, message: '分类不存在' };
    }
    return { success: true, data: category };
  });

  // 管理 API：创建新闻分类
  app.post('/news-categories', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    try {
      const { name, parent_id, sort_order } = request.body;
      const result = execute(
        'INSERT INTO news_categories (name, parent_id, sort_order) VALUES (?, ?, ?)',
        [name, parent_id || 0, sort_order || 0]
      );
      const category = queryOne(
        'SELECT id, name, parent_id, sort_order FROM news_categories WHERE id = ?',
        [result.lastInsertRowid]
      );
      return { success: true, data: category };
    } catch (error) {
      reply.code(400);
      return { success: false, message: error.message };
    }
  });

  // 管理 API：更新新闻分类
  app.put('/news-categories/:id', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    try {
      const { name, parent_id, sort_order } = request.body;
      execute(
        'UPDATE news_categories SET name = ?, parent_id = ?, sort_order = ? WHERE id = ?',
        [name, parent_id || 0, sort_order || 0, request.params.id]
      );
      const category = queryOne(
        'SELECT id, name, parent_id, sort_order FROM news_categories WHERE id = ?',
        [request.params.id]
      );
      if (!category) {
        reply.code(404);
        return { success: false, message: '分类不存在' };
      }
      return { success: true, data: category };
    } catch (error) {
      reply.code(400);
      return { success: false, message: error.message };
    }
  });

  // 管理 API：删除新闻分类
  app.delete('/news-categories/:id', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    execute('DELETE FROM news_categories WHERE id = ?', [request.params.id]);
    return { success: true, message: '删除成功' };
  });
}
