import { requireAuth } from '../../middleware/auth.mjs';
import { saveUploadedFile } from '../../services/uploads.mjs';
import path from 'node:path';

export default async function uploadRoutes(app) {
  // 文件上传接口
  app.post('/uploads', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const utype = request.query.utype || 'general';

    const data = await request.file();

    if (!data) {
      return reply.badRequest('未上传文件');
    }

    const buffer = await data.toBuffer();
    const originalFilename = data.filename;

    try {
      const result = saveUploadedFile({
        buffer,
        originalFilename,
        utype
      });

      return {
        success: true,
        message: '上传成功',
        ...result
      };
    } catch (error) {
      app.log.error(error);
      return reply.badRequest(error.message || '上传失败');
    }
  });
}
