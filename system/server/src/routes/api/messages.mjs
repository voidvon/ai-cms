import { requireAuth } from '../../middleware/auth.mjs';
import {
  listMessages,
  listMessagesAdmin,
  getMessageById,
  createMessage,
  updateMessage,
  deleteMessage
} from '../../services/messages.mjs';

export default async function messageRoutes(app) {
  // 管理 API：留言列表（分页）- 必须在 :id 路由之前
  app.get('/messages/admin', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const { page, limit } = request.query;

    const result = listMessagesAdmin({
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined
    });

    return { success: true, ...result };
  });

  // 公开 API：提交留言
  app.post('/messages', async (request, reply) => {
    const message = createMessage(request.body);
    return { success: true, data: message };
  });

  // 管理 API：留言详情
  app.get('/messages/:id', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const message = getMessageById(parseInt(request.params.id));

    if (!message) {
      return reply.notFound('留言不存在');
    }

    return { success: true, data: message };
  });

  // 管理 API：更新留言
  app.put('/messages/:id', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const updated = updateMessage(parseInt(request.params.id), request.body);

    if (!updated) {
      return reply.notFound('留言不存在');
    }

    return { success: true, data: updated };
  });

  // 管理 API：删除留言
  app.delete('/messages/:id', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const deleted = deleteMessage(parseInt(request.params.id));

    if (!deleted) {
      return reply.notFound('留言不存在');
    }

    return { success: true, message: '留言已删除' };
  });
}
