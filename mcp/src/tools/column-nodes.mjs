import { z } from 'zod';
import { buildToolResult } from './result-utils.mjs';

const COLUMN_NODE_BASE_FIELD_NAMES = new Set([
  'parent_id',
  'dir_name',
  'detail_rule',
  'sort_order',
  'is_visible'
]);

const COLUMN_NODE_FLAT_FIELD_NAMES = new Set([
  'name',
  'summary',
  'content_html',
  'seo_title',
  'seo_description',
  'publish_status',
  'dir_name',
  'detail_rule',
  'sort_order',
  'parent_id',
  'is_visible'
]);

const COLUMN_NODE_TRANSLATION_FIELD_NAMES = new Set([
  'name',
  'summary',
  'content_html',
  'seo_title',
  'seo_description',
  'publish_status'
]);

const rootColumnIdField = z.number().int().positive();
const nodeIdField = z.union([z.number().int().positive(), z.string().trim().min(1)]);

const listColumnNodesSchema = {
  rootColumnId: rootColumnIdField,
  parentId: z.number().int().min(0).optional(),
  page: z.number().int().positive().optional(),
  limit: z.number().int().positive().max(200).optional(),
  languageCode: z.string().trim().optional()
};

const listColumnNodeOptionsSchema = {
  rootColumnId: rootColumnIdField,
  languageCode: z.string().trim().optional()
};

const getColumnNodeSchema = {
  rootColumnId: rootColumnIdField,
  id: nodeIdField,
  languageCode: z.string().trim().optional(),
  includeTranslations: z.boolean().optional()
};

const createColumnNodeSchema = {
  rootColumnId: rootColumnIdField,
  payload: z.record(z.any())
};

const updateColumnNodeSchema = {
  rootColumnId: rootColumnIdField,
  id: nodeIdField,
  payload: z.record(z.any())
};

const deleteColumnNodeSchema = {
  rootColumnId: rootColumnIdField,
  id: nodeIdField
};

function normalizeBoolean(value) {
  return value ? 'true' : undefined;
}

function sanitizeTranslations(translations) {
  const output = {};
  const ignoredTranslations = {};

  for (const [languageCode, translation] of Object.entries(translations || {})) {
    const sanitizedTranslation = {};
    const ignoredFields = [];

    for (const [key, value] of Object.entries(translation || {})) {
      if (!COLUMN_NODE_TRANSLATION_FIELD_NAMES.has(key)) {
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

function sanitizeColumnNodePayload(payload) {
  const hasStructuredPayload = Boolean(payload?.base || payload?.translations);
  const baseInput = payload?.base || {};
  const sanitizedBase = {};
  const ignoredBaseFields = [];

  for (const [key, value] of Object.entries(baseInput || {})) {
    if (!COLUMN_NODE_BASE_FIELD_NAMES.has(key)) {
      ignoredBaseFields.push(key);
      continue;
    }
    sanitizedBase[key] = value;
  }

  const { output: translations, ignoredTranslations } = sanitizeTranslations(payload?.translations || {});
  const passthroughFlatFields = {};
  const ignoredFlatFields = [];

  if (!hasStructuredPayload) {
    for (const [key, value] of Object.entries(payload || {})) {
      if (!COLUMN_NODE_FLAT_FIELD_NAMES.has(key)) {
        ignoredFlatFields.push(key);
        continue;
      }
      passthroughFlatFields[key] = value;
    }
  }

  return {
    payload: hasStructuredPayload
      ? {
          ...payload,
          base: sanitizedBase,
          translations
        }
      : passthroughFlatFields,
    ignoredBaseFields,
    ignoredFlatFields,
    ignoredTranslationFields: ignoredTranslations,
    supportedBaseFields: Array.from(COLUMN_NODE_BASE_FIELD_NAMES).sort(),
    supportedFlatFields: Array.from(COLUMN_NODE_FLAT_FIELD_NAMES).sort(),
    supportedTranslationFields: Array.from(COLUMN_NODE_TRANSLATION_FIELD_NAMES).sort()
  };
}

export function registerColumnNodeTools(server, cmsClient) {
  server.registerTool(
    'list_column_nodes',
    {
      title: 'List Column Nodes',
      description: 'List column nodes under one root column through the admin API.',
      inputSchema: listColumnNodesSchema
    },
    async ({ rootColumnId, parentId, page, limit, languageCode }) => {
      const response = await cmsClient.get('/api/column-nodes/admin', {
        query: {
          rootColumnId,
          parentId,
          page,
          limit,
          language: languageCode
        }
      });
      return buildToolResult(response, {}, 'column');
    }
  );

  server.registerTool(
    'list_column_node_options',
    {
      title: 'List Column Node Options',
      description: 'List selectable column node options under one root column.',
      inputSchema: listColumnNodeOptionsSchema
    },
    async ({ rootColumnId, languageCode }) => {
      const response = await cmsClient.get('/api/column-nodes/options', {
        query: {
          rootColumnId,
          language: languageCode
        }
      });
      return buildToolResult(response, {}, 'column');
    }
  );

  server.registerTool(
    'get_column_node',
    {
      title: 'Get Column Node',
      description: 'Get one column node by root column id and node id.',
      inputSchema: getColumnNodeSchema
    },
    async ({ rootColumnId, id, languageCode, includeTranslations }) => {
      const response = await cmsClient.get(`/api/column-nodes/${id}`, {
        query: {
          rootColumnId,
          language: languageCode,
          includeTranslations: normalizeBoolean(includeTranslations)
        }
      });
      return buildToolResult(response, {}, 'column');
    }
  );

  server.registerTool(
    'create_column_node',
    {
      title: 'Create Column Node',
      description: 'Create one column node under a root column.',
      inputSchema: createColumnNodeSchema
    },
    async ({ rootColumnId, payload }) => {
      const sanitized = sanitizeColumnNodePayload(payload);
      const response = await cmsClient.post('/api/column-nodes', {
        query: { rootColumnId },
        body: sanitized.payload
      });
      return buildToolResult(response, {
        ignored_base_fields: sanitized.ignoredBaseFields,
        ignored_flat_fields: sanitized.ignoredFlatFields,
        ignored_translation_fields: sanitized.ignoredTranslationFields,
        supported_base_fields: sanitized.supportedBaseFields,
        supported_flat_fields: sanitized.supportedFlatFields,
        supported_translation_fields: sanitized.supportedTranslationFields
      }, 'column');
    }
  );

  server.registerTool(
    'update_column_node',
    {
      title: 'Update Column Node',
      description: 'Update one column node under a root column.',
      inputSchema: updateColumnNodeSchema
    },
    async ({ rootColumnId, id, payload }) => {
      const sanitized = sanitizeColumnNodePayload(payload);
      const response = await cmsClient.put(`/api/column-nodes/${id}`, {
        query: { rootColumnId },
        body: sanitized.payload
      });
      return buildToolResult(response, {
        ignored_base_fields: sanitized.ignoredBaseFields,
        ignored_flat_fields: sanitized.ignoredFlatFields,
        ignored_translation_fields: sanitized.ignoredTranslationFields,
        supported_base_fields: sanitized.supportedBaseFields,
        supported_flat_fields: sanitized.supportedFlatFields,
        supported_translation_fields: sanitized.supportedTranslationFields
      }, 'column');
    }
  );

  server.registerTool(
    'delete_column_node',
    {
      title: 'Delete Column Node',
      description: 'Delete one column node under a root column.',
      inputSchema: deleteColumnNodeSchema
    },
    async ({ rootColumnId, id }) => {
      const response = await cmsClient.delete(`/api/column-nodes/${id}`, {
        query: { rootColumnId }
      });
      return buildToolResult(response, {
        dangerous_operation: true
      });
    }
  );
}
