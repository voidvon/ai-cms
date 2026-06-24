import { requireAuth } from '../../middleware/auth.mjs';
import {
  listBulkReplaceOptions,
  previewBulkReplace,
  runBulkReplace
} from '../../services/bulk-replace.mjs';

export default async function bulkReplaceRoutes(app) {
  app.get('/bulk-replace/options', {
    onRequest: [requireAuth]
  }, async () => {
    return { success: true, data: listBulkReplaceOptions() };
  });

  app.post('/bulk-replace/preview', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    try {
      const result = previewBulkReplace(request.body || {});
      return { success: true, data: result };
    } catch (error) {
      reply.code(400);
      return { success: false, message: error.message || '预览失败' };
    }
  });

  app.post('/bulk-replace/execute', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    try {
      const result = runBulkReplace(request.body || {});
      return { success: true, data: result, message: '批量替换已执行' };
    } catch (error) {
      reply.code(400);
      return { success: false, message: error.message || '执行失败' };
    }
  });
}
