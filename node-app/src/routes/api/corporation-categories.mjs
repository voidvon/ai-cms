import { requireAuth } from '../../middleware/auth.mjs';
import { queryAll, queryOne, execute } from '../../db.mjs';

export default async function corporationCategoriesRoutes(app) {
  // 公开 API：获取所有公司分类
  app.get('/corporation-categories', async (request, reply) => {
    const categories = queryAll(`
      SELECT id, name, parent_id, sort_order, is_external, external_url
      FROM corporation_categories
      ORDER BY sort_order ASC, id ASC
    `);
    return { success: true, data: categories };
  });

  // 管理 API：获取所有公司分类
  app.get('/corporation-categories/admin', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const categories = queryAll(`
      SELECT id, name, parent_id, sort_order, is_external, external_url
      FROM corporation_categories
      ORDER BY parent_id ASC, sort_order ASC, id ASC
    `);
    return { success: true, data: categories };
  });

  // 管理 API：获取单个公司分类
  app.get('/corporation-categories/:id', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const category = queryOne(
      'SELECT id, name, parent_id, sort_order, is_external, external_url FROM corporation_categories WHERE id = ?',
      [request.params.id]
    );
    if (!category) {
      reply.code(404);
      return { success: false, message: '分类不存在' };
    }
    return { success: true, data: category };
  });

  // 管理 API：创建公司分类
  app.post('/corporation-categories', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    try {
      const { name, parent_id, sort_order, is_external, external_url } = request.body;
      const result = execute(
        'INSERT INTO corporation_categories (name, parent_id, sort_order, is_external, external_url) VALUES (?, ?, ?, ?, ?)',
        [name, parent_id || 0, sort_order || 0, is_external || 0, external_url || null]
      );
      const category = queryOne(
        'SELECT id, name, parent_id, sort_order, is_external, external_url FROM corporation_categories WHERE id = ?',
        [result.lastInsertRowid]
      );
      return { success: true, data: category };
    } catch (error) {
      reply.code(400);
      return { success: false, message: error.message };
    }
  });

  // 管理 API：更新公司分类
  app.put('/corporation-categories/:id', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    try {
      const { name, parent_id, sort_order, is_external, external_url } = request.body;
      execute(
        'UPDATE corporation_categories SET name = ?, parent_id = ?, sort_order = ?, is_external = ?, external_url = ? WHERE id = ?',
        [name, parent_id || 0, sort_order || 0, is_external || 0, external_url || null, request.params.id]
      );
      const category = queryOne(
        'SELECT id, name, parent_id, sort_order, is_external, external_url FROM corporation_categories WHERE id = ?',
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

  // 管理 API：删除公司分类
  app.delete('/corporation-categories/:id', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    execute('DELETE FROM corporation_categories WHERE id = ?', [request.params.id]);
    return { success: true, message: '删除成功' };
  });
}
