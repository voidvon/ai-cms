import { authenticateAdmin } from '../services/admins.mjs';
import { createAdminSession, deleteAdminSession } from '../services/sessions.mjs';
import { getClientIp, createAdminCookies, clearAdminCookies } from '../middleware/auth.mjs';

export default async function authRoutes(app) {
  // 登录页面由 React SPA 接管
  app.get('/login', async (request, reply) => {
    if (request.session) {
      return reply.redirect('/admin/');
    }

    const { serveAdminApp } = await import('../static-file-handler.mjs');
    const handled = await serveAdminApp(request, reply);
    if (!handled) {
      return reply.code(503).type('text/plain; charset=utf-8').send('后台前端尚未构建，请先执行 system/admin 构建。');
    }
  });

  // 兼容旧表单登录
  app.post('/login', async (request, reply) => {
    const { username, password } = request.body;

    const admin = authenticateAdmin(username, password, getClientIp(request));

    if (!admin) {
      return reply.redirect('/admin/login');
    }

    const session = createAdminSession(admin.id);
    const cookies = createAdminCookies(session.token, admin);

    for (const cookie of cookies) {
      reply.setCookie(cookie.name, cookie.value, cookie.options);
    }

    return reply.redirect('/admin/');
  });

  // 登出
  app.get('/logout', async (request, reply) => {
    const token = request.cookies.adminToken;
    if (token) {
      deleteAdminSession(token);
    }

    const clearCookies = clearAdminCookies();
    for (const cookie of clearCookies) {
      reply.setCookie(cookie.name, cookie.value, cookie.options);
    }

    return reply.redirect('/admin/login');
  });

  // API 登录
  app.post('/api/login', async (request, reply) => {
    const { username, password } = request.body;

    const admin = authenticateAdmin(username, password, getClientIp(request));

    if (!admin) {
      return reply.code(401).send({
        success: false,
        message: '用户名或密码不正确'
      });
    }

    const session = createAdminSession(admin.id);
    const cookies = createAdminCookies(session.token, admin);

    for (const cookie of cookies) {
      reply.setCookie(cookie.name, cookie.value, cookie.options);
    }

    return {
      success: true,
      token: session.token,
      admin: {
        id: admin.id,
        username: admin.username
      }
    };
  });

  // API 登出
  app.post('/api/logout', async (request, reply) => {
    const token = request.cookies.adminToken ||
                  request.headers.authorization?.replace(/^Bearer\s+/i, '');

    if (token) {
      deleteAdminSession(token);
    }

    const clearCookies = clearAdminCookies();
    for (const cookie of clearCookies) {
      reply.setCookie(cookie.name, cookie.value, cookie.options);
    }

    return { success: true, message: '已登出' };
  });
}
