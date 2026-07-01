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
    html: injectPreviewDocumentShell(html, cssAsset?.cssText || '', draft),
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

function injectPreviewDocumentShell(html, cssText, draft) {
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
  const draftContextScriptTag = buildDocumentPreviewDraftContextScript(draft);
  const stampScriptTag = buildDocumentStampPreviewScript();

  if (/<\/head>/i.test(normalizedHtml)) {
    const withHead = normalizedHtml.replace(/<\/head>/i, `${styleTag}\n</head>`);
    return withHead.replace(/<\/body>/i, `${scriptTag}\n${draftContextScriptTag}\n${stampScriptTag}\n</body>`);
  }

  return `${styleTag}\n${normalizedHtml}\n${scriptTag}\n${draftContextScriptTag}\n${stampScriptTag}`;
}

function buildDocumentPreviewDraftContextScript(draft) {
  const context = {
    id: String(draft?.id || ''),
    stamps: Array.isArray(draft?.draft_payload?.stamps) ? draft.draft_payload.stamps : [],
  };

  return [
    '<script data-document-preview="draft-context">',
    `window.__DOCUMENT_PREVIEW_DRAFT__ = ${serializeInlineJson(context)};`,
    '</script>',
  ].join('\n');
}

function previewBaseCss() {
  return [
    'html, body { min-height: 100%; background: #0f172a; color-scheme: dark; }',
    'body { margin: 0; background: #0f172a; }',
    '*, *::before, *::after { box-sizing: border-box; }',
    'body > .doc-shell, body > .contract-shell, body > .quote-page { max-width: none; }',
    '.document-pages, .document-page, .document-page__inner, .doc-shell, .contract-shell, .quote-page { position: relative; }',
    '.document-page, .document-page__inner, .doc-shell, .contract-shell, .quote-page { overflow: visible !important; }',
    '.doc-stamp-anchor { position: absolute; inset: 0; pointer-events: none; overflow: visible; z-index: 999; }',
    '.doc-stamp-layer { position: absolute; inset: 0; pointer-events: none; overflow: visible; z-index: 1; }',
    '.doc-stamp-anchor--edit, .doc-stamp-layer--edit { pointer-events: auto; }',
    '.doc-stamp-item { position: absolute; touch-action: none; user-select: none; cursor: move; transform-origin: center center; opacity: 1; }',
    '.doc-stamp-item img { display: block; width: 100%; height: 100%; object-fit: contain; pointer-events: none; }',
    '.doc-stamp-item--active { outline: 1px dashed rgba(59, 130, 246, 0.9); outline-offset: 2px; }',
    '.doc-stamp-item__rotate { position: absolute; top: -18px; right: -18px; width: 24px; height: 24px; border-radius: 9999px; border: 1px solid rgba(15, 23, 42, 0.3); background: rgba(255, 255, 255, 0.96); color: #0f172a; display: flex; align-items: center; justify-content: center; font: 700 14px/1 sans-serif; cursor: grab; pointer-events: auto; }',
    '.doc-stamp-item__rotate::before { content: "↻"; }',
    '@media print {',
    '  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }',
    '  .doc-stamp-anchor, .doc-stamp-layer { position: absolute; inset: 0; pointer-events: none; overflow: visible; }',
    '  .doc-stamp-item { break-inside: avoid; page-break-inside: avoid; }',
    '  .doc-stamp-item__rotate { display: none !important; }',
    '}',
  ].join('\n');
}

function buildDocumentStampPreviewScript() {
  return [
    '<script data-document-preview="stamps">',
    '(function () {',
    '  const rawDraft = window.__DOCUMENT_PREVIEW_DRAFT__ || {};',
    '  let stamps = Array.isArray(rawDraft.stamps) ? rawDraft.stamps.map(normalizeStamp) : [];',
    '  let editMode = false;',
    '  let activeStampId = "";',
    '  let dragState = null;',
    '  const pageAnchors = new Map();',
    '  function normalizeStamp(item, index) {',
    '    const source = item && typeof item === "object" ? item : {};',
    '    return {',
    '      id: String(source.id || `stamp-${index + 1}`),',
    '      stampId: Number.parseInt(String(source.stampId ?? source.stamp_id ?? ""), 10) || null,',
    '      name: String(source.name || ""),',
    '      imagePath: String(source.imagePath || source.image_path || ""),',
    '      page: Math.max(Number(source.page) || 1, 1),',
    '      x: Number(source.x) || 0,',
    '      y: Number(source.y) || 0,',
    '      width: Math.max(Number(source.width) || 160, 60),',
    '      height: Math.max(Number(source.height) || 160, 60),',
    '      rotation: Number(source.rotation) || 0,',
    '    };',
    '  }',
    '  function getPrintableSurfaces() {',
    '    const pageSurfaces = Array.from(document.querySelectorAll(".document-page__inner"));',
    '    if (pageSurfaces.length > 0) return pageSurfaces;',
    '    const shell = document.querySelector(".document-page__inner > .quote-page, .document-page__inner > .doc-shell, .document-page__inner > .contract-shell, .quote-page, .doc-shell, .contract-shell");',
    '    return shell ? [shell] : [];',
    '  }',
    '  function ensurePageAnchors() {',
    '    const surfaces = getPrintableSurfaces();',
    '    const validPages = new Set();',
    '    surfaces.forEach((surface, index) => {',
    '      const pageNumber = index + 1;',
    '      validPages.add(pageNumber);',
    '      const existing = pageAnchors.get(pageNumber);',
    '      if (existing && existing.anchor.parentNode === surface) {',
    '        existing.anchor.classList.toggle("doc-stamp-anchor--edit", editMode);',
    '        existing.layer.classList.toggle("doc-stamp-layer--edit", editMode);',
    '        return;',
    '      }',
    '      if (existing?.anchor?.parentNode) existing.anchor.remove();',
    '      const anchor = document.createElement("div");',
    '      anchor.className = "doc-stamp-anchor" + (editMode ? " doc-stamp-anchor--edit" : "");',
    '      const layer = document.createElement("div");',
    '      layer.className = "doc-stamp-layer" + (editMode ? " doc-stamp-layer--edit" : "");',
    '      anchor.appendChild(layer);',
    '      surface.appendChild(anchor);',
    '      pageAnchors.set(pageNumber, { anchor, layer, surface });',
    '    });',
    '    Array.from(pageAnchors.keys()).forEach((pageNumber) => {',
    '      if (validPages.has(pageNumber)) return;',
    '      const stale = pageAnchors.get(pageNumber);',
    '      if (stale?.anchor?.parentNode) stale.anchor.remove();',
    '      pageAnchors.delete(pageNumber);',
    '    });',
    '  }',
    '  function render() {',
    '    ensurePageAnchors();',
    '    pageAnchors.forEach(({ layer, anchor }) => {',
    '      layer.innerHTML = "";',
    '      anchor.classList.toggle("doc-stamp-anchor--edit", editMode);',
    '      layer.classList.toggle("doc-stamp-layer--edit", editMode);',
    '    });',
    '    stamps.forEach((stamp) => {',
    '      if (!stamp.imagePath) return;',
    '      const pageNumber = Math.max(Number(stamp.page) || 1, 1);',
    '      const target = pageAnchors.get(pageNumber) || pageAnchors.get(1);',
    '      if (!target?.layer) return;',
    '      const item = document.createElement("div");',
    '      item.className = "doc-stamp-item" + (editMode && stamp.id === activeStampId ? " doc-stamp-item--active" : "");',
    '      item.dataset.stampId = stamp.id;',
    '      item.dataset.page = String(pageNumber);',
    '      item.style.left = `${stamp.x}px`;',
    '      item.style.top = `${stamp.y}px`;',
    '      item.style.width = `${stamp.width}px`;',
    '      item.style.height = `${stamp.height}px`;',
    '      item.style.transform = `rotate(${stamp.rotation}deg)`;',
    '      const image = document.createElement("img");',
    '      image.src = stamp.imagePath;',
    '      image.alt = stamp.name || "stamp";',
    '      item.appendChild(image);',
    '      if (editMode) {',
    '        const rotate = document.createElement("button");',
    '        rotate.type = "button";',
    '        rotate.className = "doc-stamp-item__rotate";',
    '        rotate.setAttribute("aria-label", "rotate stamp");',
    '        rotate.addEventListener("pointerdown", (event) => startRotate(event, stamp.id));',
    '        item.appendChild(rotate);',
    '        item.addEventListener("pointerdown", (event) => startDrag(event, stamp.id));',
    '      }',
    '      target.layer.appendChild(item);',
    '    });',
    '  }',
    '  function startDrag(event, stampId) {',
    '    if (event.target && event.target.classList && event.target.classList.contains("doc-stamp-item__rotate")) return;',
    '    const stamp = stamps.find((entry) => entry.id === stampId);',
    '    if (!stamp) return;',
    '    activeStampId = stampId;',
    '    const pageNumber = Math.max(Number(stamp.page) || 1, 1);',
    '    dragState = { mode: "move", stampId, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: stamp.x, originY: stamp.y, page: pageNumber };',
    '    event.currentTarget.setPointerCapture(event.pointerId);',
    '    bindPointerEvents();',
    '    render();',
    '  }',
    '  function startRotate(event, stampId) {',
    '    event.stopPropagation();',
    '    const stamp = stamps.find((entry) => entry.id === stampId);',
    '    if (!stamp) return;',
    '    activeStampId = stampId;',
    '    dragState = { mode: "rotate", stampId, pointerId: event.pointerId, page: Math.max(Number(stamp.page) || 1, 1) };',
    '    event.currentTarget.setPointerCapture(event.pointerId);',
    '    bindPointerEvents();',
    '    updateRotation(event.clientX, event.clientY);',
    '    render();',
    '  }',
    '  function bindPointerEvents() {',
    '    window.addEventListener("pointermove", onPointerMove);',
    '    window.addEventListener("pointerup", onPointerUp);',
    '    window.addEventListener("pointercancel", onPointerUp);',
    '  }',
    '  function unbindPointerEvents() {',
    '    window.removeEventListener("pointermove", onPointerMove);',
    '    window.removeEventListener("pointerup", onPointerUp);',
    '    window.removeEventListener("pointercancel", onPointerUp);',
    '  }',
    '  function onPointerMove(event) {',
    '    if (!dragState) return;',
    '    if (dragState.mode === "move") {',
    '      const stamp = stamps.find((entry) => entry.id === dragState.stampId);',
    '      if (!stamp) return;',
    '      stamp.page = dragState.page || stamp.page || 1;',
    '      stamp.x = dragState.originX + (event.clientX - dragState.startX);',
    '      stamp.y = dragState.originY + (event.clientY - dragState.startY);',
    '      render();',
    '      return;',
    '    }',
    '    if (dragState.mode === "rotate") {',
    '      updateRotation(event.clientX, event.clientY);',
    '      render();',
    '    }',
    '  }',
    '  function updateRotation(clientX, clientY) {',
    '    const stamp = stamps.find((entry) => entry.id === dragState?.stampId);',
    '    if (!stamp) return;',
    '    stamp.page = dragState?.page || stamp.page || 1;',
    '    const centerX = stamp.x + stamp.width / 2;',
    '    const centerY = stamp.y + stamp.height / 2;',
    '    const radians = Math.atan2(clientY - centerY, clientX - centerX);',
    '    stamp.rotation = Math.round((radians * 180 / Math.PI) + 90);',
    '  }',
    '  function onPointerUp() {',
    '    if (!dragState) return;',
    '    dragState = null;',
    '    unbindPointerEvents();',
    '    dispatchChange();',
    '    render();',
    '  }',
    '  function dispatchChange() {',
    '    window.parent.postMessage({ type: "document-preview-stamps-change", draftId: rawDraft.id || "", stamps }, window.location.origin);',
    '  }',
    '  window.addEventListener("message", (event) => {',
    '    if (event.origin !== window.location.origin) return;',
    '    const data = event.data || {};',
    '    if (data.type === "document-preview-set-stamps") {',
    '      stamps = Array.isArray(data.stamps) ? data.stamps.map(normalizeStamp) : [];',
    '      activeStampId = stamps[0]?.id || "";',
    '      render();',
    '      return;',
    '    }',
    '    if (data.type === "document-preview-set-stamp-edit-mode") {',
    '      editMode = Boolean(data.enabled);',
    '      activeStampId = String(data.activeStampId || activeStampId || "");',
    '      render();',
    '      return;',
    '    }',
    '  });',
    '  window.addEventListener("document-preview-layout-change", render);',
    '  render();',
    '})();',
    '</script>',
  ].join('\n');
}

function serializeInlineJson(value) {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}
