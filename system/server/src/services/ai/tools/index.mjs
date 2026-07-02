import { registerBusinessTools } from './business-tools.mjs';
import { registerDatabaseTools } from './database-tools.mjs';
import { registerWebTools } from './web-tools.mjs';

/**
 * 注册所有工具到全局工具注册中心
 * 应在服务器启动时调用一次
 */
export function registerAllTools() {
  registerBusinessTools();
  registerDatabaseTools();
  registerWebTools();
}

// 导出工具注册函数
export { registerBusinessTools } from './business-tools.mjs';
export { registerDatabaseTools } from './database-tools.mjs';
export { registerWebTools } from './web-tools.mjs';
