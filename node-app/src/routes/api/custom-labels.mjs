import { requireAuth } from '../../middleware/auth.mjs';
import { queryAll, queryOne, execute } from '../../db.mjs';

export default async function customLabelsRoutes(app) {
  // 获取所有标签类型
  app.get('/custom-label-kinds', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const kinds = queryAll('SELECT * FROM custom_label_kinds ORDER BY id');
    return { success: true, data: kinds };
  });

  // 获取所有自定义标签
  app.get('/custom-labels', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const labels = queryAll(`
      SELECT cl.*, clk.name as kind_name
      FROM custom_labels cl
      LEFT JOIN custom_label_kinds clk ON cl.kind_id = clk.id
      ORDER BY cl.kind_id, cl.id
    `);
    return { success: true, data: labels };
  });

  // 创建标签
  app.post('/custom-labels', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const { kind_id, name, content } = request.body;
    const result = execute(
      'INSERT INTO custom_labels (kind_id, name, content) VALUES (?, ?, ?)',
      [kind_id || null, name, content || null]
    );
    const label = queryOne('SELECT * FROM custom_labels WHERE id = ?', [result.lastInsertRowid]);
    return { success: true, data: label };
  });

  // 更新标签
  app.put('/custom-labels/:id', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const { kind_id, name, content } = request.body;
    execute(
      'UPDATE custom_labels SET kind_id = ?, name = ?, content = ? WHERE id = ?',
      [kind_id || null, name, content || null, request.params.id]
    );
    const label = queryOne('SELECT * FROM custom_labels WHERE id = ?', [request.params.id]);
    return { success: true, data: label };
  });

  // 删除标签
  app.delete('/custom-labels/:id', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    execute('DELETE FROM custom_labels WHERE id = ?', [request.params.id]);
    return { success: true, message: '删除成功' };
  });
}
