import { registerBuildTools } from './build.mjs';
import { registerColumnNodeTools } from './column-nodes.mjs';
import { registerColumnsTools } from './columns.mjs';
import { registerContentItemTools } from './content-items.mjs';
import { registerContentModelTools } from './content-models.mjs';
import { registerTemplateBindingTools } from './template-bindings.mjs';
import { registerTemplateTools } from './templates.mjs';
import { registerTemplateVariantTools } from './template-variants.mjs';

export function registerCmsTools(server, cmsClient) {
  registerColumnsTools(server, cmsClient);
  registerColumnNodeTools(server, cmsClient);
  registerContentModelTools(server, cmsClient);
  registerContentItemTools(server, cmsClient);
  registerTemplateTools(server, cmsClient);
  registerTemplateVariantTools(server, cmsClient);
  registerTemplateBindingTools(server, cmsClient);
  registerBuildTools(server, cmsClient);
}
