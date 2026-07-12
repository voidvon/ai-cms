const PDF_DOCUMENT_PATTERN = /\bclass\s*=\s*["'][^"']*\bpdf-document(?:\s|--|["'])/gi;
const PDF_DOCUMENT_BODY_PATTERN = /\bclass\s*=\s*["'][^"']*\bpdf-document__body(?:\s|["'])/gi;
const DOCUMENT_MAIN_PATTERN = /\bclass\s*=\s*["'][^"']*\bdocument-main(?:\s|["'])/gi;
const FORBIDDEN_DOCUMENT_STYLE_PATTERN = /<style\b|<link\b|\sstyle\s*=/i;

export function assertStructuredContentHtmlPreserved(existingHtml, nextHtml, { languageCode = '' } = {}) {
  const existing = String(existingHtml || '');
  if (!hasStructuredPdfDocument(existing)) {
    return;
  }

  const next = String(nextHtml || '');
  const languageLabel = languageCode ? `（${languageCode}）` : '';
  const requiredCounts = {
    pdfDocument: countMatches(existing, PDF_DOCUMENT_PATTERN),
    pdfDocumentBody: countMatches(existing, PDF_DOCUMENT_BODY_PATTERN),
    documentMain: countMatches(existing, DOCUMENT_MAIN_PATTERN)
  };
  const nextCounts = {
    pdfDocument: countMatches(next, PDF_DOCUMENT_PATTERN),
    pdfDocumentBody: countMatches(next, PDF_DOCUMENT_BODY_PATTERN),
    documentMain: countMatches(next, DOCUMENT_MAIN_PATTERN)
  };

  if (
    nextCounts.pdfDocument < requiredCounts.pdfDocument
    || nextCounts.pdfDocumentBody < requiredCounts.pdfDocumentBody
    || nextCounts.documentMain < requiredCounts.documentMain
  ) {
    throw new Error(`PDF 文档框架${languageLabel}不完整，已拒绝保存。请使用支持 PDF 结构的编辑器或专用导入流程。`);
  }

  if (FORBIDDEN_DOCUMENT_STYLE_PATTERN.test(next)) {
    throw new Error(`PDF 文档正文${languageLabel}不能包含 style、link 或内联样式，已拒绝保存。`);
  }
}

export function hasStructuredPdfDocument(value) {
  PDF_DOCUMENT_PATTERN.lastIndex = 0;
  return PDF_DOCUMENT_PATTERN.test(String(value || ''));
}

function countMatches(value, pattern) {
  pattern.lastIndex = 0;
  return Array.from(String(value || '').matchAll(pattern)).length;
}
