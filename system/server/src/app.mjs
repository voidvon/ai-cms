import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyMultipart from '@fastify/multipart';
import fastifyCors from '@fastify/cors';
import fastifySensible from '@fastify/sensible';
import fastifyFormbody from '@fastify/formbody';
import { HOST, PORT } from './config.mjs';
import { getDb } from './db.mjs';

// 确保数据库初始化
getDb();

export async function createApp(options = {}) {
  const app = Fastify({
    logger: options.logger ?? {
      level: process.env.LOG_LEVEL || 'info',
      transport: process.env.NODE_ENV === 'development' ? {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname'
        }
      } : undefined
    },
    trustProxy: true,
    ...options
  });

  // 注册插件
  await app.register(fastifySensible);
  await app.register(fastifyCookie, {
    secret: process.env.COOKIE_SECRET || 'spiraxsarcocn-server-secret-key-change-in-production',
    parseOptions: {}
  });

  await app.register(fastifyFormbody);

  await app.register(fastifyMultipart, {
    limits: {
      fileSize: (process.env.UPLOAD_MAX_SIZE_KB || 400) * 1024,
      files: 1
    }
  });

  await app.register(fastifyCors, {
    origin: true,
    credentials: true
  });

  // 自定义装饰器：会话管理
  app.decorateRequest('session', null);
  app.decorateRequest('adminUser', null);

  // 全局钩子：加载会话信息
  app.addHook('onRequest', async (request, reply) => {
    const { authHook } = await import('./middleware/auth.mjs');
    await authHook(request, reply);
  });

  // 注册路由模块
  await app.register(import('./routes/auth.mjs'), { prefix: '/admin' });
  await app.register(import('./routes/api/products.mjs'), { prefix: '/api' });
  await app.register(import('./routes/api/product-categories.mjs'), { prefix: '/api' });
  await app.register(import('./routes/api/product-photos.mjs'), { prefix: '/api' });
  await app.register(import('./routes/api/news-categories.mjs'), { prefix: '/api' });
  await app.register(import('./routes/api/news.mjs'), { prefix: '/api' });
  await app.register(import('./routes/api/corporation-categories.mjs'), { prefix: '/api' });
  await app.register(import('./routes/api/jobs.mjs'), { prefix: '/api' });
  await app.register(import('./routes/api/messages.mjs'), { prefix: '/api' });
  await app.register(import('./routes/api/contacts.mjs'), { prefix: '/api' });
  await app.register(import('./routes/api/custom-labels.mjs'), { prefix: '/api' });
  await app.register(import('./routes/api/meta-types.mjs'), { prefix: '/api' });
  await app.register(import('./routes/api/template-variants.mjs'), { prefix: '/api' });
  await app.register(import('./routes/api/uploads.mjs'), { prefix: '/api' });
  await app.register(import('./routes/api/admin.mjs'), { prefix: '/api' });
  await app.register(import('./routes/api/site-config.mjs'), { prefix: '/api' });
  await app.register(import('./routes/admin/static-gen.mjs'), { prefix: '/admin' });
  await app.register(import('./routes/legacy.mjs'));

  // 静态文件服务和 404 处理（最后注册）
  // 使用自定义静态文件处理器以支持大小写不敏感的路径匹配
  app.setNotFoundHandler(async (request, reply) => {
    // 尝试提供静态文件
    const { serveStatic } = await import('./static-file-handler.mjs');
    const handled = await serveStatic(request, reply);

    if (!handled) {
      reply.type('text/html; charset=utf-8');
      reply.code(404);
      reply.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>404 - 页面未找到</title>
</head>
<body>
  <h1>404</h1>
  <p>未找到请求资源。</p>
</body>
</html>`);
    }
  });

  // 全局错误处理
  app.setErrorHandler((error, request, reply) => {
    app.log.error(error);

    if (error.validation) {
      return reply.code(400).send({
        error: 'Validation Error',
        message: error.message,
        details: error.validation
      });
    }

    if (error.statusCode) {
      return reply.code(error.statusCode).send({
        error: error.name,
        message: error.message
      });
    }

    return reply.code(500).send({
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'production' ? 'An error occurred' : error.message
    });
  });

  return app;
}

export async function startServer() {
  const app = await createApp();

  try {
    await app.listen({ port: PORT, host: HOST });
    console.log(`🚀 Server listening on http://${HOST}:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}
