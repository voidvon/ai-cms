import { z } from 'zod';
import { buildToolResult } from './result-utils.mjs';

const modelCodeField = z.string().trim().min(1);
const itemIdField = z.union([z.number().int().positive(), z.string().trim().min(1)]);
const MAIN_FIELD_NAMES = new Set([
  'column_id',
  'custom_url',
  'code',
  'images',
  'primary_image',
  'is_visible',
  'is_featured_home',
  'sort_order',
  'created_at'
]);

const searchContentItemsSchema = {
  modelCode: modelCodeField,
  page: z.number().int().positive().optional(),
  limit: z.number().int().positive().max(200).optional(),
  columnId: z.number().int().positive().optional(),
  includeDescendants: z.boolean().optional(),
  languageCode: z.string().trim().optional()
};

const getContentItemSchema = {
  modelCode: modelCodeField,
  id: itemIdField,
  languageCode: z.string().trim().optional(),
  includeTranslations: z.boolean().optional()
};

const createContentItemSchema = {
  modelCode: modelCodeField,
  payload: z.record(z.any())
};

const updateContentItemSchema = {
  modelCode: modelCodeField,
  id: itemIdField,
  payload: z.record(z.any())
};

const deleteContentItemSchema = {
  modelCode: modelCodeField,
  id: itemIdField
};

function normalizeBoolean(value) {
  return value ? 'true' : undefined;
}

function getSupportedMainFieldNames(fieldsPayload) {
  const fields = Array.isArray(fieldsPayload?.data) ? fieldsPayload.data : [];
  return new Set(
    fields
      .filter((field) => field && field.is_translatable === 0 && MAIN_FIELD_NAMES.has(String(field.field_name || '')))
      .map((field) => String(field.field_name || ''))
  );
}

function buildSanitizedBase(baseInput, supportedMainFieldNames) {
  const output = {};
  const ignoredFields = [];
  for (const [key, value] of Object.entries(baseInput || {})) {
    if (!supportedMainFieldNames.has(key)) {
      ignoredFields.push(key);
      continue;
    }
    output[key] = value;
  }
  return {
    output,
    ignoredFields
  };
}

async function sanitizeContentPayload(cmsClient, modelCode, payload) {
  const modelResponse = await cmsClient.get('/api/content-models');
  const models = Array.isArray(modelResponse?.data) ? modelResponse.data : [];
  const model = models.find((item) => String(item?.code || '') === String(modelCode));
  if (!model?.id) {
    throw new Error(`Content model not found for code: ${modelCode}`);
  }

  const fieldsResponse = await cmsClient.get(`/api/content-models/${model.id}/fields`);
  const supportedMainFieldNames = getSupportedMainFieldNames(fieldsResponse);
  const baseInput = payload?.base || payload || {};
  const { output: sanitizedBase, ignoredFields } = buildSanitizedBase(baseInput, supportedMainFieldNames);

  return {
    payload: {
      ...(payload?.base || payload?.translations ? payload : {}),
      base: sanitizedBase,
      translations: payload?.translations || {}
    },
    ignoredBaseFields: ignoredFields,
    supportedBaseFields: Array.from(supportedMainFieldNames).sort()
  };
}

export function registerContentItemTools(server, cmsClient) {
  server.registerTool(
    'search_content_items',
    {
      title: 'Search Content Items',
      description: 'List content items for a content model through the admin API.',
      inputSchema: searchContentItemsSchema
    },
    async ({ modelCode, page, limit, columnId, includeDescendants, languageCode }) => {
      const response = await cmsClient.get(`/api/content-items/${modelCode}/admin`, {
        query: {
          page,
          limit,
          columnId,
          includeDescendants: normalizeBoolean(includeDescendants),
          language: languageCode
        }
      });
      return buildToolResult(response, {}, 'content-item');
    }
  );

  server.registerTool(
    'get_content_item',
    {
      title: 'Get Content Item',
      description: 'Get one CMS content item by model code and item id.',
      inputSchema: getContentItemSchema
    },
    async ({ modelCode, id, languageCode, includeTranslations }) => {
      const response = await cmsClient.get(`/api/content-items/${modelCode}/${id}`, {
        query: {
          language: languageCode,
          includeTranslations: normalizeBoolean(includeTranslations)
        }
      });
      return buildToolResult(response, {}, 'content-item');
    }
  );

  server.registerTool(
    'create_content_item',
    {
      title: 'Create Content Item',
      description: 'Create one CMS content item using the existing content item API.',
      inputSchema: createContentItemSchema
    },
    async ({ modelCode, payload }) => {
      const sanitized = await sanitizeContentPayload(cmsClient, modelCode, payload);
      const response = await cmsClient.post(`/api/content-items/${modelCode}`, { body: sanitized.payload });
      return buildToolResult(response, {
        ignored_base_fields: sanitized.ignoredBaseFields,
        supported_base_fields: sanitized.supportedBaseFields
      }, 'content-item');
    }
  );

  server.registerTool(
    'update_content_item',
    {
      title: 'Update Content Item',
      description: 'Update one CMS content item using the existing content item API.',
      inputSchema: updateContentItemSchema
    },
    async ({ modelCode, id, payload }) => {
      const sanitized = await sanitizeContentPayload(cmsClient, modelCode, payload);
      const response = await cmsClient.put(`/api/content-items/${modelCode}/${id}`, { body: sanitized.payload });
      return buildToolResult(response, {
        ignored_base_fields: sanitized.ignoredBaseFields,
        supported_base_fields: sanitized.supportedBaseFields
      }, 'content-item');
    }
  );

  server.registerTool(
    'delete_content_item',
    {
      title: 'Delete Content Item',
      description: 'Delete one CMS content item using the existing content item API.',
      inputSchema: deleteContentItemSchema
    },
    async ({ modelCode, id }) => {
      const response = await cmsClient.delete(`/api/content-items/${modelCode}/${id}`);
      return buildToolResult(response);
    }
  );
}
