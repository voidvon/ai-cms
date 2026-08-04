import { requireAuth } from '../../middleware/auth.mjs';
import {
  createMediaCategory,
  deleteMediaCategory,
  getMediaCategoryById,
  listMediaCategories,
  updateMediaCategory,
} from '../../services/media-categories.mjs';

export default async function mediaCategoryRoutes(app) {
  app.get('/media-categories', { onRequest: [requireAuth] }, async (request) => ({
    success: true,
    data: listMediaCategories({
      includeDisabled: String(request.query?.include_disabled ?? '1') !== '0',
      languageCode: request.query?.language_code,
    }),
  }));

  app.get('/media-categories/:id', { onRequest: [requireAuth] }, async (request, reply) => {
    const category = getMediaCategoryById(request.params.id, { languageCode: request.query?.language_code });
    if (!category) return reply.notFound('媒体分类不存在');
    return { success: true, data: category };
  });

  app.post('/media-categories', { onRequest: [requireAuth] }, async (request, reply) => {
    try {
      return { success: true, data: createMediaCategory(request.body || {}), message: '媒体分类已创建' };
    } catch (error) {
      return reply.badRequest(error.message || '媒体分类创建失败');
    }
  });

  app.put('/media-categories/:id', { onRequest: [requireAuth] }, async (request, reply) => {
    try {
      const category = updateMediaCategory(request.params.id, request.body || {});
      if (!category) return reply.notFound('媒体分类不存在');
      return { success: true, data: category, message: '媒体分类已更新' };
    } catch (error) {
      return reply.badRequest(error.message || '媒体分类更新失败');
    }
  });

  app.delete('/media-categories/:id', { onRequest: [requireAuth] }, async (request, reply) => {
    try {
      const category = deleteMediaCategory(request.params.id);
      if (!category) return reply.notFound('媒体分类不存在');
      return { success: true, data: category, message: '媒体分类已删除' };
    } catch (error) {
      if (error.statusCode === 409) return reply.code(409).send({ success: false, message: error.message });
      return reply.badRequest(error.message || '媒体分类删除失败');
    }
  });
}
