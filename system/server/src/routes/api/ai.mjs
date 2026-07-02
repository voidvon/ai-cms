import { createUIMessageStream, pipeUIMessageStreamToResponse } from 'ai';
import { requireAuth } from '../../middleware/auth.mjs';
import { getAiOrchestrator } from '../../services/ai/initialize.mjs';
import { capabilityRegistry, toolRegistry } from '../../services/ai/core/index.mjs';
import { getAiDataSourceStatus } from '../../services/ai/data-source-registry.mjs';
import { searchAiMentions } from '../../services/ai/query-service.mjs';
import { DEFAULT_MODEL } from '../../services/ai/runtime.mjs';
import { executeContractTask } from '../../services/ai/skills/contract.mjs';
import { fetchUrlForAi } from '../../services/ai/web-fetch.mjs';
import {
  appendAiConversationMessage,
  createAiConversation,
  deleteAiConversation,
  getAiConversationById,
  listAiConversationMessages,
  listAiConversations,
  updateAiConversation,
} from '../../services/ai/conversations.mjs';

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

const PUBLIC_URL_PATTERN = /https?:\/\/[^\s<>"'，。；、]+/gi;

async function fetchReferencedWebPages(messageText) {
  const urls = Array.from(new Set(String(messageText || '').match(PUBLIC_URL_PATTERN) || [])).slice(0, 2);
  if (urls.length === 0) {
    return [];
  }

  const pages = [];
  for (const url of urls) {
    try {
      const page = await fetchUrlForAi({ url, maxTextChars: 8000 });
      pages.push({
        url: page.url,
        final_url: page.final_url,
        status: page.status,
        title: page.title,
        description: page.description,
        text: page.text,
        links: page.links,
        truncated: page.truncated,
      });
    } catch (error) {
      pages.push({
        url,
        error: error.message || '网页读取失败',
      });
    }
  }

  return pages;
}

export default async function aiRoutes(app) {
  app.get('/ai/conversations', {
    onRequest: [requireAuth],
  }, async (request, reply) => {
    try {
      return {
        success: true,
        data: listAiConversations({
          user: request.adminUser,
          limit: request.query?.limit,
        }),
      };
    } catch (error) {
      reply.code(error.statusCode || 400);
      return { success: false, message: error.message || '获取 AI 会话失败' };
    }
  });

  app.post('/ai/conversations', {
    onRequest: [requireAuth],
  }, async (request, reply) => {
    try {
      const conversation = createAiConversation(request.body || {}, { user: request.adminUser });
      return { success: true, data: conversation };
    } catch (error) {
      reply.code(error.statusCode || 400);
      return { success: false, message: error.message || '创建 AI 会话失败' };
    }
  });

  app.get('/ai/conversations/:id', {
    onRequest: [requireAuth],
  }, async (request, reply) => {
    const conversation = getAiConversationById(request.params.id, { user: request.adminUser });
    if (!conversation) {
      reply.code(404);
      return { success: false, message: 'AI 会话不存在' };
    }
    return { success: true, data: conversation };
  });

  app.patch('/ai/conversations/:id', {
    onRequest: [requireAuth],
  }, async (request, reply) => {
    const conversation = updateAiConversation(request.params.id, request.body || {}, { user: request.adminUser });
    if (!conversation) {
      reply.code(404);
      return { success: false, message: 'AI 会话不存在' };
    }
    return { success: true, data: conversation };
  });

  app.delete('/ai/conversations/:id', {
    onRequest: [requireAuth],
  }, async (request, reply) => {
    const deleted = deleteAiConversation(request.params.id, { user: request.adminUser });
    if (!deleted) {
      reply.code(404);
      return { success: false, message: 'AI 会话不存在' };
    }
    return { success: true, data: { deleted: true, id: request.params.id } };
  });

  app.get('/ai/conversations/:id/messages', {
    onRequest: [requireAuth],
  }, async (request, reply) => {
    try {
      return {
        success: true,
        data: listAiConversationMessages(request.params.id, {
          user: request.adminUser,
          limit: request.query?.limit,
        }),
      };
    } catch (error) {
      reply.code(error.statusCode || 400);
      return { success: false, message: error.message || '获取 AI 会话消息失败' };
    }
  });

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
            'read:web': ['03'],
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

  app.get('/ai/mentions/search', {
    onRequest: [requireAuth],
  }, async (request, reply) => {
    try {
      const keyword = String(request.query?.q || '').trim();
      if (!keyword) {
        reply.code(400);
        return {
          success: false,
          message: '缺少搜索关键词',
        };
      }

      const result = searchAiMentions({
        user: request.adminUser,
        keyword,
        type: request.query?.type,
        limit: request.query?.limit ? Number.parseInt(String(request.query.limit), 10) : 8,
      });

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      reply.code(error.statusCode || 400);
      return {
        success: false,
        message: error.message || 'AI 提及搜索失败',
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
    const mentions = Array.isArray(body.mentions)
      ? body.mentions.map((item) => ({
        type: String(item?.type || '').trim(),
        id: Number(item?.id || 0),
        title: String(item?.title || '').trim(),
        subtitle: String(item?.subtitle || '').trim(),
        model_code: String(item?.model_code || '').trim(),
        column_id: Number(item?.column_id || 0) || null,
        column_name: String(item?.column_name || '').trim(),
        code: String(item?.code || '').trim(),
        summary: String(item?.summary || '').trim(),
      })).filter((item) => item.type && item.id > 0 && item.title)
      : [];

    return sendAssistantStreamingTextStream(reply, messages, async (writeDelta) => {
      try {
        const orchestrator = getAiOrchestrator();
        const webPages = await fetchReferencedWebPages(messageText);

        const streamed = await orchestrator.chat({
          conversationId,
          message: messageText,
          userId: request.adminUser?.id,
          user: request.adminUser || null,
          capabilityKey,
          stream: true,
          requestedToolNames,
          toolMode,
          additionalContext: {
            mentions,
            webPages,
          },
        });

        const reader = streamed.result.toTextStream().getReader();
        let hasDelta = false;
        let assistantText = '';

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
            assistantText += delta;
            writeDelta(delta);
          }
        } finally {
          reader.releaseLock();
        }

        await streamed.result.completed;

        if (!hasDelta) {
          const finalText = String(streamed.result.finalOutput || '').trim();
          assistantText = finalText || '我已收到你的请求，但当前没有生成有效回复。';
          writeDelta(finalText || '我已收到你的请求，但当前没有生成有效回复。');
        }

        const normalizedAssistantText = String(assistantText || '').trim();
        if (normalizedAssistantText) {
          appendAiConversationMessage(conversationId, {
            role: 'assistant',
            content: { text: normalizedAssistantText },
            metadata: {
              capability: streamed.capability,
              toolNames: streamed.tool_names || [],
            },
          }, { user: request.adminUser });
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
