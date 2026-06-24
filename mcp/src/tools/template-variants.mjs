import { z } from 'zod';
import { buildToolResult } from './result-utils.mjs';

const variantIdField = z.union([z.number().int().positive(), z.string().trim().min(1)]);

const createTemplateVariantSchema = {
  payload: z.record(z.any())
};

const updateTemplateVariantSchema = {
  id: variantIdField,
  payload: z.record(z.any())
};

const selectTemplateVariantSchema = {
  id: variantIdField
};

const deleteTemplateVariantSchema = {
  id: variantIdField
};

const TEMPLATE_VARIANT_FIELD_NAMES = new Set([
  'template_name',
  'is_selected',
  'source_theme_id'
]);

function sanitizeTemplateVariantPayload(payload) {
  const sanitizedPayload = {};
  const ignoredFields = [];

  for (const [key, value] of Object.entries(payload || {})) {
    if (!TEMPLATE_VARIANT_FIELD_NAMES.has(key)) {
      ignoredFields.push(key);
      continue;
    }
    sanitizedPayload[key] = value;
  }

  return {
    payload: sanitizedPayload,
    ignoredFields,
    supportedFields: Array.from(TEMPLATE_VARIANT_FIELD_NAMES).sort()
  };
}

export function registerTemplateVariantTools(server, cmsClient) {
  server.registerTool(
    'list_template_variants',
    {
      title: 'List Template Variants',
      description: 'List CMS template variants with their attached templates.',
      inputSchema: {}
    },
    async () => {
      const response = await cmsClient.get('/api/template-variants');
      return buildToolResult(response, {}, 'template-variant');
    }
  );

  server.registerTool(
    'get_selected_template_variant',
    {
      title: 'Get Selected Template Variant',
      description: 'Get the currently selected template variant.',
      inputSchema: {}
    },
    async () => {
      const response = await cmsClient.get('/api/template-variants/selected');
      return buildToolResult(response, {}, 'template-variant');
    }
  );

  server.registerTool(
    'get_template_variant',
    {
      title: 'Get Template Variant',
      description: 'Get one template variant by id.',
      inputSchema: {
        id: variantIdField
      }
    },
    async ({ id }) => {
      const response = await cmsClient.get(`/api/template-variants/${id}`);
      return buildToolResult(response, {}, 'template-variant');
    }
  );

  server.registerTool(
    'create_template_variant',
    {
      title: 'Create Template Variant',
      description: 'Create one template variant and optionally clone from a source theme.',
      inputSchema: createTemplateVariantSchema
    },
    async ({ payload }) => {
      const sanitized = sanitizeTemplateVariantPayload(payload);
      const response = await cmsClient.post('/api/template-variants', { body: sanitized.payload });
      return buildToolResult(response, {
        ignored_fields: sanitized.ignoredFields,
        supported_fields: sanitized.supportedFields
      }, 'template-variant');
    }
  );

  server.registerTool(
    'update_template_variant',
    {
      title: 'Update Template Variant',
      description: 'Update one template variant by id.',
      inputSchema: updateTemplateVariantSchema
    },
    async ({ id, payload }) => {
      const sanitized = sanitizeTemplateVariantPayload(payload);
      const response = await cmsClient.put(`/api/template-variants/${id}`, { body: sanitized.payload });
      return buildToolResult(response, {
        ignored_fields: sanitized.ignoredFields,
        supported_fields: sanitized.supportedFields
      }, 'template-variant');
    }
  );

  server.registerTool(
    'select_template_variant',
    {
      title: 'Select Template Variant',
      description: 'Select one template variant and trigger static rebuild on the CMS.',
      inputSchema: selectTemplateVariantSchema
    },
    async ({ id }) => {
      const response = await cmsClient.post(`/api/template-variants/${id}/select`);
      return buildToolResult(response, {
        dangerous_operation: true,
        triggers_static_rebuild: true
      }, 'template-variant');
    }
  );

  server.registerTool(
    'delete_template_variant',
    {
      title: 'Delete Template Variant',
      description: 'Delete one template variant by id.',
      inputSchema: deleteTemplateVariantSchema
    },
    async ({ id }) => {
      const response = await cmsClient.delete(`/api/template-variants/${id}`);
      return buildToolResult(response, {
        dangerous_operation: true
      }, 'template-variant');
    }
  );
}
