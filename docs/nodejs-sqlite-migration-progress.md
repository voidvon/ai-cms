# Node.js + SQLite 迁移进度

> 历史说明：本文是早期 `node-app/` 迁移阶段记录，文中的目录、命令、表结构和 `products/news` 命名大多反映当时状态，不代表当前以 `system/server`、`system/admin`、数据库模板为核心的实际架构。

更新日期：2026-06-06

## 当前结论

旧 Classic ASP 后台正在迁移到 `node-app/` 下的 Node.js + SQLite 实现。当前目标是保留旧 ASP 后台 URL、表单字段、静态页生成入口和模板占位符，不新增业务功能。

当前后台已经可以打开和登录：

- 后台地址：`http://127.0.0.1:3103/spck/login.asp`
- 测试账号：`admin`
- 测试密码：`secret123`
- 当前服务入口：`node-app/src/server.mjs`
- 当前数据库：`node-app/data/site.sqlite`

验证码按当前要求暂缓，不计入本轮完成范围。

## 已完成

### 基础迁移

- 已建立 Node 项目目录：`node-app/`
- 已建立 SQLite schema：管理员、会话、产品、产品分类、产品图片、新闻、新闻分类、招聘、留言、联系方式、站点配置、Meta、公司栏目、模板和自定义标签等表
- 已实现本地启动：`npm --prefix node-app run start`
- 已实现静态生成命令：`npm --prefix node-app run build:static`
- 已实现数据库初始化：`npm --prefix node-app run db:init`
- 已实现管理员创建：`npm --prefix node-app run admin:create -- admin secret123`
- 已实现 Access/CSV 导入链路：
  - `node-app/scripts/export-access.py`
  - `node-app/scripts/import-csv.mjs`
- 已实现旧库编码修复：
  - `node-app/scripts/repair-legacy-encoding.mjs`
  - `node-app/scripts/repair-content-visibility-from-csv.mjs`
  - CSV 导入后会自动执行一次编码修复
  - 当前已覆盖 `site_config`、`products`、`product_categories`、`news.summary`、`news.keywords`、`custom_labels`
  - 已额外清理一批旧新闻摘要/关键词里的乱码和历史营销尾巴（如 `上海彪维供应`、转载署名等）
  - 本轮已新增产品侧清洗：`products.name`、`products.code`、`products.summary`、`products.keywords` 中的旧品牌词和 `中国驰名商标` 类营销尾巴会被自动修复
  - 已实际回写一次产品修复，共修正 `products` 相关字段 `234` 处、覆盖 `118` 行
  - 已修正产品导入时旧 `show` 字段到 `is_visible` 的映射语义，旧 CSV 中 `show=1` 现会导入为前台可见
  - 已实际回写一次产品可见性修复，共同步 `429` 行产品的 `is_visible`
  - 已清理 `BM_top`、`BM_indextop`、`BM_linkind` 等旧自定义标签里的旧品牌名和旧域名残留

### 登录与后台框架

已兼容旧后台入口：

- `/spck/login.asp`
- `/spck/check.asp`
- `/spck/index.asp`
- `/spck/top.asp`
- `/spck/left.asp`
- `/spck/main.asp`
- `/spck/exitsystem.asp`
- `/spck/err.asp`
- `/spck/chklogin.asp`

说明：

- 登录后会写入新旧兼容 cookie：`admin_token`、`globalecmaster`、`masterflag`、`adminid`
- 旧后台权限码仍在 Node 侧做兼容判断
- 登录验证码暂缓

### 产品模块

已兼容旧后台入口：

- `/spck/cn/produts/prod.asp`
- `/spck/cn/produts/prod_add.asp`
- `/spck/cn/produts/prod_edit.asp?id=...`
- `/spck/cn/produts/prod_save.asp?action=add`
- `/spck/cn/produts/prod_save.asp?action=save`
- `/spck/cn/produts/prod.asp?action=del`

已完成能力：

- 产品列表、添加、编辑、删除
- 旧字段映射到 SQLite：`typeid`、`prodName`、`prodCode`、`desc`、`content`、`magicfacepic1`、`magicfacepic2`
- 删除产品时同步删除关联上传图片文件
- 产品服务层已统一对外输出清洗后的 `name`、`code`、`summary`、`keywords`，避免前台搜索、列表和详情再次带出旧品牌词

### 产品分类模块

已兼容旧后台入口：

- `/spck/cn/produts/prodcat.asp`
- `/spck/cn/produts/prodcat_add.asp`
- `/spck/cn/produts/prodcat_edit.asp?id=...`
- `/spck/cn/produts/prodcat_save.asp?action=add`
- `/spck/cn/produts/prodcat_save.asp?action=Save`
- `/spck/cn/produts/prodcat_save.asp?action=del&id=...`

已完成能力：

- 分类列表、添加、编辑、删除
- 兼容旧 `Root=0` 语义
- 分类删除后子分类回到根级，避免悬空父级

### 产品图片库

已完成服务层：`node-app/src/services/product-photos.mjs`

已兼容旧后台入口：

- `/spck/cn/produts/prodphoto.asp`
- `/spck/cn/produts/prodphoto_add.asp`
- `/spck/cn/produts/prodphoto_save.asp?action=add`
- `/spck/cn/produts/photoshow.asp`

已完成能力：

- 产品图片库列表、添加、删除、选图
- 接回旧上传 iframe
- 删除图片库记录时同步删除 `uploadfile/` 下对应文件

### 新闻模块

已兼容旧后台入口：

- `/spck/cn/news/News_index.asp`
- `/spck/cn/news/News_add.asp`
- `/spck/cn/news/News_edit.asp?newsid=...`
- `/spck/cn/news/News_save.asp?action=add`
- `/spck/cn/news/News_save.asp?action=save`
- `/spck/cn/news/News_index.asp?action=del`

已完成能力：

- 新闻列表、添加、编辑、删除
- 旧字段映射到 SQLite：`typeid`、`title`、`IncludePic`、`desc`、`content`、`picture`、`key`、`tjhome`
- 删除新闻时同步删除关联上传图片文件

### 新闻分类模块

已兼容旧后台入口：

- `/spck/cn/news/Class.asp`
- `/spck/cn/news/Class_add.asp`
- `/spck/cn/news/Class_edit.asp?id=...`
- `/spck/cn/news/Class_Save.asp?action=add`
- `/spck/cn/news/Class_Save.asp?action=Save`
- `/spck/cn/news/Class_Save.asp?action=del&id=...`

已完成能力：

- 新闻分类列表、添加、编辑、删除
- 兼容旧 `Root=0` 语义

### 公司信息模块

已兼容旧后台入口：

- `/spck/cn/corporation/Co_Class.asp`
- `/spck/cn/corporation/Co_Class_add.asp`
- `/spck/cn/corporation/Co_Class_edit.asp?id=...`
- `/spck/cn/corporation/Co_Class_Save.asp?action=add`
- `/spck/cn/corporation/Co_Class_Save.asp?action=edit`
- `/spck/cn/corporation/Co_Class.asp?action=del`
- `/spck/cn/corporation/co_edit.asp?id=...`
- `/spck/cn/corporation/Co_Save.asp?action=save`

已完成能力：

- 公司栏目分类管理
- 公司栏目内容编辑
- 旧字段 `coname`、`root`、`OrderID`、`sitepath`、`siteurl`、`Centern` 已映射或保存到兼容字段

### 招聘模块

已完成服务层：`node-app/src/services/jobs.mjs`

已兼容旧后台入口：

- `/spck/cn/job/job.asp`
- `/spck/cn/job/job_add.asp`
- `/spck/cn/job/job_edit.asp?id=...`
- `/spck/cn/job/job_save.asp?action=add`
- `/spck/cn/job/job_save.asp?action=Save`
- `/spck/cn/job/job.asp?action=del&id=...`

已完成能力：

- 招聘列表、添加、编辑、删除
- 旧字段 `jobName`、`address`、`jobnob`、`linkren`、`phone`、`state`、`content` 已映射到 SQLite

### 联系方式模块

已兼容旧后台入口：

- `/spck/cn/offices/Offices.asp`
- `/spck/cn/offices/Offices_add.asp`
- `/spck/cn/offices/Offices_edit.asp?id=...`
- `/spck/cn/offices/Offices_save.asp?action=add`
- `/spck/cn/offices/Offices_save.asp?action=save`
- `/spck/cn/offices/Offices_save.asp?action=del&id=...`

已完成能力：

- 办事处联系方式列表、添加、编辑、删除
- 旧字段 `OfficeName`、`Address`、`Tel`、`Fax`、`Contact`、`Email`、`PostCode` 已映射到 SQLite

### 留言模块

已兼容前台旧提交入口：

- `/ajaxcode/prodmsg.asp?action=add`
- `/ajaxcode/msg.asp?action=msgadd`

已兼容旧后台入口：

- `/spck/cn/msg/Msg.asp`
- `/spck/cn/msg/show.asp?id=...`
- `/spck/cn/msg/chu.asp?id=...`
- `/spck/cn/msg/Msg.asp?action=del`

已完成能力：

- 留言提交
- 后台列表和详情查看
- 标记已处理
- 多选删除
- 处理日期保存在 `messages.legacy_extra.handled_at`

### 网站配置与 Meta

已兼容旧网站配置入口：

- `/spck/cn/config/Config.asp`
- `/spck/cn/config/Config.asp?action=save`

已兼容旧 Meta 入口：

- `/spck/cn/config/Meta_keywords.asp`
- `/spck/cn/config/Meta_keywords_add.asp`
- `/spck/cn/config/Mate_edit.asp?id=...`
- `/spck/cn/config/Mate_save.asp?action=add`
- `/spck/cn/config/Mate_save.asp?action=edit`

已完成能力：

- 网站配置查看和保存
- Meta 列表、添加、编辑和保存
- 兼容旧模板里的 `#HOPE_Meta_Keywords(typeid)#`、`#HOPE_Meta_Description(typeid)#`

### 管理员模块

已兼容旧后台入口：

- `/spck/system/admin_admin.asp`
- `/spck/system/admin_admin_ok.asp?action=add`
- `/spck/system/admin_admin_ok.asp?id=...`
- `/spck/system/admin_admin_ok.asp?action=addsave`
- `/spck/system/admin_admin_ok.asp?action=editsave&id=...`
- `/spck/system/admin_adminmodifypwd.asp`
- `/spck/system/admin_adminmodifypwd.asp?action=editsave`
- `/spck/system/admin_admin.asp?action=del&id=...`

已完成能力：

- 管理员列表、添加、编辑、删除
- 当前管理员修改密码
- 密码继续兼容旧 `legacy-md5-16` 方案
- 禁止删除当前登录管理员

### 模板与自定义标签

已完成服务层：

- `node-app/src/services/template-variants.mjs`
- `node-app/src/services/custom-labels.mjs`

已兼容旧后台入口：

- `/spck/cn/webtemp/index.asp`
- `/spck/cn/webtemp/worldec_index.asp?id=...`
- `/spck/cn/webtemp/worldec_co.asp?id=...`
- `/spck/cn/webtemp/worldec_news.asp?id=...`
- `/spck/cn/webtemp/worldec_service.asp?id=...`
- `/spck/cn/webtemp/worldec_prod.asp?id=...`
- `/spck/cn/webtemp/worldec_job.asp?id=...`
- `/spck/cn/webtemp/worldec_contact.asp?id=...`
- `/spck/cn/webtemp/worldec_msg.asp?id=...`
- `/spck/cn/webtemp/prod/worldec_index.asp?id=...`
- `/spck/cn/webtemp/prod/worldec_sort2.asp?id=...`
- `/spck/cn/webtemp/prod/worldec_detail.asp?id=...`
- `/spck/cn/webtemp/news/worldec_index.asp?id=...`
- `/spck/cn/webtemp/news/worldec_detail.asp?id=...`
- `/spck/cn/webtemp/service/worldec_index.asp?id=...`
- `/spck/cn/webtemp/service/worldec_detail.asp?id=...`
- `/spck/cn/webtemp/job/worldec_detail.asp?id=...`
- `/spck/cn/webtemp/cuskind.asp`
- `/spck/cn/webtemp/cuskind_ed.asp?id=...`
- `/spck/cn/webtemp/cuslabel.asp`
- `/spck/cn/webtemp/addcuslabel.asp`
- `/spck/cn/webtemp/cuslabel_ed.asp?id=...`
- `/spck/cn/webtemp/cuscheck.asp?str=...`

已完成能力：

- 模板列表和编辑保存
- 产品、新闻、服务、招聘等模板配置页兼容
- 自定义标签分类管理
- 自定义标签添加、编辑、删除和重名检查
- `service_index`、`Contact` 等旧字段保存到 `template_variants.legacy_extra`
- 自定义标签继续保持 `#BM_xxx#` 形式

### 上传与旧静态路径

已兼容上传入口：

- `/api/uploads`
- `/inc/upload.asp`
- `/inc/upload2.asp`
- `/inc/upload3.asp`

已兼容旧前台入口和路径：

- `/search.asp`
- `/Contact.html`
- `/Product/*.html`
- `/JS/*`

已完成的兼容细节：

- `/search.asp` 已兼容旧版 `POST /Search.asp?action=search`
- 已兼容旧搜索默认占位词 `找找看`、`输入产品名称` 的空搜索语义
- 旧上传 iframe 已补 `CheckUploadForm()`、`UploadLoaded()`、`UploadError()`、`UploadSaved()` 所需回调链路
- 已补 `upload2.asp?type=image` 这类旧编辑器图片对话框上传回填
- `node-app/src/server.mjs` 已拆出可直接调用的 `handleRequest()`，便于在当前沙箱中不监听端口也能做运行态回归
- 已新增 `node-app/scripts/runtime-smoke.mjs`，覆盖 `search.asp`、未登录上传拦截、旧上传表单、旧编辑器图片上传回填脚本
- 上传文件删除已兼容更多旧路径格式，包括裸文件名和部分历史相对路径写法
- 静态构建和后台 HTML 生成后，会统一把正文里的旧站上传图片绝对地址归一为站内 `/UploadFile/...` 路径
- 静态构建会统一把当前站绝对链接归一为站内相对路径，并清理模板源里残留的 `spiraxsarcocn.com` 硬编码
- 已补一轮旧正文站内链接清洗，`bilvie/bilwe` 的 `Product/products/valve/news/service` 这类可确定映射的旧站内链会被归一到本站路径
- 静态构建后会额外清理历史导入内容里的 C0 控制字符，避免脏数据原样落到生成 HTML
- 静态构建已新增一层产品正文营销文案清洗，生成结果中的 `中国驰名商标` 已清零

## 静态 HTML 生成现状

已兼容旧后台生成入口：

- `/manage/makehtml/index.asp`
- `/manage/makehtml/index/index.asp`
- `/manage/makehtml/maketrade.asp`
- `/manage/makehtml/makelist_my.asp`
- `/manage/makehtml/makedetail_my.asp`
- `/manage/makehtml/prod/makelist.asp`
- `/manage/makehtml/prod/maketrade.asp`
- `/manage/makehtml/prod/makedetail.asp`
- `/manage/makehtml/news/makedetail.asp`

已接入 Node 静态生成：

- 首页：`index.html`
- 联系页：`contact.html`
- 留言页：`msg.html`
- 公司栏目页：`about/index.html`、`about/about-*.html`
- 新闻分类页：`news/index.html`、`news/*.html`
- 服务分类页：`service/index.html`、`service/*.html`
- 招聘列表页：`job/index.html`、`job/*.html`
- 产品分类页
- 产品详情页
- 服务详情页
- 新闻详情页
- 招聘详情页（当前数据集中无启用中的招聘记录，因此本轮构建未实际写出详情文件）

## 已验证

已做过的关键验证：

- `node --check node-app/src/server.mjs`
- `node --check node-app/src/services/uploads.mjs`
- `node --check node-app/src/services/custom-labels.mjs`
- `node --check node-app/src/services/template-variants.mjs`
- `node --check node-app/src/static-builder.mjs`
- `node --check node-app/scripts/repair-content-visibility-from-csv.mjs`
- `node --check node-app/scripts/runtime-smoke.mjs`
- `node node-app/scripts/repair-content-visibility-from-csv.mjs`
- `node node-app/scripts/runtime-smoke.mjs`
- `npm --prefix node-app run build:static`
- 生成后的 `node-app/generated/**/*.html` 中 `spiraxsarcocn.com` 绝对链接已清零
- 生成后的 `node-app/generated/**/*.html` 中可确定映射的 `bilvie/bilwe` 旧站内链已清零
- 生成后的 `node-app/generated/**/*.html` 中 `bilvie/bilwe` 域名残留已清零
- 按字节扫描确认生成后的 `node-app/generated/**/*.html` 中历史控制字符已清零
- 新闻/服务分类页里此前抽样出现的摘要乱码已回归为可读文本，静态生成已改为优先走清洗后的摘要兜底逻辑
- 当前 SQLite 中 `products.is_visible` 已恢复为 `429` 条可见、`0` 条隐藏
- `products.name`、`products.code`、`products.summary`、`products.keywords` 中的 `彪维` 旧品牌残留已清零
- `products.summary`、`products.keywords` 中的 `中国驰名商标` 营销尾巴已清零
- 生成后的 `node-app/generated/**/*.html` 中 `中国驰名商标` 已清零
- 生成后的 `node-app/generated/**/*.html` 中 `彪维` 已清零
- 生成后的 `node-app/generated/**/*.html` 中畸形 `http:///` 链接已清零
- 登录旧后台：`POST /spck/check.asp`
- 打开旧后台框架：`/spck/index.asp`
- 打开模板列表：`/spck/cn/webtemp/index.asp`
- 打开自定义标签列表：`/spck/cn/webtemp/cuslabel.asp`
- 打开自定义标签分类：`/spck/cn/webtemp/cuskind.asp`
- 打开产品详情模板配置：`/spck/cn/webtemp/prod/worldec_detail.asp?id=1`
- 保存产品详情模板配置：`/spck/cn/webtemp/prod/worldec_detail.asp?action=saveedit&id=1`
- 检查自定义标签名：`/spck/cn/webtemp/cuscheck.asp?str=BM_top`
- 打开 HTML 生成主菜单：`/manage/makehtml/index.asp`
- 打开一级分类生成菜单：`/manage/makehtml/maketrade.asp`
- `npm --prefix node-app run build:static`
- 公司、新闻分类、服务分类、服务详情、招聘列表、招聘详情生成入口已完成 Node 等价接管
- 产品、新闻、联系方式、招聘、留言、管理员等主要旧后台增删改查入口已做过基本链路验证

## 暂缓项

- 登录验证码暂缓。用户已明确要求“登录验证码先不用做”。

## 尚未完成

仍需继续迁移或回归的旧站能力：

- 生成后的静态 HTML 与旧版模板仍需继续抽样对比，尤其是公司、服务、招聘、新闻分类列表页
- 当前沙箱内直接 `listen 127.0.0.1:<port>` 会触发 `EPERM`，因此虽然已通过 `runtime-smoke.mjs` 做无 socket 运行态验证，但仍未完成一次真实浏览器/IIS 级联调

## 当前注意事项

- 当前工作区包含大量由静态生成产生的 HTML 变更和新增文件，不应随意回滚。
- 当前测试账号写在 `node-app/data/site.sqlite`，仅用于本地迁移验证，后续上线前应替换。
- 迁移原则仍是优先改模板、服务和生成脚本，不直接手工修大量已生成 HTML。

## 下一步建议

建议按以下顺序继续：

1. 对比旧版公司、服务、招聘、新闻分类/list/detail 页面输出。
2. 在可监听端口的环境里补一轮真实浏览器回归，重点确认搜索分页、上传 iframe 提示文案、编辑器图片回填和静态资源路径。
3. 最后再处理登录验证码。
