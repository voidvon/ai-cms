import { requireAuth } from '../../middleware/auth.mjs';
import { PROJECT_ROOT } from '../../config.mjs';
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
  // 静态生成主页
  app.get('/build', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    return reply.type('text/html; charset=utf-8').send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>静态页面生成</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5; }
    .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; }
    h1 { color: #333; }
    .section { margin: 20px 0; padding: 15px; background: #f9f9f9; border-radius: 4px; }
    button { padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; margin: 5px; }
    button:hover { background: #0056b3; }
    .back { display: inline-block; margin-top: 20px; color: #007bff; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <h1>静态页面生成</h1>

    <div class="section">
      <h3>基础页面</h3>
      <button onclick="buildPage('index')">生成首页</button>
      <button onclick="buildPage('contact')">生成联系我们</button>
      <button onclick="buildPage('message')">生成留言页</button>
      <button onclick="buildPage('corporation')">生成公司页面</button>
    </div>

    <div class="section">
      <h3>产品相关</h3>
      <button onclick="buildPage('product-lists')">生成产品分类列表</button>
      <button onclick="buildPage('product-details')">生成产品详情页</button>
    </div>

    <div class="section">
      <h3>新闻相关</h3>
      <button onclick="buildPage('news-lists')">生成新闻分类列表</button>
      <button onclick="buildPage('news-details')">生成新闻详情页</button>
    </div>

    <div class="section">
      <h3>服务相关</h3>
      <button onclick="buildPage('service-lists')">生成服务分类列表</button>
      <button onclick="buildPage('service-details')">生成服务详情页</button>
    </div>

    <div class="section">
      <h3>招聘相关</h3>
      <button onclick="buildPage('job-lists')">生成招聘列表</button>
      <button onclick="buildPage('job-details')">生成招聘详情页</button>
    </div>

    <div class="section">
      <h3>全站生成</h3>
      <button onclick="buildPage('all')" style="background: #28a745;">生成全站</button>
    </div>

    <div id="result" style="margin-top: 20px; padding: 15px; background: #e9ecef; border-radius: 4px; display: none;"></div>

    <a href="javascript:void(0)" onclick="window.parent.location.href='/admin/dashboard'" class="back">← 返回管理首页</a>
  </div>

  <script>
    async function buildPage(section) {
      const resultDiv = document.getElementById('result');
      resultDiv.style.display = 'block';
      resultDiv.innerHTML = '正在生成...';

      try {
        const response = await fetch('/admin/build/generate?section=' + section, {
          method: 'POST'
        });
        const data = await response.json();

        if (data.success) {
          resultDiv.innerHTML = '<strong>生成成功！</strong><br>' +
            '总文件数：' + data.totalFiles + '<br>' +
            '处理记录数：' + data.totalRecords;
        } else {
          resultDiv.innerHTML = '<strong style="color:red;">生成失败：</strong>' + data.message;
        }
      } catch (error) {
        resultDiv.innerHTML = '<strong style="color:red;">错误：</strong>' + error.message;
      }
    }
  </script>
</body>
</html>`);
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
          result = buildIndexPage({ outputRoot: PROJECT_ROOT });
          break;
        case 'contact':
          result = buildContactPage({ outputRoot: PROJECT_ROOT });
          break;
        case 'message':
          result = buildMessagePage({ outputRoot: PROJECT_ROOT });
          break;
        case 'corporation':
          result = buildCorporationPages({ outputRoot: PROJECT_ROOT });
          break;
        case 'product-lists':
          result = buildProductCategoryPages({ outputRoot: PROJECT_ROOT });
          break;
        case 'product-details':
          result = buildProductDetailPages({ outputRoot: PROJECT_ROOT });
          break;
        case 'news-lists':
          result = buildNewsCategoryPages({ outputRoot: PROJECT_ROOT });
          break;
        case 'news-details':
          result = buildNewsDetailPages({ outputRoot: PROJECT_ROOT });
          break;
        case 'service-lists':
          result = buildServiceCategoryPages({ outputRoot: PROJECT_ROOT });
          break;
        case 'service-details':
          result = buildServiceDetailPages({ outputRoot: PROJECT_ROOT });
          break;
        case 'job-lists':
          result = buildJobIndexPages({ outputRoot: PROJECT_ROOT });
          break;
        case 'job-details':
          result = buildJobDetailPages({ outputRoot: PROJECT_ROOT });
          break;
        case 'all':
          const results = [
            buildIndexPage({ outputRoot: PROJECT_ROOT }),
            buildContactPage({ outputRoot: PROJECT_ROOT }),
            buildMessagePage({ outputRoot: PROJECT_ROOT }),
            buildCorporationPages({ outputRoot: PROJECT_ROOT }),
            buildProductCategoryPages({ outputRoot: PROJECT_ROOT }),
            buildProductDetailPages({ outputRoot: PROJECT_ROOT }),
            buildNewsCategoryPages({ outputRoot: PROJECT_ROOT }),
            buildNewsDetailPages({ outputRoot: PROJECT_ROOT }),
            buildServiceCategoryPages({ outputRoot: PROJECT_ROOT }),
            buildServiceDetailPages({ outputRoot: PROJECT_ROOT }),
            buildJobIndexPages({ outputRoot: PROJECT_ROOT }),
            buildJobDetailPages({ outputRoot: PROJECT_ROOT })
          ];
          result = {
            outputRoot: PROJECT_ROOT,
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
