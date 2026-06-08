# 架构评估与优化建议

评估日期：2026-06-08
代码库：www.spiraxsarcocn.com Node.js 迁移层

## 当前架构总览

### 代码规模
- `server.mjs`: **5,880 行** (单文件)
- 路由判断分支：**99 个** if/else 条件
- Services 层：16 个文件，约 3,610 行
- 总体源代码：约 456KB

### 架构特点
✅ **优点**：
1. **零依赖设计**：仅使用 Node.js 内置模块，避免 npm 依赖地狱
2. **服务层清晰**：业务逻辑与数据库操作封装在 services/ 中
3. **功能完整**：已实现完整的后台管理、REST API、静态生成功能
4. **兼容性好**：保持了与旧 ASP 系统的 URL 兼容性

⚠️ **问题点**：
1. **单文件路由过大**：5,880 行的 server.mjs 维护困难
2. **路由匹配低效**：99 个串行 if 判断，O(n) 复杂度
3. **代码重复高**：大量相似的认证检查、错误处理模板
4. **扩展性受限**：添加新路由需要编辑超长文件

## 架构优化建议

### 优先级 1：路由层重构 ⭐⭐⭐⭐⭐

**问题**：当前所有路由判断都在一个 5,880 行的函数中串行匹配。

**建议**：引入轻量级路由系统，**不引入外部依赖**。

```javascript
// node-app/src/router.mjs
export class Router {
  constructor() {
    this.routes = new Map(); // method:pattern -> handler
  }
  
  add(method, pattern, handler) {
    const key = `${method}:${pattern}`;
    this.routes.set(key, { pattern, handler, isExact: !pattern.includes(':') });
  }
  
  async match(method, pathname) {
    // 1. 精确匹配（O(1)）
    const exactKey = `${method}:${pathname}`;
    if (this.routes.has(exactKey)) {
      return this.routes.get(exactKey);
    }
    
    // 2. 参数匹配（O(m)，m = 动态路由数）
    for (const [key, route] of this.routes) {
      if (!key.startsWith(method)) continue;
      if (route.isExact) continue;
      
      const params = matchPattern(route.pattern, pathname);
      if (params) {
        return { ...route, params };
      }
    }
    
    return null;
  }
}
```

**效果**：
- 精确路由从 O(n) 降至 O(1)
- 减少 80% 的路由匹配代码
- 易于测试和维护

**实施成本**：中等（约 2-3 天）

---

### 优先级 2：路由分组模块化 ⭐⭐⭐⭐

**问题**：所有路由逻辑混杂在一个文件中。

**建议**：按功能域拆分路由模块。

```
node-app/src/routes/
├── admin/
│   ├── auth.mjs          # 登录、登出、会话
│   ├── dashboard.mjs     # 后台首页、导航
│   ├── content.mjs       # 产品、新闻、招聘管理
│   └── system.mjs        # 配置、模板、管理员
├── api/
│   ├── products.mjs      # REST API: /api/products
│   ├── news.mjs          # REST API: /api/news
│   ├── jobs.mjs          # REST API: /api/jobs
│   └── uploads.mjs       # 上传接口
├── static-gen.mjs        # 静态生成路由
└── legacy.mjs            # 旧 ASP 兼容路由
```

**server.mjs 简化为**：
```javascript
import { Router } from './router.mjs';
import adminAuthRoutes from './routes/admin/auth.mjs';
import apiProductsRoutes from './routes/api/products.mjs';
// ...

const router = new Router();
adminAuthRoutes(router);
apiProductsRoutes(router);
// ...

export async function handleRequest(req, res) {
  const route = await router.match(req.method, pathname);
  if (route) {
    return route.handler(req, res, route.params);
  }
  // fallback to static files
}
```

**效果**：
- server.mjs 从 5,880 行降至 ~300 行
- 路由文件按功能分离，单文件 100-200 行
- 并行开发不冲突

**实施成本**：中高（约 3-5 天）

---

### 优先级 3：中间件系统 ⭐⭐⭐

**问题**：认证检查、错误处理在每个路由中重复。

**建议**：实现轻量级中间件链。

```javascript
// node-app/src/middleware/auth.mjs
export function requireAuth(handler) {
  return async (req, res, params) => {
    const session = requireAdminSession(req, res);
    if (!session) {
      return; // 已发送 401 响应
    }
    req.session = session;
    return handler(req, res, params);
  };
}

// 使用示例
router.add('GET', '/admin/dashboard', requireAuth(async (req, res) => {
  return sendHtml(res, 200, renderDashboard(req.session));
}));
```

**效果**：
- 消除 80%+ 的认证重复代码
- 统一错误处理和日志记录
- 易于添加新中间件（日志、限流等）

**实施成本**：低（约 1-2 天）

---

### 优先级 4：分离静态生成器 ⭐⭐⭐

**问题**：静态生成逻辑与 Web 服务器耦合。

**建议**：将 `static-builder.mjs` 独立为 CLI 工具。

```bash
# 当前
npm run build:static

# 优化后
node-app/bin/build-static --sections=all
node-app/bin/build-static --sections=products,news --output=preview
```

**效果**：
- 静态生成可独立运行（CI/CD、定时任务）
- 减少 server.mjs 的静态生成路由代码
- 提升构建性能（无需启动 HTTP 服务器）

**实施成本**：低（约 1 天）

---

### 优先级 5：统一错误处理 ⭐⭐

**问题**：错误响应格式不一致，try-catch 分散。

**建议**：引入全局错误处理器。

```javascript
// node-app/src/middleware/error-handler.mjs
export function errorHandler(handler) {
  return async (req, res, params) => {
    try {
      return await handler(req, res, params);
    } catch (error) {
      console.error(`[Error] ${req.method} ${req.url}:`, error);
      
      if (error.code === 'ENOENT') {
        return sendApiError(res, 404, 'Resource not found');
      }
      if (error.code === 'SQLITE_CONSTRAINT') {
        return sendApiError(res, 400, 'Data constraint violation');
      }
      
      return sendApiError(res, 500, 'Internal server error');
    }
  };
}
```

**效果**：
- 统一错误响应格式
- 减少重复的 try-catch 代码
- 便于错误监控和日志记录

**实施成本**：低（约 1 天）

---

## 不建议的优化

### ❌ 引入 Express/Fastify 框架
**原因**：
- 违背零依赖设计原则
- 增加 20MB+ node_modules
- 框架升级风险

### ❌ 改用 TypeScript
**原因**：
- 编译步骤增加复杂度
- 当前 JSDoc 注释已足够提供类型提示
- 迁移成本高（数千行代码）

### ❌ 引入 ORM (如 Prisma/TypeORM)
**原因**：
- SQLite 查询简单，直接 SQL 更清晰
- ORM 额外抽象层降低性能
- 增加依赖和学习曲线

---

## 推荐实施路线图

### 阶段 1：快速见效（1-2 周）
1. ✅ 实现自研路由器（Router 类）
2. ✅ 添加认证中间件
3. ✅ 统一错误处理

**预期效果**：代码可读性提升 50%，bug 减少 30%

### 阶段 2：结构优化（2-3 周）
4. ✅ 路由分组模块化（按功能域拆分）
5. ✅ 分离静态生成器为独立 CLI

**预期效果**：server.mjs 缩减至 300 行，维护效率提升 70%

### 阶段 3：增强功能（按需）
6. ⏳ 添加请求日志中间件
7. ⏳ API 响应缓存层
8. ⏳ 静态生成增量构建

---

## 性能基准测试建议

在优化前后，建议测量以下指标：

```bash
# 路由匹配性能
ab -n 10000 -c 100 http://127.0.0.1:3000/api/products

# 静态生成速度
time npm run build:static

# 内存占用
node --expose-gc --max-old-space-size=512 src/server.mjs
```

**当前估算**：
- 路由匹配：~0.5ms/请求（串行匹配）
- 静态生成：~5-10 秒（全站）
- 内存占用：~50MB（空载）

**优化后预期**：
- 路由匹配：~0.05ms/请求（Map 查找）
- 静态生成：~3-5 秒（并行优化）
- 内存占用：~45MB（减少闭包）

---

## 总结

### 核心建议
1. **必须做**：路由层重构（优先级 1、2）
2. **应该做**：中间件系统（优先级 3）
3. **可以做**：静态生成分离、错误处理（优先级 4、5）

### 保持不变
- ✅ 零外部依赖原则
- ✅ 生成的 HTML URL 结构
- ✅ 与旧 ASP 的兼容性
- ✅ SQLite 数据库方案
- ✅ Service 层架构

### 投入产出比
- **高回报**：路由重构（减少 80% 维护成本）
- **中回报**：中间件系统（提升代码复用）
- **低回报**：微优化（过早优化）

**建议优先实施阶段 1 和阶段 2，共需 3-5 周。**
