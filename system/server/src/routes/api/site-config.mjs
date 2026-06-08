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
    const config = getSiteConfig();
    return { success: true, data: config };
  });

  // 管理 API：更新站点配置
  app.put('/site-config', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const updated = updateSiteConfig(request.body);
    return { success: true, data: updated };
  });
}
