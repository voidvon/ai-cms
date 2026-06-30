import { requireAuth } from '../../middleware/auth.mjs';
import { sendDocumentDraftMessage } from '../../services/ai/document-chat.mjs';
import { createDocumentDraft, deleteDocumentDraft, getDocumentDraftById, listDocumentDrafts, updateDocumentDraft } from '../../services/document-drafts.mjs';
import { renderDocumentDraftPreview } from '../../services/document-preview.mjs';
import { listDocumentTemplates } from '../../services/document-templates.mjs';

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

  app.get('/document-drafts', {
    onRequest: [requireAuth],
  }, async (request, reply) => {
    try {
      const drafts = listDocumentDrafts({ limit: request.query?.limit });
      return { success: true, data: drafts };
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
    const draft = updateDocumentDraft(request.params.id, {
      title: request.body?.title,
    });
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
      });
      return { success: true, data: result };
    } catch (error) {
      reply.code(error.statusCode || 400);
      return { success: false, message: error.message };
    }
  });
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
