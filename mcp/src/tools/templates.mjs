import { z } from 'zod';
import { buildToolResult } from './result-utils.mjs';

const templateIdField = z.union([z.number().int().positive(), z.string().trim().min(1)]);
const versionIdField = z.union([z.number().int().positive(), z.string().trim().min(1)]);
const templateTypeField = z.enum(['home', 'list', 'content', 'single', 'component']);

const listTemplatesSchema = {
  type: templateTypeField.optional(),
  themeId: z.number().int().positive().optional()
};

const getTemplateSchema = {
  id: templateIdField,
  includeHeavyFields: z.boolean().optional()
};

const createTemplateSchema = {
  payload: z.record(z.any())
};

const updateTemplateSchema = {
  id: templateIdField,
  payload: z.record(z.any())
};

const publishTemplateSchema = {
  id: templateIdField,
  note: z.string().trim().optional()
};

const listTemplateVersionsSchema = {
  templateId: templateIdField,
  includeHeavyFields: z.boolean().optional()
};

const getTemplateVersionSchema = {
  templateId: templateIdField,
  versionId: versionIdField,
  includeHeavyFields: z.boolean().optional()
};

const restoreTemplateVersionSchema = {
  templateId: templateIdField,
  versionId: versionIdField
};

const getTemplateDependenciesSchema = {
  id: templateIdField
};

const deleteTemplateSchema = {
  id: templateIdField
};

const previewModeField = z.enum(['auto', 'home', 'list', 'content', 'single']);

const previewTemplateSchema = {
  payload: z.record(z.any()),
  includeFullHtml: z.boolean().optional()
};

const CREATE_TEMPLATE_FIELD_NAMES = new Set([
  'theme_id',
  'name',
  'type',
  'code',
  'engine',
  'tsx_source',
  'css_source',
  'status',
  'sort_order'
]);

const UPDATE_TEMPLATE_FIELD_NAMES = new Set([
  'theme_id',
  'name',
  'type',
  'code',
  'engine',
  'tsx_source',
  'css_source',
  'sort_order'
]);

const PREVIEW_TEMPLATE_FIELD_NAMES = new Set([
  'theme_id',
  'name',
  'type',
  'code',
  'engine',
  'tsx_source',
  'css_source',
  'status',
  'sort_order',
  'preview_context'
]);

function sanitizeTemplatePayload(payload, supportedFieldNames) {
  const sanitizedPayload = {};
  const ignoredFields = [];

  for (const [key, value] of Object.entries(payload || {})) {
    if (!supportedFieldNames.has(key)) {
      ignoredFields.push(key);
      continue;
    }
    sanitizedPayload[key] = value;
  }

  return {
    payload: sanitizedPayload,
    ignoredFields,
    supportedFields: Array.from(supportedFieldNames).sort()
  };
}

function sanitizePreviewTemplatePayload(payload) {
  const baseSanitized = sanitizeTemplatePayload(payload, PREVIEW_TEMPLATE_FIELD_NAMES);
  const previewContext = payload?.preview_context;

  if (previewContext && typeof previewContext === 'object') {
    const modeResult = previewModeField.safeParse(previewContext.mode ?? 'auto');
    baseSanitized.payload.preview_context = {
      mode: modeResult.success ? modeResult.data : 'auto'
    };
  }

  return baseSanitized;
}

function findTemplateVersion(versionsResponse, versionId) {
  const versions = Array.isArray(versionsResponse?.data) ? versionsResponse.data : [];
  const targetVersionId = String(versionId);
  return versions.find((item) => String(item?.id) === targetVersionId) || null;
}

export function registerTemplateTools(server, cmsClient) {
  server.registerTool(
    'list_templates',
    {
      title: 'List Templates',
      description: 'List CMS templates from the database-backed template source.',
      inputSchema: listTemplatesSchema
    },
    async ({ type, themeId }) => {
      const response = await cmsClient.get('/api/templates', {
        query: {
          type,
          theme_id: themeId
        }
      });
      return buildToolResult(response, {}, 'template');
    }
  );

  server.registerTool(
    'get_template',
    {
      title: 'Get Template',
      description: 'Get one CMS template by id. Set includeHeavyFields=true to include template source.',
      inputSchema: getTemplateSchema
    },
    async ({ id, includeHeavyFields }) => {
      const response = await cmsClient.get(`/api/templates/${id}`);
      return buildToolResult(response, {}, 'template', {
        summary: !includeHeavyFields
      });
    }
  );

  server.registerTool(
    'create_template',
    {
      title: 'Create Template',
      description: 'Create one CMS template using the existing template API.',
      inputSchema: createTemplateSchema
    },
    async ({ payload }) => {
      const sanitized = sanitizeTemplatePayload(payload, CREATE_TEMPLATE_FIELD_NAMES);
      const response = await cmsClient.post('/api/templates', {
        body: sanitized.payload
      });
      return buildToolResult(response, {
        ignored_fields: sanitized.ignoredFields,
        supported_fields: sanitized.supportedFields
      }, 'template');
    }
  );

  server.registerTool(
    'update_template',
    {
      title: 'Update Template',
      description: 'Update one CMS template by id using the existing template API.',
      inputSchema: updateTemplateSchema
    },
    async ({ id, payload }) => {
      const sanitized = sanitizeTemplatePayload(payload, UPDATE_TEMPLATE_FIELD_NAMES);
      const response = await cmsClient.put(`/api/templates/${id}`, {
        body: sanitized.payload
      });
      return buildToolResult(response, {
        ignored_fields: sanitized.ignoredFields,
        supported_fields: sanitized.supportedFields
      }, 'template');
    }
  );

  server.registerTool(
    'preview_template',
    {
      title: 'Preview Template',
      description: 'Render one CMS template through the existing preview pipeline. Set includeFullHtml=true to return full preview HTML.',
      inputSchema: previewTemplateSchema
    },
    async ({ payload, includeFullHtml }) => {
      const sanitized = sanitizePreviewTemplatePayload(payload);
      const response = await cmsClient.post('/api/templates/preview', {
        body: sanitized.payload
      });
      return buildToolResult(response, {
        ignored_fields: sanitized.ignoredFields,
        supported_fields: sanitized.supportedFields
      }, 'template-preview', {
        summary: !includeFullHtml
      });
    }
  );

  server.registerTool(
    'publish_template',
    {
      title: 'Publish Template',
      description: 'Publish one CMS template and create a template version snapshot.',
      inputSchema: publishTemplateSchema
    },
    async ({ id, note }) => {
      const response = await cmsClient.post(`/api/templates/${id}/publish`, {
        body: note ? { note } : {}
      });
      return buildToolResult(response, {
        dangerous_operation: true,
        creates_version_snapshot: true
      }, 'template');
    }
  );

  server.registerTool(
    'list_template_versions',
    {
      title: 'List Template Versions',
      description: 'List version history for one CMS template. Set includeHeavyFields=true to include source.',
      inputSchema: listTemplateVersionsSchema
    },
    async ({ templateId, includeHeavyFields }) => {
      const response = await cmsClient.get(`/api/templates/${templateId}/versions`);
      return buildToolResult(response, {}, 'template-version', {
        summary: !includeHeavyFields
      });
    }
  );

  server.registerTool(
    'get_template_version',
    {
      title: 'Get Template Version',
      description: 'Get one template version by version id. Uses existing template version history API.',
      inputSchema: getTemplateVersionSchema
    },
    async ({ templateId, versionId, includeHeavyFields }) => {
      const response = await cmsClient.get(`/api/templates/${templateId}/versions`);
      const version = findTemplateVersion(response, versionId);
      if (!version) {
        throw new Error('模板版本不存在');
      }
      return buildToolResult({
        success: true,
        data: version
      }, {}, 'template-version', {
        summary: !includeHeavyFields
      });
    }
  );

  server.registerTool(
    'restore_template_version',
    {
      title: 'Restore Template Version',
      description: 'Restore one template version and publish it immediately.',
      inputSchema: restoreTemplateVersionSchema
    },
    async ({ templateId, versionId }) => {
      const response = await cmsClient.post(`/api/templates/${templateId}/versions/${versionId}/restore`);
      return buildToolResult(response, {
        dangerous_operation: true,
        publishes_template: true
      }, 'template');
    }
  );

  server.registerTool(
    'get_template_dependencies',
    {
      title: 'Get Template Dependencies',
      description: 'Get component references, reverse references and bindings for one template.',
      inputSchema: getTemplateDependenciesSchema
    },
    async ({ id }) => {
      const response = await cmsClient.get(`/api/templates/${id}/dependencies`);
      return buildToolResult(response, {}, 'template-dependency');
    }
  );

  server.registerTool(
    'delete_template',
    {
      title: 'Delete Template',
      description: 'Delete one CMS template by id.',
      inputSchema: deleteTemplateSchema
    },
    async ({ id }) => {
      const response = await cmsClient.delete(`/api/templates/${id}`);
      return buildToolResult(response, {
        dangerous_operation: true
      }, 'template');
    }
  );
}
