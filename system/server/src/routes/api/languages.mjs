import { requireAuth } from '../../middleware/auth.mjs';
import {
  createLanguage,
  deleteLanguage,
  getLanguageById,
  listLanguages,
  updateLanguage
} from '../../services/languages.mjs';

export default async function languagesRoutes(app) {
  app.get('/languages', {
    onRequest: [requireAuth]
  }, async () => {
    return { success: true, data: listLanguages() };
  });

  app.get('/languages/:id', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const language = getLanguageById(request.params.id);
    if (!language) {
      reply.code(404);
      return { success: false, message: '语言不存在' };
    }
    return { success: true, data: language };
  });

  app.post('/languages', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    try {
      const language = createLanguage(request.body || {});
      return { success: true, data: language, message: '语言已创建' };
    } catch (error) {
      reply.code(400);
      return { success: false, message: error.message };
    }
  });

  app.put('/languages/:id', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    try {
      const language = updateLanguage(request.params.id, request.body || {});
      if (!language) {
        reply.code(404);
        return { success: false, message: '语言不存在' };
      }
      return { success: true, data: language, message: '语言已更新' };
    } catch (error) {
      reply.code(400);
      return { success: false, message: error.message };
    }
  });

  app.delete('/languages/:id', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    try {
      const language = deleteLanguage(request.params.id);
      if (!language) {
        reply.code(404);
        return { success: false, message: '语言不存在' };
      }
      return { success: true, data: language, message: '语言已删除' };
    } catch (error) {
      reply.code(400);
      return { success: false, message: error.message };
    }
  });
}
