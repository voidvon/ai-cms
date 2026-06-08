import { requireAuth } from '../../middleware/auth.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { SERVER_ROOT } from '../../config.mjs';

export default async function adminIndexRoutes(app) {
  // 管理后台首页（框架页）
  app.get('/dashboard', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const html = await fs.promises.readFile(
      path.join(SERVER_ROOT, 'views/layout.html'),
      'utf-8'
    );
    return reply.type('text/html; charset=utf-8').send(html);
  });

  // 欢迎页（框架内容页）
  app.get('/welcome', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const html = await fs.promises.readFile(
      path.join(SERVER_ROOT, 'views/welcome.html'),
      'utf-8'
    );
    return reply.type('text/html; charset=utf-8').send(html);
  });

  // 产品管理页面
  app.get('/products', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const html = await fs.promises.readFile(
      path.join(SERVER_ROOT, 'views/admin/products-list.html'),
      'utf-8'
    );
    return reply.type('text/html; charset=utf-8').send(html);
  });

  // 新闻管理页面
  app.get('/news', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const html = await fs.promises.readFile(
      path.join(SERVER_ROOT, 'views/admin/news-list.html'),
      'utf-8'
    );
    return reply.type('text/html; charset=utf-8').send(html);
  });

  // 招聘管理页面
  app.get('/jobs', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const html = await fs.promises.readFile(
      path.join(SERVER_ROOT, 'views/admin/jobs-list.html'),
      'utf-8'
    );
    return reply.type('text/html; charset=utf-8').send(html);
  });

  // 留言管理页面
  app.get('/messages', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const html = await fs.promises.readFile(
      path.join(SERVER_ROOT, 'views/admin/messages-list.html'),
      'utf-8'
    );
    return reply.type('text/html; charset=utf-8').send(html);
  });

  // 联系方式管理页面
  app.get('/contacts', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const html = await fs.promises.readFile(
      path.join(SERVER_ROOT, 'views/admin/contacts-list.html'),
      'utf-8'
    );
    return reply.type('text/html; charset=utf-8').send(html);
  });

  // 站点配置页面
  app.get('/config', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const html = await fs.promises.readFile(
      path.join(SERVER_ROOT, 'views/admin/config.html'),
      'utf-8'
    );
    return reply.type('text/html; charset=utf-8').send(html);
  });

  // 管理员管理页面
  app.get('/admins', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const html = await fs.promises.readFile(
      path.join(SERVER_ROOT, 'views/admin/admins-list.html'),
      'utf-8'
    );
    return reply.type('text/html; charset=utf-8').send(html);
  });

  // 产品添加/编辑页面
  app.get('/products/:action', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const html = await fs.promises.readFile(
      path.join(SERVER_ROOT, 'views/admin/products-form.html'),
      'utf-8'
    );
    return reply.type('text/html; charset=utf-8').send(html);
  });

  // 新闻添加/编辑页面
  app.get('/news/:action', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const html = await fs.promises.readFile(
      path.join(SERVER_ROOT, 'views/admin/news-form.html'),
      'utf-8'
    );
    return reply.type('text/html; charset=utf-8').send(html);
  });

  // 招聘添加/编辑页面
  app.get('/jobs/:action', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const html = await fs.promises.readFile(
      path.join(SERVER_ROOT, 'views/admin/jobs-form.html'),
      'utf-8'
    );
    return reply.type('text/html; charset=utf-8').send(html);
  });

  // 联系方式添加/编辑页面
  app.get('/contacts/:action', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const html = await fs.promises.readFile(
      path.join(SERVER_ROOT, 'views/admin/contacts-form.html'),
      'utf-8'
    );
    return reply.type('text/html; charset=utf-8').send(html);
  });

  // 管理员添加/编辑页面
  app.get('/admins/:action', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const { action } = request.params;
    const filename = action === 'password' ? 'admins-password.html' : 'admins-form.html';
    const html = await fs.promises.readFile(
      path.join(SERVER_ROOT, `views/admin/${filename}`),
      'utf-8'
    );
    return reply.type('text/html; charset=utf-8').send(html);
  });

  // 留言详情页面
  app.get('/messages/view', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const html = await fs.promises.readFile(
      path.join(SERVER_ROOT, 'views/admin/messages-detail.html'),
      'utf-8'
    );
    return reply.type('text/html; charset=utf-8').send(html);
  });
}
