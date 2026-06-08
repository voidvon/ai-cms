import { requireAuth } from '../../middleware/auth.mjs';
import {
  listAdminsAdmin,
  getAdminById,
  createAdmin,
  updateAdmin,
  deleteAdmin,
  updateAdminPassword
} from '../../services/admins.mjs';

export default async function adminApiRoutes(app) {
  // 获取当前管理员信息
  app.get('/admin/me', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    return {
      success: true,
      data: request.adminUser
    };
  });

  // 管理员列表
  app.get('/admin/list', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const admins = listAdminsAdmin();
    return { success: true, data: admins };
  });

  // 获取管理员详情
  app.get('/admin/:id', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const admin = getAdminById(parseInt(request.params.id));

    if (!admin) {
      return reply.notFound('管理员不存在');
    }

    return { success: true, data: admin };
  });

  // 创建管理员
  app.post('/admin', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const admin = createAdmin(request.body);
    return { success: true, data: admin };
  });

  // 更新管理员
  app.put('/admin/:id', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const updated = updateAdmin(parseInt(request.params.id), request.body);

    if (!updated) {
      return reply.notFound('管理员不存在');
    }

    return { success: true, data: updated };
  });

  // 更新管理员密码
  app.put('/admin/:id/password', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const { newPassword } = request.body;

    if (!newPassword) {
      return reply.badRequest('缺少新密码');
    }

    const updated = updateAdminPassword(parseInt(request.params.id), newPassword);

    if (!updated) {
      return reply.notFound('管理员不存在');
    }

    return { success: true, message: '密码已更新' };
  });

  // 删除管理员
  app.delete('/admin/:id', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const deleted = deleteAdmin(parseInt(request.params.id));

    if (!deleted) {
      return reply.notFound('管理员不存在');
    }

    return { success: true, message: '管理员已删除' };
  });
}
