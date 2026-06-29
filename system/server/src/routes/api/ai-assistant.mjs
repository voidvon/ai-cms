import { requireAuth } from '../../middleware/auth.mjs';
import {
  answerKnowledgeStub,
  chatWithAssistant,
  draftContractWithAgent,
  exportContractPdfStub,
  getAiAssistantCapabilities,
  queryPriceStub,
  resetAssistantChat
} from '../../services/ai-assistant.mjs';

async function parseBody(request) {
  if (request.body && typeof request.body === 'object') {
    return request.body;
  }
  return {};
}

export default async function aiAssistantRoutes(app) {
  app.get('/ai-assistant/capabilities', {
    onRequest: [requireAuth]
  }, async () => {
    return {
      success: true,
      data: getAiAssistantCapabilities()
    };
  });

  app.post('/ai-assistant/contract/draft', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    try {
      const body = await parseBody(request);
      const result = await draftContractWithAgent(body);

      return {
        success: true,
        data: result,
        message: '合同草稿已生成'
      };
    } catch (error) {
      reply.code(error.statusCode || 400);
      return {
        success: false,
        message: error.message || '合同草稿请求失败'
      };
    }
  });

  app.post('/ai-assistant/price/query', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    try {
      const body = await parseBody(request);
      const result = queryPriceStub(body);

      return {
        success: true,
        data: result,
        message: '价格查询接口骨架已就绪，待接入真实价格源'
      };
    } catch (error) {
      reply.code(400);
      return {
        success: false,
        message: error.message || '价格查询失败'
      };
    }
  });

  app.post('/ai-assistant/knowledge/ask', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    try {
      const body = await parseBody(request);
      const result = answerKnowledgeStub(body);

      return {
        success: true,
        data: result,
        message: '知识问答接口骨架已就绪，待接入检索与回答生成'
      };
    } catch (error) {
      reply.code(400);
      return {
        success: false,
        message: error.message || '知识问答失败'
      };
    }
  });

  app.post('/ai-assistant/contract/export-pdf', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    try {
      const body = await parseBody(request);
      const result = exportContractPdfStub(body);

      return {
        success: true,
        data: result,
        message: 'PDF 导出接口骨架已就绪，待接入渲染器'
      };
    } catch (error) {
      reply.code(400);
      return {
        success: false,
        message: error.message || 'PDF 导出失败'
      };
    }
  });

  app.post('/ai-assistant/chat', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    try {
      const body = await parseBody(request);
      const messages = Array.isArray(body.messages) ? body.messages : [];
      const lastMessage = messages[messages.length - 1];
      const textParts = Array.isArray(lastMessage?.parts)
        ? lastMessage.parts.filter((part) => part?.type === 'text').map((part) => String(part.text || ''))
        : [];
      const messageText = textParts.join('\n').trim();
      const chatId = body.chatId || body.id || '';

      const result = await chatWithAssistant({
        chatId,
        message: messageText
      });

      return {
        id: result.chat_id,
        messages: [
          {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            parts: [
              {
                type: 'text',
                text: result.message
              }
            ]
          }
        ]
      };
    } catch (error) {
      reply.code(error.statusCode || 400);
      return {
        error: error.message || '聊天请求失败'
      };
    }
  });

  app.post('/ai-assistant/chat/reset', {
    onRequest: [requireAuth]
  }, async (request) => {
    const body = await parseBody(request);
    return {
      success: true,
      data: resetAssistantChat(body.chat_id || body.chatId || '')
    };
  });
}
