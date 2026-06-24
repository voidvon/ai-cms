import { z } from 'zod';

const buildStaticSchema = {
  section: z.string().trim().optional(),
  language: z.string().trim().optional()
};

export function registerBuildTools(server, cmsClient) {
  server.registerTool(
    'build_static',
    {
      title: 'Build Static Site',
      description: 'Trigger the existing CMS static generation endpoint.',
      inputSchema: buildStaticSchema
    },
    async ({ section, language }) => {
      const response = await cmsClient.post('/admin/build/generate', {
        query: {
          section,
          language
        },
        body: {}
      });
      return { content: [{ type: 'text', text: JSON.stringify(response, null, 2) }] };
    }
  );
}
