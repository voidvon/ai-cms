import Fastify from 'fastify';
import { createRequire } from 'node:module';
import fastifyCookie from '@fastify/cookie';
import fastifyMultipart from '@fastify/multipart';
import fastifyCors from '@fastify/cors';
import fastifySensible from '@fastify/sensible';
import fastifyFormbody from '@fastify/formbody';
import { ATTACHMENT_UPLOAD_MAX_SIZE_KB, HOST, PORT } from './config.mjs';
import { createAssetsListenerManager } from './assets-listener-manager.mjs';
import { getDb } from './db.mjs';
import { getClientIp } from './middleware/auth.mjs';
import { ensureAccessLogsSchema, recordAccessLog, shouldRecordPageAccess } from './services/access-logs.mjs';
import { ensureAdminGroupSchema } from './services/admin-groups.mjs';
import { applySecurityHeaders } from './services/security-headers.mjs';
import { createSiteListenerManager } from './site-listener-manager.mjs';
import { withPortConflictDetails } from './utils/port-diagnostics.mjs';
import { initializeAiService } from './services/ai/initialize.mjs';

const require = createRequire(import.meta.url);

getDb();
ensureAdminGroupSchema();
ensureAccessLogsSchema();

// 初始化 AI 服务
try {
  initializeAiService({
    useDatabase: true,
    verbose: process.env.NODE_ENV === 'development',
  });
} catch (error) {
  console.warn('Failed to initialize AI service:', error.message);
}

export async function createApp(options = {}) {
  const publicSite = normalizePublicSiteOptions(options.publicSite);
  const app = Fastify({
    logger: options.logger ?? buildLoggerOptions(),
    trustProxy: true,
    ...options
  });

  app.decorate('publicSite', publicSite);
  app.decorate('siteListenerManager', options.siteListenerManager || null);
  app.decorate('assetsListenerManager', options.assetsListenerManager || null);
  app.decorateRequest('session', null);
  app.decorateRequest('adminUser', null);

  await registerCommonPlugins(app);
  await registerCommonHooks(app);
  await registerCommonRoutes(app, { publicSite });
  registerCommonErrorHandling(app, { publicSite });

  return app;
}

export async function startServer() {
  const siteListenerManager = createSiteListenerManager({ logger: console });
  const assetsListenerManager = createAssetsListenerManager({ logger: console });
  const app = await createApp({ siteListenerManager, assetsListenerManager });

  try {
    await app.listen({ port: PORT, host: HOST });
    await assetsListenerManager.sync();
    await siteListenerManager.sync();
    console.log(`🚀 Server listening on http://${HOST}:${PORT}`);
  } catch (err) {
    const enrichedError = withPortConflictDetails(err, PORT);
    app.log.error(enrichedError);
    await assetsListenerManager.close();
    await siteListenerManager.closeAll();
    process.exit(1);
  }

  const shutdown = async () => {
    await assetsListenerManager.close();
    await siteListenerManager.closeAll();
    await app.close();
    process.exit(0);
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

async function registerCommonPlugins(app) {
  await app.register(fastifySensible);
  await app.register(fastifyCookie, {
    secret: process.env.COOKIE_SECRET || 'ai-cms-server-secret-key-change-in-production',
    parseOptions: {}
  });

  await app.register(fastifyFormbody);

  await app.register(fastifyMultipart, {
    limits: {
      fileSize: ATTACHMENT_UPLOAD_MAX_SIZE_KB * 1024,
      files: 1
    }
  });

  await app.register(fastifyCors, {
    origin: true,
    credentials: true
  });
}

async function registerCommonHooks(app) {
  app.addHook('onResponse', async (request, reply) => {
    if (!shouldRecordPageAccess(request, reply)) {
      return;
    }

    try {
      recordAccessLog({
        pagePath: request.raw?.url || request.url,
        pageUrl: buildRequestPageUrl(request),
        clientIp: getClientIp(request),
        method: request.method,
        statusCode: reply.statusCode,
        referer: request.headers.referer || request.headers.referrer || '',
        userAgent: request.headers['user-agent'] || ''
      });
    } catch (error) {
      request.log.warn({ err: error }, 'failed to record access log');
    }
  });

  app.addHook('onSend', async (request, reply, payload) => {
    applySecurityHeaders(reply);
    return payload;
  });

  app.addHook('onRequest', async (request, reply) => {
    const { authHook } = await import('./middleware/auth.mjs');
    await authHook(request, reply);
  });
}

function buildRequestPageUrl(request) {
  const rawUrl = String(request?.raw?.url || request?.url || '').trim();
  if (!rawUrl) {
    return '';
  }

  const host = normalizeForwardedHeaderValue(request?.headers?.['x-forwarded-host'])
    || String(request?.headers?.host || '').trim();
  if (!host) {
    return rawUrl;
  }

  const protocol = String(request?.protocol || '').trim() || 'http';
  return `${protocol}://${host}${rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`}`;
}

function normalizeForwardedHeaderValue(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .find(Boolean) || '';
}

async function registerCommonRoutes(app, { publicSite }) {
  if (!publicSite) {
    await app.register(import('./routes/auth.mjs'), { prefix: '/admin' });
    await app.register(import('./routes/api/content-items.mjs'), { prefix: '/api' });
    await app.register(import('./routes/api/column-nodes.mjs'), { prefix: '/api' });
    await app.register(import('./routes/api/template-variants.mjs'), { prefix: '/api' });
    await app.register(import('./routes/api/templates.mjs'), { prefix: '/api' });
    await app.register(import('./routes/api/content-models.mjs'), { prefix: '/api' });
    await app.register(import('./routes/api/content-model-fields.mjs'), { prefix: '/api' });
    await app.register(import('./routes/api/columns.mjs'), { prefix: '/api' });
    await app.register(import('./routes/api/topic-profiles.mjs'), { prefix: '/api' });
    await app.register(import('./routes/api/languages.mjs'), { prefix: '/api' });
    await app.register(import('./routes/api/media.mjs'), { prefix: '/api' });
    await app.register(import('./routes/api/admin.mjs'), { prefix: '/api' });
    await app.register(import('./routes/api/bulk-replace.mjs'), { prefix: '/api' });
    await app.register(import('./routes/api/ai.mjs'), { prefix: '/api' });
    await app.register(import('./routes/api/document-workspaces.mjs'), { prefix: '/api' });
    await app.register(import('./routes/api/document-agent.mjs'), { prefix: '/api' });
    await app.register(import('./routes/admin/static-gen.mjs'), { prefix: '/admin' });
  }

  await app.register(import('./routes/api/search.mjs'), { prefix: '/api' });
  await app.register(import('./routes/api/site-config.mjs'), { prefix: '/api' });
  await app.register(import('./routes/api/sitemap.mjs'), { prefix: '/api' });
  await app.register(import('./routes/api/llms.mjs'), { prefix: '/api' });
}

function registerCommonErrorHandling(app, { publicSite }) {
  app.setNotFoundHandler(async (request, reply) => {
    const { serveNotFoundPage, serveStatic } = await import('./static-file-handler.mjs');
    const handled = await serveStatic(request, reply, publicSite || undefined);

    if (!handled) {
      const notFoundHandled = await serveNotFoundPage(request, reply, publicSite || undefined);
      if (notFoundHandled) {
        return;
      }
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
}

function normalizePublicSiteOptions(publicSite) {
  if (!publicSite) {
    return null;
  }

  const contentRoot = String(publicSite.contentRoot || '').trim();
  if (!contentRoot) {
    throw new Error('publicSite.contentRoot 不能为空');
  }

  return {
    languageCode: String(publicSite.languageCode || '').trim() || null,
    languageSiteId: Number.parseInt(String(publicSite.languageSiteId || ''), 10) || null,
    contentRoot
  };
}

function buildLoggerOptions() {
  const logger = {
    level: process.env.LOG_LEVEL || 'info'
  };

  if (process.env.NODE_ENV !== 'development' || !hasPinoPretty()) {
    return logger;
  }

  return {
    ...logger,
    transport: {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname'
      }
    }
  };
}

function hasPinoPretty() {
  try {
    require.resolve('pino-pretty');
    return true;
  } catch {
    return false;
  }
}
