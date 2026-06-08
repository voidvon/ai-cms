# Node.js + SQLite 迁移 (Fastify)

这个目录是旧 ASP 站点的服务端迁移层，使用 **Fastify** 框架重构。当前根目录 `server.mjs` 是唯一启动入口，前台生成内容统一输出到根目录 `html/`，运行数据库统一放在根目录 `data/`。

## 架构

- **框架**: Fastify (高性能 Node.js Web 框架)
- **数据库**: SQLite (内置，无需额外安装)
- **路由**: 模块化路由系统，按功能域分组
- **认证**: 基于 Session Token 的身份验证
- **静态生成**: 独立的静态 HTML 生成器

## 当前已实现

### REST API
- `GET /api/health` - 健康检查
- `GET /api/site-config` - 站点配置
- `PUT /api/site-config` - 更新配置（需认证）

#### 产品相关
- `GET /api/products` - 产品列表
- `GET /api/products/search?q=关键词` - 搜索产品
- `GET /api/products/:id` - 产品详情
- `POST /api/products` - 创建产品（需认证）
- `PUT /api/products/:id` - 更新产品（需认证）
- `DELETE /api/products/:id` - 删除产品（需认证）

#### 新闻相关
- `GET /api/news` - 新闻列表
- `GET /api/news/:id` - 新闻详情
- `POST /api/news` - 创建新闻（需认证）
- `PUT /api/news/:id` - 更新新闻（需认证）
- `DELETE /api/news/:id` - 删除新闻（需认证）

#### 招聘相关
- `GET /api/jobs` - 招聘列表
- `GET /api/jobs/:id` - 招聘详情
- `POST /api/jobs` - 创建招聘（需认证）
- `PUT /api/jobs/:id` - 更新招聘（需认证）
- `DELETE /api/jobs/:id` - 删除招聘（需认证）

#### 留言相关
- `POST /api/messages` - 提交留言（公开）
- `GET /api/messages` - 留言列表（需认证）
- `GET /api/messages/:id` - 留言详情（需认证）
- `PUT /api/messages/:id` - 更新留言（需认证）
- `DELETE /api/messages/:id` - 删除留言（需认证）

#### 联系人相关
- `GET /api/contacts` - 联系人列表
- `POST /api/contacts` - 创建联系人（需认证）
- `PUT /api/contacts/:id` - 更新联系人（需认证）
- `DELETE /api/contacts/:id` - 删除联系人（需认证）

#### 上传相关
- `POST /api/uploads?utype=prod|news` - 文件上传（需认证）

#### 管理员相关
- `GET /api/admin/me` - 获取当前用户信息（需认证）
- `GET /api/admin/list` - 管理员列表（需认证）
- `POST /api/admin` - 创建管理员（需认证）
- `PUT /api/admin/:id` - 更新管理员（需认证）
- `PUT /api/admin/:id/password` - 更新密码（需认证）
- `DELETE /api/admin/:id` - 删除管理员（需认证）

### 后台管理页面
- `GET /admin/login` - 登录页面
- `POST /admin/login` - 登录处理
- `GET /admin/logout` - 登出
- `GET /admin/dashboard` - 管理后台首页（需认证）
- `GET /admin/build` - 静态生成管理页面（需认证）
- `POST /admin/build/generate?section=all` - 执行静态生成（需认证）

### 前台动态路由
- `GET /search?keyword=关键词` - 搜索页面
- `POST /ajaxcode/msg?action=add` - 提交留言
- `POST /ajaxcode/prodmsg?action=add` - 提交产品咨询

### 静态文件服务
- 自动服务根目录 `html/` 下的所有前台静态文件
- 支持大小写不敏感的路径匹配（兼容旧链接）
- 自动处理 `/index.html` 等默认文档

## 使用方式

根目录推荐命令：

```bash
# 生成统一发布包，输出到根目录 dist/
npm run build

# 仅在当前环境生成前台静态 HTML，输出到根目录 html/
npm run build:site

# 启动统一服务入口
npm start
```

发布服务器推荐上传根目录 `dist/` 内的内容，不上传本地 `html/`。服务器准备或保留 `data/site.sqlite` 后，运行 `npm run build:site` 现场生成前台 HTML，再启动服务。

```bash
# 安装依赖
npm install

# 初始化数据库
npm run db:init

# 导入旧数据（可选）
ACCESS_SOURCE=/path/to/legacy.mdb npm run db:export-access
RESET_TABLES=1 npm run db:import

# 创建管理员账号
npm run admin:create -- admin yourpassword

# 启动服务器
npm start              # 生产模式
npm run dev            # 开发模式（自动重载）

# 生成静态页面
npm run build:static
```

服务器默认运行在 `http://127.0.0.1:3000`

## 环境变量

- `PORT`: 服务器端口（默认: 3000）
- `HOST`: 服务器主机（默认: 127.0.0.1）
- `DATABASE_PATH`: SQLite 数据库路径（默认: 根目录 `data/site.sqlite`）
- `LOG_LEVEL`: 日志级别（默认: info）
- `NODE_ENV`: 环境（development/production）
- `COOKIE_SECRET`: Cookie 加密密钥（生产环境务必修改）
- `UPLOAD_MAX_SIZE_KB`: 上传文件大小限制（默认: 400KB）
- `ACCESS_SOURCE`: Access 数据库路径（用于导出）
- `CSV_ENCODING`: CSV 文件编码（默认: utf-8，旧文件用 gbk）
- `RESET_TABLES`: 导入前是否重置表（1 = 是）
- `STATIC_OUTPUT_DIR`: 静态生成输出目录（默认: 根目录 `html/`）

## 管理员认证

### Cookie 方式
登录后会自动设置 `adminToken` cookie，后续请求会自动携带。

### API Token 方式
```bash
# 登录获取 token
curl -X POST http://127.0.0.1:3000/admin/api/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"yourpassword"}'

# 使用 token 访问受保护接口
curl http://127.0.0.1:3000/api/admin/me \
  -H 'Authorization: Bearer YOUR_TOKEN_HERE'
```

## 路由结构

```
src/
├── app.mjs                   # Fastify 应用入口
├── server.mjs                # 启动脚本
├── middleware/
│   └── auth.mjs              # 认证中间件
├── routes/
│   ├── auth.mjs              # 登录/登出
│   ├── legacy.mjs            # 前台动态路由（搜索、留言）
│   ├── api/                  # REST API 路由
│   │   ├── products.mjs
│   │   ├── news.mjs
│   │   ├── jobs.mjs
│   │   ├── messages.mjs
│   │   ├── contacts.mjs
│   │   ├── uploads.mjs
│   │   ├── admin.mjs
│   │   └── site-config.mjs
│   └── admin/                # 后台管理路由
│       ├── index.mjs         # 后台首页、菜单
│       └── static-gen.mjs    # 静态生成页面
├── services/                 # 业务逻辑层（不变）
├── utils/                    # 工具函数（不变）
├── static-builder.mjs        # 静态生成器（不变）
└── static-file-handler.mjs   # 静态文件服务
```

## 迁移说明

### 从旧版本升级

旧的 `server.mjs` 已备份为 `server.mjs.backup`。主要变化：

1. **框架迁移**: 从自研 HTTP 服务器迁移到 Fastify
2. **路由模块化**: 按功能域拆分为独立路由文件
3. **中间件系统**: 统一的认证、错误处理
4. **插件支持**: Cookie、Multipart、CORS 等通过 Fastify 插件实现
5. **更好的日志**: 使用 Pino 结构化日志

### URL 兼容性

✅ **生成的静态 HTML URL 完全不变**：
- `/index.html`
- `/product/123.html`
- `/products/分类名/`
- `/news/456.html`
- 等等...

⚠️ **后台管理 URL 已简化**：
- 旧: `/spck/login.asp` → 新: `/admin/login`
- 旧: `/spck/index.asp` → 新: `/admin/dashboard`
- 旧: `/manage/makehtml/index.asp` → 新: `/admin/build`

✅ **前台动态 URL 保持兼容**：
- `/search?keyword=xxx` - 正常工作
- `/ajaxcode/msg?action=add` - 正常工作
- `/ajaxcode/prodmsg?action=add` - 正常工作

### Services 层无变化

所有 `src/services/` 下的业务逻辑文件保持不变，可以直接使用。

## 当前边界

如果你是从旧 ASP 的 Access 库迁移：

```bash
ACCESS_SOURCE=/path/to/legacy.mdb npm run db:export-access
RESET_TABLES=1 npm run db:import
```

也可以单独再创建一个新的测试管理员：

```bash
npm run admin:create -- admin secret123
```

登录：

```bash
curl -X POST http://127.0.0.1:3000/api/admin/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"secret123"}'
```

受保护接口通过 `Authorization: Bearer <token>` 传 token。

## 上传

统一上传 API：

```bash
curl -X POST 'http://127.0.0.1:3000/api/uploads?utype=news' \
  -H "Authorization: Bearer <token>" \
  -F 'uploadfile=@./lo.gif'
```

后台 iframe 上传页：

- `/admin/uploads/frame?tMode=2&utype=news`
- `/admin/uploads/frame?tMode=3&utype=prod`
- `/admin/uploads/frame-image?tMode=3&utype=prod`
- `/admin/uploads/frame-gallery?tMode=3&utype=prod`

允许格式：`jpg`、`jpeg`、`png`、`gif`

默认大小限制：`400KB`

如果要生成一份新的静态站点预览：

```bash
npm run build:static
```

如果想改输出目录：

```bash
STATIC_OUTPUT_DIR=preview npm run build:static
```

## 导入旧数据

1. 先从 Access 导出 CSV，放到 `system/server/import/`
2. 文件名建议保持旧表名，例如：
   - `benming_ch_prod.csv`
   - `benming_ch_ProdCat.csv`
   - `benming_ch_news.csv`
   - `benming_ch_NewsCat.csv`
   - `benming_master.csv`
   - `benming_ch_config.csv`
3. 运行：

```bash
npm run db:import
```

如果 CSV 不是 UTF-8，可指定编码：

```bash
CSV_ENCODING=gbk npm run db:import
```

如果还需要从外部旧 Access 主库导出，请显式提供文件路径：

```bash
ACCESS_SOURCE=/path/to/legacy.mdb npm run db:export-access
RESET_TABLES=1 npm run db:import
```

## 技术栈

- **Node.js**: 24.x+
- **Fastify**: 5.x (高性能 Web 框架)
- **SQLite**: 内置数据库
- **插件**:
  - `@fastify/cookie` - Cookie 处理
  - `@fastify/multipart` - 文件上传
  - `@fastify/cors` - CORS 支持
  - `@fastify/sensible` - 实用工具（400/404 等快捷方法）

## 后续优化建议

1. **后台 UI**: 构建完整的后台管理界面（可选用 Vue/React）
2. **权限系统**: 细粒度的角色权限管理
3. **验证码**: 添加表单防刷机制
4. **API 文档**: 生成 OpenAPI/Swagger 文档
5. **测试**: 添加单元测试和集成测试
6. **性能**: 添加 Redis 缓存层
7. **监控**: 集成 APM 和错误追踪

## 故障排除

### 端口占用
```bash
# 查看端口占用
lsof -i :3000
# 或修改端口
PORT=8080 npm start
```

### 数据库锁定
```bash
# 如果遇到数据库锁定，重启服务器
pkill -f "node src/server.mjs"
npm start
```

### 日志调试
```bash
# 开启详细日志
LOG_LEVEL=debug npm start
```

## 贡献指南

1. 创建功能分支
2. 修改代码并测试
3. 提交 PR，说明变更内容
4. 确保所有 API 端点正常工作

## License

内部项目，版权所有。
