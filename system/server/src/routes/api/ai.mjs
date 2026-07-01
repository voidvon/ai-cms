import { createUIMessageStream, pipeUIMessageStreamToResponse } from 'ai';
import { requireAuth } from '../../middleware/auth.mjs';
import { getAiCapabilities, executeAiTask } from '../../services/ai/capabilities.mjs';
import { resetAiConversation, streamAiChat } from '../../services/ai/chat.mjs';
import { DEFAULT_MODEL, getOpenAIModelProvider } from '../../services/ai/runtime.mjs';
import { createDocumentWorkspaceAgent } from '../../services/document-agent/agent.mjs';

async function parseBody(request) {
  if (request.body && typeof request.body === 'object') {
    return request.body;
  }
  return {};
}

function createAssistantStreamingTextStream(originalMessages, executeTextStream) {
  const textPartId = `text-${Date.now()}`;
  return createUIMessageStream({
    execute: async ({ writer }) => {
      writer.write({ type: 'start' });
      writer.write({ type: 'text-start', id: textPartId });

      try {
        await executeTextStream((delta) => {
          if (!delta) {
            return;
          }

          writer.write({
            type: 'text-delta',
            id: textPartId,
            delta,
          });
        });
      } catch (error) {
        writer.write({
          type: 'text-delta',
          id: textPartId,
          delta: formatAiError(error),
        });
      }

      writer.write({ type: 'text-end', id: textPartId });
      writer.write({ type: 'finish', finishReason: 'stop' });
    },
    originalMessages,
  });
}

function sendAssistantStreamingTextStream(reply, originalMessages, executeTextStream) {
  reply.hijack();
  pipeUIMessageStreamToResponse({
    response: reply.raw,
    stream: createAssistantStreamingTextStream(originalMessages, executeTextStream),
  });
  return reply;
}

function formatAiError(error) {
  const message = String(error?.message || '').trim();
  if (!message) {
    return 'AI 服务暂时不可用，请稍后重试。';
  }

  if (message === 'Connection error.') {
    return 'AI 服务连接失败。请检查 `OPENAI_BASE_URL`、`OPENAI_API_KEY`、模型名以及当前服务器到上游地址的网络连通性。';
  }

  return `AI 服务请求失败：${message}`;
}

export default async function aiRoutes(app) {
  app.get('/ai/provider-debug', {
    onRequest: [requireAuth],
  }, async () => {
    let providerName = '';
    let providerConstructor = '';
    try {
      const provider = getOpenAIModelProvider();
      providerName = provider?.name || '';
      providerConstructor = provider?.constructor?.name || '';
    } catch (error) {
      providerName = '';
      providerConstructor = `error:${error?.message || 'unknown'}`;
    }

    const documentAgent = createDocumentWorkspaceAgent();

    return {
      success: true,
      data: {
        defaultModel: DEFAULT_MODEL,
        documentAgentModel: documentAgent?.model || '',
        openaiApiKeyPresent: Boolean(String(process.env.OPENAI_API_KEY || '').trim()),
        openaiBaseUrl: String(process.env.OPENAI_BASE_URL || '').trim(),
        openaiAiModel: String(process.env.OPENAI_AI_MODEL || '').trim(),
        openaiDefaultModel: String(process.env.OPENAI_DEFAULT_MODEL || '').trim(),
        openaiContractModel: String(process.env.OPENAI_CONTRACT_MODEL || '').trim(),
        providerName,
        providerConstructor,
        providerUsesResponses: false,
        providerUsesResponsesWebSocket: false,
        providerApiMode: 'chat_completions',
        providerConversationMemory: 'local_session',
        pid: process.pid,
      },
    };
  });

  app.get('/ai/capabilities', {
    onRequest: [requireAuth],
  }, async () => {
    return {
      success: true,
      data: getAiCapabilities(),
    };
  });

  app.post('/ai/tasks/:taskKey/execute', {
    onRequest: [requireAuth],
  }, async (request, reply) => {
    try {
      const body = await parseBody(request);
      const taskKey = String(request.params?.taskKey || '').trim();
      const result = await executeAiTask(taskKey, body);

      return {
        success: true,
        data: result,
        message: 'AI 任务执行完成',
      };
    } catch (error) {
      reply.code(error.statusCode || 400);
      return {
        success: false,
        message: error.message || 'AI 任务执行失败',
      };
    }
  });

  app.post('/ai/chat', {
    onRequest: [requireAuth],
  }, async (request, reply) => {
    const body = await parseBody(request);
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const lastMessage = messages[messages.length - 1];
    const textParts = Array.isArray(lastMessage?.parts)
      ? lastMessage.parts.filter((part) => part?.type === 'text').map((part) => String(part.text || ''))
      : [];
    const messageText = textParts.join('\n').trim();
    const conversationId = body.conversationId || body.chatId || body.id || '';
    const capability = body.capability || '';

    return sendAssistantStreamingTextStream(reply, messages, async (writeDelta) => {
      const streamed = await streamAiChat({
        conversationId,
        capability,
        message: messageText,
      });
      const reader = streamed.result.toTextStream().getReader();
      let hasDelta = false;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          const delta = String(value || '');
          if (!delta) {
            continue;
          }

          hasDelta = true;
          writeDelta(delta);
        }
      } finally {
        reader.releaseLock();
      }

      await streamed.result.completed;

      if (!hasDelta) {
        writeDelta(streamed.getFinalText() || '我已收到你的请求，但当前没有生成有效回复。');
      }
    });
  });

  app.post('/ai/chat/reset', {
    onRequest: [requireAuth],
  }, async (request) => {
    const body = await parseBody(request);
    return {
      success: true,
      data: resetAiConversation(body.conversation_id || body.conversationId || body.chat_id || body.chatId || ''),
    };
  });
}
