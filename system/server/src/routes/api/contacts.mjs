import { requireAuth } from '../../middleware/auth.mjs';
import {
  listContacts,
  getContactById,
  createContact,
  updateContact,
  deleteContact
} from '../../services/contacts.mjs';

export default async function contactRoutes(app) {
  // 公开 API：联系人列表
  app.get('/contacts', async (request, reply) => {
    const { limit, offset } = request.query;

    const contacts = listContacts({
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined
    });

    return { success: true, data: contacts };
  });

  // 公开 API：联系人详情
  app.get('/contacts/:id', async (request, reply) => {
    const contact = getContactById(parseInt(request.params.id));

    if (!contact) {
      return reply.notFound('联系人不存在');
    }

    return { success: true, data: contact };
  });

  // 管理 API：创建联系人
  app.post('/contacts', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const contact = createContact(request.body);
    return { success: true, data: contact };
  });

  // 管理 API：更新联系人
  app.put('/contacts/:id', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const updated = updateContact(parseInt(request.params.id), request.body);

    if (!updated) {
      return reply.notFound('联系人不存在');
    }

    return { success: true, data: updated };
  });

  // 管理 API：删除联系人
  app.delete('/contacts/:id', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const deleted = deleteContact(parseInt(request.params.id));

    if (!deleted) {
      return reply.notFound('联系人不存在');
    }

    return { success: true, message: '联系人已删除' };
  });
}
