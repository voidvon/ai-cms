import { requireAuth } from '../../middleware/auth.mjs';
import {
  createManualColumn,
  deleteManualColumn,
  getColumnById,
  listColumns,
  updateManualColumn
} from '../../services/columns.mjs';

export default async function columnsRoutes(app) {
  app.get('/columns', {
    onRequest: [requireAuth]
  }, async () => {
    return { success: true, data: listColumns() };
  });

  app.get('/columns/:id', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const column = getColumnById(request.params.id);
    if (!column) {
      reply.code(404);
      return { success: false, message: '栏目不存在' };
    }
    return { success: true, data: column };
  });

  app.post('/columns', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    try {
      const column = createManualColumn(request.body || {});
      return { success: true, data: column, message: '栏目已创建' };
    } catch (error) {
      reply.code(400);
      return { success: false, message: error.message };
    }
  });

  app.put('/columns/:id', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    try {
      const column = updateManualColumn(request.params.id, request.body || {});
      if (!column) {
        reply.code(404);
        return { success: false, message: '栏目不存在' };
      }
      return { success: true, data: column, message: '栏目已更新' };
    } catch (error) {
      reply.code(400);
      return { success: false, message: error.message };
    }
  });

  app.delete('/columns/:id', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    try {
      const column = deleteManualColumn(request.params.id);
      if (!column) {
        reply.code(404);
        return { success: false, message: '栏目不存在' };
      }
      return { success: true, data: column, message: '栏目已删除' };
    } catch (error) {
      reply.code(400);
      return { success: false, message: error.message };
    }
  });
}
