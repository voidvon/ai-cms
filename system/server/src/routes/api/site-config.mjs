import { requireAuth } from '../../middleware/auth.mjs';
import { getSiteConfig, updateSiteConfig } from '../../services/site.mjs';

export default async function siteConfigRoutes(app) {
  // 健康检查
  app.get('/health', async (request, reply) => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString()
    };
  });

  // 公开 API：站点配置
  app.get('/site-config', async (request, reply) => {
    const languageCode = String(request.query?.language || '').trim() || app.publicSite?.languageCode || null;
    const includeTranslations = Number.parseInt(String(request.query?.include_translations ?? 0), 10) === 1;
    const config = getSiteConfig(languageCode, { includeTranslations, includeSecrets: Boolean(request.user && String(request.query?.include_secrets || '') === '1') });
    return { success: true, data: config };
  });

  // 管理 API：更新站点配置
  app.put('/site-config', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    try {
      const updated = await updateSiteConfig(request.body);
      await app.assetsListenerManager?.sync?.();
      return { success: true, data: updated };
    } catch (error) {
      reply.code(400);
      return { success: false, message: error.message || '网站配置更新失败' };
    }
  });
}
