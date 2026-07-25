import { requireAuth, requirePermission, requireSameOrigin } from '../../middleware/auth.mjs';
import { clearAccessLogs, getAccessLogDashboardSummary, listAccessLogs } from '../../services/access-logs.mjs';
import { listAdminLoginLogs } from '../../services/admin-login-logs.mjs';
import {
  createAdminGroup,
  deleteAdminGroup,
  listAdminGroups,
  updateAdminGroup
} from '../../services/admin-groups.mjs';
import { hasAdminPermission, listAdminPermissions } from '../../services/admin-permissions.mjs';
import {
  listAdminsAdmin,
  getAdminById,
  createAdmin,
  updateAdmin,
  deleteAdmin,
  updateAdminPassword
} from '../../services/admins.mjs';
import {
  getSystemVersionStatus,
  installLatestSystemRelease,
  requestSystemRestart
} from '../../services/system-updates.mjs';

export default async function adminApiRoutes(app) {
  const requireAdminManage = requirePermission('10');
  const requireSystemUpdate = requirePermission('15');

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
    onRequest: [requireAuth, requireAdminManage]
  }, async (request, reply) => {
    const admins = listAdminsAdmin();
    return { success: true, data: admins };
  });

  app.get('/admin/groups', {
    onRequest: [requireAuth, requireAdminManage]
  }, async () => {
    const groups = listAdminGroups();
    return { success: true, data: groups };
  });

  app.get('/admin/permissions', {
    onRequest: [requireAuth, requireAdminManage]
  }, async () => {
    return { success: true, data: listAdminPermissions() };
  });

  app.post('/admin/groups', {
    onRequest: [requireAuth, requireAdminManage]
  }, async (request, reply) => {
    try {
      const group = createAdminGroup(request.body);
      return { success: true, data: group };
    } catch (error) {
      return reply.badRequest(error.message || '用户组创建失败');
    }
  });

  app.put('/admin/groups/:id', {
    onRequest: [requireAuth, requireAdminManage]
  }, async (request, reply) => {
    try {
      const group = updateAdminGroup(parseInt(request.params.id), request.body);
      if (!group) {
        return reply.notFound('用户组不存在');
      }
      return { success: true, data: group };
    } catch (error) {
      return reply.badRequest(error.message || '用户组更新失败');
    }
  });

  app.delete('/admin/groups/:id', {
    onRequest: [requireAuth, requireAdminManage]
  }, async (request, reply) => {
    try {
      const deleted = deleteAdminGroup(parseInt(request.params.id));
      if (!deleted) {
        return reply.notFound('用户组不存在');
      }
      return { success: true, message: '用户组已删除' };
    } catch (error) {
      return reply.badRequest(error.message || '用户组删除失败');
    }
  });

  app.get('/admin/access-logs', {
    onRequest: [requireAuth, requireAdminManage]
  }, async (request, reply) => {
    const result = listAccessLogs({
      page: request.query?.page,
      limit: request.query?.limit,
      path: request.query?.path,
      ip: request.query?.ip,
      userAgentKind: request.query?.userAgentKind,
      refererMode: request.query?.refererMode,
      refererOperator: request.query?.refererOperator,
      refererValue: request.query?.refererValue,
      refererFilters: request.query?.refererFilters,
      statusMode: request.query?.statusMode,
      statusOperator: request.query?.statusOperator
    });

    return { success: true, data: result };
  });

  app.get('/admin/access-logs/summary', {
    onRequest: [requireAuth, requireAdminManage]
  }, async () => {
    const result = getAccessLogDashboardSummary();
    return { success: true, data: result };
  });

  app.get('/admin/login-logs', {
    onRequest: [requireAuth, requireAdminManage]
  }, async (request) => {
    const result = listAdminLoginLogs({
      page: request.query?.page,
      limit: request.query?.limit,
      username: request.query?.username,
      ip: request.query?.ip,
      status: request.query?.status
    });

    return { success: true, data: result };
  });

  app.delete('/admin/access-logs', {
    onRequest: [requireAuth, requireAdminManage]
  }, async (request) => {
    const deletedCount = clearAccessLogs({
      path: request.query?.path,
      ip: request.query?.ip,
      userAgentKind: request.query?.userAgentKind,
      refererMode: request.query?.refererMode,
      refererOperator: request.query?.refererOperator,
      refererValue: request.query?.refererValue,
      refererFilters: request.query?.refererFilters,
      statusMode: request.query?.statusMode,
      statusOperator: request.query?.statusOperator
    });
    return {
      success: true,
      data: { deleted_count: deletedCount },
      message: `已清空当前筛选条件下的 ${deletedCount} 条访问记录`
    };
  });

  app.get('/admin/system-version', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    reply.header('Cache-Control', 'private, no-store, max-age=0');
    const data = await getSystemVersionStatus({
      force: request.query?.refresh === '1'
    });
    return {
      success: true,
      data: {
        ...data,
        can_update: data.update_supported
          && hasAdminPermission(request.adminUser.permission_flags, '15'),
        can_restart: hasAdminPermission(request.adminUser.permission_flags, '15')
      }
    };
  });

  app.post('/admin/system-version/update', {
    onRequest: [requireAuth, requireSameOrigin, requireSystemUpdate]
  }, async (request, reply) => {
    try {
      const data = await installLatestSystemRelease();
      return { success: true, data, message: data.message };
    } catch (error) {
      if (error.code === 'UPDATE_IN_PROGRESS') {
        return reply.code(409).send({ success: false, message: error.message });
      }
      request.log.error({ err: error }, 'system update failed');
      return reply.code(422).send({
        success: false,
        error_code: error.code || 'SYSTEM_UPDATE_FAILED',
        message: error.message || '系统更新失败'
      });
    }
  });

  app.post('/admin/system-version/restart', {
    onRequest: [requireAuth, requireSameOrigin, requireSystemUpdate]
  }, async (request, reply) => {
    try {
      const data = await requestSystemRestart();
      return reply.code(202).send({ success: true, data, message: data.message });
    } catch (error) {
      if (error.code === 'UPDATE_IN_PROGRESS' || error.code === 'RESTART_IN_PROGRESS') {
        return reply.code(409).send({ success: false, message: error.message });
      }
      request.log.error({ err: error }, 'system restart failed');
      return reply.code(500).send({
        success: false,
        error_code: error.code || 'SYSTEM_RESTART_FAILED',
        message: error.message || '系统重启失败'
      });
    }
  });

  // 获取管理员详情
  app.get('/admin/:id', {
    onRequest: [requireAuth, requireAdminManage]
  }, async (request, reply) => {
    const admin = getAdminById(parseInt(request.params.id));

    if (!admin) {
      return reply.notFound('管理员不存在');
    }

    return { success: true, data: admin };
  });

  // 创建管理员
  app.post('/admin', {
    onRequest: [requireAuth, requireAdminManage]
  }, async (request, reply) => {
    const admin = createAdmin(request.body);
    return { success: true, data: admin };
  });

  // 更新管理员
  app.put('/admin/:id', {
    onRequest: [requireAuth, requireAdminManage]
  }, async (request, reply) => {
    const updated = updateAdmin(parseInt(request.params.id), request.body);

    if (!updated) {
      return reply.notFound('管理员不存在');
    }

    return { success: true, data: updated };
  });

  // 更新管理员密码
  app.put('/admin/:id/password', {
    onRequest: [requireAuth, requireAdminManage]
  }, async (request, reply) => {
    const newPassword = request.body?.newPassword ?? request.body?.password;

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
    onRequest: [requireAuth, requireAdminManage]
  }, async (request, reply) => {
    const deleted = deleteAdmin(parseInt(request.params.id));

    if (!deleted) {
      return reply.notFound('管理员不存在');
    }

    return { success: true, message: '管理员已删除' };
  });
}
