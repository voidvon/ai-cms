import { requireAuth } from '../../middleware/auth.mjs';
import { sendDocumentDraftMessage } from '../../services/ai/document-chat.mjs';
import { createDocumentDraft, deleteDocumentDraft, getDocumentDraftById, listDocumentDrafts, updateDocumentDraft } from '../../services/document-drafts.mjs';
import { createDocumentCompany, deleteDocumentCompany, listDocumentCompanies, updateDocumentCompany } from '../../services/document-companies.mjs';
import { createDocumentStamp, deleteDocumentStamp, listDocumentStamps, updateDocumentStamp } from '../../services/document-stamps.mjs';
import { renderDocumentDraftPreview } from '../../services/document-preview.mjs';
import { listDocumentTemplates, updateDocumentTemplateMetadata } from '../../services/document-templates.mjs';

export default async function documentWorkspaceRoutes(app) {
  app.get('/document-templates', {
    onRequest: [requireAuth],
  }, async (request, reply) => {
    try {
      const templates = listDocumentTemplates({
        documentType: request.query?.document_type,
      });
      return { success: true, data: templates };
    } catch (error) {
      reply.code(error.statusCode || 400);
      return { success: false, message: error.message };
    }
  });

  app.put('/document-templates/:id', {
    onRequest: [requireAuth],
  }, async (request, reply) => {
    try {
      const template = updateDocumentTemplateMetadata(request.params.id, request.body || {});
      if (!template) {
        reply.code(404);
        return { success: false, message: '文档模板不存在' };
      }
      return { success: true, data: template };
    } catch (error) {
      reply.code(error.statusCode || 400);
      return { success: false, message: error.message };
    }
  });

  app.get('/document-drafts', {
    onRequest: [requireAuth],
  }, async (request, reply) => {
    try {
      const drafts = listDocumentDrafts({
        page: request.query?.page,
        limit: request.query?.limit,
        search: request.query?.search,
      });
      return { success: true, data: drafts.items, pagination: drafts.pagination };
    } catch (error) {
      reply.code(error.statusCode || 400);
      return { success: false, message: error.message };
    }
  });

  app.get('/document-companies', {
    onRequest: [requireAuth],
  }, async (request, reply) => {
    try {
      const companies = listDocumentCompanies({ search: request.query?.search });
      return { success: true, data: companies };
    } catch (error) {
      reply.code(error.statusCode || 400);
      return { success: false, message: error.message };
    }
  });

  app.post('/document-companies', {
    onRequest: [requireAuth],
  }, async (request, reply) => {
    try {
      const company = createDocumentCompany(request.body || {});
      return { success: true, data: company };
    } catch (error) {
      reply.code(error.statusCode || 400);
      return { success: false, message: error.message };
    }
  });

  app.put('/document-companies/:id', {
    onRequest: [requireAuth],
  }, async (request, reply) => {
    try {
      const company = updateDocumentCompany(request.params.id, request.body || {});
      if (!company) {
        reply.code(404);
        return { success: false, message: '公司不存在' };
      }
      return { success: true, data: company };
    } catch (error) {
      reply.code(error.statusCode || 400);
      return { success: false, message: error.message };
    }
  });

  app.delete('/document-companies/:id', {
    onRequest: [requireAuth],
  }, async (request, reply) => {
    try {
      const deleted = deleteDocumentCompany(request.params.id);
      if (!deleted) {
        reply.code(404);
        return { success: false, message: '公司不存在' };
      }
      return { success: true, data: { deleted: true, id: request.params.id } };
    } catch (error) {
      reply.code(error.statusCode || 400);
      return { success: false, message: error.message };
    }
  });

  app.get('/document-stamps', {
    onRequest: [requireAuth],
  }, async (request, reply) => {
    try {
      const stamps = listDocumentStamps();
      return { success: true, data: stamps };
    } catch (error) {
      reply.code(error.statusCode || 400);
      return { success: false, message: error.message };
    }
  });

  app.post('/document-stamps', {
    onRequest: [requireAuth],
  }, async (request, reply) => {
    try {
      const stamp = createDocumentStamp(request.body || {});
      return { success: true, data: stamp };
    } catch (error) {
      reply.code(error.statusCode || 400);
      return { success: false, message: error.message };
    }
  });

  app.put('/document-stamps/:id', {
    onRequest: [requireAuth],
  }, async (request, reply) => {
    try {
      const stamp = updateDocumentStamp(request.params.id, request.body || {});
      if (!stamp) {
        reply.code(404);
        return { success: false, message: '印章不存在' };
      }
      return { success: true, data: stamp };
    } catch (error) {
      reply.code(error.statusCode || 400);
      return { success: false, message: error.message };
    }
  });

  app.delete('/document-stamps/:id', {
    onRequest: [requireAuth],
  }, async (request, reply) => {
    try {
      const deleted = deleteDocumentStamp(request.params.id);
      if (!deleted) {
        reply.code(404);
        return { success: false, message: '印章不存在' };
      }
      return { success: true, data: { deleted: true, id: request.params.id } };
    } catch (error) {
      reply.code(error.statusCode || 400);
      return { success: false, message: error.message };
    }
  });

  app.post('/document-drafts', {
    onRequest: [requireAuth],
  }, async (request, reply) => {
    try {
      const draft = createDocumentDraft(request.body || {});
      return { success: true, data: draft };
    } catch (error) {
      reply.code(error.statusCode || 400);
      return { success: false, message: error.message };
    }
  });

  app.get('/document-drafts/:id', {
    onRequest: [requireAuth],
  }, async (request, reply) => {
    const draft = getDocumentDraftById(request.params.id);
    if (!draft) {
      reply.code(404);
      return { success: false, message: '文档草稿不存在' };
    }
    return { success: true, data: draft };
  });

  app.patch('/document-drafts/:id', {
    onRequest: [requireAuth],
  }, async (request, reply) => {
    const draft = updateDocumentDraft(
      request.params.id,
      pickDocumentDraftUpdates(request.body)
    );
    if (!draft) {
      reply.code(404);
      return { success: false, message: '文档草稿不存在' };
    }
    return { success: true, data: draft };
  });

  app.delete('/document-drafts/:id', {
    onRequest: [requireAuth],
  }, async (request, reply) => {
    const deleted = deleteDocumentDraft(request.params.id);
    if (!deleted) {
      reply.code(404);
      return { success: false, message: '文档草稿不存在' };
    }
    return { success: true, data: { deleted: true, id: request.params.id } };
  });

  app.get('/document-drafts/:id/preview', {
    onRequest: [requireAuth],
  }, async (request, reply) => {
    try {
      const preview = renderDocumentDraftPreview(request.params.id);
      reply.type('text/html; charset=utf-8');
      return preview.html;
    } catch (error) {
      reply.code(error.statusCode || 400);
      return `<!DOCTYPE html><html><body><pre>${escapeHtml(error.message || '预览失败')}</pre></body></html>`;
    }
  });

  app.post('/document-drafts/:id/messages', {
    onRequest: [requireAuth],
  }, async (request, reply) => {
    try {
      const result = await sendDocumentDraftMessage({
        draftId: request.params.id,
        message: request.body?.message,
        user: request.adminUser,
      });
      return { success: true, data: result };
    } catch (error) {
      reply.code(error.statusCode || 400);
      return { success: false, message: error.message };
    }
  });
}

export function pickDocumentDraftUpdates(body = {}) {
  const source = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const updates = {};
  for (const key of ['title', 'draft_payload', 'payload', 'replace_payload']) {
    if (Object.prototype.hasOwnProperty.call(source, key) && source[key] !== undefined) {
      updates[key] = source[key];
    }
  }
  return updates;
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
