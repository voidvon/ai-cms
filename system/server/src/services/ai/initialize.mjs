import { getDb } from '../../db.mjs';
import {
  SessionManager,
  MemorySessionStorage,
  DatabaseSessionStorage,
  toolRegistry,
  capabilityRegistry,
  contextBuilder,
  UserContextProvider,
  ConversationHistoryProvider,
  BusinessDataProvider,
  AiOrchestrator,
  auditMiddleware,
  rateLimitMiddleware,
  permissionMiddleware,
  errorHandlerMiddleware,
  performanceMiddleware,
} from './core/index.mjs';
import { registerAllTools } from './tools/index.mjs';
import { registerAllCapabilities } from './capabilities/index.mjs';

let orchestrator = null;
let isInitialized = false;

/**
 * 初始化 AI 服务
 * 应在服务器启动时调用一次
 */
export function initializeAiService(options = {}) {
  if (isInitialized) {
    return orchestrator;
  }

  // 1. 注册所有工具
  registerAllTools();

  // 2. 注册所有能力
  registerAllCapabilities();

  // 3. 设置上下文构建器
  const db = getDb();
  contextBuilder.addProvider(new UserContextProvider(db));
  contextBuilder.addProvider(new ConversationHistoryProvider(db));
  contextBuilder.addProvider(new BusinessDataProvider(db));

  // 4. 创建会话管理器
  const sessionStorage = options.useDatabase
    ? new DatabaseSessionStorage(db)
    : new MemorySessionStorage();
  const sessionManager = new SessionManager(sessionStorage);

  // 5. 设置中间件
  const middlewares = [
    errorHandlerMiddleware(),
    auditMiddleware({ verbose: options.verbose || false }),
    performanceMiddleware({ threshold: 5000 }),
    permissionMiddleware(),
    rateLimitMiddleware({ maxRequests: 20, windowMs: 60000 }),
  ];

  // 6. 创建编排器
  orchestrator = new AiOrchestrator({
    sessionManager,
    capabilityRegistry,
    toolRegistry,
    contextBuilder,
    middlewares,
  });

  isInitialized = true;

  console.log('AI service initialized successfully');
  console.log(`- Tools registered: ${toolRegistry.getAll().length}`);
  console.log(`- Capabilities registered: ${capabilityRegistry.getAll().length}`);

  return orchestrator;
}

/**
 * 获取 AI 编排器实例
 */
export function getAiOrchestrator() {
  if (!orchestrator) {
    throw new Error('AI service not initialized. Call initializeAiService() first.');
  }
  return orchestrator;
}

/**
 * 重置 AI 服务（主要用于测试）
 */
export function resetAiService() {
  orchestrator = null;
  isInitialized = false;
  toolRegistry.clear();
  capabilityRegistry.clear();
  contextBuilder.clear();
}
