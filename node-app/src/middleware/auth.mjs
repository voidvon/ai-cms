import { getAdminSession, deleteAdminSession } from '../services/sessions.mjs';

/**
 * Fastify 钩子：从 cookie 中提取 session token 并加载会话信息
 */
export async function authHook(request, reply) {
  const token = request.cookies.adminToken ||
                request.headers.authorization?.replace(/^Bearer\s+/i, '');

  if (token) {
    const session = getAdminSession(token);
    if (session) {
      request.session = session;
      // getAdminSession 返回的对象包含 admin_id, username, permission_flags
      // 构造一个 adminUser 对象
      request.adminUser = {
        id: session.admin_id,
        username: session.username,
        permission_flags: session.permission_flags
      };
    }
  }
}

/**
 * Fastify 装饰器：要求必须有管理员会话
 */
export async function requireAuth(request, reply) {
  if (!request.session || !request.adminUser) {
    reply.code(401).send({
      error: 'Unauthorized',
      message: '需要登录'
    });
    return;
  }
}

/**
 * 获取客户端 IP
 */
export function getClientIp(request) {
  return request.ip ||
         request.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         request.socket.remoteAddress ||
         '127.0.0.1';
}

/**
 * 创建管理员 cookie（兼容旧系统）
 */
export function createAdminCookies(token, admin) {
  return [
    {
      name: 'adminToken',
      value: token,
      options: {
        httpOnly: true,
        path: '/',
        maxAge: 24 * 3600 // 24 hours
      }
    },
    {
      name: 'adminName',
      value: encodeURIComponent(admin.username),
      options: {
        path: '/',
        maxAge: 24 * 3600
      }
    }
  ];
}

/**
 * 清除管理员 cookie
 */
export function clearAdminCookies() {
  return [
    { name: 'adminToken', value: '', options: { httpOnly: true, path: '/', maxAge: 0 } },
    { name: 'adminName', value: '', options: { path: '/', maxAge: 0 } }
  ];
}
