import { normalizeSearchModelCodes, searchAllContentPaged } from '../../services/content-search.mjs';

export default async function searchRoutes(app) {
  app.get('/search', async (request, reply) => {
    const { q, page = 1, pageSize = 20, language, lang, models } = request.query;
    const defaultLanguageCode = app.publicSite?.languageCode || null;

    if (!String(q || '').trim()) {
      return reply.badRequest('缺少搜索关键词');
    }

    const modelList = String(models || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    const result = searchAllContentPaged(q, {
      page: parseInt(page),
      limit: parseInt(pageSize),
      languageCode: language ?? lang ?? defaultLanguageCode,
      models: normalizeSearchModelCodes(modelList)
    });

    return { success: true, ...result };
  });
}
