import { requireAuth } from '../../middleware/auth.mjs';
import {
  getContentModelById,
  listContentModels
} from '../../services/content-models.mjs';

export default async function contentModelsRoutes(app) {
  app.get('/content-models', {
    onRequest: [requireAuth]
  }, async () => {
    return { success: true, data: listContentModels() };
  });

  app.get('/content-models/:id', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const model = getContentModelById(request.params.id);
    if (!model) {
      reply.code(404);
      return { success: false, message: '数据模型不存在' };
    }
    return { success: true, data: model };
  });
}
