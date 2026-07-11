import { requireAuth } from '../../middleware/auth.mjs';
import { CONTENT_ROOT } from '../../config.mjs';
import { checkpointDatabaseWal } from '../../services/database-maintenance.mjs';
import { regenerateContentItemStaticPages } from '../../services/content-static-generation.mjs';
import {
  getActiveStaticBuild,
  runStaticBuild,
  subscribeActiveStaticBuild
} from '../../services/static-build-executor.mjs';
import {
  isSupportedStaticBuildSection,
  listStaticBuildTargetGroups,
  resolveStaticBuildSectionKey
} from '../../static-builder.mjs';

export default async function staticGenRoutes(app) {
  app.post('/build/content-items/:modelCode/:id', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    try {
      const data = await regenerateContentItemStaticPages(request.params.modelCode, request.params.id);
      return {
        success: true,
        data,
        message: `已生成 ${data.languageCodes.length} 个语言版本`
      };
    } catch (error) {
      app.log.error(error);
      return reply.code(error.statusCode || 500).send({
        success: false,
        message: error.message || '内容静态页生成失败'
      });
    }
  });

  app.get('/build/sections', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    try {
      const languageCode = String(request.query.language || '').trim() || null;
      return {
        success: true,
        data: listStaticBuildTargetGroups({ languageCode })
      };
    } catch (error) {
      app.log.error(error);
      reply.code(500);
      return {
        success: false,
        message: error.message || '静态生成分组加载失败'
      };
    }
  });

  app.get('/build/stream', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const section = String(request.query.section || 'all').trim();
    const languageCode = String(request.query.language || '').trim() || null;

    if (section !== 'all' && !isSupportedStaticBuildSection(section, { languageCode })) {
      return reply.badRequest('未知的生成类型');
    }

    const normalizedSection = resolveStaticBuildSectionKey(section, { languageCode });
    reply.raw.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.flushHeaders?.();
    reply.hijack();

    const sendEvent = (event, data) => {
      reply.raw.write(`event: ${event}\n`);
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const heartbeat = setInterval(() => {
      reply.raw.write(': keepalive\n\n');
    }, 15000);

    const closeStream = () => {
      clearInterval(heartbeat);
      if (!reply.raw.writableEnded) {
        reply.raw.end();
      }
    };

    request.raw.on('close', () => {
      clearInterval(heartbeat);
    });

    sendEvent('started', {
      section,
      normalizedSection,
      languageCode
    });

    let unsubscribe = null;

    try {
      const buildPromise = runStaticBuild({
        outputRoot: CONTENT_ROOT,
        sections: normalizedSection === 'all' ? undefined : [normalizedSection],
        languageCode,
        cleanExisting: true
      });

      unsubscribe = subscribeActiveStaticBuild((event) => {
        sendEvent('progress', event);
      });

      const result = await buildPromise;
      sendEvent('completed', {
        success: true,
        languageCode,
        totalFiles: result.totalFiles || 0,
        totalRecords: result.totalRecords || 0,
        result
      });
      closeStream();
    } catch (error) {
      app.log.error(error);
      sendEvent('error', {
        success: false,
        message: error.message,
        statusCode: error.statusCode || 500
      });
      closeStream();
    } finally {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    }
  });

  app.get('/build/status', {
    onRequest: [requireAuth]
  }, async () => ({
    success: true,
    data: {
      activeBuild: getActiveStaticBuild()
    }
  }));

  app.post('/build/database/checkpoint', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    try {
      return {
        success: true,
        data: checkpointDatabaseWal()
      };
    } catch (error) {
      app.log.error(error);
      return reply.code(500).send({
        success: false,
        message: error.message || '数据库日志清理失败'
      });
    }
  });
}
