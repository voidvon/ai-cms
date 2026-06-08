import { requireAuth } from '../../middleware/auth.mjs';
import { queryAll, queryOne, execute } from '../../db.mjs';

export default async function metaTypesRoutes(app) {
  // 获取所有元数据类型
  app.get('/meta-types', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const metaTypes = queryAll('SELECT * FROM meta_types ORDER BY id');
    return { success: true, data: metaTypes };
  });

  // 获取单个元数据类型
  app.get('/meta-types/:id', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const metaType = queryOne('SELECT * FROM meta_types WHERE id = ?', [request.params.id]);
    if (!metaType) {
      reply.code(404);
      return { success: false, message: '记录不存在' };
    }
    return { success: true, data: metaType };
  });

  // 更新元数据类型
  app.put('/meta-types/:id', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const { title, meta_keywords, meta_descriptions } = request.body;
    execute(
      'UPDATE meta_types SET title = ?, meta_keywords = ?, meta_descriptions = ? WHERE id = ?',
      [title || null, meta_keywords || null, meta_descriptions || null, request.params.id]
    );
    const metaType = queryOne('SELECT * FROM meta_types WHERE id = ?', [request.params.id]);
    return { success: true, data: metaType };
  });
}
