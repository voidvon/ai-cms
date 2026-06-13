import { requireAuth } from '../../middleware/auth.mjs';
import {
  createNewsCategory,
  deleteNewsCategory,
  getNewsCategoryById,
  listNewsCategories,
  listNewsCategoriesAdmin,
  listNewsCategoryOptions,
  updateNewsCategory
} from '../../services/news-categories.mjs';

export default async function newsCategoriesRoutes(app) {
  app.get('/news-categories', async (request, reply) => {
    const { language, lang } = request.query;
    return { success: true, data: listNewsCategories({ languageCode: language ?? lang }) };
  });

  app.get('/news-categories/options', async (request, reply) => {
    const { language, lang } = request.query;
    return { success: true, data: listNewsCategoryOptions({ languageCode: language ?? lang }) };
  });

  app.get('/news-categories/admin', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const { parentId, page, limit, language, lang } = request.query;
    const result = listNewsCategoriesAdmin({
      parentId: parentId ? parseInt(parentId) : 0,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50,
      languageCode: language ?? lang
    });
    return { success: true, ...result };
  });

  app.get('/news-categories/:id', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const { language, lang, include_translations, includeTranslations } = request.query;
    const category = getNewsCategoryById(request.params.id, {
      languageCode: language ?? lang,
      includeTranslations: include_translations === '1' || include_translations === 'true' || includeTranslations === '1' || includeTranslations === 'true'
    });
    if (!category) {
      reply.code(404);
      return { success: false, message: '分类不存在' };
    }
    return { success: true, data: category };
  });

  app.post('/news-categories', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    try {
      const category = createNewsCategory(request.body);
      return { success: true, data: category };
    } catch (error) {
      reply.code(400);
      return { success: false, message: error.message };
    }
  });

  app.put('/news-categories/:id', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    try {
      const category = updateNewsCategory(request.params.id, request.body);
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

  app.delete('/news-categories/:id', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const category = deleteNewsCategory(request.params.id);
    if (!category) {
      reply.code(404);
      return { success: false, message: '分类不存在' };
    }
    return { success: true, message: '删除成功' };
  });
}
