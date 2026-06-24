import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CmsClient } from './cms-client.mjs';
import { loadConfig } from './config.mjs';
import { loadEnvFile } from './env-file.mjs';
import { registerCmsTools } from './tools/index.mjs';

function createServer() {
  const server = new McpServer({
    name: 'spiraxsarcocn-cms',
    version: '0.1.0'
  });

  const config = loadConfig();
  const cmsClient = new CmsClient({
    baseUrl: config.cmsBaseUrl,
    token: config.cmsToken
  });

  registerCmsTools(server, cmsClient);
  return server;
}

async function main() {
  loadEnvFile();
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('[spiraxsarcocn-mcp] Failed to start MCP server');
  console.error(error);
  process.exit(1);
});
