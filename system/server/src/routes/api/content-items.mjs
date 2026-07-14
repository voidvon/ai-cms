import { requireAuth } from '../../middleware/auth.mjs';
import {
  createContentItem,
  deleteContentItem,
  getContentItemById,
  listContentItems,
  listContentItemsAdmin,
  searchContentItemsPaged,
  updateContentItem
} from '../../services/content-items.mjs';

export default async function contentItemsRoutes(app) {
  app.get('/content-items/:modelCode/admin', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    try {
      const { page, limit, column_id, columnId, include_descendants, includeDescendants, language, lang, keyword, q } = request.query;
      const { modelCode } = request.params;
      const result = listContentItemsAdmin(modelCode, {
        page: page ? parseInt(page, 10) : undefined,
        limit: limit ? parseInt(limit, 10) : undefined,
        columnId: (column_id ?? columnId) ? parseInt(column_id ?? columnId, 10) : undefined,
        includeDescendants: include_descendants === '1'
          || include_descendants === 'true'
          || includeDescendants === '1'
          || includeDescendants === 'true',
        languageCode: language ?? lang,
        nameKeyword: keyword ?? q
      });
      return { success: true, ...result };
    } catch (error) {
      reply.code(400);
      return { success: false, message: error.message };
    }
  });

  app.get('/content-items/:modelCode', async (request, reply) => {
    try {
      const { featured, visible, limit, language, lang } = request.query;
      const { modelCode } = request.params;
      const items = listContentItems(modelCode, {
        featured: featured === 'true' || featured === '1',
        visibleOnly: visible !== 'false' && visible !== '0',
        limit: limit ? parseInt(limit, 10) : undefined,
        languageCode: language ?? lang
      });
      return { success: true, data: items };
    } catch (error) {
      reply.code(400);
      return { success: false, message: error.message };
    }
  });

  app.get('/content-items/:modelCode/search', async (request, reply) => {
    const { q, page, limit, pageSize, language, lang } = request.query;
    if (!String(q || '').trim()) {
      return reply.badRequest('缺少搜索关键词');
    }

    try {
      const { modelCode } = request.params;
      const result = searchContentItemsPaged(modelCode, q, {
        page: page ? parseInt(page, 10) : 1,
        limit: limit ? parseInt(limit, 10) : (pageSize ? parseInt(pageSize, 10) : undefined),
        languageCode: language ?? lang
      });
      return { success: true, ...result };
    } catch (error) {
      reply.code(400);
      return { success: false, message: error.message };
    }
  });

  app.get('/content-items/:modelCode/:id', async (request, reply) => {
    try {
      const { language, lang, include_translations, includeTranslations } = request.query;
      const { modelCode, id } = request.params;
      const item = getContentItemById(modelCode, parseInt(id, 10), {
        languageCode: language ?? lang,
        includeTranslations: include_translations === '1'
          || include_translations === 'true'
          || includeTranslations === '1'
          || includeTranslations === 'true',
        includeTranslationStatuses: true
      });
      if (!item) {
        reply.code(404);
        return { success: false, message: '内容不存在' };
      }
      return { success: true, data: item };
    } catch (error) {
      reply.code(400);
      return { success: false, message: error.message };
    }
  });

  app.post('/content-items/:modelCode', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    try {
      const item = createContentItem(request.params.modelCode, request.body);
      return { success: true, data: item };
    } catch (error) {
      reply.code(400);
      return { success: false, message: error.message };
    }
  });

  app.put('/content-items/:modelCode/:id', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    try {
      const updated = updateContentItem(request.params.modelCode, parseInt(request.params.id, 10), request.body);
      if (!updated) {
        reply.code(404);
        return { success: false, message: '内容不存在' };
      }
      return { success: true, data: updated };
    } catch (error) {
      reply.code(400);
      return { success: false, message: error.message };
    }
  });

  app.delete('/content-items/:modelCode/:id', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    try {
      const deleted = deleteContentItem(request.params.modelCode, parseInt(request.params.id, 10));
      if (!deleted) {
        reply.code(404);
        return { success: false, message: '内容不存在' };
      }
      return { success: true, message: '内容已删除' };
    } catch (error) {
      reply.code(400);
      return { success: false, message: error.message };
    }
  });
}
