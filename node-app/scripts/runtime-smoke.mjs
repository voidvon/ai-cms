import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Readable, Writable } from 'node:stream';
import { queryOne } from '../src/db.mjs';
import { handleRequest } from '../src/server.mjs';
import { createAdminSession, deleteAdminSession } from '../src/services/sessions.mjs';
import { deleteUploadedFile } from '../src/services/uploads.mjs';

class MockRequest extends Readable {
  constructor({ method = 'GET', url = '/', headers = {}, body = '' }) {
    super();
    this.method = method;
    this.url = url;
    this.headers = Object.fromEntries(
      Object.entries(headers).map(([key, value]) => [String(key).toLowerCase(), value])
    );
    this.socket = { remoteAddress: '127.0.0.1' };
    this._body = Buffer.isBuffer(body) ? body : Buffer.from(String(body), 'utf8');
    this._sent = false;
  }

  _read() {
    if (this._sent) {
      this.push(null);
      return;
    }
    this._sent = true;
    if (this._body.length > 0) {
      this.push(this._body);
    }
    this.push(null);
  }
}

class MockResponse extends Writable {
  constructor() {
    super();
    this.statusCode = 200;
    this.headers = {};
    this.chunks = [];
    this.done = new Promise((resolve) => {
      this._resolveDone = resolve;
    });
  }

  setHeader(name, value) {
    this.headers[String(name).toLowerCase()] = value;
  }

  getHeader(name) {
    return this.headers[String(name).toLowerCase()];
  }

  writeHead(statusCode, headers = {}) {
    this.statusCode = statusCode;
    for (const [name, value] of Object.entries(headers)) {
      this.setHeader(name, value);
    }
    return this;
  }

  _write(chunk, encoding, callback) {
    this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
    callback();
  }

  end(chunk, encoding, callback) {
    if (typeof chunk === 'function') {
      callback = chunk;
      chunk = undefined;
      encoding = undefined;
    } else if (typeof encoding === 'function') {
      callback = encoding;
      encoding = undefined;
    }

    return super.end(chunk, encoding, () => {
      this._resolveDone();
      if (typeof callback === 'function') {
        callback();
      }
    });
  }

  get bodyText() {
    return Buffer.concat(this.chunks).toString('utf8');
  }
}

async function performRequest(options) {
  const request = new MockRequest(options);
  const response = new MockResponse();
  await handleRequest(request, response);
  await response.done;
  return response;
}

function createMultipartPayload({ boundary, fields = {}, file }) {
  const chunks = [];
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    chunks.push(Buffer.from(`Content-Disposition: form-data; name="${name}"\r\n\r\n`));
    chunks.push(Buffer.from(String(value)));
    chunks.push(Buffer.from('\r\n'));
  }

  if (file) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    chunks.push(
      Buffer.from(
        `Content-Disposition: form-data; name="${file.fieldName}"; filename="${file.filename}"\r\n` +
        `Content-Type: ${file.contentType}\r\n\r\n`
      )
    );
    chunks.push(file.data);
    chunks.push(Buffer.from('\r\n'));
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return Buffer.concat(chunks);
}

function extractUploadedPath(bodyText) {
  const match = bodyText.match(/\/UploadFile\/[A-Za-z0-9/_-]+\.(?:jpg|jpeg|png|gif)/i);
  return match ? match[0] : null;
}

async function main() {
  const admin = queryOne('SELECT id FROM admins ORDER BY id LIMIT 1');
  assert(admin?.id, '缺少管理员账号，无法执行上传兼容回归。');
  const product = queryOne(`
    SELECT id, name
    FROM products
    WHERE is_visible = 1
      AND trim(coalesce(name, '')) <> ''
    ORDER BY id
    LIMIT 1
  `);
  assert(product?.id && product?.name, '缺少可搜索产品数据，无法执行搜索页回归。');
  const searchKeyword = String(product.name).trim();

  const session = createAdminSession(admin.id);
  const adminCookie = `admin_token=${session.token}`;
  const uploadedPaths = [];

  try {
    const emptySearch = await performRequest({
      method: 'GET',
      url: '/search?ProductsName=%E6%89%BE%E6%89%BE%E7%9C%8B',
      headers: { host: 'localhost' }
    });
    assert.equal(emptySearch.statusCode, 200);
    assert.match(emptySearch.bodyText, /搜索 <span class="Font_FF0000_a">“全部产品”<\/span>/);
    assert.match(emptySearch.bodyText, /action="\/search"/);

    const keywordSearch = await performRequest({
      method: 'POST',
      url: '/search',
      headers: {
        host: 'localhost',
        'content-type': 'application/x-www-form-urlencoded'
      },
      body: `ProductsName=${encodeURIComponent(searchKeyword)}&page=1`
    });
    assert.equal(keywordSearch.statusCode, 200);
    assert.match(keywordSearch.bodyText, new RegExp(`value="${escapeRegex(searchKeyword)}"`));
    assert.match(keywordSearch.bodyText, new RegExp(`/Product/${product.id}\\.html`));

    const legacySearch = await performRequest({
      method: 'GET',
      url: '/search.asp?action=search',
      headers: { host: 'localhost' }
    });
    assert.equal(legacySearch.statusCode, 404);

    const legacyAdminLogin = await performRequest({
      method: 'GET',
      url: '/spck/login.asp',
      headers: { host: 'localhost' }
    });
    assert.equal(legacyAdminLogin.statusCode, 404);

    const editorConfig = await performRequest({
      method: 'GET',
      url: '/spck/ueditor/controller?action=config',
      headers: { host: 'localhost' }
    });
    assert.equal(editorConfig.statusCode, 200);
    assert.equal(editorConfig.getHeader('content-type'), 'application/json; charset=utf-8');
    assert.match(editorConfig.bodyText, /"imageActionName":"uploadimage"/);
    assert.doesNotMatch(editorConfig.bodyText, /controller\.asp/i);

    const adminRedirect = await performRequest({
      method: 'GET',
      url: '/admin/site/config',
      headers: { host: 'localhost' }
    });
    assert.equal(adminRedirect.statusCode, 302);
    assert.equal(adminRedirect.getHeader('location'), '/admin/login');

    const uploadUnauthorized = await performRequest({
      method: 'GET',
      url: '/admin/uploads/frame?tMode=3&utype=prod',
      headers: { host: 'localhost' }
    });
    assert.equal(uploadUnauthorized.statusCode, 302);
    assert.equal(uploadUnauthorized.getHeader('location'), '/admin/login');

    const uploadForm = await performRequest({
      method: 'GET',
      url: '/admin/uploads/frame-image?type=image&tMode=3&utype=prod',
      headers: {
        host: 'localhost',
        cookie: adminCookie
      }
    });
    assert.equal(uploadForm.statusCode, 200);
    assert.match(uploadForm.bodyText, /CheckUploadForm\(\)/);
    assert.match(uploadForm.bodyText, /name="uploadfile"/);

    const boundary = `----CodexSmoke${Date.now()}`;
    const uploadBody = createMultipartPayload({
      boundary,
      file: {
        fieldName: 'uploadfile',
        filename: 'smoke.gif',
        contentType: 'image/gif',
        data: Buffer.from('GIF89a', 'ascii')
      }
    });
    const uploadResult = await performRequest({
      method: 'POST',
      url: '/admin/uploads/frame-image?type=image&tMode=3&utype=prod',
      headers: {
        host: 'localhost',
        cookie: adminCookie,
        'content-type': `multipart/form-data; boundary=${boundary}`,
        'content-length': String(uploadBody.length)
      },
      body: uploadBody
    });
    assert.equal(uploadResult.statusCode, 200);
    assert.match(uploadResult.bodyText, /上传成功!/);
    assert.match(uploadResult.bodyText, /UploadSaved\('/);
    assert.match(uploadResult.bodyText, /addUploadFile\('/);

    const uploadedPath = extractUploadedPath(uploadResult.bodyText);
    assert(uploadedPath, '上传成功后未返回旧编辑器所需图片路径。');
    uploadedPaths.push(uploadedPath);

    console.log('runtime smoke passed');
  } finally {
    for (const relativePath of uploadedPaths) {
      deleteUploadedFile(relativePath);
    }
    deleteAdminSession(session.token);
  }
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
