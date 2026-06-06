# Node.js + SQLite Migration

这个目录是旧 ASP 站点的轻量迁移骨架，目标是先把动态能力迁到 `Node.js + SQLite`，同时继续复用仓库根目录里的静态页面、图片、CSS 和 JS。

## 当前已实现

- SQLite schema，覆盖产品、新闻、招聘、留言、联系人、管理员、站点配置、模板配置等核心表
- 内置 Node HTTP 服务，无第三方依赖
- 后台管理入口
  - `/admin/login`
  - `/admin/session`
  - `/admin/frame`
  - `/admin/nav`
  - `/admin/top`
  - `/admin/dashboard`
  - `/admin/logout`
- 兼容旧站常见路径大小写差异
  - `/Product/123.html`
  - `/Contact.html`
  - `/JS/...`
- `/search` 动态搜索页
- 基础 JSON API
  - `GET /health`
  - `GET /api/site-config`
  - `GET /api/contacts`
  - `GET /api/contacts/:id`
  - `POST /api/contacts`
  - `PUT /api/contacts/:id`
  - `DELETE /api/contacts/:id`
  - `GET /api/jobs`
  - `GET /api/jobs/:id`
  - `POST /api/jobs`
  - `PUT /api/jobs/:id`
  - `DELETE /api/jobs/:id`
  - `GET /api/products`
  - `GET /api/products/:id`
  - `POST /api/products`
  - `PUT /api/products/:id`
  - `DELETE /api/products/:id`
  - `GET /api/news`
  - `GET /api/news/:id`
  - `POST /api/news`
  - `PUT /api/news/:id`
  - `DELETE /api/news/:id`
  - `GET /api/messages`
  - `GET /api/messages/:id`
  - `POST /api/messages`
  - `PUT /api/messages/:id`
  - `DELETE /api/messages/:id`
  - `POST /api/admin/login`
  - `GET /api/admin/me`
  - `POST /api/admin/logout`
- 统一静态页生成
  - `npm run build:static`
  - 默认覆盖仓库根目录中的原有静态 HTML
- 上传接口
  - `POST /api/uploads?utype=prod|news`
- 后台上传 iframe
  - `/admin/uploads/frame`
  - `/admin/uploads/frame-image`
  - `/admin/uploads/frame-gallery`
- 旧 `.asp` 后台和动态入口不再开放访问
- 后台管理功能
  - 站点配置、Meta、模板、自定义标签
  - 公司信息、新闻、产品、产品图片、留言、招聘、管理员
  - 静态页生成任务
- CSV 导入脚本，支持把 Access 导出的表迁入 SQLite
- 前台动态提交入口
  - `POST /ajaxcode/prodmsg?action=add`
  - `POST /ajaxcode/msg?action=msgadd`

## 使用方式

```bash
cd node-app
npm run db:init
ACCESS_SOURCE=/path/to/legacy.mdb npm run db:export-access
RESET_TABLES=1 npm run db:import
npm run start
```

默认会读取 `node-app/data/site.sqlite`，并把仓库根目录作为静态资源目录。

## 管理员认证

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

1. 先从 Access 导出 CSV，放到 `node-app/import/`
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

## 当前边界

- 还没有完整重写后台 UI
- 上传接口和验证码逻辑仍待迁移
- 当前静态页生成器是轻量版，还没有完全复刻旧 ASP 模板体系

下一步优先建议：

1. 迁移上传接口与图片管理
2. 补验证码、表单防刷和更细粒度的权限校验
3. 继续增强静态页生成器和后台功能细节
