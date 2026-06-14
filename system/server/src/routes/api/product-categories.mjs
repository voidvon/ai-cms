import { requireAuth } from '../../middleware/auth.mjs';
import {
  createColumnCategory,
  deleteColumnCategory,
  getColumnCategoryById,
  listColumnCategories,
  listColumnCategoriesAdmin,
  listColumnCategoryOptions,
  updateColumnCategory
} from '../../services/column-categories.mjs';

export default async function productCategoriesRoutes(app) {
  // 公开 API：获取所有产品分类
  app.get('/product-categories', async (request, reply) => {
    const { language, lang } = request.query;
    const categories = listColumnCategories('product', { languageCode: language ?? lang });
    return { success: true, data: categories };
  });

  // 公开 API：获取产品分类选项（树形结构）
  app.get('/product-categories/options', async (request, reply) => {
    const { language, lang } = request.query;
    const options = listColumnCategoryOptions('product', { languageCode: language ?? lang });
    return { success: true, data: options };
  });

  // 管理 API：分页获取产品分类
  app.get('/product-categories/admin', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const { parentId, page, limit, language, lang } = request.query;
    const result = listColumnCategoriesAdmin('product', {
      parentId: parentId ? parseInt(parentId) : 0,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50,
      languageCode: language ?? lang
    });
    return { success: true, ...result };
  });

  // 管理 API：获取单个产品分类
  app.get('/product-categories/:id', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const { language, lang, include_translations, includeTranslations } = request.query;
    const category = getColumnCategoryById('product', request.params.id, {
      languageCode: language ?? lang,
      includeTranslations: include_translations === '1' || include_translations === 'true' || includeTranslations === '1' || includeTranslations === 'true'
    });
    if (!category) {
      reply.code(404);
      return { success: false, message: '分类不存在' };
    }
    return { success: true, data: category };
  });

  // 管理 API：创建产品分类
  app.post('/product-categories', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    try {
      const category = createColumnCategory('product', request.body);
      return { success: true, data: category };
    } catch (error) {
      reply.code(400);
      return { success: false, message: error.message };
    }
  });

  // 管理 API：更新产品分类
  app.put('/product-categories/:id', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    try {
      const category = updateColumnCategory('product', request.params.id, request.body);
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

  // 管理 API：删除产品分类
  app.delete('/product-categories/:id', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    try {
      const category = deleteColumnCategory('product', request.params.id);
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
