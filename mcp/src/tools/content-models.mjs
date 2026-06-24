import { z } from 'zod';
import { buildToolResult } from './result-utils.mjs';

const getContentModelSchema = {
  id: z.union([z.number().int().positive(), z.string().trim().min(1)])
};

const getModelFieldsSchema = {
  id: z.union([z.number().int().positive(), z.string().trim().min(1)])
};

export function registerContentModelTools(server, cmsClient) {
  server.registerTool(
    'list_content_models',
    {
      title: 'List Content Models',
      description: 'List all CMS content models.',
      inputSchema: {}
    },
    async () => {
      const response = await cmsClient.get('/api/content-models');
      return buildToolResult(response);
    }
  );

  server.registerTool(
    'get_content_model',
    {
      title: 'Get Content Model',
      description: 'Get one CMS content model by id.',
      inputSchema: getContentModelSchema
    },
    async ({ id }) => {
      const response = await cmsClient.get(`/api/content-models/${id}`);
      return buildToolResult(response);
    }
  );

  server.registerTool(
    'get_model_fields',
    {
      title: 'Get Model Fields',
      description: 'Get field definitions for one CMS content model.',
      inputSchema: getModelFieldsSchema
    },
    async ({ id }) => {
      const response = await cmsClient.get(`/api/content-models/${id}/fields`);
      return buildToolResult(response);
    }
  );
}
