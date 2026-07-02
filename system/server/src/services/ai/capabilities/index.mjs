import { registerGeneralChatCapability } from './general-chat.mjs';
import { registerContractAssistantCapability } from './contract-assistant.mjs';
import { registerDocumentWorkspaceCapability } from './document-workspace.mjs';

/**
 * 注册所有能力到全局能力注册中心
 * 应在服务器启动时调用一次
 */
export function registerAllCapabilities() {
  registerGeneralChatCapability();
  registerContractAssistantCapability();
  registerDocumentWorkspaceCapability();
}

// 导出能力注册函数
export { registerGeneralChatCapability } from './general-chat.mjs';
export { registerContractAssistantCapability } from './contract-assistant.mjs';
export { registerDocumentWorkspaceCapability } from './document-workspace.mjs';

// 导出能力配置
export { generalChatCapability } from './general-chat.mjs';
export { contractAssistantCapability } from './contract-assistant.mjs';
export { documentWorkspaceCapability } from './document-workspace.mjs';
