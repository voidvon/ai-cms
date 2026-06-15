import { requireAuth } from '../../middleware/auth.mjs';
import {
  createCorporationCategory,
  deleteCorporationCategory,
  getCorporationCategoryById,
  listCorporationCategoriesAdmin,
  listRootCorporationCategories,
  updateCorporationCategory
} from '../../services/corporation-categories.mjs';

export default async function corporationCategoriesRoutes(app) {
  app.get('/corporation-categories', async () => {
    return { success: true, data: listRootCorporationCategories() };
  });

  app.get('/corporation-categories/admin', {
    onRequest: [requireAuth]
  }, async (request) => {
    const { parentId } = request.query;
    return {
      success: true,
      data: listCorporationCategoriesAdmin({ parentId: parentId ? parseInt(parentId, 10) : 0 })
    };
  });

  app.get('/corporation-categories/:id', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const category = getCorporationCategoryById(request.params.id);
    if (!category) {
      reply.code(404);
      return { success: false, message: '分类不存在' };
    }
    return { success: true, data: category };
  });

  app.post('/corporation-categories', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    try {
      const category = createCorporationCategory(request.body || {});
      return { success: true, data: category };
    } catch (error) {
      reply.code(400);
      return { success: false, message: error.message };
    }
  });

  app.put('/corporation-categories/:id', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    try {
      const category = updateCorporationCategory(request.params.id, request.body || {});
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

  app.delete('/corporation-categories/:id', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    try {
      const category = deleteCorporationCategory(request.params.id);
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
