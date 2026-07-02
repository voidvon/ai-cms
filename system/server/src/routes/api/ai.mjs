import { createUIMessageStream, pipeUIMessageStreamToResponse } from 'ai';
import { requireAuth } from '../../middleware/auth.mjs';
import { getAiOrchestrator } from '../../services/ai/initialize.mjs';
import { capabilityRegistry, toolRegistry } from '../../services/ai/core/index.mjs';
import { getAiDataSourceStatus } from '../../services/ai/data-source-registry.mjs';
import { DEFAULT_MODEL } from '../../services/ai/runtime.mjs';
import { executeContractTask } from '../../services/ai/skills/contract.mjs';

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
  // 获取可用能力列表
  app.get('/ai/capabilities', {
    onRequest: [requireAuth],
  }, async (request) => {
    try {
      const orchestrator = getAiOrchestrator();
      const capabilities = orchestrator.getCapabilities({
        userId: request.adminUser?.id,
        user: request.adminUser,
      });

      return {
        success: true,
        data: {
          provider: 'openai_agents_js',
          status: 'ready',
          default_chat_capability: 'general_chat',
          capabilities,
          model: DEFAULT_MODEL,
        },
      };
    } catch (error) {
      return {
        success: true,
        data: {
          provider: 'openai_agents_js',
          status: 'stub',
          error: error.message,
          capabilities: [],
        },
      };
    }
  });

  // 获取可用工具列表
  app.get('/ai/tools', {
    onRequest: [requireAuth],
  }, async (request) => {
    try {
      const orchestrator = getAiOrchestrator();
      const capabilityKey = String(request.query?.capability || '').trim();
      const tools = orchestrator.getTools({
        user: request.adminUser,
        ...(capabilityKey ? { capabilityKey } : {}),
      });

      return {
        success: true,
        data: {
          total: tools.length,
          tools,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: error.message || '获取工具列表失败',
      };
    }
  });

  app.get('/ai/governance', {
    onRequest: [requireAuth],
  }, async (request) => {
    try {
      const capabilityKey = String(request.query?.capability || '').trim();
      const tools = toolRegistry.listGovernance({
        user: request.adminUser,
      }).filter((tool) => {
        if (!capabilityKey) {
          return true;
        }
        const capability = capabilityRegistry.get(capabilityKey);
        const visibleToolNames = Array.isArray(capability?.visibleToolNames) ? capability.visibleToolNames : [];
        return visibleToolNames.includes(tool.name);
      });

      return {
        success: true,
        data: {
          capability: capabilityKey || null,
          tools,
          data_sources: getAiDataSourceStatus(),
          permission_aliases: {
            'read:content': ['03'],
            'write:content': ['03'],
            'read:products': ['03'],
            'write:products': ['03'],
            'read:prices': ['03'],
            'write:prices': ['03'],
            'read:documents': ['03'],
            'write:documents': ['03'],
            'read:all': ['10'],
            'write:all': ['10'],
          },
        },
      };
    } catch (error) {
      return {
        success: false,
        message: error.message || '获取 AI 治理信息失败',
      };
    }
  });

  // 执行 AI 任务（保持向后兼容）
  app.post('/ai/tasks/:taskKey/execute', {
    onRequest: [requireAuth],
  }, async (request, reply) => {
    try {
      const body = await parseBody(request);
      const taskKey = String(request.params?.taskKey || '').trim();

      // 任务执行仍使用旧的实现（保持向后兼容）
      const result = await executeContractTask(taskKey, body);

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

  // AI 对话接口（使用新架构）
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
    const conversationId = body.conversationId || body.chatId || body.id || `chat-${Date.now()}`;
    const capabilityKey = body.capability || '';
    const toolMode = body.toolMode === 'explicit' ? 'explicit' : 'auto';
    const requestedToolNames = Array.isArray(body.toolNames)
      ? body.toolNames.map((item) => String(item || '').trim()).filter(Boolean)
      : [];

    return sendAssistantStreamingTextStream(reply, messages, async (writeDelta) => {
      try {
        const orchestrator = getAiOrchestrator();

        const streamed = await orchestrator.chat({
          conversationId,
          message: messageText,
          userId: request.adminUser?.id,
          user: request.adminUser || null,
          capabilityKey,
          stream: true,
          requestedToolNames,
          toolMode,
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
          const finalText = String(streamed.result.finalOutput || '').trim();
          writeDelta(finalText || '我已收到你的请求，但当前没有生成有效回复。');
        }
      } catch (error) {
        console.error('AI chat error:', error);
        writeDelta(formatAiError(error));
      }
    });
  });

  // 重置对话
  app.post('/ai/chat/reset', {
    onRequest: [requireAuth],
  }, async (request) => {
    const body = await parseBody(request);
    const conversationId = body.conversation_id || body.conversationId || body.chat_id || body.chatId || '';

    try {
      const orchestrator = getAiOrchestrator();
      const result = await orchestrator.resetConversation(conversationId);

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        message: error.message || '重置对话失败',
      };
    }
  });
}
