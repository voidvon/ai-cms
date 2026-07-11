import { getColumnById, listColumns } from '../columns.mjs';
import { buildColumnSlugPath, buildContentDetailUrlFromColumn } from '../column-paths.mjs';
import { getContentItemById, updateContentItem } from '../content-items.mjs';
import { getContentModelByCode } from '../content-models.mjs';
import { getDefaultLanguage, listLanguages } from '../languages.mjs';
import { getTopicProfileByColumnId, updateTopicProfileFields } from '../topic-profiles.mjs';
import { getMediaAssetById } from '../media-assets.mjs';
import { assertAiServicePermission } from './query-service.mjs';

const TEXT_FIELD_LIMITS = {
  summary: 1200,
  content_html: 8000,
  seo_title: 300,
  seo_description: 600,
};

export function buildAiMentionContext({
  user,
  mentions = [],
  languageCode = null,
  maxItems = 5,
} = {}) {
  assertAiServicePermission(user, ['read:content']);

  const normalizedMentions = Array.isArray(mentions) ? mentions : [];
  const contentMentions = normalizedMentions
    .filter((item) => String(item?.type || '') === 'content')
    .slice(0, Math.min(Math.max(Number(maxItems) || 5, 1), 10));
  const topicMentions = normalizedMentions
    .filter((item) => String(item?.type || '') === 'topic')
    .slice(0, Math.min(Math.max(Number(maxItems) || 5, 1), 10));

  if (!contentMentions.length && !topicMentions.length) {
    return {
      content_items: [],
      topic_profiles: [],
    };
  }

  const defaultLanguage = getDefaultLanguage();
  const resolvedLanguageCode = String(languageCode || defaultLanguage?.code || '').trim() || null;

  return {
    default_language_code: defaultLanguage?.code || null,
    requested_language_code: resolvedLanguageCode,
    content_items: contentMentions
      .map((mention) => buildAiMentionContentItemContext({
        user,
        mention,
        languageCode: resolvedLanguageCode,
      }))
      .filter(Boolean),
    topic_profiles: topicMentions
      .map((mention) => buildAiMentionTopicContext({
        mention,
        languageCode: resolvedLanguageCode,
      }))
      .filter(Boolean),
  };
}

function buildAiMentionTopicContext({ mention, languageCode }) {
  const columnId = Number.parseInt(String(mention?.column_id || mention?.id || ''), 10);
  if (!Number.isFinite(columnId) || columnId <= 0) {
    return null;
  }

  const profile = getTopicProfileByColumnId(columnId, { languageCode });
  if (!profile) {
    return null;
  }

  let relatedContent = [];
  try {
    const parsed = JSON.parse(String(profile.related_content_json || '[]'));
    relatedContent = Array.isArray(parsed) ? parsed.slice(0, 50) : [];
  } catch {
    relatedContent = [];
  }

  return {
    type: 'topic',
    id: profile.id,
    column: {
      id: profile.column_id,
      name: profile.column_name,
      route_path: profile.route_path || '',
      dir_name: profile.dir_name || '',
      column_type: profile.column_type || '',
    },
    language: {
      requested_code: profile.requested_language_code || languageCode || null,
      resolved_code: profile.current_language_code || profile.language_code || null,
      fallback_code: profile.fallback_language_code || null,
      is_fallback: Boolean(profile.is_language_fallback),
    },
    seo_title: String(profile.seo_title || '').slice(0, 300),
    topic_keyword: String(profile.topic_keyword || '').slice(0, 1200),
    intro_html: String(profile.intro_html || '').slice(0, 8000),
    related_content: relatedContent,
    publish_status: profile.publish_status || 'draft',
  };
}

export function getAiTopicProfileTranslationContext({
  user,
  columnId,
  languageCode,
} = {}) {
  assertAiServicePermission(user, ['read:content']);
  const safeColumnId = Number.parseInt(String(columnId || ''), 10);
  const resolvedLanguageCode = resolveAiLanguageCode(languageCode);
  if (!Number.isFinite(safeColumnId) || safeColumnId <= 0) {
    const error = new Error('缺少专题栏目 ID');
    error.statusCode = 400;
    throw error;
  }

  const context = buildAiMentionTopicContext({
    mention: { type: 'topic', id: safeColumnId, column_id: safeColumnId },
    languageCode: resolvedLanguageCode,
  });
  if (!context) {
    const error = new Error('专题配置不存在');
    error.statusCode = 404;
    throw error;
  }
  return context;
}

export function updateAiTopicProfileTranslation({
  user,
  columnId,
  languageCode,
  changes = {},
} = {}) {
  assertAiServicePermission(user, ['write:content']);
  const safeColumnId = Number.parseInt(String(columnId || ''), 10);
  const resolvedLanguageCode = resolveAiLanguageCode(languageCode);
  if (!Number.isFinite(safeColumnId) || safeColumnId <= 0) {
    const error = new Error('缺少专题栏目 ID');
    error.statusCode = 400;
    throw error;
  }

  const normalizedChanges = Object.fromEntries(
    ['seo_title', 'topic_keyword', 'intro_html', 'publish_status']
      .filter((fieldName) => changes[fieldName] !== undefined)
      .map((fieldName) => [fieldName, changes[fieldName]])
  );
  if (Object.keys(normalizedChanges).length === 0) {
    const error = new Error('至少需要提供一个要修改的专题字段');
    error.statusCode = 400;
    throw error;
  }

  const result = updateTopicProfileFields(safeColumnId, normalizedChanges, {
    languageCode: resolvedLanguageCode,
  });
  return {
    updated: true,
    created_language_profile: result.created,
    changed_fields: result.changed_fields,
    column_id: safeColumnId,
    language_code: resolvedLanguageCode,
    profile: buildAiMentionTopicContext({
      mention: { type: 'topic', id: safeColumnId, column_id: safeColumnId },
      languageCode: resolvedLanguageCode,
    }),
  };
}

export function getAiContentItemTranslationContext({
  user,
  modelCode,
  id,
  languageCode,
} = {}) {
  assertAiServicePermission(user, ['read:content']);

  const normalizedModelCode = String(modelCode || '').trim();
  const safeId = Number.parseInt(String(id || ''), 10);
  const normalizedLanguageCode = String(languageCode || '').trim();

  if (!normalizedModelCode) {
    const error = new Error('缺少内容模型编码');
    error.statusCode = 400;
    throw error;
  }
  if (!Number.isFinite(safeId) || safeId <= 0) {
    const error = new Error('缺少内容 ID');
    error.statusCode = 400;
    throw error;
  }
  if (!normalizedLanguageCode) {
    const error = new Error('缺少语言编码');
    error.statusCode = 400;
    throw error;
  }

  return buildAiMentionContentItemContext({
    user,
    mention: {
      type: 'content',
      id: safeId,
      model_code: normalizedModelCode,
    },
    languageCode: normalizedLanguageCode,
  });
}

export function updateAiContentItemTranslationTitle({
  user,
  modelCode,
  id,
  languageCode = '',
  title,
} = {}) {
  assertAiServicePermission(user, ['write:content']);

  const normalizedModelCode = String(modelCode || '').trim();
  const safeId = Number.parseInt(String(id || ''), 10);
  const normalizedTitle = String(title || '').trim();
  const resolvedLanguageCode = resolveAiLanguageCode(languageCode);

  if (!normalizedModelCode) {
    const error = new Error('缺少内容模型编码');
    error.statusCode = 400;
    throw error;
  }
  if (!Number.isFinite(safeId) || safeId <= 0) {
    const error = new Error('缺少内容 ID');
    error.statusCode = 400;
    throw error;
  }
  if (!resolvedLanguageCode) {
    const error = new Error('缺少语言编码');
    error.statusCode = 400;
    throw error;
  }
  if (!normalizedTitle) {
    const error = new Error('标题不能为空');
    error.statusCode = 400;
    throw error;
  }

  const existing = getContentItemById(normalizedModelCode, safeId, {
    languageCode: resolvedLanguageCode,
    includeTranslations: true,
    includeTranslationStatuses: true,
  });
  if (!existing) {
    const error = new Error('内容不存在');
    error.statusCode = 404;
    throw error;
  }

  const previousTitle = String(
    existing.translations?.[resolvedLanguageCode]?.name
    || existing.translations?.[resolvedLanguageCode]?.title
    || existing.name
    || ''
  ).trim();

  const updated = updateContentItem(normalizedModelCode, safeId, {
    base: {
      column_id: existing.column_id,
    },
    translations: {
      [resolvedLanguageCode]: {
        name: normalizedTitle,
      },
    },
  });

  return {
    updated: true,
    model_code: normalizedModelCode,
    id: safeId,
    language_code: resolvedLanguageCode,
    previous_title: previousTitle,
    title: normalizedTitle,
    item: buildAiMentionContentItemContext({
      mention: {
        type: 'content',
        id: safeId,
        model_code: normalizedModelCode,
      },
      languageCode: resolvedLanguageCode,
    }) || updated,
  };
}

export function setAiContentItemImage({
  user,
  modelCode,
  id,
  assetId,
  replaceGallery = false,
  setAsPrimary = true,
} = {}) {
  assertAiServicePermission(user, ['write:content']);

  const normalizedModelCode = String(modelCode || '').trim();
  const safeId = Number.parseInt(String(id || ''), 10);
  const safeAssetId = Number.parseInt(String(assetId || ''), 10);
  if (!normalizedModelCode || !Number.isFinite(safeId) || safeId <= 0) {
    throw new Error('缺少有效的内容项');
  }
  if (!Number.isFinite(safeAssetId) || safeAssetId <= 0) {
    throw new Error('缺少有效的图片');
  }

  const asset = getMediaAssetById(safeAssetId);
  if (!asset?.file_exists || !String(asset.relative_path || '').startsWith('/uploads/images/')) {
    throw new Error('指定图片不存在或不是可用图片');
  }

  const item = getContentItemById(normalizedModelCode, safeId, {
    includeTranslations: true,
    includeTranslationStatuses: true,
  });
  if (!item) {
    throw new Error('内容不存在');
  }

  const currentImages = normalizeMentionImageList(item.images);
  const nextImages = replaceGallery
    ? [asset.relative_path]
    : [
      ...currentImages.filter((image) => image !== asset.relative_path),
      asset.relative_path,
    ];
  const updated = updateContentItem(normalizedModelCode, safeId, {
    base: {
      column_id: item.column_id,
      images: nextImages,
      ...(setAsPrimary ? { primary_image: asset.relative_path } : {}),
    },
  });

  return {
    updated: true,
    model_code: normalizedModelCode,
    id: safeId,
    image: asset.relative_path,
    images: nextImages,
    primary_image: setAsPrimary ? asset.relative_path : String(item.primary_image || nextImages[0] || ''),
    item: buildAiMentionContentItemContext({
      mention: { type: 'content', id: safeId, model_code: normalizedModelCode },
    }) || updated,
  };
}

function normalizeMentionImageList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed.map((item) => String(item || '').trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function buildAiMentionContentItemContext({ mention, languageCode }) {
  const modelCode = String(mention?.model_code || '').trim();
  const id = Number.parseInt(String(mention?.id || ''), 10);
  if (!modelCode || !Number.isFinite(id) || id <= 0) {
    return null;
  }

  const model = getContentModelByCode(modelCode);
  if (!model) {
    return null;
  }

  const item = getContentItemById(modelCode, id, {
    languageCode,
    includeTranslations: false,
    includeTranslationStatuses: true,
  });
  if (!item) {
    return null;
  }

  const fields = formatModelFieldsForAi(model.fields || []);
  const column = item.column_id ? getColumnById(item.column_id, { includeTranslations: true }) : null;
  const columnMap = new Map(listColumns({ includeTranslations: true }).map((columnItem) => [Number(columnItem.id), columnItem]));
  const columnPath = column ? buildColumnSlugPath(column, columnMap) : null;
  const detailUrl = column ? buildContentDetailUrlFromColumn(item, column, columnPath) : '';

  return {
    type: 'content',
    id: item.id,
    model: {
      code: model.code,
      name: model.name,
      fields,
    },
    column: column
      ? {
        id: column.id,
        name: column.name,
        model_code: column.model_code || '',
        route_path: column.route_path || '',
        dir_name: column.dir_name || '',
        detail_rule: column.detail_rule || '',
        detail_url: detailUrl,
      }
      : null,
    language: {
      requested_code: item.requested_language_code || languageCode || null,
      resolved_code: item.resolved_language_code || item.current_language_code || null,
      fallback_code: item.fallback_language_code || null,
      is_fallback: Boolean(item.is_language_fallback),
    },
    base: pickBaseFields(item, fields),
    translation: pickTranslationFields(item, fields),
    translation_statuses: Array.isArray(item.translation_statuses) ? item.translation_statuses : [],
  };
}

function formatModelFieldsForAi(fields) {
  return fields.map((field) => ({
    field_name: String(field.field_name || '').trim(),
    field_label: String(field.field_label || field.field_name || '').trim(),
    field_type: String(field.field_type || 'text').trim(),
    is_translatable: Number(field.is_translatable || 0) === 1,
    is_system: Number(field.is_system || 0) === 1,
  })).filter((field) => field.field_name);
}

function pickBaseFields(item, fields) {
  const baseFieldNames = new Set(
    fields
      .filter((field) => !field.is_translatable)
      .map((field) => field.field_name)
  );
  ['id', 'column_id', 'code', 'custom_url', 'images', 'primary_image', 'is_visible', 'is_featured_home', 'sort_order', 'created_at', 'updated_at']
    .forEach((fieldName) => baseFieldNames.add(fieldName));

  return pickFields(item, baseFieldNames);
}

function pickTranslationFields(item, fields) {
  const translationFieldNames = new Set(
    fields
      .filter((field) => field.is_translatable)
      .map((field) => field.field_name)
  );
  ['name', 'summary', 'content_html', 'template_data_json', 'template_data', 'seo_title', 'seo_description', 'publish_status']
    .forEach((fieldName) => translationFieldNames.add(fieldName));

  return pickFields(item, translationFieldNames);
}

function pickFields(source, fieldNames) {
  const output = {};
  fieldNames.forEach((fieldName) => {
    if (!fieldName || source[fieldName] === undefined) {
      return;
    }
    output[fieldName] = normalizeValueForAi(fieldName, source[fieldName]);
  });
  return output;
}

function normalizeValueForAi(fieldName, value) {
  if (value === null || value === undefined) {
    return value;
  }

  if (fieldName === 'content_html') {
    const html = String(value || '');
    return {
      html: truncateText(html, TEXT_FIELD_LIMITS.content_html),
      text_excerpt: truncateText(stripHtml(html), TEXT_FIELD_LIMITS.content_html),
      original_length: html.length,
      truncated: html.length > TEXT_FIELD_LIMITS.content_html,
    };
  }

  if (typeof value === 'string') {
    const limit = TEXT_FIELD_LIMITS[fieldName] || 2000;
    return truncateText(value, limit);
  }

  return value;
}

function truncateText(value, limit) {
  const text = String(value || '');
  const safeLimit = Math.max(Number(limit) || 2000, 100);
  if (text.length <= safeLimit) {
    return text;
  }
  return `${text.slice(0, safeLimit)}...`;
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveAiLanguageCode(value) {
  const languages = listLanguages();
  const defaultLanguage = getDefaultLanguage() || languages[0] || null;
  const raw = String(value || '').trim();
  if (!raw) {
    return defaultLanguage?.code || '';
  }

  const normalized = raw.toLowerCase();
  const exact = languages.find((language) => String(language.code || '').toLowerCase() === normalized);
  if (exact) {
    return exact.code;
  }

  const byName = languages.find((language) => {
    const name = String(language.name || '').toLowerCase();
    const nativeName = String(language.native_name || '').toLowerCase();
    return name === normalized || nativeName === normalized;
  });
  if (byName) {
    return byName.code;
  }

  const error = new Error(`语言不存在：${raw}。可用语言：${languages.map((language) => `${language.code}(${language.name || language.native_name || ''})`).join(', ')}`);
  error.statusCode = 400;
  throw error;
}
