import { requireAuth } from '../../middleware/auth.mjs';
import {
  createTemplate,
  deleteTemplate,
  deleteTemplateBinding,
  getTemplateById,
  listTemplateBindings,
  listTemplateVersions,
  listTemplates,
  publishTemplate,
  updateTemplate,
  upsertTemplateBinding
} from '../../services/templates.mjs';

export default async function templatesRoutes(app) {
  app.get('/templates', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    try {
      const templates = listTemplates({ type: request.query?.type });
      return { success: true, data: templates };
    } catch (error) {
      reply.code(400);
      return { success: false, message: error.message };
    }
  });

  app.get('/templates/:id', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const template = getTemplateById(request.params.id);
    if (!template) {
      reply.code(404);
      return { success: false, message: '模板不存在' };
    }
    return { success: true, data: template };
  });

  app.get('/template-bindings', {
    onRequest: [requireAuth]
  }, async () => {
    return { success: true, data: listTemplateBindings() };
  });

  app.put('/template-bindings', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    try {
      const binding = upsertTemplateBinding(request.body || {});
      return { success: true, data: binding, message: '模板绑定已保存' };
    } catch (error) {
      reply.code(400);
      return { success: false, message: error.message };
    }
  });

  app.delete('/template-bindings/:id', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const binding = deleteTemplateBinding(request.params.id);
    if (!binding) {
      reply.code(404);
      return { success: false, message: '模板绑定不存在' };
    }
    return { success: true, data: binding, message: '模板绑定已删除' };
  });

  app.post('/templates', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    try {
      const template = createTemplate(request.body || {});
      return { success: true, data: template };
    } catch (error) {
      reply.code(400);
      return { success: false, message: error.message };
    }
  });

  app.put('/templates/:id', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    try {
      const template = updateTemplate(request.params.id, request.body || {});
      if (!template) {
        reply.code(404);
        return { success: false, message: '模板不存在' };
      }
      return { success: true, data: template };
    } catch (error) {
      reply.code(400);
      return { success: false, message: error.message };
    }
  });

  app.post('/templates/:id/publish', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    try {
      const template = publishTemplate(request.params.id, request.body?.note);
      if (!template) {
        reply.code(404);
        return { success: false, message: '模板不存在' };
      }
      return { success: true, data: template, message: '模板已发布' };
    } catch (error) {
      reply.code(400);
      return { success: false, message: error.message };
    }
  });

  app.get('/templates/:id/versions', {
    onRequest: [requireAuth]
  }, async (request) => {
    return { success: true, data: listTemplateVersions(request.params.id) };
  });

  app.delete('/templates/:id', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    try {
      const template = deleteTemplate(request.params.id);
      if (!template) {
        reply.code(404);
        return { success: false, message: '模板不存在' };
      }
      return { success: true, data: template, message: '模板已删除' };
    } catch (error) {
      reply.code(400);
      return { success: false, message: error.message };
    }
  });
}
