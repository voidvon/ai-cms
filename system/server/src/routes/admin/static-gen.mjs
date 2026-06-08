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
  buildJobIndexPages,
  buildJobDetailPages
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

    try {
      let result;

      switch (section) {
        case 'index':
          result = buildIndexPage({ outputRoot: CONTENT_ROOT });
          break;
        case 'contact':
          result = buildContactPage({ outputRoot: CONTENT_ROOT });
          break;
        case 'message':
          result = buildMessagePage({ outputRoot: CONTENT_ROOT });
          break;
        case 'corporation':
          result = buildCorporationPages({ outputRoot: CONTENT_ROOT });
          break;
        case 'product-lists':
          result = buildProductCategoryPages({ outputRoot: CONTENT_ROOT });
          break;
        case 'product-details':
          result = buildProductDetailPages({ outputRoot: CONTENT_ROOT });
          break;
        case 'news-lists':
          result = buildNewsCategoryPages({ outputRoot: CONTENT_ROOT });
          break;
        case 'news-details':
          result = buildNewsDetailPages({ outputRoot: CONTENT_ROOT });
          break;
        case 'service-lists':
          result = buildServiceCategoryPages({ outputRoot: CONTENT_ROOT });
          break;
        case 'service-details':
          result = buildServiceDetailPages({ outputRoot: CONTENT_ROOT });
          break;
        case 'job-lists':
          result = buildJobIndexPages({ outputRoot: CONTENT_ROOT });
          break;
        case 'job-details':
          result = buildJobDetailPages({ outputRoot: CONTENT_ROOT });
          break;
        case 'all':
          const results = [
            buildIndexPage({ outputRoot: CONTENT_ROOT }),
            buildContactPage({ outputRoot: CONTENT_ROOT }),
            buildMessagePage({ outputRoot: CONTENT_ROOT }),
            buildCorporationPages({ outputRoot: CONTENT_ROOT }),
            buildProductCategoryPages({ outputRoot: CONTENT_ROOT }),
            buildProductDetailPages({ outputRoot: CONTENT_ROOT }),
            buildNewsCategoryPages({ outputRoot: CONTENT_ROOT }),
            buildNewsDetailPages({ outputRoot: CONTENT_ROOT }),
            buildServiceCategoryPages({ outputRoot: CONTENT_ROOT }),
            buildServiceDetailPages({ outputRoot: CONTENT_ROOT }),
            buildJobIndexPages({ outputRoot: CONTENT_ROOT }),
            buildJobDetailPages({ outputRoot: CONTENT_ROOT })
          ];
          result = {
            outputRoot: CONTENT_ROOT,
            results,
            totalFiles: results.reduce((sum, r) => sum + (r.filesWritten || 0), 0),
            totalRecords: results.reduce((sum, r) => sum + (r.recordsProcessed || 0), 0)
          };
          break;
        default:
          return reply.badRequest('未知的生成类型');
      }

      return {
        success: true,
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
