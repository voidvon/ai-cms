import { getAdminSession, deleteAdminSession } from '../services/sessions.mjs';
import { hasAdminPermission } from '../services/admin-permissions.mjs';
import { hasAiPermissions } from '../services/ai/core/permissions.mjs';

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
        permission_flags: session.permission_flags,
        group_id: session.group_id,
        group_code: session.group_code,
        group_name: session.group_name,
        hasPermissions(requiredPermissions) {
          return hasAiPermissions(this, requiredPermissions);
        }
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

export function requirePermission(flag) {
  return async function requirePermissionHandler(request, reply) {
    if (!request.session || !request.adminUser) {
      reply.code(401).send({
        error: 'Unauthorized',
        message: '需要登录'
      });
      return;
    }

    if (!hasAdminPermission(request.adminUser.permission_flags, flag)) {
      reply.code(403).send({
        error: 'Forbidden',
        message: '没有对应权限'
      });
    }
  };
}

/**
 * 获取客户端 IP
 */
export function getClientIp(request) {
  const cfConnectingIp = normalizeSingleIpHeader(request.headers['cf-connecting-ip']);
  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  const realIp = normalizeSingleIpHeader(request.headers['x-real-ip']);
  if (realIp) {
    return realIp;
  }

  const forwardedFor = normalizeForwardedForHeader(request.headers['x-forwarded-for']);
  if (forwardedFor) {
    return forwardedFor;
  }

  return request.ip ||
         request.socket.remoteAddress ||
         '127.0.0.1';
}

function normalizeSingleIpHeader(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

function normalizeForwardedForHeader(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .find(Boolean) || '';
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
