/**
 * 能力注册中心
 */
export class CapabilityRegistry {
  constructor() {
    this.capabilities = new Map();
    this.matchers = [];
  }

  /**
   * 注册能力
   */
  register(capability) {
    if (!capability.key) {
      throw new Error('Capability must have a key');
    }

    if (!capability.createAgent) {
      throw new Error('Capability must have a createAgent function');
    }

    const capabilityConfig = {
      key: capability.key,
      label: capability.label || capability.key,
      description: capability.description || '',
      icon: capability.icon || '🤖',
      category: capability.category || 'general',
      requiredPermissions: capability.requiredPermissions || [],
      visibleToolNames: Array.isArray(capability.visibleToolNames)
        ? capability.visibleToolNames.filter(Boolean)
        : null,

      // 匹配器配置
      matcher: capability.matcher || null,

      // Agent 构建函数
      createAgent: capability.createAgent,

      // 工具选择函数
      selectTools: capability.selectTools || (() => []),

      // 上下文增强函数
      enhanceContext: capability.enhanceContext || ((ctx) => ctx),

      // 指令构建函数
      buildInstructions: capability.buildInstructions || null,

      // 可用性检查函数
      isAvailable: capability.isAvailable || (() => true),
    };

    this.capabilities.set(capabilityConfig.key, capabilityConfig);

    // 如果有匹配器，加入匹配器列表
    if (capabilityConfig.matcher) {
      const priority = capabilityConfig.matcher.priority ?? 0;
      this.matchers.push({
        capability: capabilityConfig,
        priority,
        keywords: capabilityConfig.matcher.keywords || [],
        regex: capabilityConfig.matcher.regex || null,
        condition: capabilityConfig.matcher.condition || null,
      });

      // 按优先级排序（高优先级在前）
      this.matchers.sort((a, b) => b.priority - a.priority);
    }

    return capabilityConfig;
  }

  /**
   * 获取能力
   */
  get(capabilityKey) {
    const capability = this.capabilities.get(capabilityKey);
    if (!capability) {
      throw new Error(`Capability ${capabilityKey} not found`);
    }
    return capability;
  }

  /**
   * 获取所有能力
   */
  getAll(context = {}) {
    return Array.from(this.capabilities.values()).filter((capability) => {
      // 检查权限
      if (context.user && capability.requiredPermissions.length > 0) {
        if (typeof context.user.hasPermissions === 'function') {
          if (!context.user.hasPermissions(capability.requiredPermissions)) {
            return false;
          }
        }
      }

      // 检查可用性
      if (!capability.isAvailable(context)) {
        return false;
      }

      return true;
    });
  }

  /**
   * 按分类获取能力
   */
  getByCategory(category, context = {}) {
    return this.getAll(context).filter((capability) => capability.category === category);
  }

  /**
   * 智能匹配能力
   */
  match(message, context = {}) {
    const normalizedMessage = String(message || '').toLowerCase().trim();

    // 遍历匹配器（已按优先级排序）
    for (const matcher of this.matchers) {
      // 检查可用性
      if (!matcher.capability.isAvailable(context)) {
        continue;
      }

      // 检查权限
      if (context.user && matcher.capability.requiredPermissions.length > 0) {
        if (typeof context.user.hasPermissions === 'function') {
          if (!context.user.hasPermissions(matcher.capability.requiredPermissions)) {
            continue;
          }
        }
      }

      // 自定义条件匹配
      if (matcher.condition) {
        try {
          if (matcher.condition(message, context)) {
            return matcher.capability;
          }
        } catch (error) {
          console.warn(`Matcher condition failed for ${matcher.capability.key}:`, error);
        }
      }

      // 正则匹配
      if (matcher.regex && matcher.regex.test(normalizedMessage)) {
        return matcher.capability;
      }

      // 关键词匹配
      if (matcher.keywords.length > 0) {
        const hasKeyword = matcher.keywords.some((keyword) =>
          normalizedMessage.includes(String(keyword).toLowerCase())
        );
        if (hasKeyword) {
          return matcher.capability;
        }
      }
    }

    // 返回默认 fallback 能力（优先级 -1）
    const fallback = this.matchers.find((m) => m.priority === -1);
    if (fallback && fallback.capability.isAvailable(context)) {
      return fallback.capability;
    }

    // 如果没有 fallback，返回第一个可用能力
    const available = this.getAll(context);
    if (available.length > 0) {
      return available[0];
    }

    throw new Error('No available capability found');
  }

  /**
   * 检查能力是否存在
   */
  has(capabilityKey) {
    return this.capabilities.has(capabilityKey);
  }

  /**
   * 清除所有能力
   */
  clear() {
    this.capabilities.clear();
    this.matchers = [];
  }
}

// 全局能力注册中心实例
export const capabilityRegistry = new CapabilityRegistry();
