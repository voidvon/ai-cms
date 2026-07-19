import { requireAuth } from '../../middleware/auth.mjs';
import {
  createDataTableRecord,
  deleteDataTableRecord,
  getDataTableByColumn,
  listDataTableRecords,
  updateDataTableFields,
  updateDataTableRecord
} from '../../services/data-tables.mjs';

export default async function dataTablesRoutes(app) {
  app.get('/data-tables/by-column/:columnId', { onRequest: [requireAuth] }, async (request, reply) => {
    try { return { success: true, data: getDataTableByColumn(request.params.columnId) }; }
    catch (error) { reply.code(400); return { success: false, message: error.message }; }
  });

  app.put('/data-tables/by-column/:columnId/fields', { onRequest: [requireAuth] }, async (request, reply) => {
    try { return { success: true, data: updateDataTableFields(request.params.columnId, request.body || {}) }; }
    catch (error) { reply.code(400); return { success: false, message: error.message }; }
  });

  app.get('/data-tables/by-column/:columnId/records', { onRequest: [requireAuth] }, async (request, reply) => {
    try { return { success: true, ...listDataTableRecords(request.params.columnId, request.query || {}) }; }
    catch (error) { reply.code(400); return { success: false, message: error.message }; }
  });

  app.post('/data-tables/by-column/:columnId/records', { onRequest: [requireAuth] }, async (request, reply) => {
    try { return { success: true, data: createDataTableRecord(request.params.columnId, request.body?.fields || {}) }; }
    catch (error) { reply.code(400); return { success: false, message: error.message }; }
  });

  app.put('/data-tables/by-column/:columnId/records/:recordId', { onRequest: [requireAuth] }, async (request, reply) => {
    try {
      const record = updateDataTableRecord(request.params.columnId, request.params.recordId, request.body?.fields || {});
      if (!record) { reply.code(404); return { success: false, message: '记录不存在' }; }
      return { success: true, data: record };
    } catch (error) { reply.code(400); return { success: false, message: error.message }; }
  });

  app.delete('/data-tables/by-column/:columnId/records/:recordId', { onRequest: [requireAuth] }, async (request, reply) => {
    try {
      if (!deleteDataTableRecord(request.params.columnId, request.params.recordId)) { reply.code(404); return { success: false, message: '记录不存在' }; }
      return { success: true };
    } catch (error) { reply.code(400); return { success: false, message: error.message }; }
  });
}
