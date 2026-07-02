# AI 服务重构迁移指南

## 概览

AI 服务已从硬编码能力架构重构为插件化能力中心架构，支持：
- ✅ 能力插件化注册
- ✅ 工具动态选择
- ✅ 上下文感知指令
- ✅ 权限控制
- ✅ 审计和限流中间件
- ✅ 统一会话管理
- ✅ 向后兼容旧 API

## 架构变化

### 旧架构
```
services/ai/
├── chat.mjs                    # 硬编码单一对话接口
├── capabilities.mjs            # 硬编码能力列表
└── skills/contract.mjs         # 硬编码合同能力
```

### 新架构
```
services/ai/
├── core/                       # 核心基础设施
│   ├── session-manager.mjs     # 统一会话管理
│   ├── tool-registry.mjs       # 工具注册中心
│   ├── capability-registry.mjs # 能力注册中心
│   ├── context-builder.mjs     # 上下文构建器
│   ├── middleware.mjs          # 中间件系统
│   └── orchestrator.mjs        # 统一编排器
├── tools/                      # 工具库
│   ├── business-tools.mjs      # 业务工具
│   ├── database-tools.mjs      # 数据库查询工具
│   └── index.mjs
├── capabilities/               # 能力插件
│   ├── general-chat.mjs        # 通用对话（新）
│   ├── contract-assistant.mjs  # 合同协作
│   ├── document-workspace.mjs  # 文档工作台
│   └── index.mjs
├── initialize.mjs              # 初始化模块
└── index.mjs                   # 统一导出
```

## API 变化

### 1. 获取能力列表

**旧 API:**
```javascript
GET /api/ai/capabilities

{
  "success": true,
  "data": {
    "provider": "openai_agents_js",
    "status": "partial_ready",
    "default_chat_capability": "contract_copilot",
    "chat_capabilities": [
      { "key": "contract_copilot", "label": "合同协作" }
    ]
  }
}
```

**新 API:**
```javascript
GET /api/ai/capabilities

{
  "success": true,
  "data": {
    "provider": "openai_agents_js",
    "status": "ready",
    "default_chat_capability": "general_chat",
    "capabilities": [
      {
        "key": "general_chat",
        "label": "通用对话",
        "description": "支持多轮对话、知识问答、产品查询的全能 AI 助手",
        "icon": "💬",
        "category": "general",
        "available": true
      },
      {
        "key": "contract_assistant",
        "label": "合同协作",
        "description": "连续对话收集价格、条款与合同上下文",
        "icon": "📝",
        "category": "business",
        "available": true
      }
    ]
  }
}
```

### 2. AI 对话接口

**调用方式不变，但能力增强：**

```javascript
POST /api/ai/chat

// 请求（不变）
{
  "conversationId": "chat-123",
  "capability": "general_chat",  // 可选，不传则自动匹配
  "messages": [
    {
      "role": "user",
      "parts": [{ "type": "text", "text": "查询产品信息" }]
    }
  ]
}

// 响应格式不变，流式返回
```

**新特性：**
- 自动能力匹配：不传 `capability` 时，根据消息内容自动选择最合适的能力
- 动态工具选择：根据用户权限和对话内容动态启用工具
- 上下文感知：自动注入用户信息、业务数据、对话历史

### 3. 新增工具列表 API

```javascript
GET /api/ai/tools

{
  "success": true,
  "data": {
    "total": 8,
    "tools": [
      {
        "name": "query_products",
        "description": "查询产品数据库",
        "category": "database",
        "requiresAuth": true,
        "requiredPermissions": ["read:products"]
      },
      {
        "name": "price_lookup",
        "description": "根据产品型号查询价格",
        "category": "business",
        "requiresAuth": false,
        "requiredPermissions": []
      }
    ]
  }
}
```

## 向后兼容

### 1. 旧的对话接口仍然可用

```javascript
// 旧代码无需修改，仍然能正常工作
import { streamAiChat, resetAiConversation } from './services/ai/chat.mjs';

const result = await streamAiChat({
  conversationId: 'chat-123',
  capability: 'contract_copilot',
  message: '生成合同',
});
```

**注意：** 但建议迁移到新的编排器：

```javascript
import { getAiOrchestrator } from './services/ai/initialize.mjs';

const orchestrator = getAiOrchestrator();
const result = await orchestrator.chat({
  conversationId: 'chat-123',
  message: '生成合同',
  userId: adminUser.id,
  capabilityKey: 'contract_assistant',
});
```

### 2. 任务接口保持不变

```javascript
POST /api/ai/tasks/contract_draft/execute

// 仍然使用旧的实现，未来可以逐步迁移
```

## 添加新能力

### 1. 创建能力文件

```javascript
// system/server/src/services/ai/capabilities/my-capability.mjs
import { createAiAgent } from '../../runtime.mjs';
import { capabilityRegistry } from '../../core/capability-registry.mjs';

export const myCapability = {
  key: 'my_capability',
  label: '我的能力',
  description: '做什么的',
  icon: '🚀',
  category: 'custom',

  // 匹配器
  matcher: {
    priority: 5,
    keywords: ['关键词1', '关键词2'],
  },

  // 创建 Agent
  createAgent: ({ tools, instructions }) => {
    return createAiAgent({
      name: 'My Agent',
      instructions: instructions || '你是...',
      tools: tools || [],
    });
  },

  // 选择工具
  selectTools: (context) => {
    return ['tool1', 'tool2'];
  },

  // 增强上下文（可选）
  enhanceContext: (context) => context,

  // 可用性检查
  isAvailable: (context) => true,
};

export function registerMyCapability() {
  capabilityRegistry.register(myCapability);
}
```

### 2. 注册能力

```javascript
// system/server/src/services/ai/capabilities/index.mjs
import { registerMyCapability } from './my-capability.mjs';

export function registerAllCapabilities() {
  registerGeneralChatCapability();
  registerContractAssistantCapability();
  registerDocumentWorkspaceCapability();
  registerMyCapability(); // 添加这行
}
```

### 3. 重启服务即可使用

```bash
npm start
```

## 添加新工具

### 1. 注册工具

```javascript
// system/server/src/services/ai/tools/my-tools.mjs
import { z } from 'zod';
import { toolRegistry } from '../core/tool-registry.mjs';

export function registerMyTools() {
  toolRegistry.register({
    name: 'my_tool',
    description: '我的工具描述',
    category: 'custom',
    requiresAuth: true,
    requiredPermissions: ['read:data'],
    parameters: z.object({
      input: z.string(),
    }),
    async execute({ input }, context) {
      // 工具逻辑
      return { result: 'success' };
    },
  });
}
```

### 2. 在初始化时注册

```javascript
// system/server/src/services/ai/tools/index.mjs
import { registerMyTools } from './my-tools.mjs';

export function registerAllTools() {
  registerBusinessTools();
  registerDatabaseTools();
  registerMyTools(); // 添加这行
}
```

## 配置选项

### 初始化选项

```javascript
// system/server/src/app.mjs
initializeAiService({
  useDatabase: true,  // 使用数据库存储会话历史
  verbose: true,      // 开启详细日志
});
```

### 中间件配置

```javascript
// system/server/src/services/ai/initialize.mjs
const middlewares = [
  errorHandlerMiddleware(),
  auditMiddleware({ verbose: options.verbose || false }),
  performanceMiddleware({ threshold: 5000 }),  // 5秒超时警告
  permissionMiddleware(),
  rateLimitMiddleware({ 
    maxRequests: 20,   // 每分钟最多20次请求
    windowMs: 60000    // 1分钟窗口
  }),
];
```

## 前端集成

### 能力选择器（可选）

```tsx
// 前端可以获取能力列表并让用户选择
const { data } = await api.get('/api/ai/capabilities');
const capabilities = data.capabilities;

<select onChange={(e) => setCapability(e.target.value)}>
  {capabilities.map(cap => (
    <option key={cap.key} value={cap.key}>
      {cap.icon} {cap.label}
    </option>
  ))}
</select>
```

### 自动能力匹配（推荐）

```tsx
// 不传 capability，让后端自动匹配
await api.post('/api/ai/chat', {
  conversationId: chatId,
  // capability: 不传，自动匹配
  messages: [...]
});
```

## 测试

### 1. 测试通用对话

```bash
curl -X POST http://localhost:3000/api/ai/chat \
  -H "Content-Type: application/json" \
  -H "Cookie: session_token=xxx" \
  -d '{
    "conversationId": "test-1",
    "messages": [{
      "role": "user",
      "parts": [{"type": "text", "text": "查询产品列表"}]
    }]
  }'
```

### 2. 测试合同协作

```bash
curl -X POST http://localhost:3000/api/ai/chat \
  -H "Content-Type: application/json" \
  -H "Cookie: session_token=xxx" \
  -d '{
    "conversationId": "test-2",
    "capability": "contract_assistant",
    "messages": [{
      "role": "user",
      "parts": [{"type": "text", "text": "生成销售合同"}]
    }]
  }'
```

### 3. 测试能力自动匹配

```bash
# 包含"合同"关键词，自动匹配到 contract_assistant
curl -X POST http://localhost:3000/api/ai/chat \
  -H "Content-Type: application/json" \
  -H "Cookie: session_token=xxx" \
  -d '{
    "conversationId": "test-3",
    "messages": [{
      "role": "user",
      "parts": [{"type": "text", "text": "帮我起草一份合同"}]
    }]
  }'
```

## 常见问题

### Q: 旧代码需要修改吗？
A: 不需要。新架构完全向后兼容，旧的 API 接口仍然可用。

### Q: 文档工作台还能正常工作吗？
A: 能。文档工作台已重构为插件，但接口保持不变。

### Q: 如何禁用某个能力？
A: 在能力配置中设置 `isAvailable: () => false`。

### Q: 如何限制工具权限？
A: 在工具注册时设置 `requiresAuth: true` 和 `requiredPermissions: ['read:products']`。

### Q: 会话数据存在哪里？
A: 默认存储在内存中。生产环境建议设置 `useDatabase: true` 持久化到数据库。

### Q: 如何调试 AI 调用？
A: 设置 `verbose: true` 启用详细日志，或查看中间件审计日志。

## 下一步

- [ ] 添加更多能力插件（知识问答、数据分析等）
- [ ] 实现 Redis 会话存储
- [ ] 添加工具权限管理 UI
- [ ] 支持自定义 Prompt 模板
- [ ] 添加 AI 调用分析面板
