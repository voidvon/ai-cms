import { MemorySession } from '@openai/agents';
import { buildConversationAgentForCapability } from './capabilities.mjs';
import { extractJsonString, normalizeText } from './shared.mjs';
import { assertAiConfig, DEFAULT_MODEL, runAiAgent } from './runtime.mjs';

const conversationSessions = new Map();

function getOrCreateConversationSession(conversationId) {
  const normalizedConversationId = normalizeText(conversationId) || `admin-ai-${Date.now()}`;
  const existing = conversationSessions.get(normalizedConversationId);
  if (existing) {
    return {
      conversationId: normalizedConversationId,
      session: existing,
    };
  }

  const session = new MemorySession(normalizedConversationId);
  conversationSessions.set(normalizedConversationId, session);
  return {
    conversationId: normalizedConversationId,
    session,
  };
}

export async function streamAiChat({ conversationId, capability, message }) {
  assertAiConfig();

  const normalizedMessage = normalizeText(message);
  if (!normalizedMessage) {
    const error = new Error('message 不能为空');
    error.statusCode = 400;
    throw error;
  }

  const { agent, capability: resolvedCapability } = buildConversationAgentForCapability(capability);
  const { conversationId: resolvedConversationId, session } = getOrCreateConversationSession(conversationId);
  const result = await runAiAgent(agent, normalizedMessage, { session, stream: true });

  return {
    conversation_id: resolvedConversationId,
    capability: resolvedCapability.key,
    model: DEFAULT_MODEL,
    result,
    getFinalText() {
      return extractJsonString(result?.finalOutput) || '';
    },
  };
}

export function resetAiConversation(conversationId) {
  const normalizedConversationId = normalizeText(conversationId);
  if (!normalizedConversationId) {
    return { cleared: false };
  }

  conversationSessions.delete(normalizedConversationId);
  return {
    cleared: true,
    conversation_id: normalizedConversationId,
  };
}
