import { MemorySession } from '@openai/agents';
import { listAiConversationMessages } from '../conversations.mjs';

/**
 * 会话存储接口的抽象基类
 */
export class SessionStorage {
  async get(sessionId, options = {}) {
    throw new Error('SessionStorage.get must be implemented');
  }

  async set(sessionId, session) {
    throw new Error('SessionStorage.set must be implemented');
  }

  async delete(sessionId) {
    throw new Error('SessionStorage.delete must be implemented');
  }

  async getMessages(sessionId, options = {}) {
    throw new Error('SessionStorage.getMessages must be implemented');
  }
}

/**
 * 内存存储实现
 */
export class MemorySessionStorage extends SessionStorage {
  constructor() {
    super();
    this.sessions = new Map();
    this.messages = new Map();
  }

  async get(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  async set(sessionId, session) {
    this.sessions.set(sessionId, session);
  }

  async delete(sessionId) {
    this.sessions.delete(sessionId);
    this.messages.delete(sessionId);
  }

  async getMessages(sessionId) {
    return this.messages.get(sessionId) || [];
  }

  async saveMessage(sessionId, message) {
    const messages = this.messages.get(sessionId) || [];
    messages.push(message);
    this.messages.set(sessionId, messages);
  }
}

/**
 * 数据库存储实现（用于持久化历史记录）
 */
export class DatabaseSessionStorage extends SessionStorage {
  constructor(db) {
    super();
    this.db = db;
    this.cache = new Map();
  }

  async get(sessionId) {
    // 先从缓存读取
    if (this.cache.has(sessionId)) {
      return this.cache.get(sessionId);
    }
    return null;
  }

  async set(sessionId, session) {
    this.cache.set(sessionId, session);
  }

  async delete(sessionId) {
    this.cache.delete(sessionId);
  }

  async getMessages(sessionId, options = {}) {
    if (!options.user) {
      return [];
    }

    try {
      return listAiConversationMessages(sessionId, {
        user: options.user,
        limit: 50,
      }).map((row) => ({
        role: row.role,
        content: row.content,
        created_at: row.created_at,
      }));
    } catch (error) {
      console.error('Failed to load messages from database:', error);
      return [];
    }
  }

  async saveMessage(sessionId, message) {
    // Message persistence is handled by the AI conversation service so it can
    // enforce user ownership and save metadata consistently.
  }
}

/**
 * 统一会话管理器
 */
export class SessionManager {
  constructor(storage) {
    this.storage = storage;
  }

  /**
   * 获取或创建会话
   */
  async getOrCreate(sessionId, options = {}) {
    let session = await this.storage.get(sessionId, options);

    if (!session) {
      session = new MemorySession({ sessionId });

      // 恢复历史消息
      if (options.restoreHistory) {
        const messages = await this.storage.getMessages(sessionId, options);
        if (messages.length > 0) {
          const items = messages
            .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
            .map((msg) => {
              const text = String(msg.content?.text || '').trim();
              if (!text) return null;
              return msg.role === 'assistant'
                ? {
                  type: 'message',
                  role: 'assistant',
                  content: [{ type: 'output_text', text }],
                  status: 'completed',
                }
                : {
                  type: 'message',
                  role: 'user',
                  content: [{ type: 'input_text', text }],
                };
            })
            .filter(Boolean);

          if (items.length > 0) {
            await session.addItems(items);
          }
        }
      }

      await this.storage.set(sessionId, session);
    }

    return session;
  }

  /**
   * 保存会话
   */
  async save(sessionId, session) {
    await this.storage.set(sessionId, session);
  }

  /**
   * 清除会话
   */
  async clear(sessionId) {
    await this.storage.delete(sessionId);
  }

  /**
   * 保存消息（用于持久化）
   */
  async saveMessage(sessionId, message) {
    if (typeof this.storage.saveMessage === 'function') {
      await this.storage.saveMessage(sessionId, message);
    }
  }
}
