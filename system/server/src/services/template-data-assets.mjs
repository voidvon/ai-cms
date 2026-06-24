import { normalizeUploadedRelativePath } from './uploads.mjs';

export function normalizeTemplateDataAssetsDeep(value, key = '') {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeTemplateDataAssetsDeep(item, key));
  }
  if (!value || typeof value !== 'object') {
    if (typeof value !== 'string') {
      return value;
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
