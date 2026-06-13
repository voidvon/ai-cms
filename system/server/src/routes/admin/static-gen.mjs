import { requireAuth } from '../../middleware/auth.mjs';
import { CONTENT_ROOT } from '../../config.mjs';
import {
  buildIndexPage,
  buildContactPage,
  buildMessagePage,
  buildCorporationPages,
  buildNewsCategoryPages,
  buildNewsDetailPages,
  buildProductCategoryPages,
  buildProductDetailPages,
  buildServiceCategoryPages,
  buildServiceDetailPages,
  buildStaticSite
} from '../../static-builder.mjs';

export default async function staticGenRoutes(app) {
  // 兼容旧入口，转到 React 后台页
  app.get('/build', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    return reply.redirect('/admin/static-gen');
  });

  // 静态生成接口
  app.post('/build/generate', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    const section = request.query.section || 'all';
    const languageCode = String(request.query.language || '').trim() || null;

    try {
      let result;

      switch (section) {
        case 'index':
          result = buildIndexPage({ outputRoot: CONTENT_ROOT, languageCode });
          break;
        case 'contact':
          result = buildContactPage({ outputRoot: CONTENT_ROOT, languageCode });
          break;
        case 'message':
          result = buildMessagePage({ outputRoot: CONTENT_ROOT, languageCode });
          break;
        case 'corporation':
          result = buildCorporationPages({ outputRoot: CONTENT_ROOT, languageCode });
          break;
        case 'product-lists':
          result = buildProductCategoryPages({ outputRoot: CONTENT_ROOT, languageCode });
          break;
        case 'product-details':
          result = buildProductDetailPages({ outputRoot: CONTENT_ROOT, languageCode });
          break;
        case 'news-lists':
          result = buildNewsCategoryPages({ outputRoot: CONTENT_ROOT, languageCode });
          break;
        case 'news-details':
          result = buildNewsDetailPages({ outputRoot: CONTENT_ROOT, languageCode });
          break;
        case 'service-lists':
          result = buildServiceCategoryPages({ outputRoot: CONTENT_ROOT, languageCode });
          break;
        case 'service-details':
          result = buildServiceDetailPages({ outputRoot: CONTENT_ROOT, languageCode });
          break;
        case 'robots':
          result = buildStaticSite({ outputRoot: CONTENT_ROOT, sections: ['robots'], languageCode });
          break;
        case 'sitemap':
          result = buildStaticSite({ outputRoot: CONTENT_ROOT, sections: ['sitemap'], languageCode });
          break;
        case 'llms':
          result = buildStaticSite({ outputRoot: CONTENT_ROOT, sections: ['llms'], languageCode });
          break;
        case 'all':
          result = buildStaticSite({ outputRoot: CONTENT_ROOT, languageCode });
          break;
        default:
          return reply.badRequest('未知的生成类型');
      }

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
}
