import { tool } from '@openai/agents';
import { hasAiPermissions } from './permissions.mjs';

/**
 * 工具注册中心
 */
export class ToolRegistry {
  constructor() {
    this.tools = new Map();
    this.categories = new Map();
  }

  /**
   * 注册工具
   */
  register(toolConfig) {
    const toolMeta = {
      name: toolConfig.name,
      description: toolConfig.description,
      category: toolConfig.category || 'general',
      requiresAuth: toolConfig.requiresAuth ?? false,
      requiredPermissions: toolConfig.requiredPermissions || [],
      accessLevel: toolConfig.accessLevel || 'read',
      dataSources: Array.isArray(toolConfig.dataSources) ? toolConfig.dataSources : [],
      execute: toolConfig.execute,
      schema: toolConfig.parameters,
      // 保留原始配置的其他属性
      strict: toolConfig.strict,
      deferLoading: toolConfig.deferLoading,
      needsApproval: toolConfig.needsApproval,
      isEnabled: toolConfig.isEnabled,
      timeoutMs: toolConfig.timeoutMs,
    };

    this.tools.set(toolMeta.name, toolMeta);

    // 按分类索引
    if (!this.categories.has(toolMeta.category)) {
      this.categories.set(toolMeta.category, []);
    }
    this.categories.get(toolMeta.category).push(toolMeta.name);

    return toolMeta;
  }

  /**
   * 获取工具配置
   */
  get(toolName) {
    return this.tools.get(toolName) || null;
  }

  /**
   * 获取所有工具
   */
  getAll() {
    return Array.from(this.tools.values());
  }

  /**
   * 获取工具（支持过滤）
   */
  getTools(filter = {}) {
    return Array.from(this.tools.values()).filter((toolMeta) => {
      // 按分类过滤
      if (filter.category && toolMeta.category !== filter.category) {
        return false;
      }

      // 按权限过滤
      if (filter.user && toolMeta.requiresAuth) {
        if (
          toolMeta.requiredPermissions.length > 0 &&
          !this.checkUserPermissions(filter.user, toolMeta.requiredPermissions)
        ) {
          return false;
        }
      }

      if (toolMeta.isEnabled === false) {
        return false;
      }

      if (typeof toolMeta.isEnabled === 'function' && !toolMeta.isEnabled(filter)) {
        return false;
      }

      // 按名称列表过滤
      if (filter.names && !filter.names.includes(toolMeta.name)) {
        return false;
      }

      return true;
    });
  }

  /**
   * 按分类获取工具
   */
  getByCategory(category) {
    const toolNames = this.categories.get(category) || [];
    return toolNames.map((name) => this.tools.get(name)).filter(Boolean);
  }

  /**
   * 创建工具实例
   */
  createToolInstance(toolName, context = {}) {
    const config = this.tools.get(toolName);
    if (!config) {
      throw new Error(`Tool ${toolName} not found in registry`);
    }

    return tool({
      name: config.name,
      description: config.description,
      parameters: config.schema,
      strict: config.strict,
      deferLoading: config.deferLoading,
      needsApproval: config.needsApproval,
      isEnabled: config.isEnabled,
      timeoutMs: config.timeoutMs,
      async execute(input, runContext) {
        // 注入业务上下文
        return config.execute(input, {
          ...runContext,
          ...context,
        });
      },
    });
  }

  /**
   * 批量创建工具实例
   */
  createToolInstances(toolNames, context = {}) {
    return toolNames
      .map((name) => {
        try {
          return this.createToolInstance(name, context);
        } catch (error) {
          console.warn(`Failed to create tool instance: ${name}`, error);
          return null;
        }
      })
      .filter(Boolean);
  }

  listGovernance(filter = {}) {
    return this.getTools(filter).map((toolMeta) => ({
      name: toolMeta.name,
      description: toolMeta.description,
      category: toolMeta.category,
      requiresAuth: toolMeta.requiresAuth,
      requiredPermissions: toolMeta.requiredPermissions,
      accessLevel: toolMeta.accessLevel,
      dataSources: toolMeta.dataSources,
      enabled: toolMeta.isEnabled === false
        ? false
        : (typeof toolMeta.isEnabled === 'function' ? Boolean(toolMeta.isEnabled(filter)) : true),
    }));
  }

  /**
   * 检查用户权限（简单实现，可扩展）
   */
  checkUserPermissions(user, requiredPermissions) {
    if (!user || !requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    // 如果用户有 hasPermissions 方法，使用它
    if (typeof user.hasPermissions === 'function') {
      return user.hasPermissions(requiredPermissions);
    }

    return hasAiPermissions(user, requiredPermissions);
  }

  /**
   * 清除所有工具
   */
  clear() {
    this.tools.clear();
    this.categories.clear();
  }
}

// 全局工具注册中心实例
export const toolRegistry = new ToolRegistry();
