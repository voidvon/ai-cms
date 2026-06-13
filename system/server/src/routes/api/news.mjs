import { requireAuth } from '../../middleware/auth.mjs';
import {
  listNews,
  listNewsAdmin,
  getNewsById,
  createNews,
  updateNews,
  deleteNews
} from '../../services/news.mjs';

export default async function newsRoutes(app) {
  // 管理 API：新闻列表（分页）- 必须在 :id 路由之前
  app.get('/news/admin', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const { page, limit, category_id, categoryId, include_descendants, includeDescendants, language, lang } = request.query;
    const selectedCategoryId = category_id ?? categoryId;
    const selectedIncludeDescendants = include_descendants ?? includeDescendants;
    const selectedLanguage = language ?? lang;

    const result = listNewsAdmin({
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
      categoryId: selectedCategoryId ? parseInt(selectedCategoryId) : undefined,
      includeDescendants: selectedIncludeDescendants === '1' || selectedIncludeDescendants === 'true',
      languageCode: selectedLanguage ? String(selectedLanguage) : undefined
    });

    return { success: true, ...result };
  });

  // 公开 API：新闻列表
  app.get('/news', async (request, reply) => {
    const { featured, limit, language, lang } = request.query;

    const news = listNews({
      featured: featured === 'true' || featured === '1',
      limit: limit ? parseInt(limit) : undefined,
      languageCode: language ?? lang
    });

    return { success: true, data: news };
  });

  // 公开 API：新闻详情
  app.get('/news/:id', async (request, reply) => {
    const { language, lang, include_translations, includeTranslations } = request.query;
    const news = getNewsById(parseInt(request.params.id), {
      languageCode: language ?? lang,
      includeTranslations: include_translations === '1' || include_translations === 'true' || includeTranslations === '1' || includeTranslations === 'true',
      includeTranslationStatuses: true
    });

    if (!news) {
      return reply.notFound('新闻不存在');
    }

    return { success: true, data: news };
  });

  // 管理 API：创建新闻
  app.post('/news', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const news = createNews(request.body);
    return { success: true, data: news };
  });

  // 管理 API：更新新闻
  app.put('/news/:id', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const updated = updateNews(parseInt(request.params.id), request.body);

    if (!updated) {
      return reply.notFound('新闻不存在');
    }

    return { success: true, data: updated };
  });

  // 管理 API：删除新闻
  app.delete('/news/:id', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const deleted = deleteNews(parseInt(request.params.id));

    if (!deleted) {
      return reply.notFound('新闻不存在');
    }

    return { success: true, message: '新闻已删除' };
  });
}
