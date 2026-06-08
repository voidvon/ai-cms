import { authenticateAdmin } from '../services/admins.mjs';
import { createAdminSession, deleteAdminSession, getAdminSession } from '../services/sessions.mjs';
import { getClientIp, createAdminCookies, clearAdminCookies } from '../middleware/auth.mjs';

export default async function authRoutes(app) {
  // 登录页面
  app.get('/login', async (request, reply) => {
    const token = request.cookies.adminToken;
    if (token && getAdminSession(token)) {
      return reply.redirect('/admin/dashboard');
    }

    return reply.type('text/html; charset=utf-8').send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>管理员登录</title>
  <style>
    body { font-family: Arial, sans-serif; background: #f5f5f5; padding: 50px; }
    .login-box { max-width: 400px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    h1 { text-align: center; color: #333; }
    input { width: 100%; padding: 10px; margin: 10px 0; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; }
    button { width: 100%; padding: 12px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; }
    button:hover { background: #0056b3; }
    .error { color: red; text-align: center; margin-top: 10px; }
  </style>
</head>
<body>
  <div class="login-box">
    <h1>管理员登录</h1>
    <form method="POST" action="/admin/login">
      <input type="text" name="username" placeholder="用户名" required>
      <input type="password" name="password" placeholder="密码" required>
      <button type="submit">登录</button>
    </form>
    <div class="error" id="error"></div>
  </div>
</body>
</html>`);
  });

  // 登录处理
  app.post('/login', async (request, reply) => {
    const { username, password } = request.body;

    const admin = authenticateAdmin(username, password, getClientIp(request));

    if (!admin) {
      return reply.type('text/html; charset=utf-8').send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>登录失败</title>
  <style>
    body { font-family: Arial, sans-serif; background: #f5f5f5; padding: 50px; text-align: center; }
    .message-box { max-width: 400px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; }
    h1 { color: #d9534f; }
    a { display: inline-block; margin-top: 20px; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 4px; }
  </style>
</head>
<body>
  <div class="message-box">
    <h1>登录失败</h1>
    <p>用户名或密码不正确</p>
    <a href="/admin/login">返回登录</a>
  </div>
</body>
</html>`);
    }

    const session = createAdminSession(admin.id);
    const cookies = createAdminCookies(session.token, admin);

    for (const cookie of cookies) {
      reply.setCookie(cookie.name, cookie.value, cookie.options);
    }

    return reply.redirect('/admin/dashboard');
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

    return { success: true, message: '已登出' };
  });
}
