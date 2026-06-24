import { z } from 'zod';

const bindingIdField = z.union([z.number().int().positive(), z.string().trim().min(1)]);

const listTemplateBindingsSchema = {
  themeId: z.number().int().positive().optional()
};

const upsertTemplateBindingSchema = {
  payload: z.record(z.any())
};

const deleteTemplateBindingSchema = {
  id: bindingIdField
};

const TEMPLATE_BINDING_FIELD_NAMES = new Set([
  'theme_id',
  'target_type',
  'target_id',
  'template_type',
  'template_id'
]);

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

function sanitizeTemplateBindingPayload(payload) {
  const sanitizedPayload = {};
  const ignoredFields = [];

  for (const [key, value] of Object.entries(payload || {})) {
    if (!TEMPLATE_BINDING_FIELD_NAMES.has(key)) {
      ignoredFields.push(key);
      continue;
    }
    sanitizedPayload[key] = value;
  }

  return {
    payload: sanitizedPayload,
    ignoredFields,
    supportedFields: Array.from(TEMPLATE_BINDING_FIELD_NAMES).sort()
  };
}

export function registerTemplateBindingTools(server, cmsClient) {
  server.registerTool(
    'list_template_bindings',
    {
      title: 'List Template Bindings',
      description: 'List template bindings, optionally filtered by theme id.',
      inputSchema: listTemplateBindingsSchema
    },
    async ({ themeId }) => {
      const response = await cmsClient.get('/api/template-bindings', {
        query: {
          theme_id: themeId
        }
      });
      return buildToolResult(response);
    }
  );

  server.registerTool(
    'upsert_template_binding',
    {
      title: 'Upsert Template Binding',
      description: 'Create or update one template binding.',
      inputSchema: upsertTemplateBindingSchema
    },
    async ({ payload }) => {
      const sanitized = sanitizeTemplateBindingPayload(payload);
      const response = await cmsClient.put('/api/template-bindings', {
        body: sanitized.payload
      });
      return buildToolResult(response, {
        ignored_fields: sanitized.ignoredFields,
        supported_fields: sanitized.supportedFields
      });
    }
  );

  server.registerTool(
    'delete_template_binding',
    {
      title: 'Delete Template Binding',
      description: 'Delete one template binding by id.',
      inputSchema: deleteTemplateBindingSchema
    },
    async ({ id }) => {
      const response = await cmsClient.delete(`/api/template-bindings/${id}`);
      return buildToolResult(response, {
        dangerous_operation: true
      });
    }
  );
}
