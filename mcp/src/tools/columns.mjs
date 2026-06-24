import { z } from 'zod';

const COLUMN_BASE_FIELD_NAMES = new Set([
  'name',
  'parent_id',
  'column_type',
  'custom_url',
  'route_path',
  'content_model_id',
  'dir_name',
  'images',
  'detail_rule',
  'is_visible',
  'sort_order'
]);

const COLUMN_TRANSLATION_FIELD_NAMES = new Set([
  'name',
  'summary',
  'content_html',
  'template_data_json',
  'template_data',
  'seo_title',
  'seo_description',
  'publish_status'
]);

const listColumnsSchema = {
  languageCode: z.string().trim().optional(),
  includeTranslations: z.boolean().optional()
};

const getColumnSchema = {
  id: z.union([z.number().int().positive(), z.string().trim().min(1)]),
  languageCode: z.string().trim().optional(),
  includeTranslations: z.boolean().optional()
};

const createManualColumnSchema = {
  payload: z.record(z.any())
};

const updateColumnSchema = {
  id: z.union([z.number().int().positive(), z.string().trim().min(1)]),
  payload: z.record(z.any())
};

function normalizeBoolean(value) {
  return value ? 'true' : undefined;
}

function buildToolResult(response, meta = {}) {
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        ...response,
        mcp_meta: meta
      }, null, 2)
    }]
  };
}

function sanitizeTranslations(translations) {
  const output = {};
  const ignoredTranslations = {};

  for (const [languageCode, translation] of Object.entries(translations || {})) {
    const sanitizedTranslation = {};
    const ignoredFields = [];

    for (const [key, value] of Object.entries(translation || {})) {
      if (!COLUMN_TRANSLATION_FIELD_NAMES.has(key)) {
        ignoredFields.push(key);
        continue;
      }
      sanitizedTranslation[key] = value;
    }

    output[languageCode] = sanitizedTranslation;
    if (ignoredFields.length > 0) {
      ignoredTranslations[languageCode] = ignoredFields;
    }
  }

  return {
    output,
    ignoredTranslations
  };
}

function sanitizeColumnPayload(payload) {
  const baseInput = payload?.base || payload || {};
  const sanitizedBase = {};
  const ignoredBaseFields = [];

  for (const [key, value] of Object.entries(baseInput || {})) {
    if (!COLUMN_BASE_FIELD_NAMES.has(key)) {
      ignoredBaseFields.push(key);
      continue;
    }
    sanitizedBase[key] = value;
  }

  const { output: translations, ignoredTranslations } = sanitizeTranslations(payload?.translations || {});

  return {
    payload: {
      ...(payload?.base || payload?.translations ? payload : {}),
      base: sanitizedBase,
      translations
    },
    ignoredBaseFields,
    ignoredTranslationFields: ignoredTranslations,
    supportedBaseFields: Array.from(COLUMN_BASE_FIELD_NAMES).sort(),
    supportedTranslationFields: Array.from(COLUMN_TRANSLATION_FIELD_NAMES).sort()
  };
}

export function registerColumnsTools(server, cmsClient) {
  server.registerTool(
    'list_columns',
    {
      title: 'List Columns',
      description: 'List CMS columns with optional language and translation data.',
      inputSchema: listColumnsSchema
    },
    async ({ languageCode, includeTranslations }) => {
      const response = await cmsClient.get('/api/columns', {
        query: {
          language: languageCode,
          includeTranslations: normalizeBoolean(includeTranslations)
        }
      });
      return buildToolResult(response);
    }
  );

  server.registerTool(
    'get_column',
    {
      title: 'Get Column',
      description: 'Get one CMS column by id.',
      inputSchema: getColumnSchema
    },
    async ({ id, languageCode, includeTranslations }) => {
      const response = await cmsClient.get(`/api/columns/${id}`, {
        query: {
          language: languageCode,
          includeTranslations: normalizeBoolean(includeTranslations)
        }
      });
      return buildToolResult(response);
    }
  );

  server.registerTool(
    'create_manual_column',
    {
      title: 'Create Manual Column',
      description: 'Create a manual CMS column using the existing columns API.',
      inputSchema: createManualColumnSchema
    },
    async ({ payload }) => {
      const sanitized = sanitizeColumnPayload(payload);
      const response = await cmsClient.post('/api/columns', { body: sanitized.payload });
      return buildToolResult(response, {
        ignored_base_fields: sanitized.ignoredBaseFields,
        ignored_translation_fields: sanitized.ignoredTranslationFields,
        supported_base_fields: sanitized.supportedBaseFields,
        supported_translation_fields: sanitized.supportedTranslationFields
      });
    }
  );

  server.registerTool(
    'update_column',
    {
      title: 'Update Column',
      description: 'Update a CMS column by id using the existing columns API.',
      inputSchema: updateColumnSchema
    },
    async ({ id, payload }) => {
      const sanitized = sanitizeColumnPayload(payload);
      const response = await cmsClient.put(`/api/columns/${id}`, { body: sanitized.payload });
      return buildToolResult(response, {
        ignored_base_fields: sanitized.ignoredBaseFields,
        ignored_translation_fields: sanitized.ignoredTranslationFields,
        supported_base_fields: sanitized.supportedBaseFields,
        supported_translation_fields: sanitized.supportedTranslationFields
      });
    }
  );
}
