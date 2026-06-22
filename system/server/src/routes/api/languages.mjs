import net from 'node:net';
import { requireAuth } from '../../middleware/auth.mjs';
import {
  createLanguage,
  deleteLanguage,
  getLanguageById,
  listLanguages,
  updateLanguage
} from '../../services/languages.mjs';

export default async function languagesRoutes(app) {
  app.get('/languages', {
    onRequest: [requireAuth]
  }, async () => {
    return { success: true, data: listLanguages() };
  });

  app.get('/languages/:id', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const language = getLanguageById(request.params.id);
    if (!language) {
      reply.code(404);
      return { success: false, message: '语言不存在' };
    }
    return { success: true, data: language };
  });

  app.post('/languages', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    try {
      await ensureStandalonePortAvailable(request.body || {});
      const language = createLanguage(request.body || {});
      await app.siteListenerManager?.sync?.();
      return { success: true, data: language, message: '语言已创建' };
    } catch (error) {
      reply.code(400);
      return { success: false, message: error.message };
    }
  });

  app.put('/languages/:id', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    try {
      const existing = getLanguageById(request.params.id);
      await ensureStandalonePortAvailable(request.body || {}, existing);
      const language = updateLanguage(request.params.id, request.body || {});
      if (!language) {
        reply.code(404);
        return { success: false, message: '语言不存在' };
      }
      await app.siteListenerManager?.sync?.();
      return { success: true, data: language, message: '语言已更新' };
    } catch (error) {
      reply.code(400);
      return { success: false, message: error.message };
    }
  });

  app.delete('/languages/:id', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    try {
      const language = deleteLanguage(request.params.id);
      if (!language) {
        reply.code(404);
        return { success: false, message: '语言不存在' };
      }
      await app.siteListenerManager?.sync?.();
      return { success: true, data: language, message: '语言已删除' };
    } catch (error) {
      reply.code(400);
      return { success: false, message: error.message };
    }
  });
}

async function ensureStandalonePortAvailable(input, existing = null) {
  const siteMode = String(input?.site?.site_mode ?? existing?.site?.site_mode ?? 'subdir').trim().toLowerCase();
  if (siteMode !== 'standalone') {
    return;
  }

  const bindHost = String(input?.site?.bind_host ?? existing?.site?.bind_host ?? '127.0.0.1').trim() || '127.0.0.1';
  const accessPort = Number.parseInt(String(input?.site?.access_port ?? existing?.site?.access_port ?? ''), 10);
  if (!Number.isFinite(accessPort) || accessPort <= 0) {
    return;
  }

  const existingPort = Number(existing?.site?.access_port || 0);
  const existingHost = String(existing?.site?.bind_host || '127.0.0.1').trim() || '127.0.0.1';
  if (existing?.site?.site_mode === 'standalone' && existingPort === accessPort && existingHost === bindHost) {
    return;
  }

  const available = await probePortAvailability(accessPort, bindHost);
  if (!available) {
    throw new Error(`端口 ${bindHost}:${accessPort} 当前不可监听，请更换端口或释放占用`);
  }
}

function probePortAvailability(port, host) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();

    server.once('error', () => {
      resolve(false);
    });

    server.listen({ port, host, exclusive: true }, () => {
      server.close(() => resolve(true));
    });
  });
}
