import fs from 'node:fs';
import { requireAuth } from '../../middleware/auth.mjs';
import {
  cleanupOrphanedMediaAssets,
  deleteMediaAsset,
  getMediaAssetById,
  listMediaAssets,
  replaceMediaAssetFile,
  updateMediaAssetLanguage,
  updateMediaAssetMetadata,
  updateMediaAssetPdfDocumentType,
  uploadMediaAsset,
} from '../../services/media-assets.mjs';

export default async function mediaRoutes(app) {
  app.get('/media-assets', {
    onRequest: [requireAuth],
  }, async (request) => {
    const { page, limit, purpose, usage, q, pdf_search, language_id, category_id } = request.query;
    const result = listMediaAssets({
      page: page ? Number.parseInt(page, 10) : undefined,
      limit: limit ? Number.parseInt(limit, 10) : undefined,
      purpose,
      usage,
      q,
      pdfSearch: String(pdf_search || '') === '1',
      languageId: language_id ? Number.parseInt(language_id, 10) : undefined,
      categoryId: category_id ? Number.parseInt(category_id, 10) : undefined,
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

  app.delete('/media-assets/:id', {
    onRequest: [requireAuth],
  }, async (request, reply) => {
    try {
      const result = deleteMediaAsset(request.params.id);
      return {
        success: true,
        message: '附件已删除',
        data: result,
      };
    } catch (error) {
      if (error.statusCode === 404) {
        return reply.notFound(error.message || '附件不存在');
      }
      if (error.statusCode === 409) {
        return reply.code(409).send({
          success: false,
          message: error.message || '附件仍在使用中，不能删除',
          data: {
            usage_references: error.usageReferences || [],
          },
        });
      }
      app.log.error(error);
      return reply.internalServerError(error.message || '删除失败');
    }
  });

  app.get('/media-assets/:id/download', {
    onRequest: [requireAuth],
  }, async (request, reply) => {
    const asset = getMediaAssetById(request.params.id);
    if (!asset) {
      return reply.notFound('附件不存在');
    }
    if (asset.storage_driver !== 'local' || !asset.fs_path || !fs.existsSync(asset.fs_path)) {
      return reply.notFound('附件文件不存在');
    }

    const downloadName = String(asset.original_name || `media-${asset.id}${asset.file_ext || ''}`)
      .replace(/[\r\n]/g, '');
    reply.header('Content-Type', asset.mime_type || 'application/octet-stream');
    reply.header('Content-Length', String(asset.file_size || fs.statSync(asset.fs_path).size));
    reply.header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`);
    return reply.send(fs.createReadStream(asset.fs_path));
  });

  app.put('/media-assets/:id/file', {
    onRequest: [requireAuth],
  }, async (request, reply) => {
    const data = await request.file();
    if (!data) {
      return reply.badRequest('未上传文件');
    }

    try {
      const asset = await replaceMediaAssetFile(request.params.id, {
        buffer: await data.toBuffer(),
        originalFilename: data.filename,
      });
      return {
        success: true,
        message: '资源已替换',
        data: asset,
      };
    } catch (error) {
      if (error.statusCode === 404) {
        return reply.notFound(error.message || '附件不存在');
      }
      if (error.statusCode === 400) {
        return reply.badRequest(error.message || '资源替换失败');
      }
      app.log.error(error);
      return reply.internalServerError(error.message || '资源替换失败');
    }
  });

  app.patch('/media-assets/:id/language', {
    onRequest: [requireAuth],
  }, async (request, reply) => {
    try {
      const asset = updateMediaAssetLanguage(request.params.id, request.body?.language_id);
      return {
        success: true,
        message: 'PDF 语言已更新',
        data: asset,
      };
    } catch (error) {
      if (error.statusCode === 404) {
        return reply.notFound(error.message || '附件不存在');
      }
      if (error.statusCode === 400) {
        return reply.badRequest(error.message || '语言更新失败');
      }
      app.log.error(error);
      return reply.internalServerError(error.message || '语言更新失败');
    }
  });

  app.patch('/media-assets/:id/pdf-document-type', {
    onRequest: [requireAuth],
  }, async (request, reply) => {
    try {
      const asset = updateMediaAssetPdfDocumentType(request.params.id, request.body?.pdf_document_type);
      return {
        success: true,
        message: 'PDF 文档类型已更新',
        data: asset,
      };
    } catch (error) {
      if (error.statusCode === 404) {
        return reply.notFound(error.message || '附件不存在');
      }
      if (error.statusCode === 400) {
        return reply.badRequest(error.message || '文档类型更新失败');
      }
      app.log.error(error);
      return reply.internalServerError(error.message || '文档类型更新失败');
    }
  });

  app.patch('/media-assets/:id/metadata', {
    onRequest: [requireAuth],
  }, async (request, reply) => {
    try {
      return {
        success: true,
        message: 'PDF 元数据已更新',
        data: updateMediaAssetMetadata(request.params.id, request.body || {}),
      };
    } catch (error) {
      if (error.statusCode === 404) return reply.notFound(error.message || '附件不存在');
      if (error.statusCode === 400) return reply.badRequest(error.message || '元数据更新失败');
      app.log.error(error);
      return reply.internalServerError(error.message || '元数据更新失败');
    }
  });

  app.post('/media/upload', {
    onRequest: [requireAuth],
  }, async (request, reply) => {
    const purpose = request.query.purpose || 'attachment';
    const languageId = request.query.language_id;
    const categoryId = request.query.category_id;
    const pdfDocumentType = request.query.pdf_document_type;
    const pdfTitle = request.query.pdf_title;
    const pdfDocumentCode = request.query.pdf_document_code;
    const data = await request.file();

    if (!data) {
      return reply.badRequest('未上传文件');
    }

    try {
      const buffer = await data.toBuffer();
      const asset = await uploadMediaAsset({
        buffer,
        originalFilename: data.filename,
        purpose,
        languageId,
        categoryId,
        pdfDocumentType,
        pdfTitle,
        pdfDocumentCode,
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
