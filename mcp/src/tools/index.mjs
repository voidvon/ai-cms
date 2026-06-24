import { registerBuildTools } from './build.mjs';
import { registerColumnNodeTools } from './column-nodes.mjs';
import { registerColumnsTools } from './columns.mjs';
import { registerContentItemTools } from './content-items.mjs';
import { registerContentModelTools } from './content-models.mjs';

export function registerCmsTools(server, cmsClient) {
  registerColumnsTools(server, cmsClient);
  registerColumnNodeTools(server, cmsClient);
  registerContentModelTools(server, cmsClient);
  registerContentItemTools(server, cmsClient);
  registerBuildTools(server, cmsClient);
}
