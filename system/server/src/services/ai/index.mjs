// Core infrastructure
export * from './core/index.mjs';

// Initialization
export { initializeAiService, getAiOrchestrator, resetAiService } from './initialize.mjs';

// Tools
export { registerAllTools, registerBusinessTools, registerDatabaseTools } from './tools/index.mjs';

// Capabilities
export {
  registerAllCapabilities,
  registerGeneralChatCapability,
  registerContractAssistantCapability,
  registerDocumentWorkspaceCapability,
  generalChatCapability,
  contractAssistantCapability,
  documentWorkspaceCapability,
} from './capabilities/index.mjs';

// Runtime (保持向后兼容)
export {
  DEFAULT_MODEL,
  assertAiConfig,
  createAiAgent,
  runAiAgent,
  getOpenAIClient,
  getOpenAIModelProvider,
} from './runtime.mjs';

// Shared utilities (保持向后兼容)
export {
  normalizeText,
  extractJsonString,
  normalizeChecklist,
  safeParseJson,
} from './shared.mjs';
