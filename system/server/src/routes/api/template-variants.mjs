import { requireAuth } from '../../middleware/auth.mjs';
import { queryAll, queryOne, execute } from '../../db.mjs';

export default async function templateVariantsRoutes(app) {
  // 获取所有模板变体
  app.get('/template-variants', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const variants = queryAll('SELECT * FROM template_variants ORDER BY id');
    return { success: true, data: variants };
  });

  // 获取当前选中的模板
  app.get('/template-variants/selected', async (request, reply) => {
    const variant = queryOne('SELECT * FROM template_variants WHERE is_selected = 1 LIMIT 1');
    return { success: true, data: variant };
  });

  // 获取单个模板变体
  app.get('/template-variants/:id', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const variant = queryOne('SELECT * FROM template_variants WHERE id = ?', [request.params.id]);
    if (!variant) {
      reply.code(404);
      return { success: false, message: '模板不存在' };
    }
    return { success: true, data: variant };
  });

  // 更新模板变体
  app.put('/template-variants/:id', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    try {
      const { template_name, is_selected } = request.body;

      // 如果设置为选中，先取消其他模板的选中状态
      if (is_selected === 1) {
        execute('UPDATE template_variants SET is_selected = 0');
      }

      execute(
        'UPDATE template_variants SET template_name = ?, is_selected = ? WHERE id = ?',
        [template_name, is_selected || 0, request.params.id]
      );

      const variant = queryOne('SELECT * FROM template_variants WHERE id = ?', [request.params.id]);
      return { success: true, data: variant };
    } catch (error) {
      reply.code(400);
      return { success: false, message: error.message };
    }
  });

  // 选择模板（设置为当前使用的模板）
  app.post('/template-variants/:id/select', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    // 先取消所有模板的选中状态
    execute('UPDATE template_variants SET is_selected = 0');

    // 设置指定模板为选中
    execute('UPDATE template_variants SET is_selected = 1 WHERE id = ?', [request.params.id]);

    const variant = queryOne('SELECT * FROM template_variants WHERE id = ?', [request.params.id]);
    return { success: true, data: variant, message: '模板已切换' };
  });
}
