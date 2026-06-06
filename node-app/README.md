# Node.js + SQLite Migration

这个目录是旧 ASP 站点的轻量迁移骨架，目标是先把动态能力迁到 `Node.js + SQLite`，同时继续复用仓库根目录里的静态页面、图片、CSS 和 JS。

## 当前已实现

- SQLite schema，覆盖产品、新闻、招聘、留言、联系人、管理员、站点配置、模板配置等核心表
- 内置 Node HTTP 服务，无第三方依赖
- 兼容旧后台登录与主框架入口
  - `/spck/login.asp`
  - `/spck/check.asp`
  - `/spck/index.asp`
  - `/spck/left.asp`
  - `/spck/top.asp`
  - `/spck/main.asp`
  - `/spck/exitsystem.asp`
- 兼容旧站常见路径大小写差异
  - `/Search.asp`
  - `/Product/123.html`
  - `/Contact.html`
  - `/JS/...`
- `/search.asp` 动态搜索页
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
  - 默认输出到 `node-app/generated/`
- 上传接口
  - `POST /api/uploads?utype=prod|news`
  - 兼容旧上传页 `/inc/upload.asp`、`/inc/upload2.asp`、`/inc/upload3.asp`
- 兼容旧产品图片库后台页
  - `/spck/cn/produts/prodphoto.asp`
  - `/spck/cn/produts/prodphoto_add.asp`
  - `/spck/cn/produts/prodphoto_save.asp?action=add`
  - `/spck/cn/produts/photoshow.asp`
- 兼容旧产品后台管理页
  - `/spck/cn/produts/prod.asp`
  - `/spck/cn/produts/prod_add.asp`
  - `/spck/cn/produts/prod_edit.asp?id=...`
  - `/spck/cn/produts/prod_save.asp?action=add`
  - `/spck/cn/produts/prod_save.asp?action=save`
- 兼容旧产品分类后台页
  - `/spck/cn/produts/prodcat.asp`
  - `/spck/cn/produts/prodcat.asp?id=...`
  - `/spck/cn/produts/prodcat_add.asp`
  - `/spck/cn/produts/prodcat_edit.asp?id=...`
  - `/spck/cn/produts/prodcat_save.asp?action=add`
  - `/spck/cn/produts/prodcat_save.asp?action=Save`
  - `/spck/cn/produts/prodcat_save.asp?action=del&id=...`
- 兼容旧新闻后台管理页
  - `/spck/cn/news/News_index.asp`
  - `/spck/cn/news/News_add.asp`
  - `/spck/cn/news/News_edit.asp?newsid=...`
  - `/spck/cn/news/News_save.asp?action=add`
  - `/spck/cn/news/News_save.asp?action=save`
- 兼容旧新闻分类后台页
  - `/spck/cn/news/Class.asp`
  - `/spck/cn/news/Class.asp?id=...`
  - `/spck/cn/news/Class_add.asp`
  - `/spck/cn/news/Class_edit.asp?id=...`
  - `/spck/cn/news/Class_Save.asp?action=add`
  - `/spck/cn/news/Class_Save.asp?action=Save`
  - `/spck/cn/news/Class_Save.asp?action=del&id=...`
- 兼容旧办事处联系方式后台页
  - `/spck/cn/offices/Offices.asp`
  - `/spck/cn/offices/Offices_add.asp`
  - `/spck/cn/offices/Offices_edit.asp?id=...`
  - `/spck/cn/offices/Offices_save.asp?action=add`
  - `/spck/cn/offices/Offices_save.asp?action=save`
  - `/spck/cn/offices/Offices_save.asp?action=del&id=...`
- 兼容旧网站配置后台页
  - `/spck/cn/config/Config.asp`
  - `/spck/cn/config/Config.asp?action=save`
- 兼容旧 Meta 信息后台页
  - `/spck/cn/config/Meta_keywords.asp`
  - `/spck/cn/config/Meta_keywords_add.asp`
  - `/spck/cn/config/Mate_edit.asp?id=...`
  - `/spck/cn/config/Mate_save.asp?action=add`
  - `/spck/cn/config/Mate_save.asp?action=edit`
- 兼容旧公司信息后台页
  - `/spck/cn/corporation/Co_Class.asp`
  - `/spck/cn/corporation/Co_Class.asp?action=del`
  - `/spck/cn/corporation/Co_Class_add.asp`
  - `/spck/cn/corporation/Co_Class_edit.asp?id=...`
  - `/spck/cn/corporation/Co_Class_Save.asp?action=add`
  - `/spck/cn/corporation/Co_Class_Save.asp?action=edit`
  - `/spck/cn/corporation/co_edit.asp?id=...`
  - `/spck/cn/corporation/Co_Save.asp?action=save`
- 兼容旧招聘后台页
  - `/spck/cn/job/job.asp`
  - `/spck/cn/job/job.asp?action=del&id=...`
  - `/spck/cn/job/job_add.asp`
  - `/spck/cn/job/job_edit.asp?id=...`
  - `/spck/cn/job/job_save.asp?action=add`
  - `/spck/cn/job/job_save.asp?action=Save`
- 兼容旧管理员后台页
  - `/spck/system/admin_admin.asp`
  - `/spck/system/admin_admin_ok.asp?action=add`
  - `/spck/system/admin_admin_ok.asp?id=...`
  - `/spck/system/admin_admin_ok.asp?action=addsave`
  - `/spck/system/admin_admin_ok.asp?action=editsave&id=...`
  - `/spck/system/admin_adminmodifypwd.asp`
  - `/spck/system/admin_adminmodifypwd.asp?action=editsave`
- 兼容旧留言后台页
  - `/spck/cn/msg/Msg.asp`
  - `/spck/cn/msg/Msg.asp?action=del`
  - `/spck/cn/msg/show.asp?id=...`
  - `/spck/cn/msg/chu.asp?id=...`
- CSV 导入脚本，支持把 Access 导出的表迁入 SQLite
- 兼容旧留言入口
  - `POST /ajaxcode/prodmsg.asp?action=add`
  - `POST /ajaxcode/msg.asp?action=msgadd`

## 使用方式

```bash
cd node-app
npm run db:init
npm run db:export-access
RESET_TABLES=1 npm run db:import
npm run start
```

默认会读取 `node-app/data/site.sqlite`，并把仓库根目录作为静态资源目录。

## 管理员认证

如果你是从旧 ASP 的 Access 库迁移：

```bash
npm run db:export-access
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

兼容旧后台 iframe 上传页：

- `/inc/upload.asp?tMode=2&utype=news`
- `/inc/upload.asp?tMode=3&utype=prod`
- `/inc/upload2.asp?tMode=3&utype=prod`
- `/inc/upload3.asp?tMode=3&utype=prod`

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

如果仓库里还保留着旧 Access 主库 `database/!!@spck@##.asa`，可以直接导出：

```bash
npm run db:export-access
RESET_TABLES=1 npm run db:import
```

## 当前边界

- 还没有完整重写后台 UI
- 上传接口和验证码逻辑仍待迁移
- 当前静态页生成器是轻量版，还没有完全复刻旧 ASP 模板体系

下一步优先建议：

1. 迁移上传接口与图片管理
2. 补验证码、表单防刷和更细粒度的权限校验
3. 继续增强静态页生成器，逐步替代 `manage/makehtml/*.asp`
