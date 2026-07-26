import { createUIMessageStream, pipeUIMessageStreamToResponse } from 'ai';
import { requireAuth } from '../../middleware/auth.mjs';
import { getDocumentDraftById } from '../../services/document-drafts.mjs';
import { buildDocumentAgentContext } from '../../services/document-agent/context.mjs';
import {
  finalizeDocumentAgentRun,
  startDocumentAgentRun,
} from '../../services/document-agent/orchestrator.mjs';
import { getReasoningSummaryDelta } from '../../services/document-agent/stream-events.mjs';
import { assertAiServicePermission } from '../../services/ai/query-service.mjs';
import { assertAiRunCompleted } from '../../services/ai/runtime.mjs';

async function parseBody(request) {
  if (request.body && typeof request.body === 'object') {
    return request.body;
  }
  return {};
}

function getLastUserMessageText(messages = []) {
  const lastUserMessage = [...messages].reverse().find((entry) => entry?.role === 'user');
  if (!lastUserMessage || !Array.isArray(lastUserMessage.parts)) {
    return '';
  }

  return lastUserMessage.parts
    .filter((part) => part?.type === 'text')
    .map((part) => String(part.text || ''))
    .join('')
    .trim();
}

function getDocumentToolActivity(event) {
  const item = event?.item?.toJSON?.() || null;
  const rawItem = event?.item?.rawItem || {};
  return {
    type: event?.name === 'tool_output' ? 'tool_output' : 'tool_called',
    toolName: rawItem.name || rawItem.call_id || 'tool',
    item,
  };
}

export default async function documentAgentRoutes(app) {
  app.post('/document-drafts/:id/assistant/stream', {
    onRequest: [requireAuth],
  }, async (request, reply) => {
    try {
      assertAiServicePermission(request.adminUser, ['write:documents']);
    } catch (error) {
      reply.code(error.statusCode || 403);
      return { success: false, message: error.message };
    }

    const body = await parseBody(request);
    const draftId = String(request.params?.id || '').trim();
    const originalMessages = Array.isArray(body.messages) ? body.messages : [];
    const message = String(body.message || getLastUserMessageText(originalMessages)).trim();

    if (!draftId) {
      reply.code(400);
      return { success: false, message: 'draft id 不能为空' };
    }

    if (!message) {
      reply.code(400);
      return { success: false, message: 'message 不能为空' };
    }

    const draft = getDocumentDraftById(draftId);
    if (!draft) {
      reply.code(404);
      return { success: false, message: '文档草稿不存在' };
    }

    const stream = createUIMessageStream({
      originalMessages,
      onError: (error) => error?.message || 'AI 文档助手执行失败',
      execute: async ({ writer }) => {
        const textPartId = `document-text-${Date.now()}`;
        const reasoningPartId = `document-reasoning-${Date.now()}`;
        let assistantText = '';
        let started = null;
        let textStarted = false;
        let reasoningStarted = false;

        writer.write({ type: 'start' });

        try {
          started = await startDocumentAgentRun({
            draftId,
            message,
            user: request.adminUser,
          });

          writer.write({
            type: 'data-document-run',
            data: {
              draftId,
              conversationId: started.conversation.id,
              runId: started.run.id,
              model: started.run.model,
            },
            transient: true,
          });

          for await (const event of started.result) {
            const reasoningDelta = getReasoningSummaryDelta(event);
            if (reasoningDelta) {
              if (!reasoningStarted) {
                writer.write({ type: 'reasoning-start', id: reasoningPartId });
                reasoningStarted = true;
              }
              writer.write({ type: 'reasoning-delta', id: reasoningPartId, delta: reasoningDelta });
              continue;
            }

            if (event.type === 'raw_model_stream_event' && event.data?.type === 'output_text_delta') {
              const delta = String(event.data.delta || '');
              if (delta) {
                if (!textStarted) {
                  writer.write({ type: 'text-start', id: textPartId });
                  textStarted = true;
                }
                assistantText += delta;
                writer.write({ type: 'text-delta', id: textPartId, delta });
              }
              continue;
            }

            if (event.type === 'run_item_stream_event' && (event.name === 'tool_called' || event.name === 'tool_output')) {
              writer.write({
                type: 'data-document-tool-activity',
                data: getDocumentToolActivity(event),
                transient: true,
              });
            }
          }

          await started.result.completed;
          assertAiRunCompleted(started.result);
          const finalText = String(started.result.finalOutput || assistantText || '').trim();
          if (!textStarted && finalText) {
            writer.write({ type: 'text-start', id: textPartId });
            writer.write({ type: 'text-delta', id: textPartId, delta: finalText });
            textStarted = true;
          }

          if (reasoningStarted) {
            writer.write({ type: 'reasoning-end', id: reasoningPartId });
          }
          if (textStarted) {
            writer.write({ type: 'text-end', id: textPartId });
          }

          finalizeDocumentAgentRun({
            draftId,
            conversationId: started.conversation.id,
            runId: started.run.id,
            assistantText: finalText,
          });

          const latest = buildDocumentAgentContext(draftId);
          writer.write({
            type: 'data-document-draft',
            data: {
              draft: latest.draft,
              missingFields: latest.missingFields,
            },
            transient: true,
          });
          writer.write({ type: 'finish', finishReason: 'stop' });
        } catch (error) {
          if (started) {
            finalizeDocumentAgentRun({
              draftId,
              conversationId: started.conversation.id,
              runId: started.run.id,
              assistantText: assistantText || 'AI 文档助手执行失败。',
              status: 'failed',
              errorMessage: error?.message || 'document agent run failed',
            });
          }
          throw error;
        }
      },
    });

    reply.hijack();
    pipeUIMessageStreamToResponse({ response: reply.raw, stream });
    return reply;
  });
}
