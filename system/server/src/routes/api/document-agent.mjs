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

function writeSseEvent(reply, eventName, payload) {
  reply.raw.write(`event: ${eventName}\n`);
  reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
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
    const message = String(body.message || '').trim();

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

    reply.hijack();
    reply.raw.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
    reply.raw.setHeader('Connection', 'keep-alive');

    let assistantText = '';
    let started = null;

    try {
      started = await startDocumentAgentRun({
        draftId,
        message,
        user: request.adminUser,
      });

      writeSseEvent(reply, 'started', {
        draftId,
        conversationId: started.conversation.id,
        runId: started.run.id,
        model: started.run.model,
      });

      for await (const event of started.result) {
        const reasoningDelta = getReasoningSummaryDelta(event);
        if (reasoningDelta) {
          writeSseEvent(reply, 'reasoning_delta', { delta: reasoningDelta });
          continue;
        }

        if (event.type === 'raw_model_stream_event' && event.data?.type === 'output_text_delta') {
          const delta = String(event.data.delta || '');
          if (delta) {
            assistantText += delta;
            writeSseEvent(reply, 'text_delta', { delta });
          }
          continue;
        }

        if (event.type === 'run_item_stream_event') {
          if (event.name === 'tool_called') {
            writeSseEvent(reply, 'tool_called', {
              toolName: event.item?.rawItem?.name || event.item?.rawItem?.call_id || 'tool',
              item: event.item?.toJSON?.() || null,
            });
            continue;
          }
          if (event.name === 'tool_output') {
            writeSseEvent(reply, 'tool_output', {
              toolName: event.item?.rawItem?.name || event.item?.rawItem?.call_id || 'tool',
              item: event.item?.toJSON?.() || null,
            });
            continue;
          }
        }
      }

      await started.result.completed;
      assertAiRunCompleted(started.result);
      const finalText = String(started.result.finalOutput || assistantText || '').trim();
      finalizeDocumentAgentRun({
        draftId,
        conversationId: started.conversation.id,
        runId: started.run.id,
        assistantText: finalText,
      });

      const latest = buildDocumentAgentContext(draftId);
      writeSseEvent(reply, 'draft_updated', {
        draft: latest.draft,
        missing_fields: latest.missingFields,
      });
      writeSseEvent(reply, 'completed', {
        assistant_message: finalText,
        draft: latest.draft,
        missing_fields: latest.missingFields,
        suggested_questions: [],
      });
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
      writeSseEvent(reply, 'error', {
        success: false,
        message: error?.message || 'AI 文档助手执行失败',
      });
    } finally {
      reply.raw.end();
    }

    return reply;
  });
}
