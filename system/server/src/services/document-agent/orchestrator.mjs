import { MemorySession, assistant, user } from '@openai/agents';
import { assertAiConfig, DEFAULT_MODEL, runAiAgent } from '../ai/runtime.mjs';
import { buildDocumentAgentContext } from './context.mjs';
import { createDocumentWorkspaceAgent } from './agent.mjs';
import {
  appendDocumentConversationMessage,
  completeDocumentRun,
  createDocumentRun,
  failDocumentRun,
  getConversationMessages,
  getOrCreateDocumentConversation,
  syncLegacyDraftMessages,
} from './store.mjs';

export async function startDocumentAgentRun({ draftId, message }) {
  assertAiConfig();

  const snapshot = buildDocumentAgentContext(draftId);
  const conversation = getOrCreateDocumentConversation(draftId);

  const userMessage = appendDocumentConversationMessage({
    conversationId: conversation.id,
    draftId,
    role: 'user',
    content: { text: String(message || '').trim() },
  });

  syncLegacyDraftMessages(draftId, conversation.id);

  const runRecord = createDocumentRun({
    conversationId: conversation.id,
    draftId,
    model: DEFAULT_MODEL,
    userMessageId: userMessage.id,
  });

  const agent = createDocumentWorkspaceAgent();
  const session = createDocumentAgentSession(conversation.id, conversation.session_key);
  const streamed = await runAiAgent(agent, String(message || '').trim(), {
    stream: true,
    session,
    context: {
      draftId,
      conversationId: conversation.id,
      runId: runRecord.id,
      themeId: snapshot.draft.theme_id,
      documentType: snapshot.draft.document_type,
    },
  });

  return {
    draft: snapshot.draft,
    conversation,
    run: runRecord,
    userMessage,
    result: streamed,
  };
}

export function finalizeDocumentAgentRun({
  draftId,
  conversationId,
  runId,
  assistantText,
  status = 'completed',
  errorMessage = '',
}) {
  const assistantMessage = appendDocumentConversationMessage({
    conversationId,
    draftId,
    role: 'assistant',
    content: { text: String(assistantText || '').trim() },
  });

  syncLegacyDraftMessages(draftId, conversationId);

  if (status === 'failed') {
    failDocumentRun(runId, errorMessage || assistantText || 'document agent run failed');
  } else {
    completeDocumentRun(runId, {
      status,
      assistantMessageId: assistantMessage.id,
    });
  }

  return assistantMessage;
}

function createDocumentAgentSession(conversationId, sessionKey) {
  const historyItems = getConversationMessages(conversationId)
    .filter((entry) => entry.role === 'user' || entry.role === 'assistant')
    .map((entry) => {
      const text = String(entry.content?.text || '').trim();
      if (!text) {
        return null;
      }
      return entry.role === 'assistant' ? assistant(text) : user(text);
    })
    .filter(Boolean);

  return new MemorySession({
    sessionId: sessionKey,
    initialItems: historyItems,
  });
}
