import { requireAuth } from '../../middleware/auth.mjs';
import { queryAll, queryOne, execute } from '../../db.mjs';

export default async function productPhotosRoutes(app) {
  // 获取指定产品的所有相册图片
  app.get('/product-photos', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const { product_id } = request.query;
    let photos;

    if (product_id) {
      photos = queryAll(
        'SELECT id, product_id, name, image_path, created_at FROM product_photos WHERE product_id = ? ORDER BY id',
        [product_id]
      );
    } else {
      photos = queryAll('SELECT id, product_id, name, image_path, created_at FROM product_photos ORDER BY product_id, id');
    }

    return { success: true, data: photos };
  });

  // 获取单个相册图片
  app.get('/product-photos/:id', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const photo = queryOne(
      'SELECT id, product_id, name, image_path, created_at FROM product_photos WHERE id = ?',
      [request.params.id]
    );
    if (!photo) {
      reply.code(404);
      return { success: false, message: '图片不存在' };
    }
    return { success: true, data: photo };
  });

  // 创建相册图片
  app.post('/product-photos', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    try {
      const { product_id, name, image_path } = request.body;
      const now = new Date().toISOString();
      const result = execute(
        'INSERT INTO product_photos (product_id, name, image_path, created_at) VALUES (?, ?, ?, ?)',
        [product_id || null, name || null, image_path, now]
      );
      const photo = queryOne(
        'SELECT id, product_id, name, image_path, created_at FROM product_photos WHERE id = ?',
        [result.lastInsertRowid]
      );
      return { success: true, data: photo };
    } catch (error) {
      reply.code(400);
      return { success: false, message: error.message };
    }
  });

  // 更新相册图片
  app.put('/product-photos/:id', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    try {
      const { product_id, name, image_path } = request.body;
      execute(
        'UPDATE product_photos SET product_id = ?, name = ?, image_path = ? WHERE id = ?',
        [product_id || null, name || null, image_path, request.params.id]
      );
      const photo = queryOne(
        'SELECT id, product_id, name, image_path, created_at FROM product_photos WHERE id = ?',
        [request.params.id]
      );
      if (!photo) {
        reply.code(404);
        return { success: false, message: '图片不存在' };
      }
      return { success: true, data: photo };
    } catch (error) {
      reply.code(400);
      return { success: false, message: error.message };
    }
  });

  // 删除相册图片
  app.delete('/product-photos/:id', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    execute('DELETE FROM product_photos WHERE id = ?', [request.params.id]);
    return { success: true, message: '删除成功' };
  });
}
