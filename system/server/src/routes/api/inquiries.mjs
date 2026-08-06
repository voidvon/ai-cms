import { requireAuth, requireSameOrigin } from '../../middleware/auth.mjs';
import {
  deleteInquiry,
  getInquiryById,
  getInquirySettings,
  listInquiries,
  testInquiryFeishuWebhook,
  updateInquirySettings,
  updateInquiryManagement
} from '../../services/inquiries.mjs';

export default async function inquiryRoutes(app) {
  app.get('/inquiry-settings', { onRequest: [requireAuth] }, async () => ({
    success: true,
    data: getInquirySettings()
  }));

  app.put('/inquiry-settings', {
    onRequest: [requireAuth, requireSameOrigin]
  }, async (request, reply) => {
    try {
      return { success: true, data: updateInquirySettings(request.body || {}) };
    } catch (error) {
      reply.code(400);
      return { success: false, message: error.message };
    }
  });

  app.post('/inquiry-settings/test', {
    onRequest: [requireAuth, requireSameOrigin]
  }, async (request, reply) => {
    try {
      await testInquiryFeishuWebhook(request.body?.feishu_webhook_url);
      return { success: true };
    } catch (error) {
      reply.code(400);
      return { success: false, message: error.message };
    }
  });

  app.get('/inquiries', { onRequest: [requireAuth] }, async (request, reply) => {
    try {
      const result = listInquiries({
        page: request.query?.page,
        limit: request.query?.limit,
        keyword: request.query?.keyword,
        status: request.query?.status,
        inquiryType: request.query?.inquiry_type ?? request.query?.inquiryType
      });
      return { success: true, data: result };
    } catch (error) {
      reply.code(400);
      return { success: false, message: error.message };
    }
  });

  app.get('/inquiries/:id', { onRequest: [requireAuth] }, async (request, reply) => {
    const inquiry = getInquiryById(request.params.id);
    if (!inquiry) {
      reply.code(404);
      return { success: false, message: '询价不存在' };
    }
    return { success: true, data: inquiry };
  });

  app.put('/inquiries/:id', {
    onRequest: [requireAuth, requireSameOrigin]
  }, async (request, reply) => {
    try {
      const inquiry = updateInquiryManagement(request.params.id, request.body || {});
      if (!inquiry) {
        reply.code(404);
        return { success: false, message: '询价不存在' };
      }
      return { success: true, data: inquiry };
    } catch (error) {
      reply.code(400);
      return { success: false, message: error.message };
    }
  });

  app.delete('/inquiries/:id', {
    onRequest: [requireAuth, requireSameOrigin]
  }, async (request, reply) => {
    if (!deleteInquiry(request.params.id)) {
      reply.code(404);
      return { success: false, message: '询价不存在' };
    }
    return { success: true };
  });
}
