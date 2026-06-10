import { requireAuth } from '../../middleware/auth.mjs';
import {
  cleanupOrphanedMediaAssets,
  listMediaAssets,
  uploadMediaAsset,
} from '../../services/media-assets.mjs';

export default async function mediaRoutes(app) {
  app.get('/media-assets', {
    onRequest: [requireAuth],
  }, async (request) => {
    const { page, limit, purpose, status } = request.query;
    const result = listMediaAssets({
      page: page ? Number.parseInt(page, 10) : undefined,
      limit: limit ? Number.parseInt(limit, 10) : undefined,
      purpose,
      status,
    });

    return { success: true, ...result };
  });

  app.post('/media-assets/cleanup', {
    onRequest: [requireAuth],
  }, async (request) => {
    const { purpose } = request.body || {};
    const result = cleanupOrphanedMediaAssets({ purpose });
    return {
      success: true,
      message: '孤儿资源已清理',
      data: result,
    };
  });

  app.post('/media/upload', {
    onRequest: [requireAuth],
  }, async (request, reply) => {
    const purpose = request.query.purpose || 'attachment';
    const data = await request.file();

    if (!data) {
      return reply.badRequest('未上传文件');
    }

    try {
      const buffer = await data.toBuffer();
      const asset = uploadMediaAsset({
        buffer,
        originalFilename: data.filename,
        purpose,
      });

      return {
        success: true,
        message: '上传成功',
        data: asset,
      };
    } catch (error) {
      app.log.error(error);
      return reply.badRequest(error.message || '上传失败');
    }
  });
}
