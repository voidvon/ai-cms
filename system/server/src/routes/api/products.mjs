import { requireAuth } from '../../middleware/auth.mjs';
import {
  listProducts,
  listProductsAdmin,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  searchProductsPaged
} from '../../services/products.mjs';

export default async function productRoutes(app) {
  // 管理 API：产品列表（分页，含隐藏项）- 必须在 :id 路由之前
  app.get('/products/admin', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const { page, limit } = request.query;

    const result = listProductsAdmin({
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined
    });

    return { success: true, ...result };
  });

  // 公开 API：产品列表
  app.get('/products', async (request, reply) => {
    const { category_id, featured, visible, limit, offset } = request.query;

    const products = listProducts({
      categoryId: category_id ? parseInt(category_id) : undefined,
      featured: featured === 'true' || featured === '1',
      visibleOnly: visible !== 'false' && visible !== '0',
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined
    });

    return { success: true, data: products };
  });

  // 公开 API：搜索产品
  app.get('/products/search', async (request, reply) => {
    const { q, page = 1, pageSize = 20 } = request.query;

    if (!q) {
      return reply.badRequest('缺少搜索关键词');
    }

    const result = searchProductsPaged({
      keyword: q,
      page: parseInt(page),
      pageSize: parseInt(pageSize)
    });

    return { success: true, ...result };
  });

  // 公开 API：产品详情
  app.get('/products/:id', async (request, reply) => {
    const product = getProductById(parseInt(request.params.id));

    if (!product) {
      return reply.notFound('产品不存在');
    }

    return { success: true, data: product };
  });

  // 管理 API：创建产品
  app.post('/products', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const product = createProduct(request.body);
    return { success: true, data: product };
  });

  // 管理 API：更新产品
  app.put('/products/:id', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const updated = updateProduct(parseInt(request.params.id), request.body);

    if (!updated) {
      return reply.notFound('产品不存在');
    }

    return { success: true, data: updated };
  });

  // 管理 API：删除产品
  app.delete('/products/:id', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const deleted = deleteProduct(parseInt(request.params.id));

    if (!deleted) {
      return reply.notFound('产品不存在');
    }

    return { success: true, message: '产品已删除' };
  });
}
