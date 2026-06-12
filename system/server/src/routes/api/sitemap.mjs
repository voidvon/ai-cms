import { requireAuth } from '../../middleware/auth.mjs';
import { getSitemapDiagnostics } from '../../services/sitemap.mjs';

export default async function sitemapRoutes(app) {
  app.get('/sitemap/diagnostics', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    try {
      return {
        success: true,
        data: getSitemapDiagnostics()
      };
    } catch (error) {
      reply.code(500);
      return {
        success: false,
        message: error.message || 'Sitemap 诊断信息加载失败'
      };
    }
  });
}
