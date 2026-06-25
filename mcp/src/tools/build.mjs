import { z } from 'zod';
import { buildToolResult } from './result-utils.mjs';

const buildStaticSchema = {
  section: z.string().trim().optional(),
  language: z.string().trim().optional()
};

export function registerBuildTools(server, cmsClient) {
  server.registerTool(
    'build_static',
    {
      title: 'Build Static Site',
      description: 'Trigger the existing CMS static generation endpoint. Defaults to building only the EN site unless language is explicitly provided.',
      inputSchema: buildStaticSchema
    },
    async ({ section, language }) => {
      const requestedLanguage = String(language || '').trim();
      const effectiveLanguage = requestedLanguage || 'en';
      const response = await cmsClient.post('/admin/build/generate', {
        query: {
          section,
          language: effectiveLanguage
        },
        body: {},
        timeoutMs: 300000
      });
      return buildToolResult(response, {
        default_language_applied: !requestedLanguage,
        effective_language: effectiveLanguage
      }, 'static-build');
    }
  );
}
