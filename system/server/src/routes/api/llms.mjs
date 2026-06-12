import { requireAuth } from '../../middleware/auth.mjs';
import { getLlmsDiagnostics } from '../../services/llms.mjs';

export default async function llmsRoutes(app) {
  app.get('/llms/diagnostics', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    try {
      return {
        success: true,
        data: getLlmsDiagnostics()
      };
    } catch (error) {
      reply.code(500);
      return {
        success: false,
        message: error.message || 'LLMS 诊断信息加载失败'
      };
    }
  });
}
