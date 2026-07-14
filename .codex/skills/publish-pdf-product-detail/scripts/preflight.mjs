#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as parse5 from 'parse5';
import sharp from 'sharp';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '../../../..');
const { IMAGE_UPLOAD_SOURCE_MAX_SIZE_KB, UPLOAD_ALLOWED_EXTENSIONS } = await import(
  path.join(PROJECT_ROOT, 'system/server/src/config.mjs')
);
const { optimizeUploadedImage } = await import(
  path.join(PROJECT_ROOT, 'system/server/src/services/image-optimizer.mjs')
);

function usage() {
  console.log(`用法:
  node preflight.mjs --keyword-csv <CSV> --html <HTML> [--html <HTML> ...]
                     [--pdf <PDF> ...] [--product-image <图片> ...]
                     [--product-id <ID>]

说明:
  路径相对于当前工作目录解析。已有产品可传 --product-id 检查栏目和产品记录。
  --product-image 会按 CMS 实际上传转换链路预检，但不会写入数据库或生成文件。`);
}

function parseArgs(argv) {
  const output = { html: [], pdf: [], productImages: [], keywordCsv: '', productId: null };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') {
      output.help = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`${token} 缺少参数值`);
    }
    if (token === '--html') output.html.push(value);
    else if (token === '--pdf') output.pdf.push(value);
    else if (token === '--product-image') output.productImages.push(value);
    else if (token === '--keyword-csv') output.keywordCsv = value;
    else if (token === '--product-id') output.productId = Number.parseInt(value, 10);
    else throw new Error(`未知参数: ${token}`);
    index += 1;
  }
  return output;
}

async function inspectProductImage(filePath, errors, warnings) {
  const result = {
    file: filePath,
    exists: fs.existsSync(filePath),
    extension: path.extname(filePath).toLowerCase(),
    sourceBytes: null,
    storedBytes: null,
    storedExtension: '',
    width: null,
    height: null,
    format: '',
    hasAlpha: false,
    pages: 1,
    sha256: ''
  };
  if (!result.exists) {
    errors.push(`产品图片不存在: ${filePath}`);
    return result;
  }
  if (!UPLOAD_ALLOWED_EXTENSIONS.has(result.extension)) {
    errors.push(`产品图片格式不受 CMS 支持: ${filePath}`);
    return result;
  }

  const source = fs.readFileSync(filePath);
  result.sourceBytes = source.length;
  result.sha256 = createHash('sha256').update(source).digest('hex');
  const sourceLimitBytes = IMAGE_UPLOAD_SOURCE_MAX_SIZE_KB * 1024;
  if (source.length === 0) errors.push(`产品图片为空文件: ${filePath}`);
  if (source.length > sourceLimitBytes) {
    errors.push(`产品图片超过上传源文件限制 ${IMAGE_UPLOAD_SOURCE_MAX_SIZE_KB}KB: ${filePath}`);
    return result;
  }

  try {
    const stored = await optimizeUploadedImage({ buffer: source, extension: result.extension });
    const metadata = await sharp(stored.buffer, { animated: true, failOn: 'error' }).metadata();
    result.storedBytes = stored.buffer.length;
    result.storedExtension = stored.extension;
    result.width = metadata.width || null;
    result.height = metadata.height || null;
    result.format = metadata.format || '';
    result.hasAlpha = Boolean(metadata.hasAlpha);
    result.pages = Number(metadata.pages || 1);
    if (!Number.isInteger(result.width) || result.width <= 0 || !Number.isInteger(result.height) || result.height <= 0) {
      errors.push(`无法取得产品图片有效尺寸: ${filePath}`);
    } else {
      if (Math.min(result.width, result.height) < 600) {
        warnings.push(`${filePath}: 较短边只有 ${Math.min(result.width, result.height)}px，作为产品主图可能偏小`);
      }
      if (result.width * result.height > 40_000_000) {
        warnings.push(`${filePath}: 像素总量超过 4000 万，建议确认上传和页面加载成本`);
      }
    }
    if (result.pages > 1) warnings.push(`${filePath}: 检测到 ${result.pages} 帧，产品主图将保留动态图行为`);
  } catch (error) {
    errors.push(`产品图片无法通过 CMS 转换链路: ${filePath}: ${error.message}`);
  }
  return result;
}

function resolveInputPath(value) {
  return path.resolve(process.cwd(), value);
}

function parseCsvRow(line) {
  const fields = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      fields.push(value);
      value = '';
    } else {
      value += char;
    }
  }
  fields.push(value);
  return fields.map((field) => field.trim());
}

function getAttr(node, name) {
  return node?.attrs?.find((entry) => entry.name === name)?.value || '';
}

function hasClass(node, className) {
  return getAttr(node, 'class').split(/\s+/).includes(className);
}

function walk(node, visitor) {
  visitor(node);
  for (const child of node?.childNodes || []) walk(child, visitor);
}

function findFirst(node, predicate) {
  if (predicate(node)) return node;
  for (const child of node?.childNodes || []) {
    const result = findFirst(child, predicate);
    if (result) return result;
  }
  return null;
}

function isRemoteOrUploadedAsset(src) {
  return /^(?:https?:)?\/\//i.test(src) || src.startsWith('/uploads/');
}

async function inspectHtml(filePath, errors, warnings) {
  if (!fs.existsSync(filePath)) {
    errors.push(`HTML 不存在: ${filePath}`);
    return null;
  }
  const html = fs.readFileSync(filePath, 'utf8');
  const document = parse5.parse(html);
  const body = findFirst(document, (node) => node.tagName === 'body');
  const elements = [];
  walk(document, (node) => {
    if (node.tagName) elements.push(node);
  });

  const pdfDocuments = elements.filter((node) => hasClass(node, 'pdf-document'));
  const pdfBodies = elements.filter((node) => hasClass(node, 'pdf-document__body'));
  const documentMains = elements.filter((node) => node.tagName === 'main' && hasClass(node, 'document-main'));
  const technicalCount = pdfDocuments.filter((node) => hasClass(node, 'pdf-document--technical')).length;
  const manualCount = pdfDocuments.filter((node) => hasClass(node, 'pdf-document--manual')).length;
  const stylesheetLinks = elements.filter((node) => node.tagName === 'link' && getAttr(node, 'rel') === 'stylesheet');

  if (pdfDocuments.length === 0) errors.push(`${filePath}: 缺少 .pdf-document`);
  if (pdfBodies.length < pdfDocuments.length) errors.push(`${filePath}: 缺少 .pdf-document__body`);
  if (documentMains.length < pdfDocuments.length) errors.push(`${filePath}: 缺少 main.document-main`);
  if (technicalCount + manualCount !== pdfDocuments.length) {
    errors.push(`${filePath}: 每个 PDF 根节点必须标记 technical 或 manual`);
  }
  if (!stylesheetLinks.some((node) => getAttr(node, 'href').includes('pdf-document.css'))) {
    warnings.push(`${filePath}: 独立预览未检测到共享 pdf-document.css`);
  }

  const bodyElements = [];
  if (body) walk(body, (node) => { if (node.tagName) bodyElements.push(node); });
  for (const node of bodyElements) {
    if (node.tagName === 'style' || node.tagName === 'link') {
      errors.push(`${filePath}: 正文禁止 <${node.tagName}>`);
    }
    if (getAttr(node, 'style')) {
      errors.push(`${filePath}: 正文禁止内联 style 属性`);
    }
  }

  const images = bodyElements.filter((node) => node.tagName === 'img');
  const imageResults = [];
  for (const image of images) {
    const src = getAttr(image, 'src');
    const width = Number.parseInt(getAttr(image, 'width'), 10);
    const height = Number.parseInt(getAttr(image, 'height'), 10);
    if (!src) errors.push(`${filePath}: img 缺少 src`);
    if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
      errors.push(`${filePath}: ${src || '<unknown>'} 缺少正整数 width/height`);
    }

    const result = { src, width, height, local: false, exists: null, pixelsMatch: null };
    if (src && !isRemoteOrUploadedAsset(src) && !src.startsWith('data:')) {
      const cleanSrc = decodeURIComponent(src.split(/[?#]/, 1)[0]);
      const assetPath = path.resolve(path.dirname(filePath), cleanSrc);
      result.local = true;
      result.exists = fs.existsSync(assetPath);
      if (!result.exists) {
        errors.push(`${filePath}: 图片资源不存在 ${assetPath}`);
      } else if (Number.isInteger(width) && Number.isInteger(height)) {
        try {
          const metadata = await sharp(assetPath).metadata();
          result.pixelsMatch = metadata.width === width && metadata.height === height;
          if (!result.pixelsMatch) {
            errors.push(`${filePath}: ${src} 文件像素 ${metadata.width}x${metadata.height} 与 HTML ${width}x${height} 不一致`);
          }
        } catch (error) {
          errors.push(`${filePath}: 无法读取图片尺寸 ${src}: ${error.message}`);
        }
      }
    } else if (src && isRemoteOrUploadedAsset(src)) {
      warnings.push(`${filePath}: ${src} 是远程或已上传资源，前置检查未验证物理像素`);
    }
    imageResults.push(result);
  }

  return {
    file: filePath,
    pdfDocumentCount: pdfDocuments.length,
    technicalCount,
    manualCount,
    imageCount: images.length,
    images: imageResults
  };
}

async function inspectProduct(productId, errors) {
  if (!Number.isInteger(productId) || productId <= 0) {
    errors.push('--product-id 必须是正整数');
    return null;
  }
  const [{ getContentItemById }, { getColumnById }, { getContentModelByCode }] = await Promise.all([
    import(path.join(PROJECT_ROOT, 'system/server/src/services/content-items.mjs')),
    import(path.join(PROJECT_ROOT, 'system/server/src/services/columns.mjs')),
    import(path.join(PROJECT_ROOT, 'system/server/src/services/content-models.mjs'))
  ]);
  const product = getContentItemById('product', productId, {
    languageCode: 'en',
    includeTranslations: true,
    includeTranslationStatuses: true
  });
  if (!product) {
    errors.push(`产品 ${productId} 不存在`);
    return null;
  }
  const column = getColumnById(product.column_id, { languageCode: 'en' });
  const productModel = getContentModelByCode('product');
  if (!column) errors.push(`产品 ${productId} 的栏目 ${product.column_id} 不存在`);
  else {
    if (column.column_type !== 'list') errors.push(`栏目 ${column.id} 不是 list 栏目`);
    if (!productModel || Number(column.content_model_id || 0) !== Number(productModel.id || 0)) {
      errors.push(`栏目 ${column.id} 未绑定 product 模型`);
    }
  }
  return {
    id: product.id,
    code: product.code,
    name: product.name,
    columnId: product.column_id,
    columnName: column?.name || '',
    columnType: column?.column_type || '',
    contentModelId: column?.content_model_id || null,
    visible: product.is_visible,
    translations: product.translation_statuses || []
  };
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    usage();
    process.exit(2);
  }
  if (args.help) {
    usage();
    return;
  }

  const errors = [];
  const warnings = [];
  if (!args.keywordCsv) errors.push('必须提供 --keyword-csv');
  if (args.html.length === 0) errors.push('至少提供一个 --html');

  let keywordCsv = null;
  if (args.keywordCsv) {
    const csvPath = resolveInputPath(args.keywordCsv);
    if (!fs.existsSync(csvPath)) {
      errors.push(`关键词 CSV 不存在: ${csvPath}`);
    } else {
      const firstLine = fs.readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0];
      const headers = parseCsvRow(firstLine);
      for (const required of ['Keyword', '内链']) {
        if (!headers.includes(required)) errors.push(`关键词 CSV 缺少列: ${required}`);
      }
      keywordCsv = { file: csvPath, headers };
    }
  }

  const pdfs = args.pdf.map(resolveInputPath).map((file) => {
    const exists = fs.existsSync(file);
    if (!exists) errors.push(`PDF 不存在: ${file}`);
    return { file, exists };
  });

  const documents = [];
  for (const htmlPath of args.html.map(resolveInputPath)) {
    const result = await inspectHtml(htmlPath, errors, warnings);
    if (result) documents.push(result);
  }
  const productImages = [];
  for (const imagePath of args.productImages.map(resolveInputPath)) {
    productImages.push(await inspectProductImage(imagePath, errors, warnings));
  }
  const imageHashes = new Map();
  for (const image of productImages) {
    if (!image.sha256) continue;
    if (imageHashes.has(image.sha256)) {
      warnings.push(`产品图片内容重复: ${image.file} 与 ${imageHashes.get(image.sha256)}`);
    } else {
      imageHashes.set(image.sha256, image.file);
    }
  }
  const product = args.productId === null ? null : await inspectProduct(args.productId, errors);

  const report = {
    success: errors.length === 0,
    canonicalLanguage: 'en',
    keywordCsv,
    pdfs,
    product,
    productImages,
    documents,
    warnings,
    errors
  };
  console.log(JSON.stringify(report, null, 2));
  if (errors.length > 0) process.exit(1);
}

await main();
