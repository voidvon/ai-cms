import { getTemplateById } from './templates.mjs';
import { getDocumentDraftById } from './document-drafts.mjs';
import { buildDocumentPaginationCss, buildDocumentPaginationScript } from './document-pagination.mjs';
import { renderTsxTemplate } from '../tsx-template-renderer.mjs';
import { getTsxTemplateStyleAsset } from '../tsx-template-styles.mjs';

export function renderDocumentDraftPreview(draftId) {
  const draft = getDocumentDraftById(draftId);
  if (!draft) {
    const error = new Error('文档草稿不存在');
    error.statusCode = 404;
    throw error;
  }

  const template = getTemplateById(draft.template_id);
  if (!template?.tsx_source) {
    const error = new Error('文档模板不存在或源码为空');
    error.statusCode = 404;
    throw error;
  }

  const html = renderTsxTemplate(template.tsx_source || '', {
    draft: draft.draft_payload,
    workspace: {
      id: draft.id,
      title: draft.title,
      documentType: draft.document_type,
      languageCode: draft.language_code,
      templateName: draft.template_name,
    },
  }, {
    templateCode: template.code,
  });

  const cssAsset = getDocumentTemplateStyleAsset(template);
  return {
    html: injectPreviewDocumentShell(html, cssAsset?.cssText || ''),
    draft,
  };
}

function getDocumentTemplateStyleAsset(template) {
  const cssSource = String(template.css_source || '').trim();
  if (!cssSource) {
    return null;
  }

  const styleCarrierSource = [
    `export const css = ${JSON.stringify(cssSource)};`,
    'export default function DocumentStyleCarrier() { return null; }',
    '',
  ].join('\n');

  return getTsxTemplateStyleAsset(styleCarrierSource, {
    templateCode: template.code,
  });
}

function injectPreviewDocumentShell(html, cssText) {
  const normalizedHtml = String(html || '');
  const styleTag = [
    '<style data-document-preview="base">',
    previewBaseCss(),
    '</style>',
    '<style data-document-preview="pagination">',
    buildDocumentPaginationCss(),
    '</style>',
    cssText ? `<style data-document-preview="template">\n${cssText}\n</style>` : '',
  ].filter(Boolean).join('\n');
  const scriptTag = buildDocumentPaginationScript();

  if (/<\/head>/i.test(normalizedHtml)) {
    const withHead = normalizedHtml.replace(/<\/head>/i, `${styleTag}\n</head>`);
    return withHead.replace(/<\/body>/i, `${scriptTag}\n</body>`);
  }

  return `${styleTag}\n${normalizedHtml}\n${scriptTag}`;
}

function previewBaseCss() {
  return [
    'html, body { min-height: 100%; }',
    'body { margin: 0; }',
    '*, *::before, *::after { box-sizing: border-box; }',
    'body > .doc-shell, body > .contract-shell { max-width: none; }',
    '@media print {',
    '  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }',
    '}',
  ].join('\n');
}
