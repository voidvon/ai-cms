import { requireAuth } from '../../middleware/auth.mjs';
import {
  createColumnCategoryByRoot,
  deleteColumnCategoryInRoot,
  getColumnCategoryByIdInRoot,
  listColumnCategoriesByRoot,
  listColumnCategoryOptionsByRoot,
  updateColumnCategoryInRoot
} from '../../services/column-categories.mjs';

function resolveRootColumnId(request) {
  const value = Number.parseInt(String(request?.query?.rootColumnId || request?.query?.root_column_id || '').trim(), 10);
  if (Number.isNaN(value) || value <= 0) {
    throw new Error('invalid root column id');
  }
  return value;
}

export default async function columnCategoriesRoutes(app) {
  app.get('/column-categories', async (request, reply) => {
    try {
      const rootColumnId = resolveRootColumnId(request);
      const { language, lang } = request.query;
      return { success: true, data: listColumnCategoriesByRoot(rootColumnId, { languageCode: language ?? lang }) };
    } catch (error) {
      reply.code(400);
      return { success: false, message: error.message };
    }
  });

  app.get('/column-categories/options', async (request, reply) => {
    try {
      const rootColumnId = resolveRootColumnId(request);
      const { language, lang } = request.query;
      return { success: true, data: listColumnCategoryOptionsByRoot(rootColumnId, { languageCode: language ?? lang }) };
    } catch (error) {
      reply.code(400);
      return { success: false, message: error.message };
    }
  });

  app.get('/column-categories/admin', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    try {
      const rootColumnId = resolveRootColumnId(request);
      const { parentId, page, limit, language, lang } = request.query;
      const items = listColumnCategoriesByRoot(rootColumnId, { languageCode: language ?? lang })
        .filter((item) => Number(item.parent_id || 0) === (parentId ? parseInt(parentId, 10) : 0));
      const safeLimit = Math.min(Math.max(parentId ? parseInt(String(limit || 50), 10) : parseInt(String(limit || 50), 10), 1), 200);
      const safePage = Math.max(parseInt(String(page || 1), 10), 1);
      const offset = (safePage - 1) * safeLimit;
      return {
        success: true,
        items: items.slice(offset, offset + safeLimit),
        pagination: {
          page: safePage,
          limit: safeLimit,
          total: items.length,
          totalPages: Math.max(Math.ceil(items.length / safeLimit), 1)
        }
      };
    } catch (error) {
      reply.code(400);
      return { success: false, message: error.message };
    }
  });

  app.get('/column-categories/:id', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    try {
      const rootColumnId = resolveRootColumnId(request);
      const { language, lang, include_translations, includeTranslations } = request.query;
      const queryOptions = {
        languageCode: language ?? lang,
        includeTranslations: include_translations === '1' || include_translations === 'true' || includeTranslations === '1' || includeTranslations === 'true'
      };
      const category = getColumnCategoryByIdInRoot(rootColumnId, request.params.id, queryOptions);
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

  app.post('/column-categories', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    try {
      const rootColumnId = resolveRootColumnId(request);
      const category = createColumnCategoryByRoot(rootColumnId, request.body || {});
      return { success: true, data: category };
    } catch (error) {
      reply.code(400);
      return { success: false, message: error.message };
    }
  });

  app.put('/column-categories/:id', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    try {
      const rootColumnId = resolveRootColumnId(request);
      const category = updateColumnCategoryInRoot(rootColumnId, request.params.id, request.body || {});
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

  app.delete('/column-categories/:id', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    try {
      const rootColumnId = resolveRootColumnId(request);
      const category = deleteColumnCategoryInRoot(rootColumnId, request.params.id);
      if (!category) {
        reply.code(404);
        return { success: false, message: '分类不存在' };
      }
      return { success: true, message: '删除成功' };
    } catch (error) {
      reply.code(400);
      return { success: false, message: error.message };
    }
  });
}
