import { z } from 'zod';
import { toolRegistry } from '../core/tool-registry.mjs';
import { fetchUrlForAi } from '../web-fetch.mjs';

export function registerWebTools() {
  toolRegistry.register({
    name: 'fetch_url',
    description: '读取一个公开 http/https 网页，返回标题、描述、正文摘要和少量链接。禁止访问内网、本机和保留地址。',
    category: 'web',
    requiresAuth: true,
    accessLevel: 'read',
    requiredPermissions: ['read:web'],
    dataSources: ['public_web_url'],
    parameters: z.object({
      url: z.string().describe('要读取的公开网页 URL，仅支持 http/https'),
    }),
    async execute({ url }) {
      return fetchUrlForAi({ url });
    },
  });
}
