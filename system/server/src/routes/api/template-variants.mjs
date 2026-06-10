import { requireAuth } from '../../middleware/auth.mjs';
import { CONTENT_ROOT } from '../../config.mjs';
import { buildStaticSite } from '../../static-builder.mjs';
import {
  createTemplateVariant,
  deleteTemplateVariant,
  ensureTemplateVariantsSchema,
  getSelectedTemplateVariant,
  getTemplateVariantById,
  listTemplateVariants,
  setSelectedTemplateVariant,
  updateTemplateVariant
} from '../../services/template-variants.mjs';

export default async function templateVariantsRoutes(app) {
  ensureTemplateVariantsSchema();

  app.get('/template-variants', {
    onRequest: [requireAuth]
  }, async () => {
    return { success: true, data: listTemplateVariants() };
  });

  app.get('/template-variants/selected', async () => {
    const variant = getSelectedTemplateVariant();
    return { success: true, data: variant };
  });

  app.get('/template-variants/:id', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const variant = getTemplateVariantById(request.params.id);
    if (!variant) {
      reply.code(404);
      return { success: false, message: '主题不存在' };
    }
    return { success: true, data: variant };
  });

  app.post('/template-variants', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    try {
      const variant = createTemplateVariant(request.body || {});
      return { success: true, data: variant, message: '主题已创建' };
    } catch (error) {
      reply.code(400);
      return { success: false, message: error.message };
    }
  });

  app.put('/template-variants/:id', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    try {
      const variant = updateTemplateVariant(request.params.id, request.body || {});
      if (!variant) {
        reply.code(404);
        return { success: false, message: '主题不存在' };
      }
      return { success: true, data: variant };
    } catch (error) {
      reply.code(400);
      return { success: false, message: error.message };
    }
  });

  app.post('/template-variants/:id/select', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const variant = setSelectedTemplateVariant(request.params.id);
    if (!variant) {
      reply.code(404);
      return { success: false, message: '主题不存在' };
    }

    const buildResult = buildStaticSite({
      outputRoot: CONTENT_ROOT,
      cleanExisting: true
    });

    return {
      success: true,
      data: variant,
      message: '主题已切换并重新生成静态页面',
      build: {
        totalFiles: buildResult.totalFiles,
        totalRecords: buildResult.totalRecords
      }
    };
  });

  app.delete('/template-variants/:id', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    try {
      const variant = deleteTemplateVariant(request.params.id);
      if (!variant) {
        reply.code(404);
        return { success: false, message: '主题不存在' };
      }
      return { success: true, data: variant, message: '主题已删除' };
    } catch (error) {
      reply.code(400);
      return { success: false, message: error.message };
    }
  });
}
