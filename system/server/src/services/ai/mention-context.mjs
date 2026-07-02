import { getColumnById, listColumns } from '../columns.mjs';
import { buildColumnSlugPath, buildContentDetailUrlFromColumn } from '../column-paths.mjs';
import { getContentItemById } from '../content-items.mjs';
import { getContentModelByCode } from '../content-models.mjs';
import { getDefaultLanguage } from '../languages.mjs';
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

  if (!contentMentions.length) {
    return {
      content_items: [],
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
