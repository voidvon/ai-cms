# Repository Guidelines

## 项目结构与模块组织
该仓库现为三层混合架构，不再是纯 Classic ASP 站点。

- 根目录是统一启动入口与打包控制层：`server.mjs` 为唯一启动入口，`package.json` 提供根级脚本，`dist/` 为统一发布包输出目录。
- `html/` 是前台发布目录，包含生成后的 HTML、静态资源、上传文件以及部署配置文件如 `robots.txt`、`sitemap.xml`、`web.config`、`.user.ini`。
- `system/server/` 是当前主后端，基于 Fastify + SQLite。`src/routes/` 放路由，`src/services/` 放业务与数据访问，`src/middleware/` 放认证逻辑，`src/static-builder.mjs` 负责静态页生成。
- `data/` 保存运行数据，默认 SQLite 数据库为 `data/site.sqlite`，不要和程序代码混放。
- `system/admin/` 是当前后台管理前端，基于 React + TypeScript + Vite。`src/pages/` 为页面，`src/api/` 为接口封装，`src/components/` 为复用组件，`src/layouts/` 为后台框架。
- `system/templates/` 保存遗留模板源，`system/docs/` 记录迁移、架构评估和后台完成情况。
- `system/server/generated/` 与 `system/server/generated-debug/` 用于静态生成调试产物；默认正式静态生成输出现为根目录下的 `html/`。
- `dist/` 是本地打包生成的部署目录，包含启动入口、后端程序、后台 `dist`、模板和空的 `html/`/`data/` 占位；不要手工维护或提交。

## 构建、测试与开发命令
日常开发以根级单入口启动为主，遗留模板作为静态生成输入保留。

- 根级启动统一服务：`npm start`
- 根级开发模式：`npm run dev`
- 生成统一发布包：`npm run build`
- 显式生成统一发布包：`npm run build:dist`
- 仅构建后台前端：`npm run build:admin`
- 仅生成前台静态页：`npm run build:site`

- 后端安装依赖：`npm --prefix system/server install`
- 启动后端开发服务：`npm --prefix system/server run dev`
- 初始化 SQLite：`npm --prefix system/server run db:init`
- 创建后台管理员：`npm --prefix system/server run admin:create -- <username> <password>`
- 执行静态生成：`npm --prefix system/server run build:static`
- 输出到调试目录：`STATIC_OUTPUT_DIR=generated-debug npm --prefix system/server run build:static`
- 前端安装依赖：`npm --prefix system/admin install`
- 启动后台前端：`npm --prefix system/admin run dev`
- 构建后台前端：`npm --prefix system/admin run build`
- 检查后台前端 lint：`npm --prefix system/admin run lint`
- 快速排查路由或服务：`rg -n "fastify|route|services|buildStaticSite" system/server/src`
- 快速排查模板占位符：`rg -n "#BM_|#hope_" system/templates system/server/src`

提交前至少运行受影响子项目的构建或 lint；若改动涉及部署包结构，还需运行 `npm run build`。若改动涉及模板、内容或分类数据，还需执行一次静态生成并确认 `html/` 下输出正常。

## 部署流程
当前推荐部署模式是上传统一 `dist/` 包，`html/` 不随包上传，由服务器根据数据库和模板现场生成。

- 本地生成发布包：`npm run build`
- 上传根目录 `dist/` 内的内容到服务器目标目录。
- 服务器安装后端生产依赖：`npm --prefix system/server install --omit=dev`
- 服务器准备运行数据库：保留或恢复 `data/site.sqlite`；全新环境可先执行 `npm run db:init` 并创建管理员。
- 服务器生成前台静态内容：`npm run build:site`
- 服务器启动统一入口：`PORT=3000 HOST=0.0.0.0 NODE_ENV=production npm start`

发布更新时不要覆盖服务器已有 `data/site.sqlite`，也不要把本地 `html/` 当作发布源上传。

## 编码风格与命名约定
- `system/server/` 使用 ES Modules，保持现有 `*.mjs` 风格；路由层尽量薄，业务逻辑优先放入 `src/services/`。
- `system/admin/` 使用 TypeScript + React 函数组件；沿用现有页面/API/对话框拆分，不要把请求、表单和布局重新耦合到单文件。
- 遗留模板继续使用 `#BM_*#`、`#hope_*#` 占位符；编辑 `system/templates/` 下文件时尽量保持原有 HTML 结构、命名和编码习惯，避免无关格式化。
- 静态资源、上传目录和生成页文件名保持现有小写规则；不要随意重命名历史目录，否则会破坏旧链接兼容。
- 除非任务明确要求，不要直接手改 `html/` 下批量生成的静态页面，优先修改 `system/templates/`、`system/server/src/static-builder.mjs` 或对应服务层后再重新生成。

## 测试指南
当前仓库没有完整自动化测试，回归以手工验证和构建检查为主。

- 修改 `system/server/` 后，至少验证：`/` 首页、`/admin/` 后台入口、登录、一个列表接口、一个保存接口、静态文件访问，以及受影响的旧兼容路径如 `/search`、`/ajaxcode/msg`、`/admin/build`。
- 修改 `system/admin/` 后，至少运行 `npm --prefix system/admin run build`，并手工检查对应页面的列表、弹窗表单、分页或上传流程。
- 修改模板、站点配置、分类、新闻、产品或公司信息后，运行静态生成并抽查 `html/index.html`、`html/contact.html`、`html/msg.html`、一个产品详情页、一个新闻详情页。
- 修改数据库 schema、导入脚本或编码修复脚本后，额外检查 `data/site.sqlite` 的兼容性，并确认生成页未出现乱码或字段丢失。

## 提交与合并请求
提交信息建议使用简短祈使句，聚焦一个改动主题，例如：`fix static builder contact links`、`update admin product form validation`。

PR 应说明：
- 影响范围：`system/server`、`system/admin`、`system/templates`、`html`，或其中组合
- 是否需要执行 `npm run build` 或至少 `npm run build:site`
- 手工验证页面或接口
- 是否涉及数据库、环境变量、上传目录或部署路径调整

涉及后台界面变更时附截图；涉及静态输出变化时说明是否需要重新发布 `html/` 目录内容。

## 安全与配置提示
- 不要提交真实生产账号、Cookie 密钥或外部数据库路径；环境相关配置重点在 `html/.user.ini`、`html/web.config`、`system/server/src/config.mjs`。
- `data/site.sqlite` 属于运行数据，改 schema 或导入逻辑前先确认迁移方案，不要无说明覆盖现有库文件。
- 上传接口仅允许站点既有图片类型，修改上传逻辑时同步检查 `html/upload/`、`html/uploadfile/` 路径和静态访问兼容性。
- 静态生成默认会清理并重写 `html/` 或指定输出目录；执行 `build:static` 前先确认目标目录与部署预期一致，避免误覆盖人工文件。
- `npm run build` 会清理并重写根目录 `dist/`；不要在 `dist/` 下保存人工文件。
