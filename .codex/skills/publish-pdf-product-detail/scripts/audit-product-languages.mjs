#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import * as parse5 from 'parse5';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '../../../..');
const SPACE_DELIMITED_LANGUAGES = new Set(['en', 'es', 'fr', 'ru', 'tr', 'pt', 'id', 'ar', 'vi']);

function usage() {
  console.log(`用法:
  node audit-product-languages.mjs --product-id <ID>
       [--canonical-language en] [--required-keyword <关键词> ...] [--check-static]
       [--allow-no-pdf-documents] [--require-pdf-attachments] [--strict-seo-length]

说明:
  默认要求英文母版至少包含一个 .pdf-document。仅审计旧数据时可显式放宽。`);
}

function parseArgs(argv) {
  const output = {
    productId: null,
    canonicalLanguage: 'en',
    requiredKeywords: [],
    checkStatic: false,
    allowNoPdfDocuments: false,
    requirePdfAttachments: false,
    strictSeoLength: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') {
      output.help = true;
      continue;
    }
    if (token === '--check-static') {
      output.checkStatic = true;
      continue;
    }
    if (token === '--allow-no-pdf-documents') {
      output.allowNoPdfDocuments = true;
      continue;
    }
    if (token === '--require-pdf-attachments') {
      output.requirePdfAttachments = true;
      continue;
    }
    if (token === '--strict-seo-length') {
      output.strictSeoLength = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${token} 缺少参数值`);
    if (token === '--product-id') output.productId = Number.parseInt(value, 10);
    else if (token === '--canonical-language') output.canonicalLanguage = value;
    else if (token === '--required-keyword') output.requiredKeywords.push(value);
    else throw new Error(`未知参数: ${token}`);
    index += 1;
  }
  return output;
}

function getAttr(node, name) {
  return node?.attrs?.find((entry) => entry.name === name)?.value || '';
}

function hasClass(node, className) {
  return getAttr(node, 'class').split(/\s+/).includes(className);
}

function textContent(node) {
  if (node?.nodeName === '#text') return node.value || '';
  return (node?.childNodes || []).map(textContent).join('');
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

function addLanguagePrefix(url, prefix) {
  if (!prefix || prefix === '/') return url;
  return `${prefix}${url.startsWith('/') ? url : `/${url}`}`;
}

function stripLanguagePrefix(url, prefix) {
  if (!prefix || prefix === '/') return url;
  return url === prefix ? '/' : (url.startsWith(`${prefix}/`) ? url.slice(prefix.length) : url);
}

function normalizeImageList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed.map((item) => String(item || '').trim()).filter(Boolean) : [];
  } catch {
    return String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
  }
}

function normalizeAttachmentList(value) {
  if (Array.isArray(value)) return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))];
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? [...new Set(parsed.map((item) => String(item || '').trim()).filter(Boolean))] : [];
  } catch {
    return [];
  }
}

function codePointLength(value) {
  return [...String(value || '').trim()].length;
}

function addSeoLengthFinding(message, strict, languageErrors, languageWarnings) {
  if (strict) languageErrors.push(message);
  else languageWarnings.push(message);
}

function resolveStaticFile(outputDir, publicUrl, prefix) {
  const unprefixed = stripLanguagePrefix(publicUrl, prefix).replace(/^\/+/, '');
  if (!unprefixed) return path.resolve(PROJECT_ROOT, outputDir, 'index.html');
  if (publicUrl.endsWith('/')) return path.resolve(PROJECT_ROOT, outputDir, unprefixed, 'index.html');
  return path.resolve(PROJECT_ROOT, outputDir, unprefixed);
}

function analyzeTranslation(language, translation, expectedProductUrl, canonicalCounts, errors, warnings, strictSeoLength) {
  const code = language.code;
  const prefix = language.site?.path_prefix || '/';
  const languageErrors = [];
  const languageWarnings = [];
  const requiredFields = ['name', 'summary', 'content_html', 'seo_title', 'seo_description'];
  for (const field of requiredFields) {
    if (!String(translation?.[field] || '').trim()) languageErrors.push(`缺少 ${field}`);
  }
  if (translation?.publish_status !== 'published') languageErrors.push('不是 published 状态');
  const seoTitleLength = codePointLength(translation?.seo_title);
  const seoDescriptionLength = codePointLength(translation?.seo_description);
  if (seoTitleLength > 65) {
    addSeoLengthFinding(`SEO title 长度 ${seoTitleLength}，建议不超过 65 个字符`, strictSeoLength, languageErrors, languageWarnings);
  }
  if (seoDescriptionLength > 170) {
    addSeoLengthFinding(`SEO description 长度 ${seoDescriptionLength}，建议不超过 170 个字符`, strictSeoLength, languageErrors, languageWarnings);
  }

  const document = parse5.parseFragment(String(translation?.content_html || ''));
  const anchors = [];
  const counts = { pdf: 0, technical: 0, manual: 0 };
  walk(document, (node) => {
    if (hasClass(node, 'pdf-document')) {
      counts.pdf += 1;
      if (hasClass(node, 'pdf-document--technical')) counts.technical += 1;
      if (hasClass(node, 'pdf-document--manual')) counts.manual += 1;
    }
    if (node.tagName === 'a') {
      const href = getAttr(node, 'href');
      const parent = node.parentNode;
      const index = parent?.childNodes?.indexOf(node) ?? -1;
      const before = index > 0 && parent.childNodes[index - 1]?.nodeName === '#text'
        ? parent.childNodes[index - 1].value || ''
        : '';
      const after = index >= 0 && parent.childNodes[index + 1]?.nodeName === '#text'
        ? parent.childNodes[index + 1].value || ''
        : '';
      anchors.push({ href, rel: getAttr(node, 'rel'), target: getAttr(node, 'target'), before, after });
    }
  });

  if (canonicalCounts.pdf > 0 && JSON.stringify(counts) !== JSON.stringify(canonicalCounts)) {
    languageErrors.push(`PDF 文档数量与英文母版不一致: ${JSON.stringify(counts)} != ${JSON.stringify(canonicalCounts)}`);
  }

  const normalizedExpectedUrl = addLanguagePrefix(expectedProductUrl, prefix);
  for (const anchor of anchors) {
    if (!anchor.href || anchor.href.startsWith('#') || /^(?:mailto:|tel:|https?:\/\/)/i.test(anchor.href)) continue;
    if (anchor.rel || anchor.target) languageErrors.push(`站内链接含 rel/target: ${anchor.href}`);
    if (anchor.href === normalizedExpectedUrl) languageErrors.push(`正文链接指向当前页面: ${anchor.href}`);
    if (prefix !== '/' && anchor.href.startsWith('/') && !anchor.href.startsWith(`${prefix}/`)) {
      languageErrors.push(`站内链接缺少语言前缀 ${prefix}: ${anchor.href}`);
    }
    if (SPACE_DELIMITED_LANGUAGES.has(code)) {
      if (anchor.before && !/\s$|[(\[{“‘«]$/u.test(anchor.before)) {
        languageErrors.push(`链接前缺少空格: ${anchor.href}`);
      }
      if (anchor.after && !/^[\s.,;:!?،؛)\]}”’»]/u.test(anchor.after)) {
        languageErrors.push(`链接后边界异常: ${anchor.href}`);
      }
    }
    if (language._checkStatic && anchor.href.startsWith('/')) {
      const targetFile = resolveStaticFile(language.site.output_dir, anchor.href, prefix);
      if (!fs.existsSync(targetFile)) languageErrors.push(`静态内链目标不存在: ${anchor.href}`);
    }
  }

  const visibleText = textContent(document).replace(/\s+/g, ' ').trim();
  if (code !== 'zh-CN' && visibleText.includes('。')) languageErrors.push('正文残留中文句号');
  errors.push(...languageErrors.map((message) => `[${code}] ${message}`));
  warnings.push(...languageWarnings.map((message) => `[${code}] ${message}`));

  return {
    code,
    status: translation?.publish_status || null,
    bodyCharacters: [...visibleText].length,
    documentCounts: counts,
    internalLinks: anchors.filter((anchor) => anchor.href.startsWith('/')).length,
    seoTitleLength,
    seoDescriptionLength,
    warnings: languageWarnings,
    errors: languageErrors
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
  if (!Number.isInteger(args.productId) || args.productId <= 0) {
    console.error('--product-id 必须是正整数');
    usage();
    process.exit(2);
  }
  if (args.canonicalLanguage !== 'en') {
    console.error('本工作流固定要求 --canonical-language en');
    process.exit(2);
  }

  const [contentItems, languagesService, columnsService, pathsService, uploadsService, dbService] = await Promise.all([
    import(path.join(PROJECT_ROOT, 'system/server/src/services/content-items.mjs')),
    import(path.join(PROJECT_ROOT, 'system/server/src/services/languages.mjs')),
    import(path.join(PROJECT_ROOT, 'system/server/src/services/columns.mjs')),
    import(path.join(PROJECT_ROOT, 'system/server/src/services/column-paths.mjs')),
    import(path.join(PROJECT_ROOT, 'system/server/src/services/uploads.mjs')),
    import(path.join(PROJECT_ROOT, 'system/server/src/db.mjs'))
  ]);
  const product = contentItems.getContentItemById('product', args.productId, {
    languageCode: 'en',
    includeTranslations: true,
    includeTranslationStatuses: true
  });
  if (!product) {
    console.error(`产品 ${args.productId} 不存在`);
    process.exit(1);
  }

  const languages = languagesService.listLanguages().filter((language) => language.is_enabled === 1);
  const columns = columnsService.listColumns({ languageCode: 'en' });
  const columnMap = new Map(columns.map((column) => [Number(column.id), column]));
  const column = columnMap.get(Number(product.column_id));
  const columnPath = pathsService.buildColumnSlugPath(column, columnMap);
  const productUrl = pathsService.buildContentDetailUrlFromColumn(product, column, columnPath);
  const canonical = product.translations?.en;
  const errors = [];
  const warnings = [];
  const productImages = normalizeImageList(product.images);
  const primaryImage = String(product.primary_image || '').trim();
  if (productImages.length > 0 && !primaryImage) errors.push('[images] 图库存在但缺少主图');
  if (primaryImage && !productImages.includes(primaryImage)) errors.push('[images] 主图不在产品图库中');
  for (const imagePath of productImages) {
    if (!imagePath.startsWith('/uploads/images/')) {
      errors.push(`[images] 产品图不是标准上传路径: ${imagePath}`);
      continue;
    }
    const filePath = uploadsService.resolveUploadedFilePath(imagePath);
    if (!filePath || !fs.existsSync(filePath)) errors.push(`[images] 产品图文件不存在: ${imagePath}`);
  }

  if (!canonical) errors.push('[en] 缺少英文母版');
  const canonicalAttachments = normalizeAttachmentList(canonical?.attachments_json);
  if (args.requirePdfAttachments && canonicalAttachments.length === 0) {
    errors.push('[en] 缺少原始 PDF 附件');
  }
  const attachmentReports = canonicalAttachments.map((relativePath) => {
    const asset = dbService.queryOne(
      `SELECT m.id, m.purpose, m.pdf_document_type, m.language_id, l.code AS language_code
       FROM media_assets m
       LEFT JOIN languages l ON l.id = m.language_id
       WHERE m.relative_path = ?`,
      [relativePath]
    );
    const filePath = uploadsService.resolveUploadedFilePath(relativePath);
    const item = {
      relativePath,
      mediaId: asset?.id || null,
      purpose: asset?.purpose || null,
      documentType: asset?.pdf_document_type || null,
      language: asset?.language_code || null,
      fileExists: Boolean(filePath && fs.existsSync(filePath))
    };
    if (!asset) errors.push(`[attachments] 媒体记录不存在: ${relativePath}`);
    else {
      if (asset.purpose !== 'pdf_document') errors.push(`[attachments] 不是 pdf_document: ${relativePath}`);
      if (asset.language_code !== 'en') errors.push(`[attachments] 英文母版附件语言不是 en: ${relativePath}`);
      if (!asset.pdf_document_type) errors.push(`[attachments] 缺少文档类型: ${relativePath}`);
    }
    if (!item.fileExists) errors.push(`[attachments] PDF 文件不存在: ${relativePath}`);
    return item;
  });
  const canonicalDocument = parse5.parseFragment(String(canonical?.content_html || ''));
  const canonicalCounts = { pdf: 0, technical: 0, manual: 0 };
  walk(canonicalDocument, (node) => {
    if (hasClass(node, 'pdf-document')) {
      canonicalCounts.pdf += 1;
      if (hasClass(node, 'pdf-document--technical')) canonicalCounts.technical += 1;
      if (hasClass(node, 'pdf-document--manual')) canonicalCounts.manual += 1;
    }
  });
  if (canonicalCounts.pdf === 0 && !args.allowNoPdfDocuments) {
    errors.push('[en] 英文母版不含 .pdf-document，未达到 PDF 产品详情发布条件');
  }

  const canonicalSearchText = [
    canonical?.name,
    canonical?.summary,
    canonical?.seo_title,
    canonical?.seo_description,
    textContent(canonicalDocument)
  ].join(' ').toLocaleLowerCase('en');
  for (const keyword of args.requiredKeywords) {
    if (!canonicalSearchText.includes(keyword.toLocaleLowerCase('en'))) {
      errors.push(`[en] 缺少必需关键词: ${keyword}`);
    }
  }

  const languageReports = [];
  for (const language of languages) {
    language._checkStatic = args.checkStatic;
    const translation = product.translations?.[language.code];
    if (!translation) {
      const message = `[${language.code}] 缺少启用语言翻译`;
      errors.push(message);
      languageReports.push({ code: language.code, errors: [message] });
      continue;
    }
    languageReports.push(analyzeTranslation(
      language,
      translation,
      productUrl,
      canonicalCounts,
      errors,
      warnings,
      args.strictSeoLength
    ));

    if (args.checkStatic) {
      const pageFile = resolveStaticFile(language.site.output_dir, addLanguagePrefix(productUrl, language.site.path_prefix), language.site.path_prefix);
      if (!fs.existsSync(pageFile)) {
        errors.push(`[${language.code}] 产品静态页不存在: ${pageFile}`);
        continue;
      }
      const page = parse5.parse(fs.readFileSync(pageFile, 'utf8'));
      const title = textContent(findFirst(page, (node) => node.tagName === 'title')).trim();
      const h1 = textContent(findFirst(page, (node) => node.tagName === 'h1')).replace(/\s+/g, ' ').trim();
      let quantity = 0;
      let contact = 0;
      walk(page, (node) => {
        if (node.tagName === 'input' && getAttr(node, 'name') === 'quantity') quantity += 1;
        if (node.tagName === 'a' && /\/contact-us\/$/.test(getAttr(node, 'href'))) contact += 1;
      });
      if (title !== translation.seo_title) errors.push(`[${language.code}] 静态页 title 与数据库不一致`);
      if (h1 !== translation.name) errors.push(`[${language.code}] 静态页 H1 与数据库不一致`);
      if (quantity === 0) errors.push(`[${language.code}] 静态页缺少数量控件`);
      if (contact === 0) errors.push(`[${language.code}] 静态页缺少联系入口`);
    }
  }

  const report = {
    success: errors.length === 0,
    product: {
      id: product.id,
      code: product.code,
      columnId: product.column_id,
      canonicalLanguage: 'en',
      publicUrl: productUrl,
      visible: product.is_visible,
      featuredHome: product.is_featured_home
    },
    productImages: {
      primaryImage,
      gallery: productImages
    },
    pdfAttachments: attachmentReports,
    enabledLanguages: languages.map((language) => language.code),
    canonicalDocumentCounts: canonicalCounts,
    requiredKeywords: args.requiredKeywords,
    checkStatic: args.checkStatic,
    allowNoPdfDocuments: args.allowNoPdfDocuments,
    requirePdfAttachments: args.requirePdfAttachments,
    strictSeoLength: args.strictSeoLength,
    languages: languageReports,
    warnings,
    errors
  };
  console.log(JSON.stringify(report, null, 2));
  if (errors.length > 0) process.exit(1);
}

await main();
