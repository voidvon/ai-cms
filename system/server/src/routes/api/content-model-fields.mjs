import { requireAuth } from '../../middleware/auth.mjs';
import { getContentModelById, listContentModels } from '../../services/content-models.mjs';
import { getConfiguredModelField, upsertConfiguredModelField } from '../../services/content-model-fields.mjs';

export default async function contentModelFieldsRoutes(app) {
  app.get('/content-models/:id/fields', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const model = getContentModelById(request.params.id);
    if (!model) {
      reply.code(404);
      return { success: false, message: '数据模型不存在' };
    }

    return { success: true, data: model.fields };
  });

  app.put('/content-models/:id/fields/:fieldName', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const model = getContentModelById(request.params.id);
    if (!model) {
      reply.code(404);
      return { success: false, message: '数据模型不存在' };
    }

    const sourceField = model.fields.find((field) => field.field_name === request.params.fieldName);
    if (!sourceField) {
      reply.code(404);
      return { success: false, message: '字段不存在' };
    }

    try {
      const field = upsertConfiguredModelField(model.code, request.params.fieldName, request.body || {}, sourceField);
      const refreshedModel = listContentModels().find((item) => item.code === model.code) || model;
      const mergedField = refreshedModel.fields.find((item) => item.field_name === request.params.fieldName) || field || getConfiguredModelField(model.code, request.params.fieldName);
      return { success: true, data: mergedField, message: '字段配置已更新' };
    } catch (error) {
      reply.code(400);
      return { success: false, message: error.message };
    }
  });
}
