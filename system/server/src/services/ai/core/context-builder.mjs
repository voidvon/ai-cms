import { hasAiPermissions } from './permissions.mjs';
import { getAiContentStats } from '../query-service.mjs';

/**
 * 上下文提供者接口
 * 每个提供者接收当前上下文并返回增强后的上下文
 */
export class ContextProvider {
  async provide(context) {
    throw new Error('ContextProvider.provide must be implemented');
  }
}

/**
 * 业务上下文构建器
 */
export class ContextBuilder {
  constructor() {
    this.providers = [];
  }

  /**
   * 添加上下文提供者
   */
  addProvider(provider) {
    if (typeof provider === 'function') {
      this.providers.push({ provide: provider });
    } else if (provider instanceof ContextProvider || typeof provider.provide === 'function') {
      this.providers.push(provider);
    } else {
      throw new Error('Provider must be a function or implement ContextProvider interface');
    }
    return this;
  }

  /**
   * 构建完整上下文
   */
  async build(baseContext = {}) {
    let context = { ...baseContext };

    for (const provider of this.providers) {
      try {
        context = await provider.provide(context);
      } catch (error) {
        console.error('Context provider failed:', error);
        // 提供者失败不应阻断整个流程，继续执行
      }
    }

    return context;
  }

  /**
   * 清除所有提供者
   */
  clear() {
    this.providers = [];
  }
}

/**
 * 用户上下文提供者
 */
export class UserContextProvider extends ContextProvider {
  constructor(db) {
    super();
    this.db = db;
  }

  async provide(context) {
    if (context.user && typeof context.user.hasPermissions === 'function') {
      return context;
    }

    if (!context.userId) {
      return context;
    }

    try {
      const user = this.db
        .prepare(`
          SELECT
            a.id,
            a.username,
            COALESCE(g.permission_flags, a.permission_flags, '') AS permission_flags,
            a.group_id,
            g.code AS group_code,
            g.name AS group_name
          FROM admins a
          LEFT JOIN admin_groups g ON g.id = a.group_id
          WHERE a.id = ?
        `)
        .get(context.userId);

      if (!user) {
        return context;
      }

      return {
        ...context,
        user: {
          id: user.id,
          username: user.username,
          role: 'admin',
          group_id: user.group_id,
          group_code: user.group_code || 'super_admin',
          group_name: user.group_name || '超级管理员',
          permission_flags: user.permission_flags || '',
          permissions: this.getUserPermissions(user),
          hasPermissions: (requiredPerms) => hasAiPermissions(user, requiredPerms),
        },
      };
    } catch (error) {
      console.error('Failed to load user context:', error);
      return context;
    }
  }

  getUserPermissions(user) {
    const rawFlags = String(user?.permission_flags || '').trim();
    if (!rawFlags) {
      return [];
    }

    return rawFlags
      .split(',')
      .map((item) => String(item || '').trim())
      .filter(Boolean);
  }
}

/**
 * 会话历史上下文提供者
 */
export class ConversationHistoryProvider extends ContextProvider {
  constructor(db) {
    super();
    this.db = db;
  }

  async provide(context) {
    if (!context.conversationId) {
      return context;
    }

    try {
      // 尝试从数据库加载历史消息
      const messages = this.loadMessages(context.conversationId);

      return {
        ...context,
        conversationHistory: {
          messages: messages.slice(-20), // 最近20条
          topics: this.extractTopics(messages),
          entities: this.extractEntities(messages),
        },
      };
    } catch (error) {
      console.error('Failed to load conversation history:', error);
      return context;
    }
  }

  loadMessages(conversationId) {
    try {
      const rows = this.db
        .prepare(
          `SELECT role, content, created_at
           FROM ai_conversation_messages
           WHERE conversation_id = ?
           ORDER BY created_at ASC
           LIMIT 50`
        )
        .all(conversationId);

      return rows.map((row) => ({
        role: row.role,
        content: typeof row.content === 'string' ? JSON.parse(row.content) : row.content,
        created_at: row.created_at,
      }));
    } catch (error) {
      console.warn('Table ai_conversation_messages may not exist:', error);
      return [];
    }
  }

  extractTopics(messages) {
    // 简单的主题提取（关键词频率）
    const keywords = ['价格', '产品', '合同', '报价', '客户', '条款'];
    const topics = [];

    for (const keyword of keywords) {
      const count = messages.filter((msg) => {
        const text = String(msg.content?.text || '').toLowerCase();
        return text.includes(keyword);
      }).length;

      if (count > 0) {
        topics.push({ keyword, count });
      }
    }

    return topics.sort((a, b) => b.count - a.count).map((t) => t.keyword);
  }

  extractEntities(messages) {
    // 简单的实体提取（可以后续接入 NER）
    const entities = {
      companies: [],
      products: [],
      persons: [],
    };

    // 这里只是占位实现
    return entities;
  }
}

/**
 * 业务数据上下文提供者
 */
export class BusinessDataProvider extends ContextProvider {
  constructor(db) {
    super();
    this.db = db;
  }

  async provide(context) {
    try {
      const productStats = context.user
        ? getAiContentStats({ user: context.user, modelCode: 'product' })
        : { recentItems: [], itemCount: 0 };

      return {
        ...context,
        businessData: {
          recentItems: productStats.recentItems,
          itemCount: productStats.itemCount,
          newsCount: 0,
        },
      };
    } catch (error) {
      console.error('Failed to load business data:', error);
      return context;
    }
  }
}

// 全局上下文构建器实例
export const contextBuilder = new ContextBuilder();
