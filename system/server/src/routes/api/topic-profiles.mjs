import { requireAuth } from '../../middleware/auth.mjs';
import { CONTENT_ROOT } from '../../config.mjs';
import { buildTopicColumnPage } from '../../static-builder.mjs';
import {
  deleteTopicProfile,
  deleteTopicProfileForLanguage,
  getTopicProfileByColumnId,
  listTopicProfiles,
  saveTopicProfile
} from '../../services/topic-profiles.mjs';

export default async function topicProfilesRoutes(app) {
  app.get('/topic-profiles', {
    onRequest: [requireAuth]
  }, async (request) => {
    const { language, lang } = request.query;
    return {
      success: true,
      data: listTopicProfiles({ languageCode: language ?? lang })
    };
  });

  app.get('/topic-profiles/:columnId', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const { language, lang } = request.query;
    const profile = getTopicProfileByColumnId(request.params.columnId, { languageCode: language ?? lang });
    if (!profile) {
      reply.code(404);
      return { success: false, message: '专题配置不存在' };
    }
    return { success: true, data: profile };
  });

  app.put('/topic-profiles/:columnId', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    try {
      const { language, lang } = request.query;
      const profile = saveTopicProfile(request.params.columnId, request.body || {}, { languageCode: language ?? lang });
      return { success: true, data: profile, message: '专题配置已保存' };
    } catch (error) {
      reply.code(400);
      return { success: false, message: error.message };
    }
  });

  app.post('/topic-profiles/:columnId/generate', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    try {
      const { language, lang } = request.query;
      const result = buildTopicColumnPage({
        outputRoot: CONTENT_ROOT,
        columnId: request.params.columnId,
        languageCode: language ?? lang
      });
      return { success: true, data: result, message: '专题页面已生成' };
    } catch (error) {
      reply.code(400);
      return { success: false, message: error.message };
    }
  });

  app.delete('/topic-profiles/:columnId', {
    onRequest: [requireAuth]
  }, async (request) => {
    const { language, lang, all } = request.query;
    const deleted = all === '1' || all === 'true'
      ? deleteTopicProfile(request.params.columnId)
      : deleteTopicProfileForLanguage(request.params.columnId, { languageCode: language ?? lang });
    return { success: true, data: { deleted }, message: deleted ? '专题配置已删除' : '专题配置不存在' };
  });
}
