import { requireAuth } from '../../middleware/auth.mjs';
import { CONTENT_ROOT } from '../../config.mjs';
import { checkpointDatabaseWal } from '../../services/database-maintenance.mjs';
import {
  buildStaticSite,
  isSupportedStaticBuildSection,
  listStaticBuildTargetGroups,
  resolveStaticBuildSectionKey
} from '../../static-builder.mjs';

export default async function staticGenRoutes(app) {
  // 兼容旧入口，转到 React 后台页
  app.get('/build', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    return reply.redirect('/admin/static-gen');
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

  // 静态生成接口
  app.post('/build/generate', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const section = String(request.query.section || 'all').trim();
    const languageCode = String(request.query.language || '').trim() || null;

    try {
      if (section !== 'all' && !isSupportedStaticBuildSection(section, { languageCode })) {
        return reply.badRequest('未知的生成类型');
      }

      const normalizedSection = resolveStaticBuildSectionKey(section, { languageCode });
      const result = buildStaticSite({
        outputRoot: CONTENT_ROOT,
        sections: normalizedSection === 'all' ? undefined : [normalizedSection],
        languageCode
      });

      return {
        success: true,
        languageCode,
        totalFiles: result.totalFiles || result.filesWritten || 0,
        totalRecords: result.totalRecords || result.recordsProcessed || 0,
        result
      };
    } catch (error) {
      app.log.error(error);
      return reply.code(500).send({
        success: false,
        message: error.message
      });
    }
  });

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
