import { requireAuth } from '../../middleware/auth.mjs';
import {
  createManualColumn,
  deleteManualColumn,
  getColumnById,
  listColumns,
  updateColumnRecord,
  updateManualColumn
} from '../../services/columns.mjs';

export default async function columnsRoutes(app) {
  app.get('/columns', {
    onRequest: [requireAuth]
  }, async (request) => {
    const { language, lang, include_translations, includeTranslations } = request.query;
    return {
      success: true,
      data: listColumns({
        languageCode: language ?? lang,
        includeTranslations: include_translations === '1' || include_translations === 'true' || includeTranslations === '1' || includeTranslations === 'true'
      })
    };
  });

  app.get('/columns/:id', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const { language, lang, include_translations, includeTranslations } = request.query;
    const column = getColumnById(request.params.id, {
      languageCode: language ?? lang,
      includeTranslations: include_translations === '1' || include_translations === 'true' || includeTranslations === '1' || includeTranslations === 'true'
    });
    if (!column) {
      reply.code(404);
      return { success: false, message: '栏目不存在' };
    }
    return { success: true, data: column };
  });

  app.post('/columns', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    try {
      const column = createManualColumn(request.body || {});
      return { success: true, data: column, message: '栏目已创建' };
    } catch (error) {
      reply.code(400);
      return { success: false, message: error.message };
    }
  });

  app.put('/columns/:id', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    try {
      const current = getColumnById(request.params.id, { includeTranslations: true });
      if (!current) {
        reply.code(404);
        return { success: false, message: '栏目不存在' };
      }

      const isManual = String(current.column_type || '') === 'link' || String(current.column_type || '') === 'single';
      const column = isManual
        ? updateManualColumn(request.params.id, request.body || {})
        : updateColumnRecord(request.params.id, request.body || {});
      if (!column) {
        reply.code(404);
        return { success: false, message: '栏目不存在' };
      }
      return { success: true, data: column, message: '栏目已更新' };
    } catch (error) {
      reply.code(400);
      return { success: false, message: error.message };
    }
  });

  app.delete('/columns/:id', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    try {
      const column = deleteManualColumn(request.params.id);
      if (!column) {
        reply.code(404);
        return { success: false, message: '栏目不存在' };
      }
      return { success: true, data: column, message: '栏目已删除' };
    } catch (error) {
      reply.code(400);
      return { success: false, message: error.message };
    }
  });
}
