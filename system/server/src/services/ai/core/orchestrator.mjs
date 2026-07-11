import { runAiAgent } from '../runtime.mjs';
import { composeMiddlewares } from './middleware.mjs';
import { appendAiConversationMessage, clearAiConversationMessages, touchAiConversation } from '../conversations.mjs';

/**
 * AI 编排器 - 统一管理能力、工具、会话和中间件
 */
export class AiOrchestrator {
  constructor({
    sessionManager,
    capabilityRegistry,
    toolRegistry,
    contextBuilder,
    middlewares = [],
  }) {
    this.sessionManager = sessionManager;
    this.capabilityRegistry = capabilityRegistry;
    this.toolRegistry = toolRegistry;
    this.contextBuilder = contextBuilder;
    this.middlewares = middlewares;
  }

  /**
   * 执行 AI 对话
   */
  async chat({
    conversationId,
    message,
    userId,
    user,
    capabilityKey,
    stream = true,
    additionalContext = {},
    requestedToolNames = [],
    toolMode = 'auto',
  }) {
    // 1. 构建基础上下文
    const baseContext = {
      conversationId,
      userId,
      user: user || null,
      message,
      ...additionalContext,
    };

    // 2. 通过上下文构建器增强上下文
    const context = await this.contextBuilder.build(baseContext);

    // 3. 选择能力
    const capability = capabilityKey
      ? this.capabilityRegistry.get(capabilityKey)
      : this.capabilityRegistry.match(message, context);

    // 4. 检查能力可用性
    if (!capability.isAvailable(context)) {
      const error = new Error(`能力 ${capability.label} 当前不可用`);
      error.statusCode = 503;
      throw error;
    }

    // 5. 增强上下文
    const enhancedContext = await capability.enhanceContext(context);
    enhancedContext.capability = capability;

    // 6. 获取或创建会话
    const session = await this.sessionManager.getOrCreate(conversationId, {
      restoreHistory: true,
      user: enhancedContext.user,
    });

    // 7. 选择工具
    const toolNames = await capability.selectTools(enhancedContext);
    const autoSelectedToolNames = this.filterAllowedTools(toolNames, enhancedContext, capability);
    const selectedToolNames = toolMode === 'explicit'
      ? this.filterRequestedTools(requestedToolNames, enhancedContext, capability, [])
      : Array.isArray(requestedToolNames) && requestedToolNames.length > 0
        ? this.filterRequestedTools(requestedToolNames, enhancedContext, capability, autoSelectedToolNames)
        : autoSelectedToolNames;
    const tools = this.toolRegistry.createToolInstances(selectedToolNames, enhancedContext);

    // 8. 构建指令
    let instructions = capability.buildInstructions
      ? await capability.buildInstructions(enhancedContext)
      : undefined;

    if (toolMode === 'explicit') {
      if (selectedToolNames.length > 0) {
        const explicitInstruction = [
          `当前对话处于显式工具模式。用户已明确选择这些工具：${selectedToolNames.join(', ')}。`,
          '你必须优先调用这些已选工具来回答问题，不要忽略它们直接给泛化建议。',
          '如果用户问题与已选工具不匹配，要明确说明当前已选工具无法完成该请求，而不是假装已经查询过系统数据。',
        ].join('\n');
        instructions = instructions ? `${instructions}\n${explicitInstruction}` : explicitInstruction;
      } else {
        const noToolInstruction = [
          '当前对话处于显式工具模式，但用户本轮没有选择任何工具。',
          '你不得声称已经查询了系统数据、价格库、分类或联系方式。',
          '如果问题需要查询数据，明确提醒用户先使用 @ 选择合适工具。',
        ].join('\n');
        instructions = instructions ? `${instructions}\n${noToolInstruction}` : noToolInstruction;
      }
    }

    // 9. 创建 Agent
    const agent = capability.createAgent({
      ...enhancedContext,
      tools,
      instructions,
    });

    // 10. 执行中间件链
    const middlewareChain = composeMiddlewares(this.middlewares);

    // 11. 运行 Agent
    const result = await middlewareChain(
      async () => {
        return runAiAgent(agent, message, {
          session,
          stream,
          context: enhancedContext,
        });
      },
      { agent, context: enhancedContext }
    );

    // 12. 保存会话
    await this.sessionManager.save(conversationId, session);

    // 13. 持久化用户消息
    if (enhancedContext.user) {
      const persistedMessage = String(enhancedContext.userMessageText || message).trim();
      touchAiConversation(conversationId, {
        user: enhancedContext.user,
        title: persistedMessage,
        capability: capability.key,
        selectedToolNames,
      });
      appendAiConversationMessage(conversationId, {
        role: 'user',
        content: {
          text: persistedMessage,
          ...(enhancedContext.uploadedImageContext?.images?.length > 0
            ? { images: enhancedContext.uploadedImageContext.images }
            : {}),
        },
        metadata: {
          capability: capability.key,
          toolNames: selectedToolNames,
          mentions: enhancedContext.mentions || [],
          displayParts: Array.isArray(enhancedContext.displayParts)
            ? enhancedContext.displayParts
            : [],
        },
      }, { user: enhancedContext.user });
    }

    return {
      conversation_id: conversationId,
      capability: capability.key,
      capability_label: capability.label,
      tool_names: selectedToolNames,
      result,
    };
  }

  filterRequestedTools(requestedToolNames, context, capability, fallbackToolNames = []) {
    const filteredFallback = this.filterAllowedTools(fallbackToolNames, context, capability);
    const visibleToolNames = Array.isArray(capability?.visibleToolNames) && capability.visibleToolNames.length > 0
      ? new Set(capability.visibleToolNames)
      : null;
    const allowedToolNames = new Set(this.toolRegistry.getTools({
      user: context.user,
      names: requestedToolNames,
    }).map((tool) => tool.name).filter((toolName) => (
      visibleToolNames ? visibleToolNames.has(toolName) : true
    )));

    const filtered = requestedToolNames.filter((name) => allowedToolNames.has(name));
    if (filtered.length > 0) {
      return filtered;
    }

    return filteredFallback;
  }

  filterAllowedTools(toolNames, context, capability) {
    if (!Array.isArray(toolNames) || toolNames.length === 0) {
      return [];
    }

    const visibleToolNames = Array.isArray(capability?.visibleToolNames) && capability.visibleToolNames.length > 0
      ? new Set(capability.visibleToolNames)
      : null;

    return this.toolRegistry.getTools({
      user: context.user,
      names: toolNames,
    }).map((tool) => tool.name).filter((toolName) => (
      visibleToolNames ? visibleToolNames.has(toolName) : true
    ));
  }

  /**
   * 重置会话
   */
  async resetConversation(conversationId, { user } = {}) {
    await this.sessionManager.clear(conversationId);
    clearAiConversationMessages(conversationId, { user });
    return {
      cleared: true,
      conversation_id: conversationId,
    };
  }

  /**
   * 获取可用能力列表
   */
  getCapabilities(context = {}) {
    return this.capabilityRegistry.getAll(context).map((capability) => ({
      key: capability.key,
      label: capability.label,
      description: capability.description,
      icon: capability.icon,
      category: capability.category,
      available: capability.isAvailable(context),
    }));
  }

  /**
   * 获取可用工具列表
   */
  getTools(filter = {}) {
    const capability = filter.capabilityKey
      ? this.capabilityRegistry.get(filter.capabilityKey)
      : null;
    const names = Array.isArray(capability?.visibleToolNames) && capability.visibleToolNames.length > 0
      ? capability.visibleToolNames
      : filter.names;

    return this.toolRegistry.getTools({
      ...filter,
      ...(Array.isArray(names) ? { names } : {}),
    }).map((tool) => ({
      name: tool.name,
      description: tool.description,
      category: tool.category,
      requiresAuth: tool.requiresAuth,
      requiredPermissions: tool.requiredPermissions,
      accessLevel: tool.accessLevel,
      dataSources: tool.dataSources,
      enabled: tool.isEnabled === false
        ? false
        : (typeof tool.isEnabled === 'function' ? Boolean(tool.isEnabled(filter)) : true),
    }));
  }
}
