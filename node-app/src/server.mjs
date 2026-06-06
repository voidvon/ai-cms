import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:http';
import { fileURLToPath, URL } from 'node:url';
import { HOST, MIME_TYPES, PORT, PROJECT_ROOT } from './config.mjs';
import { getDb } from './db.mjs';
import { parseCookies, serializeCookie } from './utils/cookies.mjs';
import {
  authenticateAdmin,
  createAdmin,
  deleteAdmin,
  getAdminById,
  listAdminsAdmin,
  updateAdmin,
  updateAdminPassword
} from './services/admins.mjs';
import { createContact, deleteContact, getContactById, listContacts, updateContact } from './services/contacts.mjs';
import {
  createCorporationCategory,
  deleteCorporationCategory,
  getCorporationCategoryById,
  getNextCorporationCategorySortOrder,
  listCorporationCategoriesAdmin,
  listRootCorporationCategories,
  updateCorporationCategory,
  updateCorporationCategoryContent
} from './services/corporation-categories.mjs';
import {
  createCustomLabel,
  createCustomLabelKind,
  deleteCustomLabel,
  deleteCustomLabelKind,
  findCustomLabelByName,
  getCustomLabelById,
  getCustomLabelKindById,
  listCustomLabelKinds,
  listCustomLabels,
  updateCustomLabel,
  updateCustomLabelKind
} from './services/custom-labels.mjs';
import { createJob, deleteJob, getJobById, listJobs, listJobsAdmin, updateJob } from './services/jobs.mjs';
import { createMessage, deleteMessage, getMessageById, listMessages, listMessagesAdmin, updateMessage } from './services/messages.mjs';
import { createMetaType, getMetaTypeById, listMetaTypes, updateMetaType } from './services/meta-types.mjs';
import {
  createNewsCategory,
  deleteNewsCategory,
  getNewsCategoryById,
  listNewsCategoriesAdmin,
  listNewsCategoryOptions,
  listRootNewsCategories,
  updateNewsCategory
} from './services/news-categories.mjs';
import { createNews, deleteNews, getNewsById, listNews, listNewsAdmin, updateNews } from './services/news.mjs';
import {
  createProductCategory,
  deleteProductCategory,
  getNextProductCategorySortOrder,
  getProductCategoryById,
  listProductCategoriesAdmin,
  listProductCategoryOptions,
  listRootProductCategories,
  updateProductCategory
} from './services/product-categories.mjs';
import { createProductPhoto, deleteProductPhoto, getProductPhotoById, listProductPhotos } from './services/product-photos.mjs';
import { createProduct, deleteProduct, getNextProductSortOrder, getProductById, listProducts, listProductsAdmin, searchProductsPaged, updateProduct } from './services/products.mjs';
import { createAdminSession, deleteAdminSession, getAdminSession } from './services/sessions.mjs';
import { getSiteConfig, updateSiteConfig } from './services/site.mjs';
import { deleteTemplateVariant, getTemplateVariantById, listTemplateVariants, setSelectedTemplateVariant, updateTemplateVariant } from './services/template-variants.mjs';
import { saveUploadedFile } from './services/uploads.mjs';
import {
  buildContactPage,
  buildCorporationPages,
  buildIndexPage,
  buildJobDetailPages,
  buildJobIndexPages,
  buildMessagePage,
  buildNewsCategoryPages,
  buildNewsDetailPages,
  buildProductCategoryPages,
  buildProductDetailPages,
  buildServiceCategoryPages,
  buildServiceDetailPages
} from './static-builder.mjs';
import { escapeHtml, renderPage } from './utils/html.mjs';
import { getClientIp, readFormBody, readJsonBody, sendApi, sendApiError, sendHtml } from './utils/http.mjs';
import { readMultipartBody } from './utils/multipart.mjs';

getDb();

export async function handleRequest(request, response) {
  try {
    const baseUrl = `http://${request.headers.host || 'localhost'}`;
    const url = new URL(request.url || '/', baseUrl);
    const pathnameLower = url.pathname.toLowerCase();

    if (request.method === 'GET' && (pathnameLower === '/spck' || pathnameLower === '/spck/')) {
      response.statusCode = 302;
      response.setHeader('Location', '/spck/login.asp');
      response.end();
      return;
    }

    if (request.method === 'GET' && pathnameLower === '/spck/login.asp') {
      const session = getAdminSession(getAdminToken(request));
      if (session) {
        response.statusCode = 302;
        response.setHeader('Location', '/spck/index.asp');
        response.end();
        return;
      }
      return sendHtml(response, 200, renderLegacyAdminLoginPage());
    }

    if (request.method === 'POST' && pathnameLower === '/spck/check.asp') {
      const form = await readFormBody(request);
      const username = String(form.userid || form.username || '').trim();
      const password = String(form.password || '').trim();
      const admin = authenticateAdmin(username, password, getClientIp(request));

      if (!admin) {
        return sendHtml(response, 401, renderLegacyLoginResult({
          success: false,
          message: '登录失败，用户名或密码不正确。',
          href: 'login.asp',
          label: '返回登录页'
        }));
      }

      const session = createAdminSession(admin.id);
      response.setHeader('Set-Cookie', createLegacyAdminCookies(session.token, admin));
      return sendHtml(response, 200, renderLegacyLoginResult({
        success: true,
        message: '登录成功，正在进入后台管理首页。',
        href: 'index.asp',
        label: '进入后台管理'
      }));
    }

    if (request.method === 'GET' && pathnameLower === '/spck/exitsystem.asp') {
      const token = getAdminToken(request);
      if (token) {
        deleteAdminSession(token);
      }
      response.statusCode = 302;
      response.setHeader('Set-Cookie', clearLegacyAdminCookies());
      response.setHeader('Location', '/spck/login.asp');
      response.end();
      return;
    }

    if (request.method === 'GET' && pathnameLower === '/spck/index.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }
      return sendHtml(response, 200, renderLegacyAdminFrameset());
    }

    if (request.method === 'GET' && pathnameLower === '/spck/top.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }
      return sendHtml(response, 200, renderLegacyAdminTop());
    }

    if (request.method === 'GET' && pathnameLower === '/spck/left.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }
      return sendHtml(response, 200, renderLegacyAdminLeft(session));
    }

    if (request.method === 'GET' && pathnameLower === '/spck/main.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }
      return sendHtml(response, 200, renderLegacyAdminHome(session));
    }

    if (request.method === 'GET' && pathnameLower === '/spck/err.asp') {
      return sendHtml(response, 403, renderLegacySimpleMessage('当前账号没有访问该后台页面的权限', 'index.asp'));
    }

    if (request.method === 'GET' && pathnameLower === '/spck/chklogin.asp') {
      return sendHtml(response, 405, renderLegacySimpleMessage('当前请求方式不被支持，请重新从后台页面提交表单', 'login.asp'));
    }

    if (request.method === 'GET' && pathnameLower === '/manage/makehtml/index.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }
      if (!requireLegacyPermission(session, '010', response, '/spck/err.asp')) {
        return;
      }
      return sendHtml(response, 200, renderLegacyMakeHtmlHome());
    }

    if (request.method === 'GET' && pathnameLower === '/manage/makehtml/index/index.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }
      if (!requireLegacyPermission(session, '010', response, '/spck/err.asp')) {
        return;
      }

      const action = String(url.searchParams.get('act') || '').toLowerCase();
      if (!action) {
        return sendHtml(response, 200, renderLegacyMakeHtmlSinglePageMenu());
      }

      if (action === 'all') {
        const results = [
          buildIndexPage({ outputRoot: PROJECT_ROOT }),
          buildContactPage({ outputRoot: PROJECT_ROOT }),
          buildMessagePage({ outputRoot: PROJECT_ROOT })
        ];
        return sendHtml(response, 200, renderLegacyMakeHtmlResult({
          title: '单页批量生成完成',
          result: {
            label: '首页、联系页面、留言页面',
            recordsProcessed: results.reduce((sum, item) => sum + Number(item.recordsProcessed || 0), 0),
            filesWritten: results.reduce((sum, item) => sum + Number(item.filesWritten || 0), 0)
          },
          outputRoot: PROJECT_ROOT,
          viewPath: null,
          backUrl: '/manage/makehtml/index/index.asp'
        }));
      }

      if (action === 'index') {
        const result = buildIndexPage({ outputRoot: PROJECT_ROOT });
        return sendHtml(response, 200, renderLegacyMakeHtmlResult({
          title: '首页生成完成',
          result,
          outputRoot: PROJECT_ROOT,
          viewPath: '/index.html',
          backUrl: '/manage/makehtml/index/index.asp'
        }));
      }

      if (action === 'contact') {
        const result = buildContactPage({ outputRoot: PROJECT_ROOT });
        return sendHtml(response, 200, renderLegacyMakeHtmlResult({
          title: '联系页面生成完成',
          result,
          outputRoot: PROJECT_ROOT,
          viewPath: '/contact.html',
          backUrl: '/manage/makehtml/index/index.asp'
        }));
      }

      if (action === 'msg') {
        const result = buildMessagePage({ outputRoot: PROJECT_ROOT });
        return sendHtml(response, 200, renderLegacyMakeHtmlResult({
          title: '留言页面生成完成',
          result,
          outputRoot: PROJECT_ROOT,
          viewPath: '/msg.html',
          backUrl: '/manage/makehtml/index/index.asp'
        }));
      }

      if (action === 'search') {
        return sendHtml(response, 200, renderLegacySimpleSuccess('搜索页已改为动态入口 /search.asp，无需单独生成', '/manage/makehtml/index/index.asp'));
      }

      return sendHtml(response, 400, renderLegacySimpleMessage('不支持的生成类型', '/manage/makehtml/index/index.asp'));
    }

    if ((request.method === 'GET' || request.method === 'POST') && pathnameLower === '/manage/makehtml/maketrade.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }
      if (!requireLegacyPermission(session, '010', response, '/spck/err.asp')) {
        return;
      }
      return sendHtml(response, 200, renderLegacyMakeHtmlTradeMenu());
    }

    if ((request.method === 'GET' || request.method === 'POST') && pathnameLower === '/manage/makehtml/makelist_my.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }
      if (!requireLegacyPermission(session, '010', response, '/spck/err.asp')) {
        return;
      }
      const result = buildProductCategoryPages({ outputRoot: PROJECT_ROOT });
      return sendHtml(response, 200, renderLegacyMakeHtmlResult({
        title: '多级分类页生成完成',
        result,
        outputRoot: PROJECT_ROOT,
        viewPath: null,
        backUrl: '/manage/makehtml/index.asp'
      }));
    }

    if ((request.method === 'GET' || request.method === 'POST') && pathnameLower === '/manage/makehtml/makedetail_my.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }
      if (!requireLegacyPermission(session, '010', response, '/spck/err.asp')) {
        return;
      }
      const result = buildProductDetailPages({ outputRoot: PROJECT_ROOT });
      return sendHtml(response, 200, renderLegacyMakeHtmlResult({
        title: '多级详情页生成完成',
        result,
        outputRoot: PROJECT_ROOT,
        viewPath: null,
        backUrl: '/manage/makehtml/index.asp'
      }));
    }

    if (request.method === 'GET' && pathnameLower === '/manage/makehtml/prod/makelist.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }
      if (!requireLegacyPermission(session, '010', response, '/spck/err.asp')) {
        return;
      }

      const result = buildProductCategoryPages({ outputRoot: PROJECT_ROOT });
      return sendHtml(response, 200, renderLegacyMakeHtmlResult({
        title: '产品分类页生成完成',
        result,
        outputRoot: PROJECT_ROOT,
        viewPath: null,
        backUrl: '/manage/makehtml/index.asp'
      }));
    }

    if ((request.method === 'GET' || request.method === 'POST') && pathnameLower === '/manage/makehtml/prod/maketrade.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }
      if (!requireLegacyPermission(session, '010', response, '/spck/err.asp')) {
        return;
      }

      const result = buildProductCategoryPages({ outputRoot: PROJECT_ROOT });
      return sendHtml(response, 200, renderLegacyMakeHtmlResult({
        title: '产品一级分类页生成完成',
        result,
        outputRoot: PROJECT_ROOT,
        viewPath: null,
        backUrl: '/manage/makehtml/maketrade.asp'
      }));
    }

    if (request.method === 'GET' && pathnameLower === '/manage/makehtml/prod/makedetail.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }
      if (!requireLegacyPermission(session, '010', response, '/spck/err.asp')) {
        return;
      }

      const idRange = normalizeLegacyBuildRange(url.searchParams);
      const result = buildProductDetailPages({ outputRoot: PROJECT_ROOT, idRange });
      return sendHtml(response, 200, renderLegacyMakeHtmlResult({
        title: '产品详情页生成完成',
        result,
        outputRoot: PROJECT_ROOT,
        viewPath: null,
        backUrl: '/manage/makehtml/index.asp'
      }));
    }

    if (request.method === 'GET' && pathnameLower === '/manage/makehtml/news/makedetail.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }
      if (!requireLegacyPermission(session, '010', response, '/spck/err.asp')) {
        return;
      }

      const idRange = normalizeLegacyBuildRange(url.searchParams);
      const result = buildNewsDetailPages({ outputRoot: PROJECT_ROOT, idRange });
      return sendHtml(response, 200, renderLegacyMakeHtmlResult({
        title: '新闻详情页生成完成',
        result,
        outputRoot: PROJECT_ROOT,
        viewPath: null,
        backUrl: '/manage/makehtml/index.asp'
      }));
    }

    if ((request.method === 'GET' || request.method === 'POST') && pathnameLower === '/manage/makehtml/news/maketrade.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }
      if (!requireLegacyPermission(session, '010', response, '/spck/err.asp')) {
        return;
      }
      const result = buildNewsCategoryPages({ outputRoot: PROJECT_ROOT });
      return sendHtml(response, 200, renderLegacyMakeHtmlResult({
        title: '新闻分类页生成完成',
        result,
        outputRoot: PROJECT_ROOT,
        viewPath: '/news/index.html',
        backUrl: '/manage/makehtml/maketrade.asp'
      }));
    }

    if ((request.method === 'GET' || request.method === 'POST') && pathnameLower === '/manage/makehtml/service/maketrade.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }
      if (!requireLegacyPermission(session, '010', response, '/spck/err.asp')) {
        return;
      }
      const result = buildServiceCategoryPages({ outputRoot: PROJECT_ROOT });
      return sendHtml(response, 200, renderLegacyMakeHtmlResult({
        title: '服务分类页生成完成',
        result,
        outputRoot: PROJECT_ROOT,
        viewPath: '/service/index.html',
        backUrl: '/manage/makehtml/maketrade.asp'
      }));
    }

    if (request.method === 'GET' && pathnameLower === '/manage/makehtml/service/makedetail.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }
      if (!requireLegacyPermission(session, '010', response, '/spck/err.asp')) {
        return;
      }
      const idRange = normalizeLegacyBuildRange(url.searchParams);
      const result = buildServiceDetailPages({ outputRoot: PROJECT_ROOT, idRange });
      return sendHtml(response, 200, renderLegacyMakeHtmlResult({
        title: '服务详情页生成完成',
        result,
        outputRoot: PROJECT_ROOT,
        viewPath: null,
        backUrl: '/manage/makehtml/index.asp'
      }));
    }

    if ((request.method === 'GET' || request.method === 'POST') && pathnameLower === '/manage/makehtml/job/maketrade.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }
      if (!requireLegacyPermission(session, '010', response, '/spck/err.asp')) {
        return;
      }
      const result = buildJobIndexPages({ outputRoot: PROJECT_ROOT });
      return sendHtml(response, 200, renderLegacyMakeHtmlResult({
        title: '招聘列表页生成完成',
        result,
        outputRoot: PROJECT_ROOT,
        viewPath: '/job/index.html',
        backUrl: '/manage/makehtml/maketrade.asp'
      }));
    }

    if (request.method === 'GET' && pathnameLower === '/manage/makehtml/job/makedetail.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }
      if (!requireLegacyPermission(session, '010', response, '/spck/err.asp')) {
        return;
      }
      const idRange = normalizeLegacyBuildRange(url.searchParams);
      const result = buildJobDetailPages({ outputRoot: PROJECT_ROOT, idRange });
      return sendHtml(response, 200, renderLegacyMakeHtmlResult({
        title: '招聘详情页生成完成',
        result,
        outputRoot: PROJECT_ROOT,
        viewPath: null,
        backUrl: '/manage/makehtml/index.asp'
      }));
    }

    if ((request.method === 'GET' || request.method === 'POST') && pathnameLower === '/manage/makehtml/co/maketrade.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }
      if (!requireLegacyPermission(session, '010', response, '/spck/err.asp')) {
        return;
      }
      const result = buildCorporationPages({ outputRoot: PROJECT_ROOT });
      return sendHtml(response, 200, renderLegacyMakeHtmlResult({
        title: '公司栏目页生成完成',
        result,
        outputRoot: PROJECT_ROOT,
        viewPath: '/about/index.html',
        backUrl: '/manage/makehtml/maketrade.asp'
      }));
    }

    if (request.method === 'GET' && pathnameLower === '/health') {
      return sendApi(response, 200, { ok: true });
    }

    if (request.method === 'GET' && pathnameLower === '/api/site-config') {
      return sendApi(response, 200, getSiteConfig());
    }

    if (request.method === 'GET' && pathnameLower === '/api/contacts') {
      return sendApi(response, 200, listContacts());
    }

    if (request.method === 'GET' && pathnameLower === '/api/jobs') {
      const activeOnly = url.searchParams.get('activeOnly') !== '0';
      const limit = url.searchParams.get('limit') || '20';
      return sendApi(response, 200, listJobs({ activeOnly, limit }));
    }

    if (request.method === 'GET' && pathnameLower === '/api/product-photos') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }
      const page = url.searchParams.get('page') || '1';
      const limit = url.searchParams.get('limit') || '100';
      const result = listProductPhotos({ page, limit });
      return sendApi(response, 200, result.items, result.pagination);
    }

    if (request.method === 'GET' && pathnameLower === '/api/products') {
      const featured = url.searchParams.get('featured') === '1';
      const visibleOnly = url.searchParams.get('visibleOnly') !== '0';
      const limit = url.searchParams.get('limit') || '20';
      return sendApi(response, 200, listProducts({ featured, visibleOnly, limit }));
    }

    if (request.method === 'GET' && pathnameLower === '/api/news') {
      const limit = url.searchParams.get('limit') || '20';
      return sendApi(response, 200, listNews({ limit }));
    }

    if (request.method === 'GET' && pathnameLower === '/api/messages') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }
      const limit = url.searchParams.get('limit') || '50';
      const status = url.searchParams.get('status');
      return sendApi(response, 200, listMessages({ limit, status }));
    }

    if (pathnameLower.startsWith('/api/products/')) {
      const id = getNumericId(pathnameLower, '/api/products/');
      if (id === null) {
        return sendApiError(response, 400, 'invalid_product_id');
      }

      if (request.method === 'GET') {
        const product = getProductById(id);
        return product
          ? sendApi(response, 200, product)
          : sendApiError(response, 404, 'product_not_found');
      }

      if (request.method === 'PUT') {
        const session = requireAdminSession(request, response);
        if (!session) {
          return;
        }
        const body = await readJsonBody(request);
        const product = updateProduct(id, body);
        return product
          ? sendApi(response, 200, product)
          : sendApiError(response, 404, 'product_not_found');
      }

      if (request.method === 'DELETE') {
        const session = requireAdminSession(request, response);
        if (!session) {
          return;
        }
        const product = deleteProduct(id);
        return product
          ? sendApi(response, 200, product)
          : sendApiError(response, 404, 'product_not_found');
      }
    }

    if (pathnameLower.startsWith('/api/product-photos/')) {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }

      const id = getNumericId(pathnameLower, '/api/product-photos/');
      if (id === null) {
        return sendApiError(response, 400, 'invalid_product_photo_id');
      }

      if (request.method === 'GET') {
        const photo = getProductPhotoById(id);
        return photo
          ? sendApi(response, 200, photo)
          : sendApiError(response, 404, 'product_photo_not_found');
      }

      if (request.method === 'DELETE') {
        const photo = deleteProductPhoto(id);
        return photo
          ? sendApi(response, 200, photo)
          : sendApiError(response, 404, 'product_photo_not_found');
      }
    }

    if (pathnameLower.startsWith('/api/news/')) {
      const id = getNumericId(pathnameLower, '/api/news/');
      if (id === null) {
        return sendApiError(response, 400, 'invalid_news_id');
      }

      if (request.method === 'GET') {
        const item = getNewsById(id);
        return item
          ? sendApi(response, 200, item)
          : sendApiError(response, 404, 'news_not_found');
      }

      if (request.method === 'PUT') {
        const session = requireAdminSession(request, response);
        if (!session) {
          return;
        }
        const body = await readJsonBody(request);
        const item = updateNews(id, body);
        return item
          ? sendApi(response, 200, item)
          : sendApiError(response, 404, 'news_not_found');
      }

      if (request.method === 'DELETE') {
        const session = requireAdminSession(request, response);
        if (!session) {
          return;
        }
        const item = deleteNews(id);
        return item
          ? sendApi(response, 200, item)
          : sendApiError(response, 404, 'news_not_found');
      }
    }

    if (pathnameLower.startsWith('/api/messages/')) {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }

      const id = getNumericId(pathnameLower, '/api/messages/');
      if (id === null) {
        return sendApiError(response, 400, 'invalid_message_id');
      }

      if (request.method === 'GET') {
        const message = getMessageById(id);
        return message
          ? sendApi(response, 200, message)
          : sendApiError(response, 404, 'message_not_found');
      }

      if (request.method === 'PUT') {
        const body = await readJsonBody(request);
        const message = updateMessage(id, body);
        return message
          ? sendApi(response, 200, message)
          : sendApiError(response, 404, 'message_not_found');
      }

      if (request.method === 'DELETE') {
        const message = deleteMessage(id);
        return message
          ? sendApi(response, 200, message)
          : sendApiError(response, 404, 'message_not_found');
      }
    }

    if (pathnameLower.startsWith('/api/contacts/')) {
      const id = getNumericId(pathnameLower, '/api/contacts/');
      if (id === null) {
        return sendApiError(response, 400, 'invalid_contact_id');
      }

      if (request.method === 'GET') {
        const contact = getContactById(id);
        return contact
          ? sendApi(response, 200, contact)
          : sendApiError(response, 404, 'contact_not_found');
      }

      if (request.method === 'PUT') {
        const session = requireAdminSession(request, response);
        if (!session) {
          return;
        }
        const body = await readJsonBody(request);
        const contact = updateContact(id, body);
        return contact
          ? sendApi(response, 200, contact)
          : sendApiError(response, 404, 'contact_not_found');
      }

      if (request.method === 'DELETE') {
        const session = requireAdminSession(request, response);
        if (!session) {
          return;
        }
        const contact = deleteContact(id);
        return contact
          ? sendApi(response, 200, contact)
          : sendApiError(response, 404, 'contact_not_found');
      }
    }

    if (pathnameLower.startsWith('/api/jobs/')) {
      const id = getNumericId(pathnameLower, '/api/jobs/');
      if (id === null) {
        return sendApiError(response, 400, 'invalid_job_id');
      }

      if (request.method === 'GET') {
        const job = getJobById(id);
        return job
          ? sendApi(response, 200, job)
          : sendApiError(response, 404, 'job_not_found');
      }

      if (request.method === 'PUT') {
        const session = requireAdminSession(request, response);
        if (!session) {
          return;
        }
        const body = await readJsonBody(request);
        const job = updateJob(id, body);
        return job
          ? sendApi(response, 200, job)
          : sendApiError(response, 404, 'job_not_found');
      }

      if (request.method === 'DELETE') {
        const session = requireAdminSession(request, response);
        if (!session) {
          return;
        }
        const job = deleteJob(id);
        return job
          ? sendApi(response, 200, job)
          : sendApiError(response, 404, 'job_not_found');
      }
    }

    if (request.method === 'POST' && pathnameLower === '/api/products') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }
      const body = await readJsonBody(request);
      return sendApi(response, 201, createProduct(body));
    }

    if (request.method === 'POST' && pathnameLower === '/api/product-photos') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }
      const body = await readJsonBody(request);
      return sendApi(response, 201, createProductPhoto({
        name: body.name,
        image_path: body.image_path,
        product_id: body.product_id
      }));
    }

    if (request.method === 'POST' && pathnameLower === '/api/news') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }
      const body = await readJsonBody(request);
      return sendApi(response, 201, createNews(body));
    }

    if (request.method === 'POST' && pathnameLower === '/api/admin/login') {
      const body = await readJsonBody(request);
      const username = String(body.username || '').trim();
      const password = String(body.password || '');

      if (!username || !password) {
        return sendApiError(response, 400, 'username and password are required');
      }

      const result = authenticateAdmin(username, password, getClientIp(request));
      if (!result) {
        return sendApiError(response, 401, 'invalid_credentials');
      }

      const session = createAdminSession(result.id);
      response.setHeader(
        'Set-Cookie',
        serializeCookie('admin_token', session.token, {
          path: '/',
          httpOnly: true,
          sameSite: 'Lax',
          maxAge: 7 * 24 * 60 * 60
        })
      );
      return sendApi(response, 200, {
        ...result,
        token: session.token,
        expires_at: session.expires_at
      });
    }

    if (request.method === 'GET' && pathnameLower === '/api/admin/me') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }

      return sendApi(response, 200, {
        id: session.admin_id,
        username: session.username,
        permission_flags: session.permission_flags,
        created_at: session.created_at,
        last_seen_at: session.last_seen_at,
        expires_at: session.expires_at
      });
    }

    if (request.method === 'POST' && pathnameLower === '/api/admin/logout') {
      const token = getAdminToken(request);
      if (token) {
        deleteAdminSession(token);
      }
      response.setHeader('Set-Cookie', clearLegacyAdminCookies());
      return sendApi(response, 200, { logged_out: true });
    }

    if (request.method === 'POST' && pathnameLower === '/api/uploads') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }
      const multipart = await readMultipartBody(request, { maxBytes: 1024 * 1024 });
      const uploadType = String(url.searchParams.get('utype') || multipart.fields.utype || 'prod').toLowerCase();
      const uploaded = saveUploadedFile(multipart.files[0], { uploadType });
      return sendApi(response, 201, uploaded);
    }

    if (request.method === 'POST' && pathnameLower === '/api/messages') {
      const body = await readJsonBody(request);
      return sendApi(response, 201, createMessage(body));
    }

    if (request.method === 'POST' && pathnameLower === '/api/contacts') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }
      const body = await readJsonBody(request);
      return sendApi(response, 201, createContact(body));
    }

    if (request.method === 'POST' && pathnameLower === '/api/jobs') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }
      const body = await readJsonBody(request);
      return sendApi(response, 201, createJob(body));
    }

    if ((request.method === 'GET' || request.method === 'POST') && pathnameLower === '/spck/cn/config/config.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }

      const action = String(url.searchParams.get('action') || '').toLowerCase();
      if (request.method === 'POST' && action === 'save') {
        const form = await readFormBody(request);
        updateSiteConfig(normalizeLegacySiteConfigForm(form));
        response.statusCode = 302;
        response.setHeader('Location', 'Config.asp');
        response.end();
        return;
      }

      return sendHtml(response, 200, renderLegacySiteConfigForm(getSiteConfig()));
    }

    if (request.method === 'GET' && pathnameLower === '/spck/cn/config/meta_keywords.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }
      return sendHtml(response, 200, renderLegacyMetaTypesList(listMetaTypes()));
    }

    if (request.method === 'GET' && pathnameLower === '/spck/cn/config/meta_keywords_add.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }
      return sendHtml(response, 200, renderLegacyMetaTypeForm({
        mode: 'add',
        item: {
          type_name: '',
          title: '',
          meta_keywords: '',
          meta_descriptions: ''
        }
      }));
    }

    if (request.method === 'GET' && pathnameLower === '/spck/cn/config/mate_edit.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }

      const id = Number.parseInt(String(url.searchParams.get('id') || ''), 10);
      if (Number.isNaN(id)) {
        return sendHtml(response, 400, renderLegacySimpleMessage('Meta 信息不存在', 'Meta_keywords.asp'));
      }

      const item = getMetaTypeById(id);
      if (!item) {
        return sendHtml(response, 404, renderLegacySimpleMessage('Meta 信息不存在', 'Meta_keywords.asp'));
      }

      return sendHtml(response, 200, renderLegacyMetaTypeForm({ mode: 'edit', item }));
    }

    if (request.method === 'POST' && pathnameLower === '/spck/cn/config/mate_save.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }

      const action = String(url.searchParams.get('action') || '').toLowerCase();
      const form = await readFormBody(request);

      if (action === 'add') {
        createMetaType(normalizeLegacyMetaTypeForm(form));
        return sendHtml(response, 200, renderLegacySimpleSuccess('新增页面 Meta 信息成功', 'Meta_keywords.asp', 'Meta_keywords_add.asp'));
      }

      if (action === 'edit') {
        const id = Number.parseInt(String(form.hidid || ''), 10);
        if (Number.isNaN(id)) {
          return sendHtml(response, 400, renderLegacySimpleMessage('Meta 信息不存在', 'Meta_keywords.asp'));
        }

        const item = updateMetaType(id, normalizeLegacyMetaTypeForm(form));
        if (!item) {
          return sendHtml(response, 404, renderLegacySimpleMessage('Meta 信息不存在', 'Meta_keywords.asp'));
        }

        return sendHtml(response, 200, renderLegacySimpleSuccess('修改页面 Meta 信息成功', 'Meta_keywords.asp'));
      }

      return sendHtml(response, 400, renderLegacySimpleMessage('不支持的 Meta 操作', 'Meta_keywords.asp'));
    }

    if ((request.method === 'GET' || request.method === 'POST') && pathnameLower === '/spck/cn/webtemp/index.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }

      const action = String(url.searchParams.get('action') || '').toLowerCase();
      if (request.method === 'POST' && action === 'saveedit') {
        const form = await readFormBody(request);
        const id = Number.parseInt(String(form.sele || ''), 10);
        if (!Number.isNaN(id)) {
          if (String(form.aaa || '').includes('删除')) {
            try {
              deleteTemplateVariant(id);
            } catch (error) {
              return sendHtml(response, 400, renderLegacySimpleMessage(error.message, 'index.asp'));
            }
          } else {
            setSelectedTemplateVariant(id);
          }
        }
      }

      return sendHtml(response, 200, renderLegacyTemplateVariantsList(listTemplateVariants()));
    }

    if ((request.method === 'GET' || request.method === 'POST') && pathnameLower === '/spck/cn/webtemp/cuskind.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }

      const action = String(url.searchParams.get('action') || '').toLowerCase();
      if (action === 'add' && request.method === 'POST') {
        const form = await readFormBody(request);
        createCustomLabelKind({ addkind: form.addkind });
        response.statusCode = 302;
        response.setHeader('Location', 'cuskind.asp');
        response.end();
        return;
      }
      if (action === 'del') {
        const id = Number.parseInt(String(url.searchParams.get('id') || ''), 10);
        if (!Number.isNaN(id)) {
          deleteCustomLabelKind(id);
        }
        response.statusCode = 302;
        response.setHeader('Location', 'cuskind.asp');
        response.end();
        return;
      }

      return sendHtml(response, 200, renderLegacyCustomLabelKindsList(listCustomLabelKinds()));
    }

    if ((request.method === 'GET' || request.method === 'POST') && pathnameLower === '/spck/cn/webtemp/cuskind_ed.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }

      const id = Number.parseInt(String(url.searchParams.get('id') || ''), 10);
      if (Number.isNaN(id)) {
        return sendHtml(response, 400, renderLegacySimpleMessage('自定义标签分类不存在', 'cuskind.asp'));
      }

      const action = String(url.searchParams.get('action') || '').toLowerCase();
      if (action === 'save' && request.method === 'POST') {
        const form = await readFormBody(request);
        const item = updateCustomLabelKind(id, { addkind: form.addkind });
        if (!item) {
          return sendHtml(response, 404, renderLegacySimpleMessage('自定义标签分类不存在', 'cuskind.asp'));
        }
        response.statusCode = 302;
        response.setHeader('Location', 'cuskind.asp');
        response.end();
        return;
      }

      const item = getCustomLabelKindById(id);
      if (!item) {
        return sendHtml(response, 404, renderLegacySimpleMessage('自定义标签分类不存在', 'cuskind.asp'));
      }
      return sendHtml(response, 200, renderLegacyCustomLabelKindForm(item));
    }

    if ((request.method === 'GET' || request.method === 'POST') && pathnameLower === '/spck/cn/webtemp/cuslabel.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }

      const action = String(url.searchParams.get('action') || '').toLowerCase();
      if (action === 'del') {
        const id = Number.parseInt(String(url.searchParams.get('id') || ''), 10);
        if (!Number.isNaN(id)) {
          deleteCustomLabel(id);
        }
        response.statusCode = 302;
        response.setHeader('Location', 'cuslabel.asp');
        response.end();
        return;
      }

      return sendHtml(response, 200, renderLegacyCustomLabelsList(listCustomLabels()));
    }

    if ((request.method === 'GET' || request.method === 'POST') && pathnameLower === '/spck/cn/webtemp/addcuslabel.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }

      const action = String(url.searchParams.get('action') || '').toLowerCase();
      if (action === 'add' && request.method === 'POST') {
        const form = await readFormBody(request);
        createCustomLabel(form);
        response.statusCode = 302;
        response.setHeader('Location', 'cuslabel.asp');
        response.end();
        return;
      }

      return sendHtml(response, 200, renderLegacyCustomLabelForm({
        mode: 'add',
        item: { raw_name: '', description: '', content: '', kind_id: null },
        kinds: listCustomLabelKinds()
      }));
    }

    if ((request.method === 'GET' || request.method === 'POST') && pathnameLower === '/spck/cn/webtemp/cuslabel_ed.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }

      const id = Number.parseInt(String(url.searchParams.get('id') || ''), 10);
      if (Number.isNaN(id)) {
        return sendHtml(response, 400, renderLegacySimpleMessage('自定义标签不存在', 'cuslabel.asp'));
      }

      const action = String(url.searchParams.get('action') || '').toLowerCase();
      if (action === 'save' && request.method === 'POST') {
        const form = await readFormBody(request);
        const item = updateCustomLabel(id, form);
        if (!item) {
          return sendHtml(response, 404, renderLegacySimpleMessage('自定义标签不存在', 'cuslabel.asp'));
        }
        response.statusCode = 302;
        response.setHeader('Location', 'cuslabel.asp');
        response.end();
        return;
      }

      const item = getCustomLabelById(id);
      if (!item) {
        return sendHtml(response, 404, renderLegacySimpleMessage('自定义标签不存在', 'cuslabel.asp'));
      }
      return sendHtml(response, 200, renderLegacyCustomLabelForm({
        mode: 'edit',
        item,
        kinds: listCustomLabelKinds()
      }));
    }

    if (request.method === 'GET' && pathnameLower === '/spck/cn/webtemp/cuscheck.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }
      const rawName = String(url.searchParams.get('str') || '');
      return sendHtml(response, 200, renderLegacyCustomLabelCheck(rawName, findCustomLabelByName(rawName)));
    }

    if ((request.method === 'GET' || request.method === 'POST') && pathnameLower.startsWith('/spck/cn/webtemp/')) {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }

      const templatePage = getLegacyTemplateEditorPage(pathnameLower);
      if (templatePage) {
        const id = Number.parseInt(String(url.searchParams.get('id') || ''), 10);
        if (Number.isNaN(id)) {
          return sendHtml(response, 400, renderLegacySimpleMessage('模板不存在', 'index.asp'));
        }

        if (request.method === 'POST' && String(url.searchParams.get('action') || '').toLowerCase() === 'saveedit') {
          const form = await readFormBody(request);
          const item = updateLegacyTemplateEditorField(id, templatePage, form);
          if (!item) {
            return sendHtml(response, 404, renderLegacySimpleMessage('模板不存在', 'index.asp'));
          }
          response.statusCode = 302;
          response.setHeader('Location', `/spck/cn/webtemp/${templatePage.fileName}?id=${id}`);
          response.end();
          return;
        }

        const item = getTemplateVariantById(id);
        if (!item) {
          return sendHtml(response, 404, renderLegacySimpleMessage('模板不存在', 'index.asp'));
        }
        return sendHtml(response, 200, renderLegacyTemplateEditorForm({ page: templatePage, item }));
      }
    }

    if ((request.method === 'GET' || request.method === 'POST') && pathnameLower === '/spck/cn/corporation/co_class.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }

      const action = String(url.searchParams.get('action') || '').toLowerCase();
      if (request.method === 'POST' && action === 'del') {
        const form = await readFormBody(request);
        const ids = normalizeLegacyMultiIds(form.selAnnounce);
        for (const id of ids) {
          deleteCorporationCategory(id);
        }
      }

      const parentId = url.searchParams.get('id') || '0';
      return sendHtml(response, 200, renderLegacyCorporationCategoriesList({
        items: listCorporationCategoriesAdmin({ parentId }),
        parentId: Number.parseInt(String(parentId), 10) || 0
      }));
    }

    if (request.method === 'GET' && pathnameLower === '/spck/cn/corporation/co_class_add.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }

      return sendHtml(response, 200, renderLegacyCorporationCategoryForm({
        mode: 'add',
        roots: listRootCorporationCategories(),
        item: {
          parent_id: 0,
          name: '',
          sort_order: getNextCorporationCategorySortOrder(0),
          is_external: 0,
          external_url: ''
        }
      }));
    }

    if (request.method === 'GET' && pathnameLower === '/spck/cn/corporation/co_class_edit.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }

      const id = Number.parseInt(String(url.searchParams.get('id') || ''), 10);
      if (Number.isNaN(id)) {
        return sendHtml(response, 400, renderLegacySimpleMessage('公司信息分类不存在', 'Co_Class.asp'));
      }

      const item = getCorporationCategoryById(id);
      if (!item) {
        return sendHtml(response, 404, renderLegacySimpleMessage('公司信息分类不存在', 'Co_Class.asp'));
      }

      return sendHtml(response, 200, renderLegacyCorporationCategoryForm({
        mode: 'edit',
        roots: listRootCorporationCategories().filter((root) => root.id !== id),
        item
      }));
    }

    if (request.method === 'POST' && pathnameLower === '/spck/cn/corporation/co_class_save.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }

      const action = String(url.searchParams.get('action') || '').toLowerCase();
      const form = await readFormBody(request);

      if (action === 'add') {
        createCorporationCategory(normalizeLegacyCorporationCategoryForm(form));
        return sendHtml(response, 200, renderLegacySimpleSuccess('添加公司信息分类成功', 'Co_Class.asp', 'Co_Class_add.asp'));
      }

      if (action === 'edit') {
        const id = Number.parseInt(String(form.hidid || ''), 10);
        if (Number.isNaN(id)) {
          return sendHtml(response, 400, renderLegacySimpleMessage('公司信息分类不存在', 'Co_Class.asp'));
        }

        const item = updateCorporationCategory(id, normalizeLegacyCorporationCategoryForm(form));
        if (!item) {
          return sendHtml(response, 404, renderLegacySimpleMessage('公司信息分类不存在', 'Co_Class.asp'));
        }

        return sendHtml(response, 200, renderLegacySimpleSuccess('修改公司信息分类成功', String(form.hidurl || 'Co_Class.asp')));
      }

      return sendHtml(response, 400, renderLegacySimpleMessage('不支持的公司分类操作', 'Co_Class.asp'));
    }

    if (request.method === 'GET' && pathnameLower === '/spck/cn/corporation/co_edit.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }

      const id = Number.parseInt(String(url.searchParams.get('id') || ''), 10);
      if (Number.isNaN(id)) {
        return sendHtml(response, 400, renderLegacySimpleMessage('公司信息不存在', 'Co_Class.asp'));
      }

      const item = getCorporationCategoryById(id);
      if (!item) {
        return sendHtml(response, 404, renderLegacySimpleMessage('公司信息不存在', 'Co_Class.asp'));
      }

      return sendHtml(response, 200, renderLegacyCorporationContentForm(item));
    }

    if (request.method === 'POST' && pathnameLower === '/spck/cn/corporation/co_save.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }

      const action = String(url.searchParams.get('action') || '').toLowerCase();
      if (action === 'save') {
        const form = await readFormBody(request);
        const id = Number.parseInt(String(form.select || ''), 10);
        if (Number.isNaN(id)) {
          return sendHtml(response, 400, renderLegacySimpleMessage('公司信息不存在', 'Co_Class.asp'));
        }

        const item = updateCorporationCategoryContent(id, form.content);
        if (!item) {
          return sendHtml(response, 404, renderLegacySimpleMessage('公司信息不存在', 'Co_Class.asp'));
        }

        return sendHtml(response, 200, renderLegacySimpleSuccess('更新公司信息成功', 'Co_Class.asp'));
      }

      return sendHtml(response, 400, renderLegacySimpleMessage('不支持的公司信息操作', 'Co_Class.asp'));
    }

    if ((request.method === 'GET' || request.method === 'POST') && pathnameLower === '/spck/system/admin_admin.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }

      const action = String(url.searchParams.get('action') || '').toLowerCase();
      if (action === 'del') {
        const id = Number.parseInt(String(url.searchParams.get('id') || ''), 10);
        if (!Number.isNaN(id)) {
          if (id === Number.parseInt(String(session.admin_id || ''), 10)) {
            return sendHtml(response, 400, renderLegacySimpleMessage('不能删除当前登录的管理员账号', 'admin_admin.asp'));
          }
          deleteAdmin(id);
        }
      }

      return sendHtml(response, 200, renderLegacyAdminsList(listAdminsAdmin()));
    }

    if ((request.method === 'GET' || request.method === 'POST') && pathnameLower === '/spck/system/admin_admin_ok.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }

      const action = String(url.searchParams.get('action') || '').toLowerCase();

      if (request.method === 'POST' && action === 'addsave') {
        const form = await readFormBody(request);
        createAdmin(normalizeLegacyAdminForm(form, { requirePassword: true }));
        return sendHtml(response, 200, renderLegacySimpleSuccess('新增管理员成功', 'admin_admin.asp'));
      }

      if (request.method === 'POST' && action === 'editsave') {
        const form = await readFormBody(request);
        const formId = Number.parseInt(String(url.searchParams.get('id') || form.id || ''), 10);
        if (Number.isNaN(formId)) {
          return sendHtml(response, 400, renderLegacySimpleMessage('管理员不存在', 'admin_admin.asp'));
        }
        const admin = updateAdmin(formId, normalizeLegacyAdminForm(form));
        if (!admin) {
          return sendHtml(response, 404, renderLegacySimpleMessage('管理员不存在', 'admin_admin.asp'));
        }
        return sendHtml(response, 200, renderLegacySimpleSuccess('修改管理员成功', 'admin_admin.asp'));
      }

      if (action === 'add') {
        return sendHtml(response, 200, renderLegacyAdminForm({
          mode: 'add',
          admin: {
            username: '',
            permission_flags: ''
          }
        }));
      }

      const id = Number.parseInt(String(url.searchParams.get('id') || ''), 10);
      if (Number.isNaN(id)) {
        return sendHtml(response, 400, renderLegacySimpleMessage('管理员不存在', 'admin_admin.asp'));
      }

      const admin = getAdminById(id);
      if (!admin) {
        return sendHtml(response, 404, renderLegacySimpleMessage('管理员不存在', 'admin_admin.asp'));
      }

      return sendHtml(response, 200, renderLegacyAdminForm({ mode: 'edit', admin }));
    }

    if ((request.method === 'GET' || request.method === 'POST') && pathnameLower === '/spck/system/admin_adminmodifypwd.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }

      const action = String(url.searchParams.get('action') || '').toLowerCase();
      if (request.method === 'POST' && action === 'editsave') {
        const form = await readFormBody(request);
        updateAdminPassword(session.admin_id, form.password);
        return sendHtml(response, 200, renderLegacySimpleSuccess('修改密码成功', 'admin_adminmodifypwd.asp'));
      }

      const admin = getAdminById(session.admin_id);
      if (!admin) {
        return sendHtml(response, 404, renderLegacySimpleMessage('管理员不存在', '../login.asp'));
      }

      return sendHtml(response, 200, renderLegacyAdminPasswordForm(admin));
    }

    if ((request.method === 'GET' || request.method === 'POST') && pathnameLower === '/spck/cn/msg/msg.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }

      const action = String(url.searchParams.get('action') || '').toLowerCase();
      if (action === 'del') {
        let ids = [];
        if (request.method === 'POST') {
          const form = await readFormBody(request);
          ids = normalizeLegacyMultiIds(form.selAnnounce);
        } else {
          ids = normalizeLegacyMultiIds(url.searchParams.get('selAnnounce') || url.searchParams.get('id'));
        }

        for (const id of ids) {
          deleteMessage(id);
        }
      }

      const page = url.searchParams.get('page') || '1';
      return sendHtml(response, 200, renderLegacyMessagesList(listMessagesAdmin({ page, limit: 10 })));
    }

    if (request.method === 'GET' && pathnameLower === '/spck/cn/msg/show.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }

      const id = Number.parseInt(String(url.searchParams.get('id') || ''), 10);
      if (Number.isNaN(id)) {
        return sendHtml(response, 400, renderLegacySimpleMessage('留言不存在', 'Msg.asp'));
      }

      const message = getMessageById(id);
      if (!message) {
        return sendHtml(response, 404, renderLegacySimpleMessage('留言不存在', 'Msg.asp'));
      }

      return sendHtml(response, 200, renderLegacyMessageDetail(message));
    }

    if (request.method === 'GET' && pathnameLower === '/spck/cn/msg/chu.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }

      const id = Number.parseInt(String(url.searchParams.get('id') || ''), 10);
      if (Number.isNaN(id)) {
        return sendHtml(response, 400, renderLegacySimpleMessage('留言不存在', 'Msg.asp'));
      }

      const existing = getMessageById(id);
      if (!existing) {
        return sendHtml(response, 404, renderLegacySimpleMessage('留言不存在', 'Msg.asp'));
      }

      updateMessage(id, {
        status: 1,
        legacy_extra: {
          handled_at: formatLegacyDate(new Date().toISOString())
        }
      });

      response.statusCode = 302;
      response.setHeader('Location', 'Msg.asp');
      response.end();
      return;
    }

    if (request.method === 'GET' && pathnameLower === '/spck/cn/offices/offices.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }
      return sendHtml(response, 200, renderLegacyOfficesList(listContacts()));
    }

    if (request.method === 'GET' && pathnameLower === '/spck/cn/offices/offices_add.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }
      return sendHtml(response, 200, renderLegacyOfficeForm({
        mode: 'add',
        defaults: {
          office_name: '',
          address: '',
          phone: '',
          fax: '',
          contact_person: '',
          email: '',
          postal_code: ''
        }
      }));
    }

    if (request.method === 'GET' && pathnameLower === '/spck/cn/offices/offices_edit.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }

      const id = Number.parseInt(String(url.searchParams.get('id') || ''), 10);
      if (Number.isNaN(id)) {
        return sendHtml(response, 400, renderLegacySimpleMessage('联系方式不存在', 'Offices.asp'));
      }

      const contact = getContactById(id);
      if (!contact) {
        return sendHtml(response, 404, renderLegacySimpleMessage('联系方式不存在', 'Offices.asp'));
      }

      return sendHtml(response, 200, renderLegacyOfficeForm({
        mode: 'edit',
        contact
      }));
    }

    if ((request.method === 'GET' || request.method === 'POST') && pathnameLower === '/spck/cn/offices/offices_save.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }

      const action = String(url.searchParams.get('action') || '').toLowerCase();

      if (request.method === 'GET' && action === 'del') {
        const id = Number.parseInt(String(url.searchParams.get('id') || ''), 10);
        if (Number.isNaN(id)) {
          return sendHtml(response, 400, renderLegacySimpleMessage('联系方式不存在', 'Offices.asp'));
        }
        const deleted = deleteContact(id);
        if (!deleted) {
          return sendHtml(response, 404, renderLegacySimpleMessage('联系方式不存在', 'Offices.asp'));
        }
        return sendHtml(response, 200, renderLegacySimpleSuccess('删除办事处信息成功', 'Offices.asp'));
      }

      if (request.method !== 'POST') {
        return sendPlainError(response, 400, 'unsupported method');
      }

      const form = await readFormBody(request);
      if (action === 'add') {
        createContact(normalizeLegacyOfficeForm(form));
        return sendHtml(response, 200, renderLegacySimpleSuccess('添加办事处联系信息成功', 'Offices.asp', 'Offices_add.asp'));
      }

      if (action === 'save') {
        const id = Number.parseInt(String(form.hidid || ''), 10);
        if (Number.isNaN(id)) {
          return sendHtml(response, 400, renderLegacySimpleMessage('联系方式不存在', 'Offices.asp'));
        }
        const updated = updateContact(id, normalizeLegacyOfficeForm(form));
        if (!updated) {
          return sendHtml(response, 404, renderLegacySimpleMessage('联系方式不存在', 'Offices.asp'));
        }
        return sendHtml(response, 200, renderLegacySimpleSuccess('修改办事处联系信息成功', 'Offices.asp'));
      }

      return sendPlainError(response, 400, 'unsupported action');
    }

    if ((request.method === 'GET' || request.method === 'POST') && pathnameLower === '/spck/cn/job/job.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }

      const action = String(url.searchParams.get('action') || '').toLowerCase();
      if (request.method === 'GET' && action === 'del') {
        const id = Number.parseInt(String(url.searchParams.get('id') || ''), 10);
        if (Number.isNaN(id)) {
          return sendHtml(response, 400, renderLegacySimpleMessage('招聘信息不存在', 'job.asp'));
        }
        const deleted = deleteJob(id);
        if (!deleted) {
          return sendHtml(response, 404, renderLegacySimpleMessage('招聘信息不存在', 'job.asp'));
        }
        return sendHtml(response, 200, renderLegacySimpleSuccess('删除招聘信息成功', 'job.asp'));
      }

      const page = url.searchParams.get('page') || '1';
      const limit = url.searchParams.get('limit') || '20';
      return sendHtml(response, 200, renderLegacyJobList(listJobsAdmin({ page, limit })));
    }

    if (request.method === 'GET' && pathnameLower === '/spck/cn/job/job_add.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }
      return sendHtml(response, 200, renderLegacyJobForm({
        mode: 'add',
        defaults: {
          name: '',
          address: '',
          openings: '1',
          contact_person: '',
          phone: '',
          is_active: 1,
          requirements_html: ''
        }
      }));
    }

    if (request.method === 'GET' && pathnameLower === '/spck/cn/job/job_edit.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }

      const id = Number.parseInt(String(url.searchParams.get('id') || ''), 10);
      if (Number.isNaN(id)) {
        return sendHtml(response, 400, renderLegacySimpleMessage('招聘信息不存在', 'job.asp'));
      }

      const job = getJobById(id);
      if (!job) {
        return sendHtml(response, 404, renderLegacySimpleMessage('招聘信息不存在', 'job.asp'));
      }

      return sendHtml(response, 200, renderLegacyJobForm({
        mode: 'edit',
        job
      }));
    }

    if (request.method === 'POST' && pathnameLower === '/spck/cn/job/job_save.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }

      const action = String(url.searchParams.get('action') || '').toLowerCase();
      const form = await readFormBody(request);

      if (action === 'add') {
        createJob(normalizeLegacyJobForm(form));
        return sendHtml(response, 200, renderLegacySimpleSuccess('添加招聘信息成功', 'job.asp', 'job_add.asp'));
      }

      if (action === 'save') {
        const id = Number.parseInt(String(form.hidid || ''), 10);
        if (Number.isNaN(id)) {
          return sendHtml(response, 400, renderLegacySimpleMessage('招聘信息不存在', 'job.asp'));
        }
        const updated = updateJob(id, normalizeLegacyJobForm(form, { existing: getJobById(id) }));
        if (!updated) {
          return sendHtml(response, 404, renderLegacySimpleMessage('招聘信息不存在', 'job.asp'));
        }
        return sendHtml(response, 200, renderLegacySimpleSuccess('修改招聘信息成功', 'job.asp'));
      }

      return sendPlainError(response, 400, 'unsupported action');
    }

    if ((request.method === 'GET' || request.method === 'POST') && pathnameLower === '/spck/cn/news/news_index.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }

      if (request.method === 'POST' && String(url.searchParams.get('action') || '').toLowerCase() === 'del') {
        const form = await readFormBody(request);
        const ids = normalizeLegacyMultiIds(form.selAnnounce);
        for (const id of ids) {
          deleteNews(id);
        }
      }

      const page = url.searchParams.get('page') || '1';
      const result = listNewsAdmin({ page, limit: 15 });
      return sendHtml(response, 200, renderLegacyNewsList(result));
    }

    if (request.method === 'GET' && pathnameLower === '/spck/cn/news/news_add.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }
      return sendHtml(response, 200, renderLegacyNewsForm({
        mode: 'add',
        categories: listNewsCategoryOptions(),
        defaults: {
          title: '',
          keywords: '',
          summary: '',
          content_html: '',
          picture: '/UploadFile/nopicture.gif',
          is_featured_home: 0
        }
      }));
    }

    if (request.method === 'GET' && pathnameLower === '/spck/cn/news/news_edit.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }

      const id = Number.parseInt(String(url.searchParams.get('newsid') || ''), 10);
      if (Number.isNaN(id)) {
        return sendHtml(response, 400, renderLegacySimpleMessage('新闻不存在', 'News_index.asp'));
      }

      const item = getNewsById(id);
      if (!item) {
        return sendHtml(response, 404, renderLegacySimpleMessage('新闻不存在', 'News_index.asp'));
      }

      return sendHtml(response, 200, renderLegacyNewsForm({
        mode: 'edit',
        categories: listNewsCategoryOptions(),
        item
      }));
    }

    if (request.method === 'POST' && pathnameLower === '/spck/cn/news/news_save.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }

      const action = String(url.searchParams.get('action') || '').toLowerCase();
      const form = await readFormBody(request);

      if (action === 'add') {
        createNews(normalizeLegacyNewsForm(form));
        return sendHtml(response, 200, renderLegacySimpleSuccess('添加新闻成功', 'News_index.asp', 'News_add.asp'));
      }

      if (action === 'save') {
        const id = Number.parseInt(String(form.hidid || ''), 10);
        if (Number.isNaN(id)) {
          return sendHtml(response, 400, renderLegacySimpleMessage('新闻不存在', 'News_index.asp'));
        }

        const updated = updateNews(id, normalizeLegacyNewsForm(form, { existing: getNewsById(id) }));
        if (!updated) {
          return sendHtml(response, 404, renderLegacySimpleMessage('新闻不存在', 'News_index.asp'));
        }
        return sendHtml(response, 200, renderLegacySimpleSuccess('修改新闻成功', 'News_index.asp'));
      }

      return sendPlainError(response, 400, 'unsupported action');
    }

    if (request.method === 'GET' && pathnameLower === '/spck/cn/news/class.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }

      const parentId = url.searchParams.get('id') || '0';
      const page = url.searchParams.get('page') || '1';
      const result = listNewsCategoriesAdmin({ parentId, page, limit: 10 });
      const parentCategory = Number.parseInt(String(parentId), 10) > 0
        ? getNewsCategoryById(Number.parseInt(String(parentId), 10))
        : null;
      return sendHtml(response, 200, renderLegacyNewsCategoryList(result, Number.parseInt(String(parentId), 10) || 0, parentCategory));
    }

    if (request.method === 'GET' && pathnameLower === '/spck/cn/news/class_add.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }
      return sendHtml(response, 200, renderLegacyNewsCategoryForm({
        mode: 'add',
        rootCategories: listRootNewsCategories(),
        defaults: {
          parent_id: 0,
          sort_order: 1
        }
      }));
    }

    if (request.method === 'GET' && pathnameLower === '/spck/cn/news/class_edit.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }

      const id = Number.parseInt(String(url.searchParams.get('id') || ''), 10);
      if (Number.isNaN(id)) {
        return sendHtml(response, 400, renderLegacySimpleMessage('分类不存在', 'Class.asp'));
      }

      const category = getNewsCategoryById(id);
      if (!category) {
        return sendHtml(response, 404, renderLegacySimpleMessage('分类不存在', 'Class.asp'));
      }

      return sendHtml(response, 200, renderLegacyNewsCategoryForm({
        mode: 'edit',
        rootCategories: listRootNewsCategories().filter((item) => item.id !== id),
        category
      }));
    }

    if ((request.method === 'GET' || request.method === 'POST') &&
      (pathnameLower === '/spck/cn/news/class_save.asp')) {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }

      const action = String(url.searchParams.get('action') || '').toLowerCase();

      if (request.method === 'GET' && action === 'del') {
        const id = Number.parseInt(String(url.searchParams.get('id') || ''), 10);
        if (Number.isNaN(id)) {
          return sendHtml(response, 400, renderLegacySimpleMessage('分类不存在', 'Class.asp'));
        }
        const deleted = deleteNewsCategory(id);
        if (!deleted) {
          return sendHtml(response, 404, renderLegacySimpleMessage('分类不存在', 'Class.asp'));
        }
        return sendHtml(response, 200, renderLegacySimpleSuccess('删除新闻分类成功', 'Class.asp'));
      }

      if (request.method !== 'POST') {
        return sendPlainError(response, 400, 'unsupported method');
      }

      const form = await readFormBody(request);
      if (action === 'add') {
        createNewsCategory(normalizeLegacyNewsCategoryForm(form));
        return sendHtml(response, 200, renderLegacySimpleSuccess('添加新闻分类成功', 'Class.asp', 'Class_add.asp'));
      }

      if (action === 'save') {
        const id = Number.parseInt(String(form.hidid || ''), 10);
        if (Number.isNaN(id)) {
          return sendHtml(response, 400, renderLegacySimpleMessage('分类不存在', 'Class.asp'));
        }
        const updated = updateNewsCategory(id, normalizeLegacyNewsCategoryForm(form));
        if (!updated) {
          return sendHtml(response, 404, renderLegacySimpleMessage('分类不存在', 'Class.asp'));
        }
        return sendHtml(response, 200, renderLegacySimpleSuccess('修改新闻分类成功', 'Class.asp'));
      }

      return sendPlainError(response, 400, 'unsupported action');
    }

    if (request.method === 'POST' && pathnameLower === '/ajaxcode/prodmsg.asp') {
      const form = await readFormBody(request);
      const action = String(url.searchParams.get('action') || '').toLowerCase();
      if (action === 'add' || action === 'msgadd') {
        createMessage({
          contact_name: form.name,
          phone: form.phone,
          title: form.title || form.Title,
          product_id: form.prodid,
          content: form.content,
          address: form.address,
          mobile: form.mobile,
          fax: form.fax,
          email: form.email
        });
        response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('true');
        return;
      }
      return sendPlainError(response, 400, 'false');
    }

    if (request.method === 'POST' && pathnameLower === '/ajaxcode/msg.asp') {
      const form = await readFormBody(request);
      const action = String(url.searchParams.get('action') || '').toLowerCase();

      if (action === 'msgadd') {
        createMessage({
          contact_name: form.name,
          phone: form.phone,
          title: form.title,
          content: form.content,
          product_id: 0,
          address: form.address,
          mobile: form.mobile,
          fax: form.fax,
          email: form.email
        });
        response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('true');
        return;
      }

      return sendPlainError(response, 400, 'false');
    }

    if ((request.method === 'GET' || request.method === 'POST') &&
      (pathnameLower === '/inc/upload.asp' || pathnameLower === '/inc/upload2.asp' || pathnameLower === '/inc/upload3.asp')) {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }

      if (request.method === 'GET') {
        return sendHtml(response, 200, renderLegacyUploadForm(url.pathname, url.searchParams));
      }

      try {
        const multipart = await readMultipartBody(request, { maxBytes: 1024 * 1024 });
        const uploadType = String(url.searchParams.get('utype') || multipart.fields.utype || 'prod').toLowerCase();
        const uploaded = saveUploadedFile(multipart.files[0], { uploadType });
        return sendHtml(response, 200, renderLegacyUploadResult(url.pathname, url.searchParams, uploaded));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return sendHtml(response, 400, renderLegacyUploadError(message));
      }
    }

    if ((request.method === 'GET' || request.method === 'POST') && pathnameLower === '/spck/cn/produts/prodphoto.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }

      if (request.method === 'POST' && String(url.searchParams.get('action') || '').toLowerCase() === 'del') {
        const form = await readFormBody(request);
        const ids = normalizeLegacyMultiIds(form.selAnnounce);
        for (const id of ids) {
          deleteProductPhoto(id);
        }
      }

      const page = url.searchParams.get('page') || '1';
      const result = listProductPhotos({ page, limit: 10 });
      return sendHtml(response, 200, renderLegacyProductPhotoList(result));
    }

    if ((request.method === 'GET' || request.method === 'POST') && pathnameLower === '/spck/cn/produts/prod.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }

      if (request.method === 'POST' && String(url.searchParams.get('action') || '').toLowerCase() === 'del') {
        const form = await readFormBody(request);
        const ids = normalizeLegacyMultiIds(form.selAnnounce);
        for (const id of ids) {
          deleteProduct(id);
        }
      }

      const page = url.searchParams.get('page') || '1';
      const result = listProductsAdmin({ page, limit: 50 });
      return sendHtml(response, 200, renderLegacyProductList(result));
    }

    if (request.method === 'GET' && pathnameLower === '/spck/cn/produts/prodcat.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }

      const parentId = url.searchParams.get('id') || '0';
      const page = url.searchParams.get('page') || '1';
      const result = listProductCategoriesAdmin({ parentId, page, limit: 10 });
      const parentCategory = Number.parseInt(String(parentId), 10) > 0
        ? getProductCategoryById(Number.parseInt(String(parentId), 10))
        : null;
      return sendHtml(response, 200, renderLegacyProductCategoryList(result, Number.parseInt(String(parentId), 10) || 0, parentCategory));
    }

    if (request.method === 'GET' && pathnameLower === '/spck/cn/produts/prodcat_add.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }
      return sendHtml(response, 200, renderLegacyProductCategoryForm({
        mode: 'add',
        rootCategories: listRootProductCategories(),
        defaults: {
          parent_id: 0,
          sort_order: getNextProductCategorySortOrder(0),
          seo_keywords: '',
          seo_description: ''
        }
      }));
    }

    if (request.method === 'GET' && pathnameLower === '/spck/cn/produts/prodcat_edit.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }

      const id = Number.parseInt(String(url.searchParams.get('id') || ''), 10);
      if (Number.isNaN(id)) {
        return sendHtml(response, 400, renderLegacySimpleMessage('分类不存在', 'prodcat.asp'));
      }

      const category = getProductCategoryById(id);
      if (!category) {
        return sendHtml(response, 404, renderLegacySimpleMessage('分类不存在', 'prodcat.asp'));
      }

      return sendHtml(response, 200, renderLegacyProductCategoryForm({
        mode: 'edit',
        rootCategories: listRootProductCategories().filter((item) => item.id !== id),
        category
      }));
    }

    if (request.method === 'GET' && pathnameLower === '/spck/cn/produts/prod_add.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }
      return sendHtml(response, 200, renderLegacyProductForm({
        mode: 'add',
        categories: listProductCategoryOptions(),
        defaults: {
          sort_order: getNextProductSortOrder(),
          is_visible: 1,
          is_featured_home: 0,
          small_image: '',
          large_image: '',
          content_html: '',
          summary: '',
          keywords: ''
        }
      }));
    }

    if (request.method === 'GET' && pathnameLower === '/spck/cn/produts/prod_edit.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }

      const id = Number.parseInt(String(url.searchParams.get('id') || ''), 10);
      if (Number.isNaN(id)) {
        return sendHtml(response, 400, renderLegacySimpleMessage('产品不存在', 'prod.asp'));
      }

      const product = getProductById(id);
      if (!product) {
        return sendHtml(response, 404, renderLegacySimpleMessage('产品不存在', 'prod.asp'));
      }

      return sendHtml(response, 200, renderLegacyProductForm({
        mode: 'edit',
        categories: listProductCategoryOptions(),
        product
      }));
    }

    if (request.method === 'GET' && pathnameLower === '/spck/cn/produts/prodphoto_add.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }
      return sendHtml(response, 200, renderLegacyProductPhotoAdd());
    }

    if (request.method === 'POST' && pathnameLower === '/spck/cn/produts/prodphoto_save.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }
      const action = String(url.searchParams.get('action') || '').toLowerCase();
      if (action === 'add') {
        const form = await readFormBody(request);
        createProductPhoto({
          name: form.photoName,
          image_path: form.picture
        });
        return sendHtml(response, 200, renderLegacySimpleSuccess('添加图片成功', 'prodphoto.asp', 'prodphoto_add.asp'));
      }
      return sendPlainError(response, 400, 'unsupported action');
    }

    if (request.method === 'POST' && pathnameLower === '/spck/cn/produts/prod_save.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }

      const action = String(url.searchParams.get('action') || '').toLowerCase();
      const form = await readFormBody(request);

      if (action === 'add') {
        createProduct(normalizeLegacyProductForm(form));
        return sendHtml(response, 200, renderLegacySimpleSuccess('添加产品成功', 'prod.asp', 'prod_add.asp'));
      }

      if (action === 'save') {
        const id = Number.parseInt(String(form.hidid || ''), 10);
        if (Number.isNaN(id)) {
          return sendHtml(response, 400, renderLegacySimpleMessage('产品不存在', 'prod.asp'));
        }

        const product = updateProduct(id, normalizeLegacyProductForm(form));
        if (!product) {
          return sendHtml(response, 404, renderLegacySimpleMessage('产品不存在', 'prod.asp'));
        }
        return sendHtml(response, 200, renderLegacySimpleSuccess('修改产品成功', 'prod.asp'));
      }

      return sendPlainError(response, 400, 'unsupported action');
    }

    if ((request.method === 'GET' || request.method === 'POST') && pathnameLower === '/spck/cn/produts/prodcat_save.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }

      const action = String(url.searchParams.get('action') || '').toLowerCase();

      if (request.method === 'GET' && action === 'del') {
        const id = Number.parseInt(String(url.searchParams.get('id') || ''), 10);
        if (Number.isNaN(id)) {
          return sendHtml(response, 400, renderLegacySimpleMessage('分类不存在', 'prodcat.asp'));
        }

        const deleted = deleteProductCategory(id);
        if (!deleted) {
          return sendHtml(response, 404, renderLegacySimpleMessage('分类不存在', 'prodcat.asp'));
        }
        return sendHtml(response, 200, renderLegacySimpleSuccess('删除产品分类成功', 'prodcat.asp'));
      }

      if (request.method !== 'POST') {
        return sendPlainError(response, 400, 'unsupported method');
      }

      const form = await readFormBody(request);
      if (action === 'add') {
        createProductCategory(normalizeLegacyProductCategoryForm(form));
        return sendHtml(response, 200, renderLegacySimpleSuccess('添加产品分类成功', 'prodcat.asp', 'prodcat_add.asp'));
      }

      if (action === 'save') {
        const id = Number.parseInt(String(form.hidid || ''), 10);
        if (Number.isNaN(id)) {
          return sendHtml(response, 400, renderLegacySimpleMessage('分类不存在', 'prodcat.asp'));
        }

        const category = updateProductCategory(id, normalizeLegacyProductCategoryForm(form));
        if (!category) {
          return sendHtml(response, 404, renderLegacySimpleMessage('分类不存在', 'prodcat.asp'));
        }
        return sendHtml(response, 200, renderLegacySimpleSuccess('修改产品分类成功', 'prodcat.asp'));
      }

      return sendPlainError(response, 400, 'unsupported action');
    }

    if (request.method === 'GET' && pathnameLower === '/spck/cn/produts/photoshow.asp') {
      const session = requireAdminSession(request, response);
      if (!session) {
        return;
      }
      const page = url.searchParams.get('page') || '1';
      const action = url.searchParams.get('action') || '1';
      const result = listProductPhotos({ page, limit: 8 });
      return sendHtml(response, 200, renderLegacyPhotoShow(result, action));
    }

    if ((request.method === 'GET' || request.method === 'POST') && pathnameLower === '/search.asp') {
      const form = request.method === 'POST' ? await readFormBody(request) : {};
      const query = normalizeLegacySearchQuery(
        String(
          form.ProductsName ||
          form.q ||
          url.searchParams.get('ProductsName') ||
          url.searchParams.get('q') ||
          ''
        ).trim()
      );
      const page = Number.parseInt(String(form.page || url.searchParams.get('page') || '1'), 10) || 1;
      const result = searchProductsPaged(query, { page, limit: 6 });
      const html = renderSearchPage({
        query,
        result
      });
      return sendHtml(response, 200, html);
    }

    if (request.method === 'GET' || request.method === 'HEAD') {
      const served = await serveStaticFile(response, url.pathname, request.method === 'HEAD');
      if (served) {
        return;
      }
    }

    sendHtml(response, 404, renderPage({ title: '404', body: '<h1>404</h1><p>未找到请求资源。</p>' }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const statusCode = message.includes('required') ? 400 : 500;
    sendApiError(response, statusCode, statusCode === 400 ? 'invalid_request' : 'internal_server_error', message);
  }
}

export function createAppServer() {
  return createServer(handleRequest);
}

function isDirectExecution() {
  if (!process.argv[1]) {
    return false;
  }
  return path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isDirectExecution()) {
  const server = createAppServer();
  server.listen(PORT, HOST, () => {
    console.log(`Node app listening on http://${HOST}:${PORT}`);
  });
}

async function serveStaticFile(response, pathname, headOnly) {
  for (const candidate of getStaticCandidates(pathname)) {
    const filePath = path.resolve(PROJECT_ROOT, `.${candidate}`);
    if (!filePath.startsWith(PROJECT_ROOT)) {
      continue;
    }

    try {
      const stats = await fs.promises.stat(filePath);
      if (!stats.isFile()) {
        continue;
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES.get(ext) || 'application/octet-stream';

      response.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': stats.size
      });

      if (headOnly) {
        response.end();
        return true;
      }

      await new Promise((resolve, reject) => {
        const stream = fs.createReadStream(filePath);
        stream.on('error', reject);
        stream.on('end', resolve);
        stream.pipe(response);
      });
      return true;
    } catch {
      continue;
    }
  }

  return false;
}

function getStaticCandidates(pathname) {
  const cleanPath = decodeURIComponent(pathname);
  const candidates = new Set();

  if (cleanPath === '/') {
    candidates.add('/index.html');
  } else {
    candidates.add(cleanPath);
  }

  if (cleanPath.endsWith('/')) {
    candidates.add(`${cleanPath}index.html`);
  }

  if (cleanPath !== '/' && !path.extname(cleanPath)) {
    candidates.add(`${cleanPath}.html`);
    candidates.add(`${cleanPath}/index.html`);
  }

  const exactAliases = new Map([
    ['/Contact.html', '/contact.html'],
    ['/Sitemap.xml', '/sitemap.xml'],
    ['/Sitemap.html', '/sitemap.html'],
    ['/Index.html', '/index.html']
  ]);

  if (exactAliases.has(cleanPath)) {
    candidates.add(exactAliases.get(cleanPath));
  }

    const parts = cleanPath.split('/').filter(Boolean);
    if (parts.length > 0) {
      const segmentAliases = new Map([
      ['JS', 'js'],
      ['Images', 'images'],
      ['Skin', 'skin'],
      ['UploadFile', 'uploadfile'],
      ['Job', 'job'],
      ['Product', 'product'],
      ['Products', 'products'],
      ['News', 'news'],
      ['Service', 'service'],
      ['About', 'about'],
      ['Valve', 'valve'],
      ['Wap', 'wap']
    ]);

    const [first, ...rest] = parts;
    if (segmentAliases.has(first)) {
      const normalizedFirst = segmentAliases.get(first);
      candidates.add(`/${[normalizedFirst, ...rest].join('/')}`);
      candidates.add(`/${[normalizedFirst, ...rest.map((segment) => segment.toLowerCase())].join('/')}`);
    }
  }

  return [...candidates];
}

function renderSearchPage({ query, result }) {
  const site = getSiteConfig();
  const titleKeyword = query || '产品搜索';
  const queryValue = query || '输入产品名称';
  const displayKeyword = query || '全部产品';
  const productCategories = listRootProductCategories();
  const menuItems = productCategories
    .map((item) => `<li><a href="/valve/${item.id}.html"><span>${escapeHtml(item.name || '')}</span></a></li>`)
    .join('');
  const rows = [];
  for (let index = 0; index < result.items.length; index += 2) {
    const slice = result.items.slice(index, index + 2);
    const cells = slice.map((product) => {
      const image = escapeHtml(product.small_image || '/skin/dfpic.gif');
      const name = escapeHtml(product.name || '');
      const summary = escapeHtml(truncateLegacySearchText(product.summary || '', 150));
      return `<td width="50%" valign="top" class="bottom_dashedl_line" height="100">
        <table width="100%" height="100" border="0" cellpadding="0" cellspacing="0">
          <tr>
            <td width="39%" rowspan="2"><img src="${image}" width="150" height="94" alt="${name}" /></td>
            <td width="61%" height="20"><a href="/Product/${product.id}.html" class="Font_2E4690_a Font-Weight">${name}</a></td>
          </tr>
          <tr>
            <td valign="top" class="prod_sp">${summary || '暂无摘要。'}</td>
          </tr>
        </table>
      </td>`;
    }).join('');
    const emptyCells = slice.length === 1 ? '<td width="50%" valign="top" class="bottom_dashedl_line" height="100">&nbsp;</td>' : '';
    rows.push(`<tr>${cells}${emptyCells}</tr>`);
  }

  const itemsTable = rows.length > 0
    ? `<table width="98%" border="0" cellpadding="0" cellspacing="0" align="center">${rows.join('')}</table>`
    : `<table width="98%" border="0" cellpadding="0" cellspacing="0" align="center"><tr><td height="90" align="center" class="prod_left_solid">没有匹配的产品记录。</td></tr></table>`;
  const page = result.pagination.page;
  const totalPages = result.pagination.totalPages;
  const total = result.pagination.total;
  const baseQuery = `/Search.asp?action=search&ProductsName=${encodeURIComponent(query)}`;
  const pagination = totalPages > 1
    ? `
      共 <strong>${total}</strong> 条信息
      <a href="${baseQuery}&page=1">首页</a>
      ${page > 1 ? `<a href="${baseQuery}&page=${page - 1}">上一页</a>` : '<span>上一页</span>'}
      ${page < totalPages ? `<a href="${baseQuery}&page=${page + 1}">下一页</a>` : '<span>下一页</span>'}
      <a href="${baseQuery}&page=${totalPages}">末页</a>
      页次：<strong>${page}/${totalPages}</strong> 页 <strong>${result.pagination.limit}</strong>条信息/页
    `
    : `共 <strong>${total}</strong> 条信息 页次：<strong>${page}/${totalPages}</strong> 页 <strong>${result.pagination.limit}</strong>条信息/页`;

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(titleKeyword)}|产品搜索|${escapeHtml(site.web_name || '')}</title>
  <meta name="keywords" content="${escapeHtml(query)}">
  <meta name="description" content="找到${escapeHtml(displayKeyword)}">
  <link href="/css/c.css" rel="stylesheet" type="text/css" />
  <style>
    body{margin:0;background:#fff;color:#333;font:12px/1.6 Arial,"Microsoft YaHei",sans-serif}
    a{text-decoration:none}
    .search-shell{max-width:980px;margin:0 auto;padding:18px 10px 40px}
    .search-top{padding:10px 0 16px;border-bottom:2px solid #e5e5e5}
    .search-top h1{margin:0;font-size:26px;color:#1f3f73}
    .search-top p{margin:6px 0 0;color:#666}
    .page-products ul{margin:0;padding:0;list-style:none}
    .page-products img{background:#f3f3f3;object-fit:cover}
    .left-products ul{margin:0;padding:0;list-style:none}
    .page-left{width:210px;float:left}
    .page-right{margin-left:230px}
    .left-products,.left-search{border:1px solid #e5e5e5;margin-bottom:14px;background:#fff}
    .left-products h2,.left-search h2{margin:0;padding:10px 12px;background:#f6f6f6;font-size:14px}
    .left-search p{margin:0;padding:12px}
    .left-search input[type="text"]{width:120px}
    .left-search input[type="submit"]{padding:4px 10px}
    .site-nav{padding:6px 0 14px;color:#666}
    .search-panel{border:1px solid #e5e5e5;background:#fff}
    .search-toolbar{padding:12px;border-bottom:1px solid #eee}
    .search-toolbar table{width:100%}
    .search-summary{padding:10px 12px;color:#666;border-bottom:1px dashed #ddd}
    .search-pager{padding:16px 0;text-align:center;color:#666}
    @media (max-width: 760px) {
      .page-left{width:auto;float:none}
      .page-right{margin-left:0}
    }
  </style>
</head>
<body>
  <div class="search-shell">
    <div class="search-top">
      <h1>${escapeHtml(site.web_name || '产品搜索')}</h1>
      <p>${escapeHtml(site.company_name || '产品搜索结果')}</p>
    </div>
    <div id="page_main" class="clearfix" style="padding-top:18px;">
      <div class="page-right">
        <div class="site-nav"><span>当前位置 : </span><a href="/index.html">公司主页</a> &gt;&gt; <a href="/Search.asp" title="更多阀门产品，这里找找看">产品搜索</a></div>
        <div class="page-products">
          <div class="search-panel">
            <div class="search-toolbar">
              <form id="form2" name="form2" method="post" action="/Search.asp?action=search">
                <table border="0" cellpadding="0" cellspacing="0">
                  <tr>
                    <td width="90">产品名称：</td>
                    <td><input name="ProductsName" type="text" id="ProductsName" value="${escapeHtml(queryValue)}" size="18" class="Font_666666_a" onfocus="if(this.value==='输入产品名称'){this.value='';}" /></td>
                    <td width="80" align="center"><input name="searchbutton" type="submit" value="搜索" /></td>
                  </tr>
                </table>
              </form>
            </div>
            <div class="search-summary">首页 &gt;&gt; 搜索 <span class="Font_FF0000_a">“${escapeHtml(displayKeyword)}”</span> 结果：</div>
            ${itemsTable}
            <div class="search-pager">${pagination}</div>
          </div>
        </div>
      </div>
      <div class="page-left">
        <div class="left-products">
          <h2><span>产品展示</span></h2>
          <div id="LeftMenu" class="ddsmoothmenu-v">
            <ul>
              <table width="100%" border="0" align="center" cellpadding="0" cellspacing="0">${menuItems}</table>
            </ul>
          </div>
        </div>
        <div class="left-search">
          <h2><span>站内搜索</span></h2>
          <form id="form1" name="form1" method="post" action="/Search.asp?action=search">
            <p>
              <input name="ProductsName" type="text" id="ProductsName2" value="找找看" size="18" class="Font_666666_a" onfocus="if(this.value==='找找看'){this.value='';}" />
              <input name="searchbutton" type="submit" value="搜索" />
            </p>
          </form>
        </div>
      </div>
      <div style="clear:both"></div>
    </div>
  </div>
</body>
</html>`;
}

function normalizeLegacySearchQuery(rawValue) {
  const normalized = String(rawValue || '').trim();
  if (!normalized) {
    return '';
  }

  const placeholders = new Set(['找找看', '输入产品名称', '���ҿ�', '�����Ʒ����']);
  return placeholders.has(normalized) ? '' : normalized;
}

function truncateLegacySearchText(value, limit) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(limit - 3, 0))}...`;
}

function getNumericId(pathnameLower, prefix) {
  const value = pathnameLower.slice(prefix.length);
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function getAdminToken(request) {
  const authorization = request.headers.authorization;
  if (typeof authorization === 'string' && authorization.toLowerCase().startsWith('bearer ')) {
    return authorization.slice(7).trim();
  }

  const headerToken = request.headers['x-admin-token'];
  if (typeof headerToken === 'string' && headerToken.trim() !== '') {
    return headerToken.trim();
  }

  const cookies = parseCookies(request);
  if (cookies.admin_token) {
    return cookies.admin_token;
  }

  return null;
}

function requireAdminSession(request, response) {
  const token = getAdminToken(request);
  const session = getAdminSession(token);
  if (!session) {
    const pathname = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`).pathname.toLowerCase();
    if (pathname.startsWith('/spck/') || pathname.startsWith('/manage/')) {
      response.statusCode = 302;
      response.setHeader('Location', '/spck/login.asp');
      response.end();
      return null;
    }
    sendApiError(response, 401, 'admin_auth_required');
    return null;
  }
  return session;
}

function requireLegacyPermission(session, flag, response, backUrl = '/spck/err.asp') {
  if (hasLegacyPermission(session?.permission_flags, flag)) {
    return true;
  }
  sendHtml(response, 403, renderLegacySimpleMessage('当前账号没有访问该后台页面的权限', backUrl));
  return false;
}

function hasLegacyPermission(permissionFlags, expectedFlag) {
  const normalizedExpected = normalizeLegacyPermissionFlag(expectedFlag);
  return String(permissionFlags || '')
    .split(',')
    .map((item) => normalizeLegacyPermissionFlag(item))
    .filter(Boolean)
    .includes(normalizedExpected);
}

function normalizeLegacyPermissionFlag(value) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return '';
  }
  const parsed = Number.parseInt(normalized, 10);
  return Number.isNaN(parsed) ? '' : String(parsed);
}

function sendPlainError(response, statusCode, text) {
  response.writeHead(statusCode, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end(text);
}

function renderLegacyUploadForm(pathname, searchParams) {
  const action = `${pathname}?${searchParams.toString()}${searchParams.toString() ? '&' : ''}t=1`;
  const isEditorImageDialog = String(searchParams.get('type') || '').toLowerCase() === 'image';
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>文件上传</title>
  <style>
    body { margin: 0; font: 12px/1.4 Arial, sans-serif; }
    form { margin: 0; padding: 0; }
    input[type="file"] { width: 220px; }
  </style>
</head>
<body onload="notifyLoaded()">
  <script>
    function notifyLoaded() {
      try { if (parent && typeof parent.UploadLoaded === 'function') parent.UploadLoaded(); } catch (error) {}
    }
    function CheckUploadForm() {
      if (!document.myform || !document.myform.uploadfile || !document.myform.uploadfile.value) {
        try {
          if (parent && typeof parent.UploadError === 'function') {
            parent.UploadError('请选择要上传的文件。');
          }
        } catch (error) {}
        return false;
      }
      return true;
    }
  </script>
  <form name="myform" method="post" action="${escapeHtml(action)}" enctype="multipart/form-data" onsubmit="return CheckUploadForm()">
    <input type="hidden" name="UploadCode" value="${Date.now()}">
    <input type="hidden" name="act" value="upload">
    <input type="hidden" name="fname" value="">
    <input type="file" name="uploadfile">
    <input type="submit" name="Ok" value="上传">
    ${isEditorImageDialog ? '<input type="hidden" name="type" value="image">' : ''}
  </form>
</body>
</html>`;
}

function renderLegacyUploadResult(pathname, searchParams, uploaded) {
  const tMode = String(searchParams.get('tMode') || '');
  const uploadKind = String(searchParams.get('type') || '').toLowerCase();
  let script = '';

  if (uploadKind === 'image') {
    script = `try { if (parent && typeof parent.UploadSaved === 'function') parent.UploadSaved('${uploaded.relativePath}'); } catch (error) {}
try {
  var obj = parent && parent.dialogArguments ? (parent.dialogArguments.dialogArguments || parent.dialogArguments) : null;
  if (obj && typeof obj.addUploadFile === 'function') {
    obj.addUploadFile('${uploaded.legacyFileName}', '${uploaded.legacyFileName}', '${uploaded.relativePath}');
  }
} catch (error) {}`;
  } else if (pathname.toLowerCase().endsWith('upload2.asp')) {
    script = `parent.form.magicfacepic1.value='${uploaded.relativePath}'`;
  } else if (pathname.toLowerCase().endsWith('upload3.asp')) {
    script = `parent.form.magicfacepic2.value='${uploaded.relativePath}'`;
  } else if (tMode === '2') {
    script = `parent.form.picture.value='${uploaded.legacyFileName}'`;
  } else if (tMode === '3') {
    script = `parent.form.picture.value='${uploaded.relativePath}'`;
  } else if (tMode === '1') {
    script = `parent.form.picture.value='aboutuppic/${uploaded.legacyFileName}'`;
  }

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>上传完成</title>
</head>
<body>
  文件 ${escapeHtml(uploaded.legacyFileName)} 上传成功!
  <script>${script}</script>
</body>
</html>`;
}

function renderLegacyUploadError(message) {
  const plainMessage = normalizeLegacyUploadErrorMessage(message);
  const normalizedMessage = escapeHtml(plainMessage);
  const scriptMessage = JSON.stringify(plainMessage);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>上传失败</title>
</head>
<body>
  ${normalizedMessage}
  <script>
    try {
      if (parent && typeof parent.UploadError === 'function') {
        parent.UploadError(${scriptMessage});
      }
    } catch (error) {}
  </script>
</body>
</html>`;
}

function normalizeLegacyUploadErrorMessage(message) {
  const normalized = String(message || '').trim();
  if (normalized === 'uploadfile is required') {
    return '请选择要上传的文件。';
  }
  if (normalized === 'unsupported file type') {
    return '上传文件类型不受支持。';
  }
  if (normalized === 'uploaded file exceeds size limit') {
    return '上传文件超过大小限制。';
  }
  return normalized || '上传失败。';
}

function renderLegacyProductPhotoList(result) {
  const rows = result.items.map((item) => `
    <tr height="20">
      <td align="left" class="forumRow">&nbsp;${escapeHtml(item.name || '')}
        <img src="../../images/haveimg.gif" width="12" height="12" border="0">
      </td>
      <td align="center" class="forumRow">${escapeHtml(item.created_at || '')}</td>
      <td align="center" class="forumRow"><input type="checkbox" name="selAnnounce" value="${item.id}"></td>
    </tr>
  `).join('');
  const paginationLinks = renderLegacyPager({
    basePath: 'prodphoto.asp',
    page: result.pagination.page,
    totalPages: result.pagination.totalPages
  });

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>产品图片</title>
  <link href="/spck/css/style.css" rel="stylesheet" type="text/css">
</head>
<body>
  <table width="98%" border="0" cellspacing="0" cellpadding="0" align="center" class="tableBorder">
    <tr><th height="25" colspan="2" class="tableHeaderText">产品图片</th></tr>
    <tr><td colspan="2" class="forumRowHighlight"><p><b>注意</b>：删除图片会影响当前引用它的产品信息。</p></td></tr>
    <tr><td class="forumRowHighlight"><a href="prodphoto_add.asp">添加图片</a> | [<a href="javascript:location.reload()">刷新页面</a>]</td></tr>
  </table>
  <form method="post" action="prodphoto.asp?action=del">
    <table width="100%" border="0" align="center" cellpadding="2" cellspacing="1" class="tableBorder">
      <tr><th class="tableHeaderText" height="25" colspan="3">产品图片列表</th></tr>
      <tr height="25" class="bodytitle">
        <td width="46%" align="left"><b>图片名称</b></td>
        <td width="28%" align="center"><b>上传时间</b></td>
        <td width="26%" align="center"><input type="submit" value="删除"></td>
      </tr>
      ${rows || '<tr><td colspan="3" class="forumRow" align="center">暂无图片</td></tr>'}
      <tr><td colspan="3" class="forumrowHighLight" align="center">${paginationLinks} 第 ${result.pagination.page} / ${result.pagination.totalPages} 页，共 ${result.pagination.total} 条</td></tr>
    </table>
  </form>
</body>
</html>`;
}

function renderLegacyProductList(result) {
  const rows = result.items.map((item) => `
    <tr height="20">
      <td align="left" class="forumRow">${item.id}</td>
      <td align="left" class="forumRow">${escapeHtml(item.name || '')}${item.is_featured_home ? ' <img src="../../images/thanx.gif" width="19" height="19" align="absmiddle">' : ''}${item.small_image ? ' <img src="../../images/haveimg.gif" width="12" height="12" border="0">' : ''}</td>
      <td align="center" class="forumRow">${escapeHtml(item.code || '')}</td>
      <td align="center" class="forumRow">${escapeHtml(item.category_name || '')}</td>
      <td align="center" class="forumRow">${item.is_visible ? '显示' : '<span class="STYLE1">隐藏</span>'}</td>
      <td align="center" class="forumRow">${item.sort_order ?? 0}</td>
      <td align="center" class="forumRow"><a href="prod_edit.asp?id=${item.id}">修改</a></td>
      <td align="center" class="forumRow"><input type="checkbox" name="selAnnounce" value="${item.id}"></td>
    </tr>
  `).join('');
  const paginationLinks = renderLegacyPager({
    basePath: 'prod.asp',
    page: result.pagination.page,
    totalPages: result.pagination.totalPages
  });

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>产品管理</title>
  <link href="/spck/css/style.css" rel="stylesheet" type="text/css">
  <style>.STYLE1 { color:#FF0000; }</style>
</head>
<body>
  <table width="98%" border="0" cellspacing="0" cellpadding="0" align="center" class="tableBorder">
    <tr><th height="25" colspan="2" class="tableHeaderText">产品管理</th></tr>
    <tr><td colspan="2" class="forumRowHighlight"><p><b>注意</b>：删除产品会同时清理其上传图片路径记录。</p></td></tr>
    <tr><td width="19%" height="25" class="forumRowHighlight">&nbsp;</td><td width="81%" class="forumRowHighlight"><a href="prod.asp">管理产品</a> | <a href="prod_add.asp">添加产品</a> | <a href="prodcat.asp">管理分类</a> | <a href="prodcat_add.asp">添加分类</a> | <a href="prodphoto.asp">图片管理</a> | <a href="prodphoto_add.asp">添加图片</a> | [<a href="javascript:location.reload()">刷新页面</a>]</td></tr>
  </table>
  <form method="post" action="prod.asp?action=del">
    <table width="100%" border="0" align="center" cellpadding="2" cellspacing="1" class="tableBorder">
      <tr><th class="tableHeaderText" height="25" colspan="8">产品列表</th></tr>
      <tr height="25" class="bodytitle">
        <td width="43" align="left">ID</td>
        <td width="325" align="left"><b>产品名称</b></td>
        <td width="131" align="center"><b>产品型号</b></td>
        <td width="111" align="center"><b>产品分类</b></td>
        <td width="82" align="center"><b>产品属性</b></td>
        <td width="62" align="center"><b>排序</b></td>
        <td width="59" align="center"><b>修改</b></td>
        <td width="100" align="center"><input name="submit2" type="submit" value="删除"></td>
      </tr>
      ${rows || '<tr><td colspan="8" class="forumRow" align="center">暂无产品</td></tr>'}
      <tr height="20" bgcolor="#ffffff">
        <td colspan="7" class="forumRow" align="right">&nbsp;</td>
        <td class="forumRow" align="center"><input name="button" type="button" onclick="toggleAll(this.form)" value="全选"></td>
      </tr>
      <tr height="20" bgcolor="#ffffff">
        <td class="forumrowHighLight" align="center" colspan="8">${paginationLinks} 第 ${result.pagination.page} / ${result.pagination.totalPages} 页，共 ${result.pagination.total} 条</td>
      </tr>
    </table>
  </form>
  <script>
    let legacyCheckFlag = false;
    function toggleAll(form) {
      const fields = form.querySelectorAll('input[name="selAnnounce"]');
      legacyCheckFlag = !legacyCheckFlag;
      for (const field of fields) field.checked = legacyCheckFlag;
    }
  </script>
</body>
</html>`;
}

function renderLegacyNewsList(result) {
  const rows = result.items.map((item) => `
    <tr height="20">
      <td align="left" class="forumRow">${item.id}</td>
      <td align="left" class="forumRow">&nbsp;${escapeHtml(item.title || '')}${item.is_featured_home ? ' <img src="../../images/thanx.gif" width="19" height="19" align="absmiddle">' : ''}${item.picture && item.picture !== '/UploadFile/nopicture.gif' ? ' <img src="../../images/haveimg.gif" width="12" height="12" border="0">' : ''}</td>
      <td class="forumRow" align="center">${escapeHtml(item.category_name || '')}</td>
      <td align="center" class="forumRow">${escapeHtml(item.created_at || '')}</td>
      <td align="center" class="forumRow"><a href="News_edit.asp?newsid=${item.id}">修改</a></td>
      <td align="center" class="forumRow"><input type="checkbox" name="selAnnounce" value="${item.id}"></td>
    </tr>
  `).join('');
  const paginationLinks = renderLegacyPager({
    basePath: 'News_index.asp',
    page: result.pagination.page,
    totalPages: result.pagination.totalPages
  });

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>新闻管理</title>
  <link href="/spck/css/style.css" rel="stylesheet" type="text/css">
</head>
<body>
  <table width="98%" border="0" cellspacing="0" cellpadding="0" align="center" class="tableBorder">
    <tr><th height="25" colspan="2" class="tableHeaderText">新闻管理</th></tr>
    <tr><td colspan="2" class="forumRowHighlight"><p><b>注意</b>：删除新闻会同时删除其上传封面图。</p></td></tr>
    <tr><td width="9%" height="25" class="forumRowHighlight">&nbsp;</td><td width="91%" class="forumRowHighlight"><a href="News_index.asp">管理新闻</a> | <a href="News_add.asp">添加新闻</a> | <a href="Class.asp">管理分类</a> | <a href="Class_add.asp">添加分类</a> | [<a href="javascript:location.reload()">刷新页面</a>]</td></tr>
  </table>
  <form method="post" action="News_index.asp?action=del">
    <table width="100%" border="0" align="center" cellpadding="2" cellspacing="1" class="tableBorder">
      <tr><th class="tableHeaderText" height="25" colspan="6">新闻列表</th></tr>
      <tr height="25" class="bodytitle">
        <td width="6%" align="left"><b>ID</b></td>
        <td width="47%" align="left"><b>新闻标题</b></td>
        <td width="12%" align="center"><b>所属分类</b></td>
        <td width="21%" align="center"><b>发布时间</b></td>
        <td width="7%" align="center"><b>修改</b></td>
        <td width="7%" align="center"><input name="submit2" type="submit" value="删除"></td>
      </tr>
      ${rows || '<tr><td colspan="6" class="forumRow" align="center">暂无新闻</td></tr>'}
      <tr height="20" bgcolor="#ffffff">
        <td colspan="6" class="forumRow" align="right"><input name="button" type="button" onclick="toggleAll(this.form)" value="全选"></td>
      </tr>
      <tr height="20" bgcolor="#ffffff">
        <td class="forumrowHighLight" align="center" colspan="6">${paginationLinks} 第 ${result.pagination.page} / ${result.pagination.totalPages} 页，共 ${result.pagination.total} 条</td>
      </tr>
    </table>
  </form>
  <script>
    let legacyNewsCheckFlag = false;
    function toggleAll(form) {
      const fields = form.querySelectorAll('input[name="selAnnounce"]');
      legacyNewsCheckFlag = !legacyNewsCheckFlag;
      for (const field of fields) field.checked = legacyNewsCheckFlag;
    }
  </script>
</body>
</html>`;
}

function renderLegacyAdminLoginPage() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>后台管理员登录</title>
  <link href="/spck/css/style.css" rel="stylesheet" type="text/css">
  <style>
    body { background:#f3f6fb; margin:0; font:12px/1.5 Arial,sans-serif; }
    .legacy-login-wrap { width:440px; margin:80px auto; background:#fff; border:1px solid #cad4e5; box-shadow:0 12px 30px rgba(27,53,92,.08); }
    .legacy-login-head { background:#4455aa; color:#fff; padding:18px 24px; font-size:20px; }
    .legacy-login-body { padding:24px; }
    .legacy-login-row { margin-bottom:16px; }
    .legacy-login-row label { display:block; margin-bottom:6px; color:#334; }
    .legacy-login-row input { width:100%; box-sizing:border-box; padding:9px 10px; border:1px solid #b9c4d8; }
    .legacy-login-actions { display:flex; justify-content:space-between; align-items:center; }
  </style>
  <script>
    function validateLegacyAdminLogin() {
      if (document.HOPE_form.userid.value === '') {
        alert('请输入后台用户名');
        document.HOPE_form.userid.focus();
        return false;
      }
      if (document.HOPE_form.password.value === '') {
        alert('请输入登录密码');
        document.HOPE_form.password.focus();
        return false;
      }
      return true;
    }
  </script>
</head>
<body>
  <form name="HOPE_form" action="check.asp" method="post" onsubmit="return validateLegacyAdminLogin()">
    <div class="legacy-login-wrap">
      <div class="legacy-login-head">Spirax Sarco CN 后台</div>
      <div class="legacy-login-body">
        <div class="legacy-login-row">
          <label for="userid">用户名</label>
          <input id="userid" name="userid" type="text" autocomplete="username">
        </div>
        <div class="legacy-login-row">
          <label for="password">密码</label>
          <input id="password" name="password" type="password" autocomplete="current-password">
        </div>
        <div class="legacy-login-actions">
          <span>Node.js 兼容后台入口</span>
          <input type="submit" value="登 录">
        </div>
      </div>
    </div>
  </form>
</body>
</html>`;
}

function renderLegacyLoginResult({ success, message, href, label }) {
  const title = success ? '登录成功' : '登录失败';
  const refresh = success ? `<meta http-equiv="refresh" content="1;url=${escapeHtml(href)}">` : '';
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  ${refresh}
  <link href="/spck/css/style.css" rel="stylesheet" type="text/css">
</head>
<body>
  <table cellpadding="2" cellspacing="1" border="0" width="460" class="tableBorder" align="center" style="margin-top:80px">
    <tr><th class="tableHeaderText" colspan="2" height="25">${title}</th></tr>
    <tr><td height="85" valign="top" class="forumRow"><div align="center"><br><br>${escapeHtml(message)}<br><br></div></td></tr>
    <tr align="center"><td height="30" class="forumRowHighlight"><a href="${escapeHtml(href)}">${escapeHtml(label)}</a></td></tr>
  </table>
</body>
</html>`;
}

function renderLegacyAdminFrameset() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>后台管理</title>
</head>
<frameset rows="*" cols="200,*" framespacing="0" frameborder="0" border="0" id="frame">
  <frame name="left" scrolling="yes" marginwidth="0" marginheight="0" src="Left.asp">
  <frameset rows="60,*" cols="*" framespacing="0" border="0" frameborder="0">
    <frame name="top" scrolling="no" src="Top.asp">
    <frame name="main" scrolling="auto" src="Main.asp">
  </frameset>
</frameset>
</html>`;
}

function renderLegacyAdminTop() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>后台顶部</title>
  <style>
    body{margin:0;background:#3450a3;color:#fff;font:12px/1.4 Arial,sans-serif}
    .legacy-top{height:60px;display:flex;align-items:center;justify-content:space-between;padding:0 18px}
    .legacy-top a{color:#fff;text-decoration:none;margin-left:18px}
  </style>
</head>
<body>
  <div class="legacy-top">
    <div>Spirax Sarco CN 管理后台</div>
    <div>
      <a href="/index.html" target="_blank">访问前台</a>
      <a href="system/admin_AdminModifyPwd.asp" target="main">修改密码</a>
      <a href="ExitSystem.asp" target="_top">退出</a>
    </div>
  </div>
</body>
</html>`;
}

function renderLegacyAdminLeft(session) {
  const sections = [
    {
      title: '基础设置',
      links: [
        ['网站配置', 'cn/Config/Config.asp'],
        ['办事处联系方式', 'cn/Offices/Offices.asp'],
        ['Meta 信息', 'cn/Config/Meta_keywords.asp']
      ]
    },
    {
      title: '模板标签',
      links: [
        ['模板管理', 'cn/WebTemp/index.asp'],
        ['自定义标签', 'cn/WebTemp/cuslabel.asp'],
        ['标签分类', 'cn/WebTemp/cuskind.asp']
      ]
    },
    {
      title: '公司信息',
      links: [
        ['公司分类', 'cn/Corporation/Co_Class.asp'],
        ['新增公司分类', 'cn/Corporation/Co_Class_add.asp']
      ]
    },
    {
      title: '新闻管理',
      links: [
        ['新闻分类', 'cn/News/Class.asp'],
        ['新闻列表', 'cn/News/News_index.asp']
      ]
    },
    {
      title: '产品管理',
      links: [
        ['产品分类', 'cn/produts/prodcat.asp'],
        ['产品列表', 'cn/produts/prod.asp'],
        ['产品图片', 'cn/produts/prodphoto.asp']
      ]
    },
    {
      title: '其他内容',
      links: [
        ['留言管理', 'cn/msg/Msg.asp'],
        ['招聘管理', 'cn/job/job.asp'],
        ['管理员管理', 'system/admin_admin.asp']
      ]
    },
    {
      title: 'HTML 生成',
      links: [
        ['静态页生成', '/manage/makehtml/index.asp']
      ]
    }
  ];

  const sectionHtml = sections.map((section) => `
    <div class="legacy-left-section">
      <div class="legacy-left-title">${escapeHtml(section.title)}</div>
      ${section.links.map(([label, href]) => `<a href="${href}" target="main">${escapeHtml(label)}</a>`).join('')}
    </div>
  `).join('');

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>后台菜单</title>
  <style>
    body{margin:0;background:#eef2fb;font:12px/1.5 Arial,sans-serif;color:#223}
    .legacy-left-head{background:#4455aa;color:#fff;padding:18px 14px}
    .legacy-left-head small{display:block;opacity:.8;margin-top:4px}
    .legacy-left-section{padding:10px 10px 2px}
    .legacy-left-title{background:#dbe3f7;color:#223;padding:8px 10px;font-weight:bold}
    .legacy-left-section a{display:block;padding:7px 10px;color:#334;text-decoration:none;border-bottom:1px solid #dde4f2;background:#fff}
    .legacy-left-section a:hover{background:#f6f8fd}
  </style>
</head>
<body>
  <div class="legacy-left-head">
    当前用户：${escapeHtml(session.username || '')}
    <small>权限：${escapeHtml(session.permission_flags || '')}</small>
  </div>
  ${sectionHtml}
</body>
</html>`;
}

function renderLegacyAdminHome(session) {
  const cards = [
    ['网站配置', '/spck/cn/config/Config.asp'],
    ['新闻管理', '/spck/cn/news/News_index.asp'],
    ['产品管理', '/spck/cn/produts/prod.asp'],
    ['管理员管理', '/spck/system/admin_admin.asp'],
    ['生成 HTML', '/manage/makehtml/index.asp']
  ];

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>后台首页</title>
  <link href="/spck/css/style.css" rel="stylesheet" type="text/css">
  <style>
    body{margin:18px;background:#f6f8fc;font:12px/1.5 Arial,sans-serif}
    .legacy-home-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-top:18px}
    .legacy-home-card{background:#fff;border:1px solid #d7dfef;padding:18px;text-decoration:none;color:#223}
    .legacy-home-card strong{display:block;font-size:16px;margin-bottom:6px}
  </style>
</head>
<body>
  <table width="98%" border="0" cellpadding="3" cellspacing="1" class="tableBorder">
    <tr><th class="tableHeaderText" height="25">后台管理首页</th></tr>
    <tr><td class="forumRow">当前登录用户：${escapeHtml(session.username || '')}</td></tr>
    <tr><td class="forumRow">这里是 Node.js 兼容后的后台首页，已接通常用内容管理模块。</td></tr>
  </table>
  <div class="legacy-home-grid">
    ${cards.map(([title, href]) => `<a class="legacy-home-card" href="${href}" target="main"><strong>${escapeHtml(title)}</strong><span>打开对应管理页</span></a>`).join('')}
  </div>
</body>
</html>`;
}

function renderLegacyAdminsList(items) {
  const rows = items.map((item) => `
    <tr height="28">
      <td width="18%" align="center" class="forumRow"><a href="admin_admin_ok.asp?id=${item.id}">${escapeHtml(item.username || '')}</a></td>
      <td width="32%" align="center" class="forumRow">${escapeHtml(item.last_login_at || '')}</td>
      <td width="35%" align="center" class="forumRow">${escapeHtml(item.last_login_ip || '')}</td>
      <td width="15%" align="center" class="forumRow"><a href="admin_admin.asp?action=del&id=${item.id}" onclick="return confirm('确认删除该管理员吗？')">删除</a>&nbsp;&nbsp;<a href="admin_admin_ok.asp?id=${item.id}">编辑权限</a></td>
    </tr>
  `).join('');

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>管理员管理</title>
  <link href="/spck/css/style.css" rel="stylesheet" type="text/css">
</head>
<body>
  <table border="0" align="center" cellpadding="2" cellspacing="1" class="tableBorder" width="100%">
    <tr><th height="25" colspan="4" class="tableHeaderText">系统后台管理员管理</th></tr>
    <tr><td colspan="4" class="forumRowHighlight"><a href="admin_admin_ok.asp?action=add">新增管理员</a> | <a href="admin_adminmodifypwd.asp">修改当前账号密码</a></td></tr>
    <tr height="28">
      <td width="18%" align="center" class="bodytitle"><font color="ff6600"><b>用户名</b></font></td>
      <td width="32%" align="center" class="bodytitle"><font color="ff6600"><b>最后登录时间</b></font></td>
      <td width="35%" align="center" class="bodytitle"><font color="ff6600"><b>最后登录 IP</b></font></td>
      <td width="15%" align="center" class="bodytitle"><font color="ff6600"><b>管理选项</b></font></td>
    </tr>
    ${rows || '<tr><td colspan="4" class="forumRow" align="center">暂无管理员信息</td></tr>'}
  </table>
</body>
</html>`;
}

function renderLegacyAdminForm({ mode, admin }) {
  const title = mode === 'add' ? '新增管理员' : '修改管理员';
  const action = mode === 'add'
    ? 'admin_admin_ok.asp?action=addsave'
    : `admin_admin_ok.asp?action=editsave&id=${admin.id}`;
  const checkedFlags = new Set(String(admin.permission_flags || '').split(',').map((item) => item.trim()).filter(Boolean));

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <link href="/spck/css/style.css" rel="stylesheet" type="text/css">
  <script>
    function validateLegacyAdminForm() {
      if (document.Form1.username.value === '') {
        alert('请输入登录用户名');
        document.Form1.username.focus();
        return false;
      }
      if (${mode === 'add' ? 'document.Form1.password.value === ""' : 'false'}) {
        alert('请输入登录密码');
        document.Form1.password.focus();
        return false;
      }
      return true;
    }
    function toggleLegacyAdminFlags(form) {
      const checked = form.chkall.checked;
      const fields = form.querySelectorAll('input[name="flag"]');
      for (const field of fields) field.checked = checked;
    }
  </script>
</head>
<body>
  <form action="${action}" method="post" name="Form1" onsubmit="return validateLegacyAdminForm()">
    <table width="100%" border="0" cellpadding="2" cellspacing="1" class="tableBorder">
      <tr><th height="25" colspan="2" class="tableHeaderText">${title}</th></tr>
      <tr>
        <td width="17%" height="28" align="right" class="forumRow">用户名</td>
        <td width="83%" class="forumRow">&nbsp;&nbsp;<input type="text" name="username" size="35" value="${escapeHtml(admin.username || '')}"> <font color="#FF0000">*</font></td>
      </tr>
      <tr>
        <td align="right" height="28" class="forumRow">密码</td>
        <td class="forumRow">&nbsp;&nbsp;<input type="password" name="password" size="40" value=""> ${mode === 'edit' ? '<span>留空表示不修改密码</span>' : '<font color="#FF0000">*</font>'}</td>
      </tr>
      <tr><td align="center" height="28" colspan="2" class="bodytitle"><b>管理权限设置</b></td></tr>
      <tr>
        <td colspan="2" class="forumRow">
          ${LEGACY_ADMIN_PERMISSION_ITEMS.map((item) => `&nbsp;<input type="checkbox" name="flag" value="${item.flag}"${checkedFlags.has(item.flag) ? ' checked' : ''}>${escapeHtml(item.label)}&nbsp;&nbsp;`).join('')}
          <br><br><hr color="#F7F7F7" width="98%" size="1">
        </td>
      </tr>
      <tr>
        <td colspan="2" height="28" align="center" class="forumRowHighlight">
          <input type="submit" value="确 认"> &nbsp;&nbsp;&nbsp;&nbsp;<input name="chkall" type="checkbox" value="on" onclick="toggleLegacyAdminFlags(this.form)">全选/取消
        </td>
      </tr>
    </table>
  </form>
</body>
</html>`;
}

function renderLegacyAdminPasswordForm(admin) {
  const checkedFlags = new Set(String(admin.permission_flags || '').split(',').map((item) => item.trim()).filter(Boolean));
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>修改密码</title>
  <link href="/spck/css/style.css" rel="stylesheet" type="text/css">
  <script>
    function validateLegacyAdminPasswordForm() {
      if (document.Form1.password.value === '') {
        alert('请输入新密码');
        document.Form1.password.focus();
        return false;
      }
      return true;
    }
  </script>
</head>
<body>
  <form action="admin_adminmodifypwd.asp?action=editsave" method="post" name="Form1" onsubmit="return validateLegacyAdminPasswordForm()">
    <table width="100%" border="0" cellpadding="2" cellspacing="1" class="tableBorder">
      <tr><th height="25" colspan="2" class="tableHeaderText">修改密码</th></tr>
      <tr>
        <td width="17%" height="28" align="right" class="forumRow">用户名</td>
        <td width="83%" class="forumRow">&nbsp;&nbsp;${escapeHtml(admin.username || '')}</td>
      </tr>
      <tr>
        <td align="right" height="28" class="forumRow">新密码</td>
        <td class="forumRow">&nbsp;&nbsp;<input type="password" name="password" size="40" value=""></td>
      </tr>
      <tr><td align="center" height="28" colspan="2" class="bodytitle"><b>当前权限</b></td></tr>
      <tr>
        <td colspan="2" class="forumRow">
          ${LEGACY_ADMIN_PERMISSION_ITEMS.filter((item) => checkedFlags.has(item.flag)).map((item) => escapeHtml(item.label)).join('、') || '无'}
        </td>
      </tr>
      <tr><td colspan="2" height="28" align="center" class="forumRowHighlight"><input type="submit" value="确 认"></td></tr>
    </table>
  </form>
</body>
</html>`;
}

function renderLegacySiteConfigForm(config) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>网站配置</title>
  <link href="/spck/css/style.css" rel="stylesheet" type="text/css">
</head>
<body>
  <br>
  <form name="form" method="post" action="Config.asp?action=save">
    <table cellpadding="2" cellspacing="1" border="0" width="95%" class="tableBorder" align="center">
      <tr><th height="23" align="left">网站参数配置</th></tr>
      <tr>
        <td>
          <table width="100%" border="0" cellpadding="0" cellspacing="1">
            <tr>
              <td width="15%" height="22" class="forumRow">网站名称：</td>
              <td width="35%" class="forumRow"><input name="WebName" type="text" value="${escapeHtml(config.web_name || '')}" size="40" maxlength="100"></td>
              <td width="15%" class="forumRow">网站域名：</td>
              <td width="35%" class="forumRow"><input name="WebUrl" type="text" value="${escapeHtml(config.web_url || '')}" size="40" maxlength="100"></td>
            </tr>
            <tr>
              <td height="22" class="forumRow">网站作者：</td>
              <td class="forumRow"><input name="Webauthor" type="text" value="${escapeHtml(config.web_author || '')}" size="40" maxlength="100"></td>
              <td class="forumRow">网站版权：</td>
              <td class="forumRow"><input name="WebCopyright" type="text" value="${escapeHtml(config.web_copyright || '')}" size="40" maxlength="100"></td>
            </tr>
            <tr>
              <td height="22" class="forumRow">公司名称：</td>
              <td class="forumRow"><input name="CoName" type="text" value="${escapeHtml(config.company_name || '')}" size="40" maxlength="100"></td>
              <td class="forumRow">联系地址：</td>
              <td class="forumRow"><input name="CoAdd" type="text" value="${escapeHtml(config.company_address || '')}" size="40" maxlength="200"></td>
            </tr>
            <tr>
              <td height="22" class="forumRow">联系电话：</td>
              <td class="forumRow"><input name="CoPhone" type="text" value="${escapeHtml(config.company_phone || '')}" size="40" maxlength="100"></td>
              <td class="forumRow">邮政编码：</td>
              <td class="forumRow"><input name="CoPost" type="text" value="${escapeHtml(config.postal_code || '')}" size="40" maxlength="10"></td>
            </tr>
            <tr>
              <td height="22" class="forumRow">传真号码：</td>
              <td class="forumRow"><input name="CoFax" type="text" value="${escapeHtml(config.company_fax || '')}" size="40" maxlength="100"></td>
              <td class="forumRow">联系人：</td>
              <td class="forumRow"><input name="CoRen" type="text" value="${escapeHtml(config.contact_person || '')}" size="40" maxlength="100"></td>
            </tr>
            <tr>
              <td height="22" class="forumRow">电子邮箱：</td>
              <td class="forumRow"><input name="CoEmail" type="text" value="${escapeHtml(config.company_email || '')}" size="40" maxlength="100"></td>
              <td class="forumRow">ICP备案号：</td>
              <td class="forumRow"><input name="WebIcp" type="text" value="${escapeHtml(config.icp_number || '')}" size="40" maxlength="100"></td>
            </tr>
            <tr>
              <td height="22" class="forumRow">联系 QQ：</td>
              <td class="forumRow"><input name="WebQQ" type="text" value="${escapeHtml(config.web_qq || '')}" size="40" maxlength="100"></td>
              <td class="forumRow">手机：</td>
              <td class="forumRow"><input name="Webmsn" type="text" value="${escapeHtml(config.web_mobile || '')}" size="40" maxlength="100"></td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td class="forumRow">
          <table width="100%" border="0" cellpadding="0" cellspacing="0">
            <tr><td height="30" align="center"><input type="submit" name="Submit" value="保 存 配 置"></td></tr>
          </table>
        </td>
      </tr>
    </table>
  </form>
</body>
</html>`;
}

function renderLegacyMetaTypesList(items) {
  const rows = items.map((item) => `
    <tr>
      <td align="right" bgcolor="#FFFFFF">${escapeHtml(item.type_name || '')}：</td>
      <td colspan="2" align="left" bgcolor="#FFFFFF" class="red">[调用标签] #HOPE_Meta_Keywords(${item.id})# &nbsp;&nbsp; #HOPE_Meta_Description(${item.id})#</td>
      <td rowspan="4" align="left">&nbsp;<a href="Mate_edit.asp?id=${item.id}"><strong>编辑 Meta 信息</strong></a><br><br>&nbsp;<span style="color:#666">点击右侧编辑进入修改页</span></td>
    </tr>
    <tr bgcolor="#F1F3F5">
      <td align="right" bgcolor="#FFFFFF">&nbsp;</td>
      <td width="12%" align="right" bgcolor="#FFFFFF">Meta 关键字：</td>
      <td width="57%" align="left" bgcolor="#FFFFFF"><input type="text" value="${escapeHtml(item.meta_keywords || '')}" size="70"></td>
    </tr>
    <tr bgcolor="#F1F3F5">
      <td align="right" bgcolor="#FFFFFF">&nbsp;</td>
      <td align="right" bgcolor="#FFFFFF">Meta 描述：</td>
      <td align="left" bgcolor="#FFFFFF"><input type="text" value="${escapeHtml(item.meta_descriptions || '')}" size="70"></td>
    </tr>
    <tr bgcolor="#F1F3F5">
      <td align="right" bgcolor="#FFFFFF">&nbsp;</td>
      <td align="right" bgcolor="#FFFFFF">页面标题：</td>
      <td align="left" bgcolor="#FFFFFF"><input type="text" value="${escapeHtml(item.title || '')}" size="70"></td>
    </tr>
    <tr bgcolor="#FFFFFF"><td height="8" colspan="4" bgcolor="#4455AA"></td></tr>
  `).join('');

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>网站 Meta 信息管理</title>
  <link href="/spck/css/style.css" rel="stylesheet" type="text/css">
</head>
<body>
  <table width="98%" border="0" cellspacing="0" cellpadding="0" align="center" class="tableBorder">
    <tr><th width="100%" height="25" class="tableHeaderText">网站 Meta 信息管理</th></tr>
    <tr><td class="forumRowHighlight"><p><b>注意</b>：这里继续兼容旧站的 Meta 配置入口和模板标签调用方式。列表页用于查看，修改请点每条右侧“编辑 Meta 信息”。</p></td></tr>
    <tr><td align="center" class="forumRowHighlight"><a href="Meta_keywords.asp">关键字管理</a> | <a href="Meta_keywords_add.asp">新增页面关键字</a> |</td></tr>
  </table>
  <table width="95%" border="0" cellspacing="1" cellpadding="3" align="center" class="tableBorder">
    <tr><th height="22">网站 Meta 信息列表</th></tr>
  </table>
  <table width="95%" border="0" align="center" cellpadding="0" cellspacing="0" bgcolor="#F6F6F6" class="tableBorder">
    <tr bgcolor="#F0F0F0">
      <td width="17%" height="25" align="center" bgcolor="#F1F3F5">&nbsp;</td>
      <td colspan="2" align="center" bgcolor="#F1F3F5"><div align="left"><br>(对应标签 #HOPE_Meta_Keywords(typeid)# / #HOPE_Meta_Description(typeid)#)</div></td>
      <td width="14%" align="center">操作</td>
    </tr>
    ${rows || '<tr><td colspan="4" class="forumRowHighlight" align="center">暂无 Meta 配置</td></tr>'}
  </table>
</body>
</html>`;
}

function renderLegacyMetaTypeForm({ mode, item }) {
  const title = mode === 'edit' ? '修改页面关键字' : '新增页面关键字';
  const action = mode === 'edit' ? 'Mate_save.asp?action=edit' : 'Mate_save.asp?action=add';

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <link href="/spck/css/style.css" rel="stylesheet" type="text/css">
  <script>
    function validateLegacyMetaTypeForm() {
      if (document.FORM1.typename.value === '') {
        alert('请输入页面名称!');
        document.FORM1.typename.focus();
        return false;
      }
      return true;
    }
  </script>
</head>
<body>
  <table width="98%" border="0" cellspacing="0" cellpadding="0" align="center" class="tableBorder">
    <tr><th width="100%" height="25" class="tableHeaderText">网站 Meta 信息管理</th></tr>
    <tr><td class="forumRowHighlight"><b>注意</b>：保持旧站 Meta 信息录入字段和调用路径。</td></tr>
    <tr><td align="center" class="forumRowHighlight"><a href="Meta_keywords.asp">关键字管理</a> | <a href="Meta_keywords_add.asp">新增页面关键字</a> |</td></tr>
  </table>
  <form name="FORM1" method="post" action="${action}" onsubmit="return validateLegacyMetaTypeForm()">
    ${mode === 'edit' ? `<input name="hidid" type="hidden" value="${item.id}">` : ''}
    <table width="100%" border="0" align="center" cellpadding="3" cellspacing="1" class="tableBorder">
      <tr><th colspan="3" height="28" class="tableHeaderText">${title}</th></tr>
      <tr>
        <td height="25" class="forumRowHighlight" align="right"><b>页面名称：</b></td>
        <td colspan="2" class="forumRowHighlight"><input name="typename" type="text" value="${escapeHtml(item.type_name || '')}" size="30" maxlength="100"> <span class="red">*</span></td>
      </tr>
      <tr>
        <td height="25" class="forumRowHighlight" align="right"><b>Meta 关键字：</b></td>
        <td colspan="2" class="forumRowHighlight"><input name="meta_keywords" type="text" value="${escapeHtml(item.meta_keywords || '')}" size="60"></td>
      </tr>
      <tr>
        <td width="18%" height="25" class="forumRowHighlight" align="right"><b>Meta 描述：</b></td>
        <td colspan="2" class="forumRowHighlight"><input name="meta_descriptions" value="${escapeHtml(item.meta_descriptions || '')}" size="60"></td>
      </tr>
      <tr>
        <td height="27" class="forumRowHighlight" align="right"><b>页面标题：</b></td>
        <td colspan="2" class="forumRowHighlight"><input name="title" value="${escapeHtml(item.title || '')}" size="60"></td>
      </tr>
      <tr>
        <td height="27" class="forumRowHighlight"></td>
        <td width="38%" height="27" align="center" class="forumRowHighlight"><input type="submit" value="确 认 提 交" name="Submit2"></td>
        <td width="44%" class="forumRowHighlight"></td>
      </tr>
    </table>
  </form>
</body>
</html>`;
}

function renderLegacyTemplateVariantsList(items) {
  const rows = items.map((item) => `
    <tr>
      <td class="forumRowHighlight" width="18%" align="center">${item.id}</td>
      <td class="forumRowHighlight" width="22%" align="center">${escapeHtml(item.template_name || '')}</td>
      <td align="center" class="forumRowHighlight">
        <input type="radio" name="sele" value="${item.id}"${item.is_selected ? ' checked' : ''}>
      </td>
      <td align="left" class="forumRowHighlight">
        <a href="worldec_index.asp?id=${item.id}">修改首页</a> |
        <a href="worldec_co.asp?id=${item.id}">关于公司</a> |
        <a href="worldec_news.asp?id=${item.id}">新闻</a> |
        <a href="worldec_prod.asp?id=${item.id}">产品</a> |
        <a href="worldec_service.asp?id=${item.id}">服务</a> |
        <a href="worldec_job.asp?id=${item.id}">招聘</a> |
        <a href="worldec_contact.asp?id=${item.id}">联系我们</a> |
        <a href="worldec_msg.asp?id=${item.id}">留言</a>
      </td>
    </tr>
  `).join('');

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>网站 HTML 模板管理</title>
  <link href="/spck/css/style.css" rel="stylesheet" type="text/css">
</head>
<body>
  <table border="0" cellspacing="1" cellpadding="3" align="center" class="tableBorder">
    <tr><th width="180%" class="tableHeaderText" height="25">网站 HTML 模板管理</th></tr>
    <tr><td class="forumRowHighlight"><p><b>注意</b>：这里继续兼容旧模板配置入口，当前用于维护模板路径和默认模板。</p></td></tr>
  </table>
  <form name="Form" action="?action=saveedit" method="post">
    <table width="98%" border="0" align="center" cellpadding="5" cellspacing="1" class="tableBorder">
      <tr><th class="tableHeaderText" colspan="4" height="25">网站所有模板管理</th></tr>
      <tr>
        <td width="18%" height="25" align="center" class="forumRowHighlight">ID</td>
        <td height="25" align="center" class="forumRowHighlight">名称</td>
        <td width="15%" height="25" align="center" class="forumRowHighlight">默认</td>
        <td width="45%" height="25" align="center" class="forumRowHighlight">管理</td>
      </tr>
      ${rows || '<tr><td colspan="4" align="center" class="forumRow">暂无模板配置</td></tr>'}
      <tr>
        <td height="25" colspan="4" align="right" class="forumRowHighlight">
          <input type="submit" name="aaa" value="设为默认模板">
          <input type="submit" name="aaa" value="删除" onclick="return confirm('确认删除该模板吗？')">
        </td>
      </tr>
    </table>
  </form>
</body>
</html>`;
}

function renderLegacyCustomLabelKindsList(items) {
  const rows = items.map((item, index) => `
    <td>&nbsp;<font color="#0099CC">${index + 1}.</font>${escapeHtml(item.name || '')} [<a href="cuskind_ed.asp?id=${item.id}">修改</a>] [<a href="cuskind.asp?action=del&id=${item.id}" onclick="return confirm('确认删除该分类吗？')">删除</a>]</td>
    ${((index + 1) % 3 === 0) ? '</tr><tr>' : ''}
  `).join('');

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>自定义标签分类管理</title>
  <link href="/spck/css/style.css" rel="stylesheet" type="text/css">
</head>
<body>
  ${renderLegacyCustomLabelTop()}
  <br>
  <table width="98%" border="0" align="center" cellpadding="0" cellspacing="0" class="tableBorder">
    <tr><td>
      <form name="addform" method="post" action="cuskind.asp?action=add">
        <table width="100%" align="center">
          <tr><td align="center"><font color="#799ADD">添加自定义标签分类</font></td></tr>
          <tr><td colspan="2" align="center" bgcolor="#F4F3F0">分类名称:
            <input type="text" name="addkind" value="" maxlength="25">
            <input type="submit" value="添加分类" name="addbtn" style="background-color:#F4F3F0">
          </td></tr>
        </table>
      </form>
      <table border="0" cellpadding="0" cellspacing="0" width="100%"><tr>${rows || '<td align="center">暂无分类</td>'}</tr></table>
    </td></tr>
  </table>
</body>
</html>`;
}

function renderLegacyCustomLabelKindForm(item) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>修改自定义标签分类</title>
  <link href="/spck/css/style.css" rel="stylesheet" type="text/css">
</head>
<body>
  ${renderLegacyCustomLabelTop()}
  <br>
  <table width="98%" border="0" align="center" cellpadding="0" cellspacing="0" class="tableBorder">
    <tr><td>
      <form name="addform" method="post" action="cuskind_ed.asp?action=save&id=${item.id}">
        <table width="100%" align="center">
          <tr><td align="center"><font color="#799ADD">修改自定义标签分类</font></td></tr>
          <tr><td colspan="2" align="center" bgcolor="#F4F3F0">分类名称:
            <input type="text" name="addkind" value="${escapeHtml(item.name || '')}" maxlength="25">
            <input type="submit" value="修改分类" name="addbtn" style="background-color:#F4F3F0">
          </td></tr>
        </table>
      </form>
    </td></tr>
  </table>
</body>
</html>`;
}

function renderLegacyCustomLabelsList(items) {
  const rows = items.map((item, index) => `
    <tr bgcolor="${index % 2 === 0 ? '#ffffff' : '#F1F3F5'}">
      <td><font color="#6E92DB">${index + 1}.</font>${escapeHtml(item.name || '')}</td>
      <td>[<font color="#999999">分类:</font> <font color="#0099CC">${escapeHtml(item.kind_name || '')}</font>]<br>
        [<font color="#999999">说明:</font><font color="#666666">${escapeHtml(item.description || '')}</font>]</td>
      <td>[<a href="cuslabel_ed.asp?id=${item.id}">修改</a>]</td>
      <td>[<a href="cuslabel.asp?action=del&id=${item.id}" onclick="return confirm('确认删除该标签吗？')">删除</a>]</td>
    </tr>
  `).join('');

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>自定义标签管理</title>
  <link href="/spck/css/style.css" rel="stylesheet" type="text/css">
</head>
<body>
  ${renderLegacyCustomLabelTop()}
  <br>
  <table width="100%" border="0" align="center" cellpadding="3" cellspacing="1" bgcolor="#F7F7F7" class="tableBorder">
    <tr bgcolor="#ffffff"><th colspan="4">自定义标签管理</th></tr>
    ${rows || '<tr><td colspan="4" align="center" class="forumRow">暂无自定义标签</td></tr>'}
  </table>
</body>
</html>`;
}

function renderLegacyCustomLabelForm({ mode, item, kinds }) {
  const isEdit = mode === 'edit';
  const action = isEdit ? `cuslabel_ed.asp?id=${item.id}&action=save` : 'addcuslabel.asp?action=add';
  const options = kinds.map((kind) => `<option value="${kind.id}"${Number(kind.id) === Number(item.kind_id) ? ' selected' : ''}>${escapeHtml(kind.name || '')}</option>`).join('');

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>${isEdit ? '修改' : '添加'}自定义标签</title>
  <link href="/spck/css/style.css" rel="stylesheet" type="text/css">
</head>
<body>
  ${renderLegacyCustomLabelTop()}
  <form name="myform" method="post" action="${action}">
    <table width="98%" border="0" align="center" cellpadding="0" cellspacing="0" class="tableBorder">
      <tr><th height="22" colspan="2">${isEdit ? '修改' : '添加'}自定义标签</th></tr>
      <tr><td>
        <table width="98%" border="0" align="center" cellpadding="2" cellspacing="4" bgcolor="#F7F7F7">
          <tr>
            <td align="right">标签名称：</td>
            <td>#BM_<input type="text" name="addclname" value="${escapeHtml(item.raw_name || '')}" maxlength="25">#
              <input type="button" name="checklabel" value="检查标签是否有效" style="background-color:#DFDFDF" onclick="window.open('cuscheck.asp?str=' + document.myform.addclname.value, '', 'width=500,height=200')">
            </td>
          </tr>
          <tr>
            <td align="right">标签类型：</td>
            <td><select size="1" name="editlkind"><option value="">请选择分类</option>${options}</select></td>
          </tr>
          <tr>
            <td align="right">标签说明：</td>
            <td><input type="text" name="addcldes" value="${escapeHtml(item.description || '')}" style="width:300px" maxlength="60"></td>
          </tr>
          <tr>
            <td align="right">标签内容：</td>
            <td><textarea rows="15" cols="87" name="addclcontent">${escapeHtml(item.content || '')}</textarea></td>
          </tr>
          <tr><td align="center" colspan="2" height="40"><input type="submit" name="addbtn" value="${isEdit ? '确认修改' : '确认添加'}" style="background-color:#DFDFDF"></td></tr>
        </table>
      </td></tr>
    </table>
  </form>
</body>
</html>`;
}

function renderLegacyCustomLabelCheck(rawName, existing) {
  const normalizedName = rawName.startsWith('#') ? rawName : `#${rawName}#`;
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>自定义标签名称检查</title>
  <link href="/spck/css/style.css" rel="stylesheet" type="text/css">
</head>
<body>
  <table border="0" cellpadding="0" cellspacing="0" width="60%" align="center">
    <tr><td height="20"></td></tr>
    <tr><td align="center" valign="middle"><font color="red"><b>自定义标签名称检查</b></font></td></tr>
    <tr><td><br>名称：<font color="#0099CC"><b>${escapeHtml(normalizedName)}</b></font><br></td></tr>
    <tr><td height="35">结果：<font color="red">${existing ? '无效，请换一个！' : '有效，可以使用！'}</font></td></tr>
    <tr><td height="50" align="center"><a href="#" onclick="window.close()">关闭</a></td></tr>
  </table>
</body>
</html>`;
}

function renderLegacyTemplateEditorForm({ page, item }) {
  const value = item[page.field] ?? '';
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(page.title)}</title>
  <link href="/spck/css/style.css" rel="stylesheet" type="text/css">
</head>
<body>
  ${renderLegacyTemplateEditorTop(item.id)}
  <form name="Form" action="/spck/cn/webtemp/${page.fileName}?action=saveedit&id=${item.id}" method="post">
    <table border="0" cellspacing="1" cellpadding="3" align="center" class="tableBorder">
      <tr><th class="tableHeaderText" colspan="2" height="25"><font color="#FFFFFF">${escapeHtml(page.title)}</font></th></tr>
      <tr>
        <td class="forumRowHighlight" height="30" align="left">模板名称：</td>
        <td class="forumRowHighlight" height="30" align="left"><input name="tempname" type="text" value="${escapeHtml(item.template_name || '')}" size="50" maxlength="50"></td>
      </tr>
      <tr>
        <td class="forumRowHighlight" width="18%" height="40" align="left">${escapeHtml(page.label)}：</td>
        <td class="forumRowHighlight" width="82%" height="40" align="left">
          <input name="${escapeHtml(page.formField)}" type="text" value="${escapeHtml(value || '')}" size="60" maxlength="100">
          ${value ? `( <a href="${escapeHtml(value)}" target="_blank">查看模板</a> )` : ''}
        </td>
      </tr>
      <tr><td height="25" colspan="2" align="center" class="forumRowHighlight"><input type="submit" name="B1" value="确认修改设置"></td></tr>
    </table>
  </form>
</body>
</html>`;
}

function renderLegacyCustomLabelTop() {
  return `
  <table border="0" cellspacing="1" cellpadding="3" align="center" class="tableBorder">
    <tr><th width="180%" class="tableHeaderText" height="25">网站 HTML 自定义标签管理</th></tr>
    <tr><td class="forumRowHighlight"><p><b>注意</b>：这里继续兼容旧站自定义标签入口和模板标签写法。</p></td></tr>
    <tr><td align="center" class="forumRowHighlight"><a href="addcuslabel.asp">添加自定义页面显示标签</a> | <a href="cuslabel.asp">自定义标签管理</a> | <a href="cuskind.asp">自定义标签分类管理</a> | [<a href="javascript:location.reload()">刷新页面</a>]</td></tr>
  </table>`;
}

function renderLegacyTemplateEditorTop(id) {
  return `
  <table border="0" cellspacing="1" cellpadding="3" align="center" class="tableBorder">
    <tr><th width="180%" class="tableHeaderText" height="25">网站 HTML 模板管理</th></tr>
    <tr><td class="forumRowHighlight"><p><b>注意</b>：这里继续兼容旧站模板路径配置入口。</p></td></tr>
    <tr><td align="center" class="forumRowHighlight">
      <a href="/spck/cn/webtemp/worldec_index.asp?id=${id}">首页</a> |
      <a href="/spck/cn/webtemp/worldec_co.asp?id=${id}">关于公司</a> |
      <a href="/spck/cn/webtemp/worldec_news.asp?id=${id}">新闻</a> |
      <a href="/spck/cn/webtemp/worldec_service.asp?id=${id}">服务</a> |
      <a href="/spck/cn/webtemp/worldec_prod.asp?id=${id}">产品</a> |
      <a href="/spck/cn/webtemp/worldec_job.asp?id=${id}">招聘</a> |
      <a href="/spck/cn/webtemp/worldec_contact.asp?id=${id}">联系我们</a> |
      <a href="/spck/cn/webtemp/worldec_msg.asp?id=${id}">留言反馈</a> |
      <a href="/spck/cn/webtemp/index.asp">模板列表</a>
    </td></tr>
  </table>`;
}

function renderLegacyCorporationCategoriesList({ items, parentId }) {
  const rows = items.map((item) => `
    <tr height="20">
      <td height="30" align="left" class="forumRow">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<a href="Co_Class.asp?id=${item.id}">${escapeHtml(item.name || '')}</a>[<span class="STYLE1">${item.child_count || 0}</span>] [ID=${item.id}]</td>
      <td height="30" align="center" class="forumRow">${item.sort_order}</td>
      <td align="center" class="forumRow"><a href="Co_Class_edit.asp?id=${item.id}">修改</a></td>
      <td align="center" class="forumRow">${item.parent_id > 0 && item.is_external === 0 ? `<a href="co_edit.asp?id=${item.id}">编辑内容</a>` : ''}</td>
      <td align="center" class="forumRow"><input type="checkbox" name="selAnnounce" value="${item.id}"></td>
      <td align="center" class="forumRow">&nbsp;</td>
    </tr>
  `).join('');

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>公司信息分类管理</title>
  <link href="/spck/css/style.css" rel="stylesheet" type="text/css">
  <style>.STYLE1 { color: #FF0000; }</style>
  <script>
    let legacyCorporationCheckFlag = false;
    function toggleLegacyCorporation(form) {
      const fields = form.querySelectorAll('input[name="selAnnounce"]');
      legacyCorporationCheckFlag = !legacyCorporationCheckFlag;
      for (const field of fields) field.checked = legacyCorporationCheckFlag;
      return legacyCorporationCheckFlag ? '取消全选' : '全选';
    }
    function validateLegacyCorporationDelete() {
      return Array.from(document.querySelectorAll('input[name="selAnnounce"]')).some((item) => item.checked);
    }
  </script>
</head>
<body>
  <form name="search" method="post" action="Co_Class.asp?action=del" onsubmit="return validateLegacyCorporationDelete()">
    <table width="100%" border="0" align="center" cellpadding="2" cellspacing="1" class="tableBorder">
      <tr><th class="tableHeaderText" height="25" colspan="6">公司信息分类列表 ${parentId > 0 ? `(父级 ID: ${parentId})` : ''}</th></tr>
      <tr><td colspan="6"></td></tr>
      <tr height="25" class="bodytitle">
        <td width="55%" align="left">&nbsp;</td>
        <td width="8%" align="center"><font color="ff6600"><b>排序</b></font></td>
        <td width="9%" align="center"><font color="ff6600"><b>修改</b></font></td>
        <td width="10%" align="center"><font color="ff6600"><b>编辑内容</b></font></td>
        <td width="10%" align="center"><input name="submit2" type="submit" value="删除"></td>
        <td width="8%" align="center">&nbsp;</td>
      </tr>
      ${rows || '<tr><td colspan="6" class="forumRow" align="center">暂无公司信息分类</td></tr>'}
      <tr height="20" bgcolor="#ffffff">
        <td height="30" colspan="2" align="left" class="forumRow">${parentId > 0 ? '<a href="Co_Class.asp">返回根级分类</a>' : '&nbsp;'}</td>
        <td colspan="2" align="left" class="forumRow">&nbsp;</td>
        <td align="center" class="forumRow"><input name="button" type="button" onclick="this.value=toggleLegacyCorporation(this.form)" value="全选"></td>
        <td align="left" class="forumRow">&nbsp;</td>
      </tr>
    </table>
  </form>
</body>
</html>`;
}

function renderLegacyCorporationCategoryForm({ mode, roots, item }) {
  const title = mode === 'edit' ? '修改公司信息分类' : '添加公司信息分类';
  const action = mode === 'edit' ? 'Co_Class_Save.asp?action=edit' : 'Co_Class_Save.asp?action=add';
  const urlRowStyle = item.is_external ? '' : 'display:none';
  const rootOptions = roots.map((root) => `<option value="${root.id}"${root.id === item.parent_id ? ' selected' : ''}>${escapeHtml(root.name || '')}</option>`).join('');

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <link href="/spck/css/style.css" rel="stylesheet" type="text/css">
  <script>
    function validateLegacyCorporationCategoryForm() {
      if (document.FORM1.coname.value.length < 1) {
        alert('请输入分类名称!');
        document.FORM1.coname.focus();
        return false;
      }
      if (document.FORM1.OrderID.value === '') {
        alert('排序不能为空!');
        document.FORM1.OrderID.focus();
        return false;
      }
      if (document.FORM1.sitepath.checked && document.FORM1.siteurl.value === '') {
        alert('跳转地址不能为空!');
        document.FORM1.siteurl.focus();
        return false;
      }
      return true;
    }
    function toggleLegacyCorporationUrl() {
      const urlRow = document.getElementById('legacy-url-row');
      if (document.FORM1.Root.value === '0') {
        document.FORM1.sitepath.checked = false;
        urlRow.style.display = 'none';
        return;
      }
      urlRow.style.display = document.FORM1.sitepath.checked ? '' : 'none';
    }
  </script>
</head>
<body>
  <form name="FORM1" method="post" action="${action}" onsubmit="return validateLegacyCorporationCategoryForm()">
    ${mode === 'edit' ? `<input type="hidden" name="hidid" value="${item.id}"><input type="hidden" name="hidurl" value="Co_Class.asp${item.parent_id > 0 ? `?id=${item.parent_id}` : ''}">` : ''}
    <table width="100%" border="0" align="center" cellpadding="3" cellspacing="1" class="tableBorder">
      <tr><th colspan="2" height="28" class="tableHeaderText">${title}</th></tr>
      <tr>
        <td height="25" class="forumRowHighlight" align="right"><b>所属分类：</b></td>
        <td height="25" class="forumRowHighlight">
          <select name="Root" id="Root" onchange="toggleLegacyCorporationUrl()">
            <option value="0"${item.parent_id === 0 ? ' selected' : ''}>作为顶级分类</option>
            ${rootOptions}
          </select>
        </td>
      </tr>
      <tr>
        <td width="41%" height="25" class="forumRowHighlight" align="right"><b>分类名称：</b></td>
        <td width="59%" height="25" class="forumRowHighlight"><input name="coname" id="coname" value="${escapeHtml(item.name || '')}" size="25" maxlength="40"> <font color="#FF0000">*</font></td>
      </tr>
      <tr>
        <td height="27" class="forumRowHighlight" align="right"><b>排序</b></td>
        <td height="27" class="forumRowHighlight"><input name="OrderID" id="OrderID" value="${escapeHtml(String(item.sort_order ?? 1))}" size="10" maxlength="16"> <font color="#FF0000">*</font></td>
      </tr>
      <tr>
        <td height="27" align="right" class="forumRowHighlight"><b>外部跳转</b></td>
        <td height="27" align="left" class="forumRowHighlight"><input name="sitepath" type="checkbox" id="sitepath" value="1" onclick="toggleLegacyCorporationUrl()"${item.is_external ? ' checked' : ''}></td>
      </tr>
      <tr id="legacy-url-row" style="${urlRowStyle}">
        <td height="27" align="right" class="forumRowHighlight"><b>跳转地址</b></td>
        <td height="27" align="left" class="forumRowHighlight"><input name="siteurl" type="text" id="siteurl" size="40" value="${escapeHtml(item.external_url || '')}"></td>
      </tr>
      <tr>
        <td colspan="2" height="27" align="center" class="forumRowHighlight"><input type="submit" value="确 认 提 交" name="Submit2"></td>
      </tr>
    </table>
  </form>
</body>
</html>`;
}

function renderLegacyCorporationContentForm(item) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>编辑公司信息</title>
  <link href="/spck/css/style.css" rel="stylesheet" type="text/css">
  <style>.STYLE1 { color: #FF0000; }</style>
  <script type="text/javascript" src="/spck/ueditor/ueditor.config.js"></script>
  <script type="text/javascript" src="/spck/ueditor/ueditor.all.min.js"></script>
  <script type="text/javascript" src="/spck/ueditor/lang/zh-cn/zh-cn.js"></script>
  <script>
    function validateLegacyCorporationContentForm() {
      if (document.FORM1.select.value.length < 1) {
        alert('请选择要编辑的公司信息分类!');
        document.FORM1.select.focus();
        return false;
      }
      return true;
    }
  </script>
</head>
<body>
  <form name="FORM1" method="post" action="Co_Save.asp?action=save" onsubmit="return validateLegacyCorporationContentForm()">
    <table width="100%" border="0" align="center" cellpadding="3" cellspacing="1" class="tableBorder">
      <tr><th colspan="2" height="28" class="tableHeaderText">编辑公司信息内容</th></tr>
      <tr>
        <td height="25" class="forumRowHighlight" align="right"><b>信息分类：</b></td>
        <td height="25" class="forumRowHighlight">
          <select name="select">
            <option value="${item.id}" selected>${escapeHtml(item.name || '')}</option>
          </select>
          (<span class="STYLE1">分类名称如需修改，请返回分类管理页处理</span>)
        </td>
      </tr>
      <tr>
        <td width="16%" height="25" class="forumRowHighlight" align="right"><b>内容：</b></td>
        <td width="84%" height="25" class="forumRowHighlight">
          <textarea name="content" id="myEditor" style="width:780px;height:300px">${escapeHtml(item.content_html || '')}</textarea>
          <script>UE.getEditor('myEditor');</script>
        </td>
      </tr>
      <tr>
        <td colspan="2" height="27" align="center" class="forumRowHighlight"><input type="submit" value="确 认 提 交" name="Submit2"></td>
      </tr>
    </table>
  </form>
</body>
</html>`;
}

function renderLegacyOfficesList(items) {
  const rows = items.map((item) => `
    <tr height="20">
      <td align="left" class="forumRow">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${escapeHtml(item.office_name || '')}</td>
      <td align="center" class="forumRow">&nbsp;${escapeHtml(item.contact_person || '')}</td>
      <td align="center" class="forumRow">&nbsp;${escapeHtml(item.phone || '')}</td>
      <td height="30" align="center" class="forumRow"><a href="Offices_edit.asp?id=${item.id}">修改</a> | <a href="Offices_save.asp?action=del&id=${item.id}">删除</a></td>
    </tr>
  `).join('');

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>办事处联系信息</title>
  <link href="/spck/css/style.css" rel="stylesheet" type="text/css">
</head>
<body>
  <table width="98%" border="0" cellspacing="0" cellpadding="0" align="center" class="tableBorder">
    <tr><th height="25" colspan="2" class="tableHeaderText">公司信息管理</th></tr>
    <tr><td colspan="2" class="forumRowHighlight"><p><b>注意</b>：保持旧办事处联系信息管理路径。</p></td></tr>
    <tr><td width="26%" height="25" class="forumRowHighlight">&nbsp;</td><td class="forumRowHighlight"><a href="Offices.asp">管理办事处联系方式</a> | <a href="Offices_add.asp">添加办事处联系方式</a> | [<a href="javascript:location.reload()">刷新页面</a>]</td></tr>
  </table>
  <form name="search" method="post" action="index.asp">
    <table width="100%" border="0" align="center" cellpadding="2" cellspacing="1" class="tableBorder">
      <tr><th class="tableHeaderText" height="25" colspan="4">办事处列表</th></tr>
      <tr height="25" class="bodytitle">
        <td width="42%" align="left">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<b>办事处名称</b></td>
        <td width="21%" align="center"><b>联系人</b></td>
        <td width="16%" align="center"><b>电话</b></td>
        <td width="21%" align="center"><b>操作</b></td>
      </tr>
      ${rows || '<tr><td colspan="4" class="forumRow" align="center">暂无办事处信息</td></tr>'}
    </table>
  </form>
</body>
</html>`;
}

function renderLegacyOfficeForm({ mode, contact, defaults = {} }) {
  const data = contact || defaults;
  const title = mode === 'edit' ? '修改办事处联系信息' : '添加办事处联系信息';
  const action = mode === 'edit' ? 'Offices_save.asp?action=save' : 'Offices_save.asp?action=add';

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <link href="/spck/css/style.css" rel="stylesheet" type="text/css">
  <script>
    function validateLegacyOfficeForm() {
      if (document.FORM1.offname.value === '') {
        alert('请输入办事处名称!');
        document.FORM1.offname.focus();
        return false;
      }
      return true;
    }
  </script>
</head>
<body>
  <table width="98%" border="0" cellspacing="0" cellpadding="0" align="center" class="tableBorder">
    <tr><th height="25" colspan="2" class="tableHeaderText">公司信息管理</th></tr>
    <tr><td colspan="2" class="forumRowHighlight"><p><b>注意</b>：继续复用旧办事处联系表单结构。</p></td></tr>
    <tr><td width="26%" height="25" class="forumRowHighlight">&nbsp;</td><td class="forumRowHighlight"><a href="Offices.asp">管理办事处联系方式</a> | <a href="Offices_add.asp">添加办事处联系方式</a> | [<a href="javascript:location.reload()">刷新页面</a>]</td></tr>
  </table>
  <form name="FORM1" id="FORM1" onsubmit="return validateLegacyOfficeForm()" action="${action}" method="post">
    ${mode === 'edit' ? `<input type="hidden" name="hidid" value="${contact.id}">` : ''}
    <table width="100%" border="0" align="center" cellpadding="3" cellspacing="1" class="tableBorder">
      <tr><th colspan="4" height="28" class="tableHeaderText">${title}</th></tr>
      <tr>
        <td height="25" class="forumRowHighlight" align="right"><b>办事处名称：</b></td>
        <td height="25" colspan="3" class="forumRowHighlight"><input name="offname" type="text" id="offname" value="${escapeHtml(data.office_name || '')}" size="30"> <font color="#FF0000">*</font></td>
      </tr>
      <tr>
        <td width="17%" height="25" class="forumRowHighlight" align="right"><b>地址：</b></td>
        <td height="25" colspan="3" class="forumRowHighlight"><input name="address" type="text" id="address" size="50" value="${escapeHtml(data.address || '')}"></td>
      </tr>
      <tr>
        <td height="27" class="forumRowHighlight" align="right"><b>电话：</b></td>
        <td width="35%" height="27" class="forumRowHighlight"><input name="phone" type="text" id="phone" size="30" maxlength="100" value="${escapeHtml(data.phone || '')}"></td>
        <td width="7%" height="27" class="forumRowHighlight"><strong>传真</strong>：</td>
        <td width="41%" height="27" class="forumRowHighlight"><input name="fax" type="text" id="fax" size="30" maxlength="100" value="${escapeHtml(data.fax || '')}"></td>
      </tr>
      <tr>
        <td height="27" align="right" class="forumRowHighlight"><b>联系人</b>：</td>
        <td height="27" align="left" class="forumRowHighlight"><input name="linkren" type="text" id="linkren" size="30" maxlength="100" value="${escapeHtml(data.contact_person || '')}"></td>
        <td height="27" align="left" class="forumRowHighlight"><b>Email</b></td>
        <td height="27" align="left" class="forumRowHighlight"><input name="email" type="text" id="email" size="30" maxlength="100" value="${escapeHtml(data.email || '')}"></td>
      </tr>
      <tr>
        <td height="27" align="right" class="forumRowHighlight"><b>邮编</b>：</td>
        <td height="27" align="left" class="forumRowHighlight"><input name="post" type="text" id="post" size="30" maxlength="100" value="${escapeHtml(data.postal_code || '')}"></td>
        <td height="27" align="left" class="forumRowHighlight">&nbsp;</td>
        <td height="27" align="left" class="forumRowHighlight">&nbsp;</td>
      </tr>
      <tr>
        <td colspan="4" height="27" align="center" class="forumRowHighlight"><input type="submit" value="确认提交" name="Submit2"></td>
      </tr>
    </table>
  </form>
  <br>
</body>
</html>`;
}

function renderLegacyJobList(result) {
  const rows = result.items.map((item) => `
    <tr height="28">
      <td width="35%" align="center" class="forumRow"><a href="job_edit.asp?id=${item.id}">${escapeHtml(item.name || '')}</a></td>
      <td width="12%" align="center" class="forumRow">${item.is_active ? '招聘中' : '暂停招聘'}</td>
      <td width="11%" align="center" class="forumRow">${escapeHtml(item.openings || '')}</td>
      <td width="14%" align="center" class="forumRow">${escapeHtml(item.address || '')}</td>
      <td width="11%" align="center" class="forumRow">${escapeHtml(formatLegacyDate(item.created_at))}</td>
      <td width="17%" align="center" class="forumRow"><a href="job.asp?action=del&id=${item.id}" onclick="return confirm('删除后不可恢复，确认删除吗？')">删除</a>&nbsp;&nbsp;<a href="job_edit.asp?id=${item.id}">编辑</a></td>
    </tr>
  `).join('');
  const paginationLinks = renderLegacyPager({
    basePath: 'job.asp',
    page: result.pagination.page,
    totalPages: result.pagination.totalPages
  });

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>招聘管理</title>
  <link href="/spck/css/style.css" rel="stylesheet" type="text/css">
</head>
<body>
  <table width="98%" border="0" cellspacing="0" cellpadding="0" align="center" class="tableBorder">
    <tr><th height="25" colspan="2" class="tableHeaderText">招聘管理</th></tr>
    <tr><td colspan="2" class="forumRowHighlight"><p><b>注意</b>：继续保留旧招聘后台入口和字段结构。</p></td></tr>
    <tr><td width="26%" height="25" class="forumRowHighlight">&nbsp;</td><td class="forumRowHighlight"><a href="job.asp">管理招聘</a> | <a href="job_add.asp">添加职位</a> | [<a href="javascript:location.reload()">刷新页面</a>]</td></tr>
  </table>
  <form name="search" method="post" action="admin_admin.asp">
    <table border="0" align="center" cellpadding="2" cellspacing="1" class="tableBorder">
      <tr><th height="25" colspan="6" class="tableHeaderText">企业招聘管理</th></tr>
      <tr height="28" class="bodytitle">
        <td width="35%" align="center"><b>职位信息</b></td>
        <td width="12%" align="center"><b>状态</b></td>
        <td width="11%" align="center"><b>招聘人数</b></td>
        <td width="14%" align="center"><b>工作地点</b></td>
        <td width="11%" align="center"><b>发布时间</b></td>
        <td width="17%" align="center"><b>操作</b></td>
      </tr>
      ${rows || '<tr><td colspan="6" class="forumRow" align="center">暂无招聘信息</td></tr>'}
      <tr><td colspan="6" align="center" class="forumRow">${paginationLinks} 第 ${result.pagination.page} / ${result.pagination.totalPages} 页，共 ${result.pagination.total} 条</td></tr>
    </table>
  </form>
  <br>
</body>
</html>`;
}

function renderLegacyJobForm({ mode, job, defaults = {} }) {
  const data = job || defaults;
  const title = mode === 'edit' ? '修改职位' : '添加职位';
  const action = mode === 'edit' ? 'job_save.asp?action=Save' : 'job_save.asp?action=add';

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <link rel="stylesheet" type="text/css" href="/spck/css/style.css">
  <style>.STYLE2 { color:#FF0000; }</style>
  <script>
    function submitLegacyJobForm() {
      if (document.form.jobName.value === '') {
        alert('招聘职位不能为空');
        document.form.jobName.focus();
        return;
      }
      if (document.form.address.value === '') {
        alert('工作地点不能为空');
        document.form.address.focus();
        return;
      }
      if (document.form.jobnob.value === '') {
        alert('招聘人数不能为空');
        document.form.jobnob.focus();
        return;
      }
      if (document.form.linkren.value === '') {
        alert('联系人不能为空');
        document.form.linkren.focus();
        return;
      }
      if (document.form.phone.value === '') {
        alert('联系电话不能为空');
        document.form.phone.focus();
        return;
      }
      document.form.submit();
    }
  </script>
</head>
<body>
  <table width="98%" border="0" cellspacing="0" cellpadding="0" align="center" class="tableBorder">
    <tr><th height="25" colspan="2" class="tableHeaderText">招聘管理</th></tr>
    <tr><td colspan="2" class="forumRowHighlight"><p><b>注意</b>：继续复用旧招聘表单，内容编辑器仍走旧 iframe。</p></td></tr>
    <tr><td width="26%" height="25" class="forumRowHighlight">&nbsp;</td><td class="forumRowHighlight"><a href="job.asp">管理招聘</a> | <a href="job_add.asp">添加职位</a> | [<a href="javascript:location.reload()">刷新页面</a>]</td></tr>
  </table>
  <form name="form" method="post" action="${action}">
    ${mode === 'edit' ? `<input type="hidden" name="hidid" value="${job.id}">` : ''}
    <table width="100%" border="0" align="center" cellpadding="0" cellspacing="1" class="tableBorder">
      <tr><th height="25" colspan="2" class="tableHeaderText">${title}</th></tr>
      <tr align="center">
        <td>
          <table width="100%" border="0" cellpadding="5" cellspacing="2" style="border-collapse: collapse">
            <tr>
              <td width="133" align="right" nowrap class="Forumrow"><b>招聘职位</b>：</td>
              <td colspan="3" class="Forumrow"><input name="jobName" type="text" id="jobName" value="${escapeHtml(data.name || '')}"> <span class="STYLE2">*</span></td>
            </tr>
            <tr>
              <td align="right" valign="middle" class="Forumrow"><b>工作地点</b>：</td>
              <td colspan="3" class="Forumrow"><input name="address" type="text" class="smallInput" id="address" value="${escapeHtml(data.address || '')}" size="55" maxlength="50"> <span class="STYLE2">*</span></td>
            </tr>
            <tr>
              <td class="Forumrow" align="right"><b>招聘人数</b></td>
              <td colspan="3" class="Forumrow"><input name="jobnob" type="text" id="jobnob" value="${escapeHtml(data.openings || '1')}" size="5"> <span class="STYLE2">*</span></td>
            </tr>
            <tr>
              <td align="right" class="Forumrow"><b>联系人</b>：</td>
              <td width="209" valign="middle" class="Forumrow"><input name="linkren" type="text" id="linkren" value="${escapeHtml(data.contact_person || '')}" size="30"> <span class="STYLE2">*</span></td>
              <td width="92" valign="middle" class="Forumrow"><b>联系电话</b></td>
              <td width="452" valign="middle" class="Forumrow"><input name="phone" type="text" id="phone" value="${escapeHtml(data.phone || '')}"> <span class="STYLE2">*</span></td>
            </tr>
            <tr>
              <td align="right" class="Forumrow"><b>招聘状态</b>：</td>
              <td colspan="3" class="Forumrow"><input name="state" type="checkbox" id="state" value="1"${data.is_active ? ' checked' : ''}> (<span class="STYLE2">选中为招聘中</span>)</td>
            </tr>
            <tr>
              <td align="right" class="Forumrow"><b>任职要求</b></td>
              <td colspan="3" class="Forumrow"><textarea name="content" style="display:none">${escapeHtml(data.requirements_html || '')}</textarea><iframe id="eWebEditor1" src="/editor/ewebeditor.asp?id=content&style=standard&originalfilename=d_originalfilename&savefilename=d_savefilename&savepathfilename=d_savepathfilename" frameborder="0" scrolling="no" width="617" height="450"></iframe></td>
            </tr>
            <tr height="40">
              <td colspan="4" align="center" class="Forumrow" height="40">
                <input type="button" name="Submit" value="提交保存" class="smallInput" onclick="submitLegacyJobForm()">
                &nbsp;&nbsp;&nbsp;
                <input type="reset" name="Submit2" value="重新填写" class="smallInput">
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    <br>
  </form>
</body>
</html>`;
}

function renderLegacyMessagesList(result) {
  const rows = result.items.map((item) => `
    <tr height="20">
      <td align="left" class="forumRow">&nbsp;${escapeHtml(item.title || '')}</td>
      <td class="forumRow" align="center">${escapeHtml(item.contact_name || '')}</td>
      <td align="center" class="forumRow">${escapeHtml(formatLegacyDate(item.created_at))}</td>
      <td align="center" class="forumRow"><span class="STYLE1">${item.status === 0 ? `<a href="chu.asp?id=${item.id}">未处理</a>` : `已处理[${escapeHtml(item.handled_at || formatLegacyDate(item.created_at))}]`}</span></td>
      <td align="center" class="forumRow"><a href="show.asp?id=${item.id}">查看</a></td>
      <td align="center" class="forumRow"><input type="checkbox" name="selAnnounce" value="${item.id}"></td>
    </tr>
  `).join('');
  const paginationLinks = renderLegacyPager({
    basePath: 'Msg.asp',
    page: result.pagination.page,
    totalPages: result.pagination.totalPages
  });

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>留言列表</title>
  <link href="/spck/css/style.css" rel="stylesheet" type="text/css">
  <style>.STYLE1 { color:#FF0000; }</style>
  <script>
    let legacyMessageCheckFlag = false;
    function toggleLegacyMessages(form) {
      const fields = form.querySelectorAll('input[name="selAnnounce"]');
      legacyMessageCheckFlag = !legacyMessageCheckFlag;
      for (const field of fields) field.checked = legacyMessageCheckFlag;
      return legacyMessageCheckFlag ? '取消全选' : '全选';
    }
  </script>
</head>
<body>
  <form name="search" method="post" action="Msg.asp?action=del">
    <table width="100%" border="0" align="center" cellpadding="2" cellspacing="1" class="tableBorder">
      <tr><th class="tableHeaderText" height="25" colspan="6">留言列表</th></tr>
      <tr><td colspan="6">&nbsp;</td></tr>
      <tr height="25" class="bodytitle">
        <td width="41%" align="left"><b>留言标题</b></td>
        <td width="11%" align="center"><b>联系人</b></td>
        <td width="10%" align="center"><b>留言时间</b></td>
        <td width="21%" align="center"><b>状态</b></td>
        <td width="7%" align="center"><b>查看</b></td>
        <td width="10%" align="center"><input name="submit2" type="submit" value="删除"></td>
      </tr>
      ${rows || '<tr><td colspan="6" class="forumRow" align="center">暂无留言</td></tr>'}
      <tr height="20" bgcolor="#ffffff">
        <td colspan="6" class="forumRow" align="right"><input name="button" type="button" onclick="this.value=toggleLegacyMessages(this.form)" value="全选"></td>
      </tr>
      <tr height="20" bgcolor="#ffffff">
        <td class="forumrowHighLight" align="center" colspan="6">${paginationLinks} 第 ${result.pagination.page} / ${result.pagination.totalPages} 页，共 ${result.pagination.total} 条</td>
      </tr>
    </table>
  </form>
</body>
</html>`;
}

function renderLegacyMessageDetail(message) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>查看留言</title>
  <link href="/spck/css/style.css" rel="stylesheet" type="text/css">
  <style>
    .STYLE1 { color:#FFFFFF; }
    .STYLE2 { color:#FF0000; }
  </style>
</head>
<body>
  <table width="100%" height="100%" border="0" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" valign="top">
        <table width="100%" border="0" cellpadding="0" cellspacing="1">
          <tr><th height="28" class="tableHeaderText" align="center"><strong>留言管理</strong></th></tr>
          <tr>
            <td>
              <div align="center">
                <table width="100%" border="0" cellpadding="0" cellspacing="1">
                  <tr>
                    <td height="25" colspan="4" bgcolor="#449AE8" align="center"><span class="STYLE1">查看留言</span></td>
                  </tr>
                  <tr class="tdbg">
                    <td width="13%" height="25" align="center" bgcolor="#F0F0F0">联系人：</td>
                    <td width="25%" height="25" bgcolor="#F0F0F0">&nbsp;${escapeHtml(message.contact_name || '')}</td>
                    <td width="8%" bgcolor="#F0F0F0">联系电话：</td>
                    <td width="54%" bgcolor="#F0F0F0">&nbsp;${escapeHtml(message.phone || '')}</td>
                  </tr>
                  <tr class="tdbg">
                    <td height="25" align="center" bgcolor="#F0F0F0">E-Mail:</td>
                    <td height="25" bgcolor="#F0F0F0">&nbsp;${escapeHtml(message.email || '')}</td>
                    <td height="25" bgcolor="#F0F0F0">地址：</td>
                    <td height="25" bgcolor="#F0F0F0">&nbsp;${escapeHtml(message.address || '')}</td>
                  </tr>
                  <tr class="tdbg">
                    <td height="25" align="center" bgcolor="#F0F0F0">标题：</td>
                    <td height="25" colspan="3" bgcolor="#F0F0F0">&nbsp;&nbsp;${escapeHtml(message.title || '')}[ ${escapeHtml(formatLegacyDate(message.created_at))} ]</td>
                  </tr>
                  <tr class="tdbg">
                    <td height="25" align="center" bgcolor="#F0F0F0">内容：</td>
                    <td height="25" colspan="3" bgcolor="#F0F0F0">&nbsp;&nbsp;${escapeHtml(message.content || '')}</td>
                  </tr>
                </table>
              </div>
            </td>
          </tr>
        </table>
        <br>
        <table width="98%" border="0" cellpadding="0" cellspacing="0">
          <tr>
            <td>${message.status === 1 ? `<span class="STYLE2">[<strong>${escapeHtml(message.handled_at || '')}</strong>] 已处理</span>` : '<span class="STYLE2">未处理</span>'}</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function renderLegacyNewsForm({ mode, categories, item, defaults = {} }) {
  const data = item || defaults;
  const action = mode === 'edit' ? 'News_save.asp?action=save' : 'News_save.asp?action=add';
  const title = mode === 'edit' ? '修改新闻' : '添加新闻';
  const hasCategories = categories.length > 0;
  const categoryOptions = categories.length > 0
    ? categories.map((category) => {
      const selected = Number(category.id) === Number(data.category_id) ? ' selected' : '';
      const label = category.depth === 0
        ? `===${escapeHtml(category.name || '')}===`
        : `${'&nbsp;&nbsp;'.repeat(category.depth)}${escapeHtml(category.name || '')}`;
      return `<option value="${category.id}"${selected}>${label}</option>`;
    }).join('')
    : '<option value="">暂无分类</option>';

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <link rel="stylesheet" type="text/css" href="/spck/css/style.css">
  <script type="text/javascript" src="/spck/ueditor/ueditor.config.js"></script>
  <script type="text/javascript" src="/spck/ueditor/ueditor.all.min.js"></script>
  <script type="text/javascript" src="/spck/ueditor/lang/zh-cn/zh-cn.js"></script>
  <script>
    function submitLegacyNewsForm() {
      if (!document.form.title.value) {
        alert('请输入新闻标题');
        document.form.title.focus();
        return;
      }
      if (${hasCategories ? 'true' : 'false'} && !document.form.typeid.value) {
        alert('请选择新闻分类');
        document.form.typeid.focus();
        return;
      }
      document.form.submit();
    }
    function toggleLegacyNewsPictureUpload() {
      const enabled = document.form.pic_on.checked;
      document.getElementById('adv').style.display = enabled ? '' : 'none';
      document.getElementById('advpic').style.display = enabled ? '' : 'none';
      document.getElementById('advance').innerText = enabled ? '取消上传新闻图片' : '上传新闻图片';
    }
  </script>
</head>
<body>
  <table width="98%" border="0" cellspacing="0" cellpadding="0" align="center" class="tableBorder">
    <tr><th height="25" colspan="2" class="tableHeaderText">新闻管理</th></tr>
    <tr><td colspan="2" class="forumRowHighlight"><p><b>注意</b>：保持旧新闻字段结构，图片仍走旧上传 iframe。</p></td></tr>
    <tr><td width="26%" height="25" class="forumRowHighlight">&nbsp;</td><td class="forumRowHighlight"><a href="News_index.asp">管理新闻</a> | <a href="News_add.asp">添加新闻</a> | <a href="Class.asp">管理分类</a> | <a href="Class_add.asp">添加分类</a> | [<a href="javascript:location.reload()">刷新页面</a>]</td></tr>
  </table>
  <form name="form" method="post" action="${action}">
    <input type="hidden" name="picture" value="">
    ${mode === 'edit' ? `<input type="hidden" name="hidid" value="${item.id}">` : ''}
    <table width="100%" border="0" align="center" cellpadding="0" cellspacing="1" class="tableBorder">
      <tr><th height="25" colspan="2" class="tableHeaderText">${title}</th></tr>
      <tr align="center">
        <td>
          <table width="100%" border="0" cellpadding="5" cellspacing="2" style="border-collapse: collapse">
            <tr>
              <td width="155" align="right" nowrap class="Forumrow"><b>新闻标题：</b></td>
              <td colspan="2" class="Forumrow">
                <select name="IncludePic">
                  <option value="" selected> </option>
                  <option value="[图文]">[图文]</option>
                  <option value="[组图]">[组图]</option>
                  <option value="[推荐]">[推荐]</option>
                  <option value="[注意]">[注意]</option>
                </select>
                <input name="title" type="text" class="smallInput" value="${escapeHtml(data.title || '')}" size="55" maxlength="100">
                <font color="#FF0000">*</font>
              </td>
            </tr>
            <tr>
              <td align="right" valign="middle" class="Forumrow"><b>新闻分类：</b></td>
              <td colspan="2" class="Forumrow">
                <select name="typeid" size="1" class="lh17">
                  <option value="">请选择新闻分类</option>
                  ${categoryOptions}
                </select>
                <a href="Class_add.asp"><font color="#FF0000">新增</font></a>
                &nbsp;&nbsp;&nbsp;<input name="pic_on" type="checkbox" id="pic_on" value="1" onclick="toggleLegacyNewsPictureUpload()">
                <font color="red"><span id="advance">上传新闻图片</span></font>
                ${mode === 'edit' ? (data.picture && data.picture !== '/UploadFile/nopicture.gif' ? `<img src="${escapeHtml(data.picture)}" width="35" height="35">` : '无图像') : ''}
              </td>
            </tr>
            <tr id="adv" style="display:none">
              <td class="Forumrow"></td>
              <td colspan="2" class="Forumrow">
                <iframe id="d_file" frameborder="0" src="../../../inc/upload.asp?tMode=2&amp;istwo=0&amp;utype=news" width="300" height="30" scrolling="no"></iframe>
                ${mode === 'edit' ? `<input type="hidden" name="oldpic" value="${escapeHtml(data.picture || '/UploadFile/nopicture.gif')}">` : ''}
                ${mode === 'edit' ? '<div><input type="radio" name="cimg" value="1" checked> 不替换原图 <input type="radio" name="cimg" value="2"> 删除原图并替换上传</div>' : ''}
              </td>
            </tr>
            <tr>
              <td align="right" class="Forumrow"><b>新闻属性：</b></td>
              <td width="582" class="Forumrow"><input name="tjhome" type="checkbox" id="tjhome" value="1"${data.is_featured_home ? ' checked' : ''}> 首页推荐</td>
              <td width="161" class="Forumrow" id="advpic" style="display:none"></td>
            </tr>
            <tr>
              <td align="right" class="Forumrow"><b>关键词：</b></td>
              <td colspan="2" valign="middle" class="Forumrow"><input name="key" type="text" id="key" value="${escapeHtml(data.keywords || '')}" size="100"></td>
            </tr>
            <tr>
              <td align="right" class="Forumrow"><b>新闻摘要</b></td>
              <td colspan="2" valign="middle" class="Forumrow"><textarea name="desc" cols="100" rows="5" id="desc">${escapeHtml(data.summary || '')}</textarea></td>
            </tr>
            <tr>
              <td align="right" class="Forumrow"><b>详细信息：</b></td>
              <td colspan="2" class="Forumrow">
                <textarea name="content" id="myEditor" style="width:720px; height:300px">${escapeHtml(data.content_html || '')}</textarea>
                <script>if (window.UE) UE.getEditor('myEditor');</script>
              </td>
            </tr>
            <tr height="40">
              <td colspan="3" align="center" class="Forumrow" height="40">
                <input type="button" name="Submit" value="提交保存" class="smallInput" onclick="submitLegacyNewsForm()">
                &nbsp;&nbsp;&nbsp;
                <input type="reset" name="Submit2" value="重新填写" class="smallInput">
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    <br>
  </form>
</body>
</html>`;
}

function renderLegacyNewsCategoryList(result, parentId, parentCategory) {
  const rows = result.items.map((item) => `
    <tr height="20">
      <td align="left" class="forumRow">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<a href="Class.asp?id=${item.id}">${escapeHtml(item.name || '')}</a>[<span class="STYLE1">${item.child_count ?? 0}</span>] [ID=${item.id}]</td>
      <td align="left" class="forumRow">&nbsp;${item.parent_id === 0 ? '设为一级分类' : escapeHtml(parentCategory?.name || item.parent_name || '')}</td>
      <td align="left" class="forumRow">&nbsp;${item.sort_order ?? 0}</td>
      <td height="30" align="center" class="forumRow"><a href="Class_edit.asp?id=${item.id}">修改</a> | <a href="Class_Save.asp?action=del&id=${item.id}">删除</a></td>
    </tr>
  `).join('');
  const paginationLinks = renderLegacyPager({
    basePath: 'Class.asp',
    page: result.pagination.page,
    totalPages: result.pagination.totalPages,
    extraParams: parentId > 0 ? { id: parentId } : {}
  });

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>新闻分类</title>
  <link href="/spck/css/style.css" rel="stylesheet" type="text/css">
  <style>.STYLE1 { color:#FF0000; }</style>
</head>
<body>
  <table width="98%" border="0" cellspacing="0" cellpadding="0" align="center" class="tableBorder">
    <tr><th height="25" colspan="2" class="tableHeaderText">新闻分类</th></tr>
    <tr><td colspan="2" class="forumRowHighlight"><p><b>注意</b>：保持旧新闻分类父子结构。</p></td></tr>
    <tr><td width="26%" height="25" class="forumRowHighlight">&nbsp;</td><td class="forumRowHighlight"><a href="News_index.asp">管理新闻</a> | <a href="News_add.asp">添加新闻</a> | <a href="Class.asp">管理分类</a> | <a href="Class_add.asp">添加分类</a> | [<a href="javascript:location.reload()">刷新页面</a>]</td></tr>
  </table>
  <form name="search" method="post" action="index.asp">
    <table width="100%" border="0" align="center" cellpadding="2" cellspacing="1" class="tableBorder">
      <tr><th class="tableHeaderText" height="25" colspan="4">新闻分类列表${parentCategory ? ` - ${escapeHtml(parentCategory.name || '')}` : ''}</th></tr>
      <tr height="25" class="bodytitle">
        <td width="25%" align="left">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<b>分类名称</b></td>
        <td width="21%" align="center"><b>所属分类</b></td>
        <td width="6%" align="center"><b>排序</b></td>
        <td width="48%" align="center"><b>操作</b></td>
      </tr>
      ${rows || '<tr><td colspan="4" class="forumRow" align="center">暂无分类</td></tr>'}
      <tr height="20" bgcolor="#ffffff">
        <td height="30" colspan="4" align="center" class="forumRow">${paginationLinks} 第 ${result.pagination.page} / ${result.pagination.totalPages} 页，共 ${result.pagination.total} 条</td>
      </tr>
      <tr height="20" bgcolor="#ffffff">
        <td class="forumrowHighLight" align="center" colspan="4">${parentCategory ? '<a href="Class.asp">&lt;&lt; 返回上级</a>' : '&nbsp;'}</td>
      </tr>
    </table>
  </form>
</body>
</html>`;
}

function renderLegacyNewsCategoryForm({ mode, rootCategories, category, defaults = {} }) {
  const data = category || defaults;
  const title = mode === 'edit' ? '修改新闻分类' : '添加新闻分类';
  const action = mode === 'edit' ? 'Class_Save.asp?action=Save' : 'Class_Save.asp?action=add';
  const options = rootCategories.map((item) => {
    const selected = Number(item.id) === Number(data.parent_id) ? ' selected' : '';
    return `<option value="${item.id}"${selected}>${escapeHtml(item.name || '')}</option>`;
  }).join('');

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <link href="/spck/css/style.css" rel="stylesheet" type="text/css">
  <script>
    function validateLegacyNewsCategoryForm() {
      if (document.FORM1.CatName.value.length < 1) {
        alert('请输入分类名称!');
        document.FORM1.CatName.focus();
        return false;
      }
      if (document.FORM1.ORderID.value === '') {
        alert('排序不能为空!');
        document.FORM1.ORderID.focus();
        return false;
      }
      return true;
    }
  </script>
</head>
<body>
  <table width="98%" border="0" cellspacing="0" cellpadding="0" align="center" class="tableBorder">
    <tr><th height="25" colspan="2" class="tableHeaderText">新闻分类</th></tr>
    <tr><td colspan="2" class="forumRowHighlight"><p><b>注意</b>：继续兼容旧分类页字段结构。</p></td></tr>
    <tr><td width="26%" height="25" class="forumRowHighlight">&nbsp;</td><td class="forumRowHighlight"><a href="News_index.asp">管理新闻</a> | <a href="News_add.asp">添加新闻</a> | <a href="Class.asp">管理分类</a> | <a href="Class_add.asp">添加分类</a> | [<a href="javascript:location.reload()">刷新页面</a>]</td></tr>
  </table>
  <form name="FORM1" id="FORM1" onsubmit="return validateLegacyNewsCategoryForm()" action="${action}" method="post">
    ${mode === 'edit' ? `<input type="hidden" name="hidid" value="${category.id}">` : ''}
    <table width="100%" border="0" align="center" cellpadding="3" cellspacing="1" class="tableBorder">
      <tr><th colspan="2" height="28" class="tableHeaderText">${title}</th></tr>
      <tr>
        <td height="25" class="forumRowHighlight" align="right"><b>所属父类：</b></td>
        <td height="25" class="forumRowHighlight">
          <select name="Root" id="Root">
            <option value="0"${Number(data.parent_id) === 0 ? ' selected' : ''}>设为一级分类</option>
            ${options}
          </select>
        </td>
      </tr>
      <tr>
        <td width="41%" height="25" class="forumRowHighlight" align="right"><b>分类名称：</b></td>
        <td width="59%" height="25" class="forumRowHighlight"><input name="CatName" id="CatName" value="${escapeHtml(data.name || '')}" size="25" maxlength="40"> <font color="#FF0000">*</font></td>
      </tr>
      <tr>
        <td height="27" class="forumRowHighlight" align="right"><b>排序</b></td>
        <td height="27" class="forumRowHighlight"><input name="ORderID" id="ORderID" value="${escapeHtml(String(data.sort_order ?? 1))}" size="10" maxlength="16"> <font color="#FF0000">*</font></td>
      </tr>
      <tr>
        <td colspan="2" height="27" align="center" class="forumRowHighlight"><input type="submit" value="确认提交" name="Submit2"></td>
      </tr>
    </table>
  </form>
  <br>
</body>
</html>`;
}

function renderLegacyProductCategoryList(result, parentId, parentCategory) {
  const rows = result.items.map((item) => `
    <tr height="20">
      <td align="left" class="forumRow">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<a href="prodcat.asp?id=${item.id}">${escapeHtml(item.name || '')}</a>[<span class="STYLE1">${item.child_count ?? 0}</span>]</td>
      <td align="left" class="forumRow">&nbsp;${item.parent_id === 0 ? '一级分类' : escapeHtml(parentCategory?.name || item.parent_name || '')}</td>
      <td align="left" class="forumRow">&nbsp;${item.sort_order ?? 0}</td>
      <td height="30" align="center" class="forumRow"><a href="prodcat_edit.asp?id=${item.id}">修改</a> | <a href="prodcat_save.asp?action=del&id=${item.id}">删除</a></td>
    </tr>
  `).join('');
  const paginationLinks = renderLegacyPager({
    basePath: 'prodcat.asp',
    page: result.pagination.page,
    totalPages: result.pagination.totalPages,
    extraParams: parentId > 0 ? { id: parentId } : {}
  });

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>产品分类</title>
  <link href="/spck/css/style.css" rel="stylesheet" type="text/css">
  <style>.STYLE1 { color:#FF0000; }</style>
</head>
<body>
  <table width="98%" border="0" cellspacing="0" cellpadding="0" align="center" class="tableBorder">
    <tr><th height="25" colspan="2" class="tableHeaderText">产品分类</th></tr>
    <tr><td colspan="2" class="forumRowHighlight"><p><b>注意</b>：保持旧分类父子结构，删除后子分类会回到根级。</p></td></tr>
    <tr><td width="19%" height="25" class="forumRowHighlight">&nbsp;</td><td width="81%" class="forumRowHighlight"><a href="prod.asp">管理产品</a> | <a href="prod_add.asp">添加产品</a> | <a href="prodcat.asp">管理分类</a> | <a href="prodcat_add.asp">添加分类</a> | <a href="prodphoto.asp">图片管理</a> | <a href="prodphoto_add.asp">添加图片</a> | [<a href="javascript:location.reload()">刷新页面</a>]</td></tr>
  </table>
  <form name="search" method="post" action="index.asp">
    <table width="100%" border="0" align="center" cellpadding="2" cellspacing="1" class="tableBorder">
      <tr><th class="tableHeaderText" height="25" colspan="4">产品分类列表${parentCategory ? ` - ${escapeHtml(parentCategory.name || '')}` : ''}</th></tr>
      <tr height="25" class="bodytitle">
        <td width="25%" align="left">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<b>分类名称</b></td>
        <td width="21%" align="center"><b>所属分类</b></td>
        <td width="6%" align="center"><b>排序</b></td>
        <td width="48%" align="center"><b>操作</b></td>
      </tr>
      ${rows || '<tr><td colspan="4" class="forumRow" align="center">暂无分类</td></tr>'}
      <tr height="20" bgcolor="#ffffff">
        <td height="30" colspan="4" align="center" class="forumRow">${paginationLinks} 第 ${result.pagination.page} / ${result.pagination.totalPages} 页，共 ${result.pagination.total} 条</td>
      </tr>
      <tr height="20" bgcolor="#ffffff">
        <td class="forumrowHighLight" align="center" colspan="4">${parentCategory ? '<a href="prodcat.asp">&lt;&lt; 返回上级</a>' : '&nbsp;'}</td>
      </tr>
    </table>
  </form>
</body>
</html>`;
}

function renderLegacyProductCategoryForm({ mode, rootCategories, category, defaults = {} }) {
  const data = category || defaults;
  const title = mode === 'edit' ? '修改产品分类' : '添加产品分类';
  const action = mode === 'edit' ? 'prodcat_save.asp?action=Save' : 'prodcat_save.asp?action=add';
  const options = rootCategories.map((item) => {
    const selected = Number(item.id) === Number(data.parent_id) ? ' selected' : '';
    return `<option value="${item.id}"${selected}>${escapeHtml(item.name || '')}</option>`;
  }).join('');

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <link href="/spck/css/style.css" rel="stylesheet" type="text/css">
  <script>
    function validateLegacyProductCategoryForm() {
      if (document.FORM1.CatName.value.length < 1) {
        alert('请输入分类名称!');
        document.FORM1.CatName.focus();
        return false;
      }
      if (document.FORM1.ORderID.value === '') {
        alert('排序不能为空!');
        document.FORM1.ORderID.focus();
        return false;
      }
      return true;
    }
  </script>
</head>
<body>
  <table width="98%" border="0" cellspacing="0" cellpadding="0" align="center" class="tableBorder">
    <tr><th height="25" colspan="2" class="tableHeaderText">产品分类</th></tr>
    <tr><td colspan="2" class="forumRowHighlight"><p><b>注意</b>：保持旧分类字段结构，关键词和描述映射到 SQLite 分类 SEO 字段。</p></td></tr>
    <tr><td width="19%" height="25" class="forumRowHighlight">&nbsp;</td><td width="81%" class="forumRowHighlight"><a href="prod.asp">管理产品</a> | <a href="prod_add.asp">添加产品</a> | <a href="prodcat.asp">管理分类</a> | <a href="prodcat_add.asp">添加分类</a> | <a href="prodphoto.asp">图片管理</a> | <a href="prodphoto_add.asp">添加图片</a> | [<a href="javascript:location.reload()">刷新页面</a>]</td></tr>
  </table>
  <form name="FORM1" id="FORM1" onsubmit="return validateLegacyProductCategoryForm()" action="${action}" method="post">
    ${mode === 'edit' ? `<input type="hidden" name="hidid" value="${category.id}">` : ''}
    <table width="100%" border="0" align="center" cellpadding="3" cellspacing="1" class="tableBorder">
      <tr><th colspan="2" height="28" class="tableHeaderText">${title}</th></tr>
      <tr>
        <td height="25" class="forumRowHighlight" align="right"><b>所属父类：</b></td>
        <td height="25" class="forumRowHighlight">
          <select name="Root" id="Root">
            <option value="0"${Number(data.parent_id) === 0 ? ' selected' : ''}>设为一级分类</option>
            ${options}
          </select>
        </td>
      </tr>
      <tr>
        <td width="31%" height="25" class="forumRowHighlight" align="right"><b>分类名称：</b></td>
        <td width="69%" height="25" class="forumRowHighlight"><input name="CatName" id="CatName" value="${escapeHtml(data.name || '')}" size="25" maxlength="40"> <font color="#FF0000">*</font></td>
      </tr>
      <tr>
        <td height="27" class="forumRowHighlight" align="right"><b>排序</b></td>
        <td height="27" class="forumRowHighlight"><input name="ORderID" id="ORderID" value="${escapeHtml(String(data.sort_order ?? 1))}" size="10" maxlength="16"> <font color="#FF0000">*</font></td>
      </tr>
      <tr>
        <td height="27" class="forumRowHighlight" align="right"><b>分类关键词：</b></td>
        <td height="27" class="forumRowHighlight"><input name="key" type="text" id="key" value="${escapeHtml(data.seo_keywords || '')}" size="80"></td>
      </tr>
      <tr>
        <td height="27" class="forumRowHighlight" align="right"><b>分类描述</b></td>
        <td height="27" class="forumRowHighlight"><textarea name="desc" cols="80" rows="5" id="desc">${escapeHtml(data.seo_description || '')}</textarea></td>
      </tr>
      <tr>
        <td colspan="2" height="27" align="center" class="forumRowHighlight"><input type="submit" value="确认提交" name="Submit2"></td>
      </tr>
    </table>
  </form>
  <br>
</body>
</html>`;
}

function renderLegacyProductForm({ mode, categories, product, defaults = {} }) {
  const data = product || defaults;
  const submitAction = mode === 'edit' ? 'prod_save.asp?action=save' : 'prod_save.asp?action=add';
  const title = mode === 'edit' ? '修改产品' : '添加产品';
  const hasCategories = categories.length > 0;
  const categoryOptions = categories.length > 0
    ? categories.map((category) => {
      const selected = Number(category.id) === Number(data.category_id) ? ' selected' : '';
      const prefix = category.depth === 0 ? '===' : '&nbsp;&nbsp;'.repeat(category.depth);
      const suffix = category.depth === 0 ? '===' : '';
      return `<option value="${category.id}"${selected}>${prefix}${escapeHtml(category.name)}${suffix}</option>`;
    }).join('')
    : '<option value="">暂无分类</option>';

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <link rel="stylesheet" type="text/css" href="/spck/css/style.css">
  <script src="/js/file_js.js"></script>
  <script type="text/javascript" src="/spck/ueditor/ueditor.config.js"></script>
  <script type="text/javascript" src="/spck/ueditor/ueditor.all.min.js"></script>
  <script type="text/javascript" src="/spck/ueditor/lang/zh-cn/zh-cn.js"></script>
  <style>.STYLE1 { color: #FF0000; }</style>
  <script>
    function submitLegacyProductForm() {
      if (${hasCategories ? 'true' : 'false'} && !document.form.typeid.value) {
        alert('请选择产品分类');
        document.form.typeid.focus();
        return;
      }
      if (!document.form.prodName.value) {
        alert('请输入产品名称');
        document.form.prodName.focus();
        return;
      }
      document.form.submit();
    }
  </script>
</head>
<body>
  <table width="98%" border="0" cellspacing="0" cellpadding="0" align="center" class="tableBorder">
    <tr><th height="25" colspan="2" class="tableHeaderText">产品管理</th></tr>
    <tr><td colspan="2" class="forumRowHighlight"><p><b>注意</b>：继续沿用旧后台表单结构，提交目标已切到 Node。</p></td></tr>
    <tr><td width="19%" height="25" class="forumRowHighlight">&nbsp;</td><td width="81%" class="forumRowHighlight"><a href="prod.asp">管理产品</a> | <a href="prod_add.asp">添加产品</a> | <a href="prodcat.asp">管理分类</a> | <a href="prodcat_add.asp">添加分类</a> | <a href="prodphoto.asp">图片管理</a> | <a href="prodphoto_add.asp">添加图片</a> | [<a href="javascript:location.reload()">刷新页面</a>]</td></tr>
  </table>
  <form name="form" method="post" action="${submitAction}">
    <input type="hidden" name="picture" value="">
    ${mode === 'edit' ? `<input type="hidden" name="hidid" value="${product.id}">` : ''}
    <table width="100%" border="0" align="center" cellpadding="0" cellspacing="1" class="tableBorder">
      <tr><th height="25" colspan="2" class="tableHeaderText">${title}</th></tr>
      <tr align="center">
        <td>
          <table width="100%" border="0" cellpadding="5" cellspacing="2" style="border-collapse: collapse">
            <tr>
              <td width="107" align="right" nowrap class="Forumrow"><b>产品分类：</b></td>
              <td colspan="4" class="Forumrow">
                <select name="typeid" size="1" class="lh17">
                  <option value="">请选择产品分类</option>
                  ${categoryOptions}
                </select>
                <a href="prodcat_add.asp"><font color="#FF0000">新增</font></a>
              </td>
            </tr>
            <tr>
              <td align="right" valign="middle" class="Forumrow"><b>产品名称：</b></td>
              <td colspan="4" class="Forumrow"><input name="prodName" type="text" class="smallInput" id="prodName" value="${escapeHtml(data.name || '')}" size="55" maxlength="100"> <font color="#FF0000">*</font></td>
            </tr>
            <tr>
              <td class="Forumrow" align="right"><b>产品型号：</b></td>
              <td colspan="4" class="Forumrow"><input name="prodCode" type="text" id="prodCode" value="${escapeHtml(data.code || '')}"></td>
            </tr>
            <tr>
              <td class="Forumrow" align="right"><b>产品小图：</b></td>
              <td colspan="4" class="Forumrow">
                <input name="magicfacepic1" type="text" id="magicfacepic(1)" value="${escapeHtml(data.small_image || '')}" size="40" readonly onclick="if (typeof lookmagic === 'function') lookmagic(1)">
                <iframe id="d_file" frameborder="0" src="../../../inc/upload2.asp?tMode=3&amp;istwo=0&amp;utype=prod&amp;hgc=1" width="450" height="22" scrolling="no"></iframe>
                <div id="magicframe(1)" style="visibility:hidden; position:absolute; width:10px; left:2px; top:479px;">
                  <span class="STYLE1"><iframe src="photoShow.asp?action=1" width="580" height="260" frameborder="0" scrolling="no"></iframe></span>
                </div>
              </td>
            </tr>
            <tr>
              <td class="Forumrow" align="right"><b>产品大图：</b></td>
              <td colspan="4" class="Forumrow">
                <input name="magicfacepic2" type="text" id="magicfacepic(2)" value="${escapeHtml(data.large_image || '')}" size="40" readonly onclick="if (typeof lookmagic === 'function') lookmagic(2)">
                <iframe id="d_file2" frameborder="0" src="../../../inc/upload3.asp?tMode=3&amp;istwo=0&amp;utype=prod&amp;hgc=1" width="450" height="22" scrolling="no"></iframe>
                <div id="magicframe(2)" style="visibility:hidden; position:absolute; width:10px; left:2px; top:770px;">
                  <span class="STYLE1"><iframe src="photoShow.asp?action=2" width="580" height="260" frameborder="0" scrolling="no"></iframe></span>
                </div>
              </td>
            </tr>
            <tr>
              <td align="right" class="Forumrow"><b>产品属性：</b></td>
              <td width="95" class="Forumrow"><input name="tjhome" type="checkbox" id="tjhome" value="1"${data.is_featured_home ? ' checked' : ''}> 首页推荐</td>
              <td width="86" class="Forumrow"><input name="show" type="checkbox" id="show" value="0"${data.is_visible ? '' : ' checked'}> 隐藏</td>
              <td width="71" class="Forumrow"><b>排序</b></td>
              <td width="515" class="Forumrow"><input name="orderid" type="text" id="orderid" value="${escapeHtml(String(data.sort_order ?? 0))}" size="5"></td>
            </tr>
            <tr>
              <td align="right" class="Forumrow"><b>关键词：</b></td>
              <td colspan="4" valign="middle" class="Forumrow"><input name="key" type="text" id="key" value="${escapeHtml(data.keywords || '')}" size="100"></td>
            </tr>
            <tr>
              <td align="right" class="Forumrow"><b>产品摘要：</b></td>
              <td colspan="4" valign="middle" class="Forumrow"><textarea name="desc" cols="100" rows="5" id="desc">${escapeHtml(data.summary || '')}</textarea></td>
            </tr>
            <tr>
              <td align="right" class="Forumrow"><b>详细信息：</b></td>
              <td colspan="4" class="Forumrow">
                <textarea name="content" id="myEditor" style="width:720px; height:300px">${escapeHtml(data.content_html || '')}</textarea>
                <script>if (window.UE) UE.getEditor('myEditor');</script>
              </td>
            </tr>
            <tr height="40">
              <td colspan="5" align="center" class="Forumrow" height="40">
                <input type="button" name="Submit" value="提交保存" class="smallInput" onclick="submitLegacyProductForm()">
                &nbsp;&nbsp;&nbsp;
                <input type="reset" name="Submit2" value="重新填写" class="smallInput">
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    <br>
  </form>
</body>
</html>`;
}

function renderLegacyProductPhotoAdd() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>图片上传</title>
  <link href="/spck/css/style.css" rel="stylesheet" type="text/css">
  <script>
    function validateLegacyProductPhotoForm() {
      if (document.form.photoName.value.length < 1) {
        alert('图片名称不能为空!');
        document.form.photoName.focus();
        return false;
      }
      if (document.form.picture.value === '') {
        alert('图片路径不能为空!');
        document.form.picture.focus();
        return false;
      }
      return true;
    }
  </script>
</head>
<body>
  <table width="98%" border="0" cellspacing="0" cellpadding="0" align="center" class="tableBorder">
    <tr><th height="25" colspan="2" class="tableHeaderText">图片上传</th></tr>
    <tr><td colspan="2" class="forumRowHighlight"><p><b>注意</b>：上传后图片会进入旧产品图片库，删除时会影响已引用它的产品信息。</p></td></tr>
    <tr><td width="19%" height="25" class="forumRowHighlight">&nbsp;</td><td width="81%" class="forumRowHighlight"><a href="prod.asp">管理产品</a> | <a href="prod_add.asp">添加产品</a> | <a href="prodcat.asp">管理分类</a> | <a href="prodcat_add.asp">添加分类</a> | <a href="prodphoto.asp">图片管理</a> | <a href="prodphoto_add.asp">添加图片</a> | [<a href="javascript:location.reload()">刷新页面</a>]</td></tr>
  </table>

  <form name="form" id="form" method="post" action="prodphoto_save.asp?action=add" onsubmit="return validateLegacyProductPhotoForm()">
    <table width="100%" border="0" align="center" cellpadding="3" cellspacing="1" class="tableBorder">
      <tr><th colspan="2" height="28" class="tableHeaderText">添加产品图片</th></tr>
      <tr>
        <td height="25" class="forumRowHighlight" align="right"><b>上传图片名称：</b></td>
        <td height="25" class="forumRowHighlight"><input name="photoName" id="photoName" size="41" maxlength="100"> <font color="#FF0000">*</font></td>
      </tr>
      <tr>
        <td width="31%" height="25" class="forumRowHighlight" align="right"><b>上传图片：</b></td>
        <td width="69%" height="25" class="forumRowHighlight"><iframe id="d_file" frameborder="0" src="../../../inc/upload.asp?tMode=3&amp;istwo=0&amp;utype=prod" width="250" height="22" scrolling="no"></iframe></td>
      </tr>
      <tr>
        <td height="27" class="forumRowHighlight" align="right"><b>上传后图片路径：</b></td>
        <td height="27" class="forumRowHighlight"><input name="picture" id="picture" size="42"></td>
      </tr>
      <tr>
        <td colspan="2" height="27" align="center" class="forumRowHighlight"><input type="submit" value="确认提交" name="Submit2"></td>
      </tr>
    </table>
  </form>
</body>
</html>`;
}

function renderLegacyPhotoShow(result, action) {
  const page = result.pagination.page;
  const totalPages = result.pagination.totalPages;
  const rows = [];
  for (let index = 0; index < result.items.length; index += 4) {
    const slice = result.items.slice(index, index + 4);
    const cells = slice.map((item) => `
      <td align="center" bgcolor="#EEEEEE" valign="top">
        <img src="${escapeHtml(item.image_path || '')}" width="80" height="80" alt="${escapeHtml(item.name || '')}" vspace="2" style="border:1px #000000 solid;cursor:pointer" onclick="selectImage('${escapeHtml(item.image_path || '')}', ${Number.parseInt(String(action), 10) || 1})"><br>${escapeHtml((item.name || '').slice(0, 10))}
      </td>
    `).join('');
    const emptyCells = Math.max(4 - slice.length, 0);
    rows.push(`<tr>${cells}${'<td bgcolor="#EEEEEE"></td>'.repeat(emptyCells)}</tr>`);
  }
  const paginationLinks = renderLegacyPager({
    basePath: 'photoShow.asp',
    page,
    totalPages,
    extraParams: { action }
  });

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>图片选择</title>
  <style>
    body,td,th{font-size:12px;color:#333}
    body{margin:0}
  </style>
  <script>
    function selectImage(imagePath, index) {
      const legacyBracketField = parent.document.form['magicfacepic(' + index + ')'];
      if (legacyBracketField) legacyBracketField.value = imagePath;
      const legacyFlatField = parent.document.form['magicfacepic' + index];
      if (legacyFlatField) legacyFlatField.value = imagePath;
      if (parent.lookmagic) parent.lookmagic(index);
    }
  </script>
</head>
<body>
  <table width="100%" border="1" bordercolor="#E6E6E6" align="center" cellpadding="3" cellspacing="0" bgcolor="#FFFFFF">
    ${rows.join('') || '<tr><td colspan="4" align="center">暂无图片</td></tr>'}
    <tr><td height="18" colspan="4" align="right" bgcolor="#EEEEEE"><a href="javascript:window.location.reload();"><strong>刷新</strong></a>&nbsp;&nbsp;${paginationLinks} 第 ${page} / ${totalPages} 页</td></tr>
  </table>
</body>
</html>`;
}

function renderLegacySimpleSuccess(title, backUrl, addUrl) {
  const continueLink = addUrl
    ? `<br><br><a href="${escapeHtml(addUrl)}">继续添加</a>`
    : '<br><br>';
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" type="text/css" href="../../css/style.css">
</head>
<body>
  <table cellpadding="2" cellspacing="1" border="0" width="400" class="tableBorder" align="center">
    <tr><th class="tableHeaderText" colspan="2" height="25">${escapeHtml(title)}</th></tr>
    <tr><td height="85" valign="top" class="forumRow"><div align="center"><br><br>${escapeHtml(title)}。${continueLink}</div></td></tr>
    <tr align="center"><td height="30" class="forumRowHighlight"><a href="${escapeHtml(backUrl)}">&lt;&lt; 返回</a></td></tr>
  </table>
</body>
</html>`;
}

function renderLegacySimpleMessage(message, backUrl) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(message)}</title>
  <link rel="stylesheet" type="text/css" href="../../css/style.css">
</head>
<body>
  <table cellpadding="2" cellspacing="1" border="0" width="400" class="tableBorder" align="center">
    <tr><th class="tableHeaderText" colspan="2" height="25">${escapeHtml(message)}</th></tr>
    <tr><td height="85" valign="top" class="forumRow"><div align="center"><br><br>${escapeHtml(message)}。<br><br></div></td></tr>
    <tr align="center"><td height="30" class="forumRowHighlight"><a href="${escapeHtml(backUrl)}">&lt;&lt; 返回</a></td></tr>
  </table>
</body>
</html>`;
}

function renderLegacyMakeHtmlHome() {
  const rows = [
    {
      title: '产品详情页',
      description: '批量生成 /product/*.html 产品详情页。',
      href: '/manage/makehtml/prod/makedetail.asp'
    },
    {
      title: '产品分类页',
      description: '批量生成 /products/*.html 分类列表页。',
      href: '/manage/makehtml/prod/makelist.asp'
    },
    {
      title: '新闻详情页',
      description: '批量生成 /news/detail/*.html 新闻详情页。',
      href: '/manage/makehtml/news/makedetail.asp'
    },
    {
      title: '单页生成',
      description: '生成首页、联系页、留言页，可直接点击具体页面或一次性全部生成。',
      links: [
        ['全部单页', '/manage/makehtml/index/index.asp?act=all'],
        ['首页', '/manage/makehtml/index/index.asp?act=index'],
        ['联系页', '/manage/makehtml/index/index.asp?act=contact'],
        ['留言页', '/manage/makehtml/index/index.asp?act=msg'],
        ['搜索页', '/manage/makehtml/index/index.asp?act=search'],
        ['打开菜单', '/manage/makehtml/index/index.asp']
      ]
    }
  ];

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>生成 HTML</title>
  <link href="/spck/css/style.css" rel="stylesheet" type="text/css">
</head>
<body>
  <table border="0" cellspacing="1" cellpadding="3" align="center" class="tableBorder" width="96%">
    <tr><th class="tableHeaderText" height="25" colspan="3">生成 HTML 页面</th></tr>
    <tr>
      <td colspan="3" class="forumRowHighlight">
        当前已迁移为 Node.js 版本，点击后会直接把静态页写入站点目录。
      </td>
    </tr>
    ${rows.map((item) => `
      <tr>
        <td width="20%" class="forumRowHighlight"><strong>${escapeHtml(item.title)}</strong></td>
        <td width="48%" class="forumRowHighlight">${escapeHtml(item.description)}</td>
        <td width="32%" class="forumRowHighlight">${
          Array.isArray(item.links) && item.links.length > 0
            ? item.links.map(([label, href]) => `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`).join(' | ')
            : `<a href="${escapeHtml(item.href)}">开始生成</a>`
        }</td>
      </tr>
    `).join('')}
  </table>
</body>
</html>`;
}

function renderLegacyMakeHtmlSinglePageMenu() {
  const items = [
    ['全部单页', '/manage/makehtml/index/index.asp?act=all'],
    ['首页', '/manage/makehtml/index/index.asp?act=index'],
    ['联系页面', '/manage/makehtml/index/index.asp?act=contact'],
    ['留言页面', '/manage/makehtml/index/index.asp?act=msg'],
    ['搜索页', '/manage/makehtml/index/index.asp?act=search']
  ];

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>生成单页</title>
  <link href="/spck/css/style.css" rel="stylesheet" type="text/css">
</head>
<body>
  <table border="0" cellspacing="1" cellpadding="3" align="center" class="tableBorder" width="90%">
    <tr><th class="tableHeaderText" height="25" colspan="${items.length}">生成单页 HTML</th></tr>
    <tr>
      <td class="forumRowHighlight" colspan="${items.length}">
        可直接生成单个页面，也可以先点击“全部单页”一次性刷新首页、联系页和留言页。
      </td>
    </tr>
    <tr>
      ${items.map(([label, href]) => `<td class="forumRowHighlight" align="center"><a href="${escapeHtml(href)}">${escapeHtml(label)}</a></td>`).join('')}
    </tr>
  </table>
</body>
</html>`;
}

function renderLegacyMakeHtmlTradeMenu() {
  const items = [
    ['关于公司', '/manage/makehtml/co/maketrade.asp', '已接到公司栏目静态页生成'],
    ['新闻', '/manage/makehtml/news/maketrade.asp', '已接到新闻分类页生成'],
    ['服务', '/manage/makehtml/service/maketrade.asp', '已接到服务分类页生成'],
    ['产品', '/manage/makehtml/prod/maketrade.asp', '已接到产品分类页生成'],
    ['招聘', '/manage/makehtml/job/maketrade.asp', '已接到招聘列表页生成']
  ];

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>生成一级分类</title>
  <link href="/spck/css/style.css" rel="stylesheet" type="text/css">
</head>
<body>
  <table border="0" cellspacing="1" cellpadding="3" align="center" class="tableBorder">
    <tr><th height="25" colspan="3" class="tableHeaderText">生成一级分类</th></tr>
    ${items.map(([label, href, description]) => `
      <tr>
        <td width="16%" height="40" class="forumRowHighlight"><strong>${escapeHtml(label)}</strong></td>
        <td class="forumRowHighlight">${escapeHtml(description)}</td>
        <td class="forumRowHighlight"><a href="${escapeHtml(href)}">开始生成 &gt;&gt;</a></td>
      </tr>
    `).join('')}
    <tr><td colspan="3" align="center" bgcolor="#E4EDF9"><br><a href="/manage/makehtml/index.asp">返回</a><br></td></tr>
  </table>
</body>
</html>`;
}

function renderLegacyMakeHtmlResult({ title, result, outputRoot, viewPath, backUrl }) {
  const viewRow = viewPath
    ? `<tr><td class="forumRow" width="24%">查看路径</td><td class="forumRow"><a href="${escapeHtml(viewPath)}" target="_blank">${escapeHtml(viewPath)}</a></td></tr>`
    : '<tr><td class="forumRow" width="24%">查看方式</td><td class="forumRow">批量文件已写入对应目录，请直接访问具体页面。</td></tr>';
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <link href="/spck/css/style.css" rel="stylesheet" type="text/css">
</head>
<body>
  <table cellpadding="2" cellspacing="1" border="0" width="720" class="tableBorder" align="center">
    <tr><th class="tableHeaderText" colspan="2" height="25">${escapeHtml(title)}</th></tr>
    <tr><td class="forumRow" width="24%">生成类型</td><td class="forumRow">${escapeHtml(result.label)}</td></tr>
    <tr><td class="forumRow" width="24%">处理记录数</td><td class="forumRow">${escapeHtml(String(result.recordsProcessed))}</td></tr>
    <tr><td class="forumRow" width="24%">写入文件数</td><td class="forumRow">${escapeHtml(String(result.filesWritten))}</td></tr>
    <tr><td class="forumRow" width="24%">输出目录</td><td class="forumRow">${escapeHtml(outputRoot)}</td></tr>
    ${viewRow}
    <tr><td height="45" colspan="2" align="center" class="forumRowHighlight"><a href="${escapeHtml(backUrl)}">&lt;&lt; 返回</a></td></tr>
  </table>
</body>
</html>`;
}

function normalizeLegacyBuildRange(searchParams) {
  const start = parseOptionalInteger(searchParams.get('id1'));
  const end = parseOptionalInteger(searchParams.get('id2'));
  if (start == null && end == null) {
    return null;
  }
  return { start, end };
}

function normalizeLegacyMultiIds(value) {
  if (Array.isArray(value)) {
    return value.map((item) => Number.parseInt(String(item), 10)).filter((item) => !Number.isNaN(item));
  }
  if (typeof value !== 'string' || value.trim() === '') {
    return [];
  }
  return value.split(',').flatMap((item) => {
    const parsed = Number.parseInt(item.trim(), 10);
    return Number.isNaN(parsed) ? [] : [parsed];
  });
}

function normalizeLegacyProductForm(form) {
  const smallImage = String(form.magicfacepic1 || '').trim();
  const largeImage = String(form.magicfacepic2 || '').trim();

  return {
    category_id: form.typeid,
    name: form.prodName,
    code: form.prodCode,
    summary: form.desc,
    content_html: form.content,
    small_image: smallImage || '/skin/dfpic.gif',
    large_image: largeImage || smallImage || '/skin/dfpic.gif',
    keywords: form.key,
    is_featured_home: form.tjhome ? 1 : 0,
    is_visible: form.show ? 0 : 1,
    sort_order: form.orderid
  };
}

function normalizeLegacyProductCategoryForm(form) {
  return {
    parent_id: form.Root,
    name: form.CatName,
    sort_order: form.ORderID || form.orderid,
    seo_keywords: form.key,
    seo_description: form.desc
  };
}

function normalizeLegacyNewsForm(form, options = {}) {
  const existing = options.existing || null;
  const uploadedPicture = String(form.picture || '').trim();
  let picture = existing?.picture || '/UploadFile/nopicture.gif';

  if (uploadedPicture) {
    picture = uploadedPicture.startsWith('/UploadFile/')
      ? uploadedPicture
      : `/UploadFile/Newsuppic/${uploadedPicture}`;
  }

  return {
    category_id: form.typeid,
    title: `${String(form.IncludePic || '').trim()}${String(form.title || '').trim()}`,
    summary: form.desc,
    content_html: form.content,
    picture,
    keywords: form.key,
    is_featured_home: form.tjhome ? 1 : 0
  };
}

function normalizeLegacyNewsCategoryForm(form) {
  return {
    parent_id: form.Root,
    name: form.CatName,
    sort_order: form.ORderID || form.orderid
  };
}

function normalizeLegacyOfficeForm(form) {
  return {
    office_name: form.offname,
    address: form.address,
    phone: form.phone,
    fax: form.fax,
    contact_person: form.linkren,
    email: form.email,
    postal_code: form.post
  };
}

function normalizeLegacyJobForm(form) {
  return {
    name: form.jobName,
    address: form.address,
    openings: form.jobnob,
    contact_person: form.linkren,
    phone: form.phone,
    is_active: form.state ? 1 : 0,
    requirements_html: form.content
  };
}

function normalizeLegacySiteConfigForm(form) {
  return {
    web_name: form.WebName,
    web_url: form.WebUrl,
    company_name: form.CoName,
    company_address: form.CoAdd,
    postal_code: form.CoPost,
    company_phone: form.CoPhone,
    company_fax: form.CoFax,
    contact_person: form.CoRen,
    company_email: form.CoEmail,
    icp_number: form.WebIcp,
    web_qq: form.WebQQ,
    web_mobile: form.Webmsn,
    web_copyright: form.WebCopyright,
    web_author: form.Webauthor
  };
}

function normalizeLegacyMetaTypeForm(form) {
  return {
    type_name: form.typename,
    meta_keywords: form.meta_keywords,
    meta_descriptions: form.meta_descriptions,
    title: form.title
  };
}

function normalizeLegacyCorporationCategoryForm(form) {
  return {
    parent_id: form.Root,
    name: form.coname || form.ClassName,
    sort_order: form.OrderID,
    is_external: form.sitepath ? 1 : 0,
    external_url: form.siteurl
  };
}

function normalizeLegacyAdminForm(form) {
  return {
    username: form.username,
    password: form.password,
    permission_flags: form.flag
  };
}

function renderLegacyPager({ basePath, page, totalPages, extraParams = {} }) {
  const currentPage = Math.max(Number.parseInt(String(page), 10) || 1, 1);
  const maxPage = Math.max(Number.parseInt(String(totalPages), 10) || 1, 1);
  const links = [];

  if (currentPage > 1) {
    links.push(`<a href="${buildLegacyRelativeUrl(basePath, 1, extraParams)}">|&lt;&lt;</a>`);
    links.push(`<a href="${buildLegacyRelativeUrl(basePath, currentPage - 1, extraParams)}">&lt;&lt;</a>`);
  }

  if (currentPage < maxPage) {
    links.push(`<a href="${buildLegacyRelativeUrl(basePath, currentPage + 1, extraParams)}">&gt;&gt;</a>`);
    links.push(`<a href="${buildLegacyRelativeUrl(basePath, maxPage, extraParams)}">&gt;&gt;|</a>`);
  }

  return links.join(' ');
}

function formatLegacyDate(value) {
  const input = String(value || '').trim();
  if (!input) {
    return '';
  }
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) {
    return input;
  }
  return date.toISOString().slice(0, 10);
}

function parseOptionalInteger(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return null;
  }
  const parsed = Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function buildLegacyRelativeUrl(basePath, page, extraParams = {}) {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(extraParams)) {
    if (value !== undefined && value !== null && String(value) !== '') {
      searchParams.set(key, String(value));
    }
  }
  if (page > 1) {
    searchParams.set('page', String(page));
  }
  const query = searchParams.toString();
  return query ? `${basePath}?${query}` : basePath;
}

function createLegacyAdminCookies(token, admin) {
  const baseOptions = {
    path: '/',
    sameSite: 'Lax'
  };

  return [
    serializeCookie('admin_token', token, {
      ...baseOptions,
      httpOnly: true
    }),
    serializeCookie('globalecmaster', admin.username || '', baseOptions),
    serializeCookie('masterflag', admin.permissionFlags || '', baseOptions),
    serializeCookie('adminid', String(admin.id || ''), baseOptions)
  ];
}

function clearLegacyAdminCookies() {
  const baseOptions = {
    path: '/',
    sameSite: 'Lax',
    maxAge: 0
  };

  return [
    serializeCookie('admin_token', '', {
      ...baseOptions,
      httpOnly: true
    }),
    serializeCookie('globalecmaster', '', baseOptions),
    serializeCookie('masterflag', '', baseOptions),
    serializeCookie('adminid', '', baseOptions)
  ];
}

function getLegacyTemplateEditorPage(pathnameLower) {
  const normalizedPath = pathnameLower.replace(/^\/spck\/cn\/webtemp\//, '');
  return LEGACY_TEMPLATE_EDITOR_PAGES.get(normalizedPath) || null;
}

function updateLegacyTemplateEditorField(id, page, form) {
  const payload = {
    template_name: form.tempname,
    [page.updateKey]: form[page.formField]
  };
  return updateTemplateVariant(id, payload);
}

const LEGACY_TEMPLATE_EDITOR_PAGES = new Map([
  ['worldec_index.asp', {
    fileName: 'worldec_index.asp',
    field: 'home_index',
    formField: 'home_index',
    updateKey: 'home_index',
    title: '网站首页模板设置',
    label: '网站首页模板'
  }],
  ['worldec_co.asp', {
    fileName: 'worldec_co.asp',
    field: 'co_index',
    formField: 'Co_index',
    updateKey: 'co_index',
    title: '关于公司模板设置',
    label: '关于公司首页模板'
  }],
  ['worldec_news.asp', {
    fileName: 'worldec_news.asp',
    field: 'news_index',
    formField: 'news_index',
    updateKey: 'news_index',
    title: '新闻首页模板设置',
    label: '新闻首页模板'
  }],
  ['worldec_service.asp', {
    fileName: 'worldec_service.asp',
    field: 'service_index',
    formField: 'service_index',
    updateKey: 'service_index',
    title: '服务首页模板设置',
    label: '服务首页模板'
  }],
  ['worldec_prod.asp', {
    fileName: 'worldec_prod.asp',
    field: 'produts_index',
    formField: 'produts_index',
    updateKey: 'produts_index',
    title: '产品首页模板设置',
    label: '产品首页模板'
  }],
  ['worldec_job.asp', {
    fileName: 'worldec_job.asp',
    field: 'job_index',
    formField: 'job_index',
    updateKey: 'job_index',
    title: '人才招聘模板设置',
    label: '人才招聘模板'
  }],
  ['worldec_contact.asp', {
    fileName: 'worldec_contact.asp',
    field: 'Contact',
    formField: 'Contact',
    updateKey: 'Contact',
    title: '联系我们模板设置',
    label: '联系我们页面模板'
  }],
  ['worldec_msg.asp', {
    fileName: 'worldec_msg.asp',
    field: 'msg_index',
    formField: 'msg_index',
    updateKey: 'msg_index',
    title: '留言反馈模板设置',
    label: '留言反馈页面模板'
  }],
  ['prod/worldec_index.asp', {
    fileName: 'prod/worldec_index.asp',
    field: 'produts_sort1',
    formField: 'produts_sort1',
    updateKey: 'produts_sort1',
    title: '产品一级分类模板设置',
    label: '产品一级分类模板'
  }],
  ['prod/worldec_sort2.asp', {
    fileName: 'prod/worldec_sort2.asp',
    field: 'produts_sort2',
    formField: 'produts_sort2',
    updateKey: 'produts_sort2',
    title: '产品二级分类模板设置',
    label: '产品二级分类模板'
  }],
  ['prod/worldec_detail.asp', {
    fileName: 'prod/worldec_detail.asp',
    field: 'produts_detail',
    formField: 'produts_detail',
    updateKey: 'produts_detail',
    title: '产品详情模板设置',
    label: '产品详情模板'
  }],
  ['news/worldec_index.asp', {
    fileName: 'news/worldec_index.asp',
    field: 'news_sort1',
    formField: 'news_sort1',
    updateKey: 'news_sort1',
    title: '新闻分类模板设置',
    label: '新闻分类模板'
  }],
  ['news/worldec_detail.asp', {
    fileName: 'news/worldec_detail.asp',
    field: 'news_detail',
    formField: 'news_detail',
    updateKey: 'news_detail',
    title: '新闻详情模板设置',
    label: '新闻详情模板'
  }],
  ['service/worldec_index.asp', {
    fileName: 'service/worldec_index.asp',
    field: 'service_sort1',
    formField: 'service_sort1',
    updateKey: 'service_sort1',
    title: '服务分类模板设置',
    label: '服务分类模板'
  }],
  ['service/worldec_detail.asp', {
    fileName: 'service/worldec_detail.asp',
    field: 'service_detail',
    formField: 'service_detail',
    updateKey: 'service_detail',
    title: '服务详情模板设置',
    label: '服务详情模板'
  }],
  ['job/worldec_detail.asp', {
    fileName: 'job/worldec_detail.asp',
    field: 'job_detail',
    formField: 'Job_detail',
    updateKey: 'job_detail',
    title: '招聘详情模板设置',
    label: '招聘详情模板'
  }]
]);

const LEGACY_ADMIN_PERMISSION_ITEMS = [
  { flag: '01', label: '管理员管理' },
  { flag: '02', label: '基础设置' },
  { flag: '03', label: '公司信息' },
  { flag: '04', label: '新闻管理' },
  { flag: '05', label: '用户管理' },
  { flag: '06', label: '产品管理' },
  { flag: '07', label: '留言管理' },
  { flag: '08', label: '模板管理' },
  { flag: '09', label: '招聘管理' },
  { flag: '10', label: '生成 HTML' }
];
