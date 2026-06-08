import fs from 'node:fs';
import path from 'node:path';
import { PROJECT_ROOT, MIME_TYPES } from './config.mjs';

/**
 * 静态文件处理器，支持大小写不敏感的路径匹配
 */
export async function serveStatic(request, reply) {
  const pathname = request.url.split('?')[0];

  // 安全检查：防止路径遍历
  const normalizedPath = path.normalize(pathname);
  if (normalizedPath.includes('..')) {
    return false;
  }

  // 尝试多个路径候选（大小写变体）
  const candidates = getStaticCandidates(pathname);

  for (const candidate of candidates) {
    const filePath = path.resolve(PROJECT_ROOT, `.${candidate}`);

    // 确保文件路径在项目根目录内
    if (!filePath.startsWith(PROJECT_ROOT)) {
      continue;
    }

    try {
      const stats = await fs.promises.stat(filePath);
      if (!stats.isFile()) {
        continue;
      }

      // 获取 MIME 类型
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES.get(ext) || 'application/octet-stream';

      // 设置响应头
      reply.type(contentType);
      reply.header('Content-Length', stats.size);

      // 支持 HEAD 请求
      if (request.method === 'HEAD') {
        reply.send();
        return true;
      }

      // 发送文件内容
      const stream = fs.createReadStream(filePath);
      reply.send(stream);
      return true;
    } catch (err) {
      // 文件不存在，尝试下一个候选
      continue;
    }
  }

  return false;
}

/**
 * 生成路径候选列表（支持大小写不敏感）
 */
function getStaticCandidates(pathname) {
  const candidates = [];

  // 1. 原始路径
  candidates.push(pathname);

  // 2. 小写版本
  const lowerPath = pathname.toLowerCase();
  if (lowerPath !== pathname) {
    candidates.push(lowerPath);
  }

  // 3. 首字母大写版本（针对 /Product/, /News/ 等）
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length > 0) {
    const capitalizedSegments = segments.map(seg =>
      seg.charAt(0).toUpperCase() + seg.slice(1).toLowerCase()
    );
    const capitalizedPath = '/' + capitalizedSegments.join('/');
    if (capitalizedPath !== pathname && capitalizedPath !== lowerPath) {
      candidates.push(capitalizedPath);
    }
  }

  // 4. 如果是目录路径，尝试 index.html
  if (pathname.endsWith('/')) {
    candidates.push(pathname + 'index.html');
    candidates.push(lowerPath + 'index.html');
  }

  return candidates;
}
