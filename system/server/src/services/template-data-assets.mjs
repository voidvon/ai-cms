import { normalizeUploadedRelativePath } from './uploads.mjs';

export function normalizeTemplateDataAssetsDeep(value, key = '') {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeTemplateDataAssetsDeep(item, key));
  }
  if (!value || typeof value !== 'object') {
    if (typeof value !== 'string') {
      return value;
    }
    if (shouldNormalizeTemplateLinkKey(key)) {
      return normalizeTemplateInternalLink(value);
    }
    return shouldNormalizeTemplateImageKey(key)
      ? resolveNormalizedTemplateImagePath(value)
      : value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([entryKey, entryValue]) => [
      entryKey,
      normalizeTemplateDataAssetsDeep(entryValue, entryKey)
    ])
  );
}

export function resolveNormalizedTemplateImagePath(value) {
  return normalizeUploadedRelativePath(value) || String(value || '').trim();
}

export function shouldNormalizeTemplateImageKey(key) {
  const normalized = String(key || '').trim().toLowerCase();
  return normalized === 'image'
    || normalized === 'icon'
    || normalized === 'poster'
    || normalized === 'imagesrc'
    || normalized === 'imageurl'
    || normalized === 'iconsrc'
    || normalized === 'iconurl'
    || normalized === 'postersrc'
    || normalized === 'posterurl'
    || normalized === 'heroimage'
    || normalized === 'mastheadimage'
    || normalized === 'backgroundimage'
    || normalized === 'featureimage'
    || normalized.endsWith('image')
    || normalized.endsWith('icon')
    || normalized.endsWith('poster')
    || normalized.endsWith('imagesrc')
    || normalized.endsWith('imageurl')
    || normalized.endsWith('iconsrc')
    || normalized.endsWith('iconurl')
    || normalized.endsWith('postersrc')
    || normalized.endsWith('posterurl');
}

export function shouldNormalizeTemplateLinkKey(key) {
  const normalized = String(key || '').trim().toLowerCase();
  return normalized === 'href'
    || normalized === 'link'
    || normalized === 'url'
    || normalized.endsWith('href')
    || normalized.endsWith('link')
    || normalized.endsWith('url');
}

export function normalizeTemplateInternalLink(value) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return normalized;
  }
  if (/^(?:[a-z]+:|#|mailto:|tel:|javascript:)/i.test(normalized)) {
    return normalized;
  }
  if (!normalized.startsWith('/')) {
    return normalized;
  }

  const [pathnamePart, suffix = ''] = normalized.split(/([?#].*)/s, 2);
  let pathname = pathnamePart || '';
  if (!pathname.startsWith('/')) {
    return normalized;
  }

  pathname = pathname.replace(/\/{2,}/g, '/');

  const sitePrefixMatch = pathname.match(/^\/(?:zh-cn|ru|es|id|pt|fr|tr|th|vi|ar(?:-[a-z]{2})?)(?=\/|$)/i);
  const sitePrefix = sitePrefixMatch ? sitePrefixMatch[0] : '';
  let rewrittenPath = sitePrefix ? pathname.slice(sitePrefix.length) || '/' : pathname;

  if (!rewrittenPath.endsWith('/') && !rewrittenPath.endsWith('.html')) {
    const lastSegment = rewrittenPath.split('/').filter(Boolean).pop() || '';
    if (!lastSegment.includes('.')) {
      rewrittenPath = `${rewrittenPath}/`;
    }
  }

  return `${sitePrefix}${rewrittenPath}${suffix}`;
}
