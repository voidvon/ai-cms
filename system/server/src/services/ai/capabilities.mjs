import { normalizeText } from './shared.mjs';
import {
  CONTRACT_COPILOT_CAPABILITY,
  buildContractConversationAgent,
  executeContractTask,
  listContractTasks,
} from './skills/contract.mjs';

const CHAT_CAPABILITIES = [CONTRACT_COPILOT_CAPABILITY];
const TASK_CAPABILITIES = listContractTasks();
const DEFAULT_CHAT_CAPABILITY = CONTRACT_COPILOT_CAPABILITY.key;

export function getAiCapabilities() {
  return {
    provider: 'openai_agents_js',
    status: normalizeText(process.env.OPENAI_API_KEY) ? 'partial_ready' : 'stub',
    default_chat_capability: DEFAULT_CHAT_CAPABILITY,
    chat_capabilities: CHAT_CAPABILITIES,
    task_capabilities: TASK_CAPABILITIES,
    recommendedArchitecture: {
      ui: 'system/admin/src/pages/AiChatPage.tsx',
      api: 'system/server/src/routes/api/ai.mjs',
      orchestration: 'system/server/src/services/ai',
      files: '/uploads/pdfs',
    },
  };
}

export function buildConversationAgentForCapability(capabilityKey) {
  const resolvedKey = normalizeText(capabilityKey) || DEFAULT_CHAT_CAPABILITY;
  if (resolvedKey === CONTRACT_COPILOT_CAPABILITY.key) {
    return {
      capability: CONTRACT_COPILOT_CAPABILITY,
      agent: buildContractConversationAgent(),
    };
  }

  const error = new Error(`不支持的 AI 对话能力：${resolvedKey}`);
  error.statusCode = 404;
  throw error;
}

export async function executeAiTask(taskKey, payload = {}) {
  return executeContractTask(taskKey, payload);
}
