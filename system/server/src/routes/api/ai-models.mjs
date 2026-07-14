import { requireAuth, requirePermission } from '../../middleware/auth.mjs';
import {
  createAiModel,
  deleteAiModel,
  getAiModelById,
  listAiModels,
  setDefaultAiModel,
  testAiModelConnection,
  updateAiModel,
} from '../../services/ai-models.mjs';

export default async function aiModelsRoutes(app) {
  const requireAiModelManage = requirePermission('14');
  const guards = [requireAuth, requireAiModelManage];

  app.get('/ai-models', { onRequest: guards }, async () => ({
    success: true,
    data: listAiModels(),
  }));

  app.get('/ai-models/:id', { onRequest: guards }, async (request, reply) => {
    try {
      const model = getAiModelById(request.params.id);
      if (!model) {
        return reply.notFound('模型配置不存在');
      }
      return { success: true, data: model };
    } catch (error) {
      return reply.badRequest(error.message || '获取模型配置失败');
    }
  });

  app.post('/ai-models', { onRequest: guards }, async (request, reply) => {
    try {
      return { success: true, data: createAiModel(request.body || {}), message: '模型配置已创建' };
    } catch (error) {
      return reply.badRequest(error.message || '模型配置创建失败');
    }
  });

  app.put('/ai-models/:id', { onRequest: guards }, async (request, reply) => {
    try {
      const model = updateAiModel(request.params.id, request.body || {});
      if (!model) {
        return reply.notFound('模型配置不存在');
      }
      return { success: true, data: model, message: '模型配置已更新' };
    } catch (error) {
      return reply.badRequest(error.message || '模型配置更新失败');
    }
  });

  app.post('/ai-models/:id/default', { onRequest: guards }, async (request, reply) => {
    try {
      const model = setDefaultAiModel(request.params.id);
      if (!model) {
        return reply.notFound('模型配置不存在');
      }
      return { success: true, data: model, message: '默认模型已切换' };
    } catch (error) {
      return reply.badRequest(error.message || '默认模型切换失败');
    }
  });

  app.post('/ai-models/:id/test', { onRequest: guards }, async (request, reply) => {
    try {
      const result = await testAiModelConnection(request.params.id);
      if (!result) {
        return reply.notFound('模型配置不存在');
      }
      return { success: true, data: result, message: '模型连接成功' };
    } catch (error) {
      return reply.badRequest(error.message || '模型连接测试失败');
    }
  });

  app.delete('/ai-models/:id', { onRequest: guards }, async (request, reply) => {
    try {
      const model = deleteAiModel(request.params.id);
      if (!model) {
        return reply.notFound('模型配置不存在');
      }
      return { success: true, data: model, message: '模型配置已删除' };
    } catch (error) {
      return reply.badRequest(error.message || '模型配置删除失败');
    }
  });
}
