import Fastify from 'fastify';
import { getSiteConfig } from './services/site.mjs';
import { serveSharedUploads } from './static-file-handler.mjs';
import { withPortConflictDetails } from './utils/port-diagnostics.mjs';

export function createAssetsListenerManager({ logger = console } = {}) {
  let listener = null;

  return {
    async sync() {
      const site = getSiteConfig();
      const descriptor = buildAssetsDescriptor(site);

      if (!descriptor) {
        await closeListener(listener, logger);
        listener = null;
        return;
      }

      if (listener && isSameDescriptor(listener.descriptor, descriptor)) {
        return;
      }

      if (listener) {
        await closeListener(listener, logger);
        listener = null;
      }

      const app = Fastify({
        logger: false,
        trustProxy: true
      });

      app.setNotFoundHandler(async (request, reply) => {
        const handled = await serveSharedUploads(request, reply);
        if (!handled) {
          reply.code(404).type('text/plain; charset=utf-8').send('Not Found');
        }
      });

      try {
        await app.listen({ host: descriptor.host, port: descriptor.port });
        listener = { app, descriptor };
        logger.info?.(`[assets-listener] listening on http://${descriptor.host}:${descriptor.port}`);
      } catch (error) {
        const enrichedError = withPortConflictDetails(error, descriptor.port);
        logger.error?.(enrichedError);
        await safeCloseApp(app);
        throw new Error(`资源服务启动失败：${enrichedError.message || enrichedError}`);
      }
    },

    async close() {
      await closeListener(listener, logger);
      listener = null;
    }
  };
}

function buildAssetsDescriptor(site) {
  const port = Number(site?.assets_port || 0);
  if (!Number.isInteger(port) || port <= 0) {
    return null;
  }

  return {
    host: String(site?.assets_bind_host || '127.0.0.1').trim() || '127.0.0.1',
    port,
    publicBaseUrl: String(site?.assets_public_base_url || '').trim()
  };
}

function isSameDescriptor(left, right) {
  return (
    String(left?.host || '') === String(right?.host || '')
    && Number(left?.port || 0) === Number(right?.port || 0)
    && String(left?.publicBaseUrl || '') === String(right?.publicBaseUrl || '')
  );
}

async function closeListener(entry, logger) {
  if (!entry?.app) {
    return;
  }

  try {
    await entry.app.close();
    logger.info?.('[assets-listener] stopped');
  } catch (error) {
    logger.error?.(error);
  }
}

async function safeCloseApp(app) {
  try {
    await app.close();
  } catch {
    // ignore partial startup close failures
  }
}
