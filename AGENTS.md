# Repository Guidelines

## 产品定位与对标基线
本项目不是继续维护一个散乱的老站，而是在现有 Node.js 架构上重建一套“前台静态化 + 后台可配置 + 数据库驱动模板”的内容管理系统。后续设计和实现应**明确对标帝国CMS**，但不要求复制其技术栈或源码实现。

- 对标对象是**帝国CMS的产品能力和信息架构**，不是 PHP 代码形态。
- 栏目、内容模型、字段、模板、静态发布、URL 层级、后台操作流应尽量向帝国CMS的使用习惯靠拢。
- 新功能优先考虑“是否符合帝国CMS式 CMS 心智模型”，而不是为了局部页面快速硬编码。
- 允许在当前 Fastify + SQLite + React + TSX 模板体系内做现代化实现，但产物要能支撑帝国CMS风格的站点维护方式。

当前应默认遵守的帝国CMS式约束：

- **栏目是核心组织单元**：栏目树、栏目路径、栏目模板、栏目绑定内容模型，应优先于“散页面”思路。
- **内容模型驱动内容类型**：新闻、产品、单页、下载、案例等应尽量抽象为内容模型或栏目类型，而不是继续增加独立硬编码表单和渲染分支。
- **字段可配置优先**：能通过 `content_models`、`content_model_fields`、翻译表和模板变量解决的，不要回退到写死字段。
- **模板从数据库读取**：当前生效模板、组件模板、变体关系都以数据库为准，不要在源码里偷偷维护另一套真实模板。
- **静态发布是正式输出**：前台最终交付以 `html/` 静态产物为主，动态服务主要承担后台、数据接口、预览和生成能力。
- **兼容旧站路径**：涉及旧 URL、旧上传目录、旧访问入口时，优先做兼容，而不是直接破坏历史链接。

如果一个实现方案更像“定制网站代码”，而不是“帝国CMS式站群/栏目/模型驱动系统”，通常就不是正确方向。

## 项目结构与模块组织
该仓库现为三层混合架构，不再是纯 Classic ASP 站点。

- 根目录是统一启动入口与打包控制层：`server.mjs` 为唯一启动入口，`package.json` 提供根级脚本，`scripts/` 放开发和打包脚本，`dist/` 为统一发布包输出目录。
- `html/` 是前台发布目录，包含生成后的 HTML、静态资源、上传文件以及部署配置文件如 `robots.txt`、`sitemap.xml`、`web.config`、`.user.ini`。
- `data/` 保存运行数据，默认 SQLite 数据库为 `data/site.sqlite`，不要和程序代码混放。
- `system/server/` 是当前主后端，基于 Fastify + SQLite。
  - `src/routes/` 放路由，包括后台接口、认证和旧站兼容入口。
  - `src/services/` 放业务、数据访问、栏目树、栏目路径、内容模型、模板、媒体、SEO、站点配置等核心逻辑。
  - `src/middleware/` 放认证和路由中间件。
  - `src/static-builder.mjs`、`src/site-renderer.mjs`、`src/tsx-template-renderer.mjs` 是静态生成和模板渲染主链路。
  - `src/cms-template-runtime.mjs` 负责数据库 TSX 模板运行时能力；不要绕开它再造一套模板机制。
- `system/admin/` 是当前后台管理前端，基于 React + TypeScript + Vite。
  - `src/pages/` 为后台页面，如栏目、内容模型、模板变体、静态生成、站点配置、媒体资源等。
  - `src/api/` 为接口封装。
  - `src/components/` 为后台复用组件和表单对话框。
  - `src/layouts/` 为后台框架。
- `system/templates/` 仅保留遗留模板与迁移参考，不是当前生效模板来源。
- `system/docs/` 和根目录 `docs/` 记录架构演进、迁移方案、帝国CMS方向分析和后台完成情况。
- `system/server/generated/` 与 `system/server/generated-debug/` 用于静态生成调试产物；默认正式静态生成输出为根目录 `html/`。
- `dist/` 是本地打包生成的部署目录，包含启动入口、后端程序、后台 `dist`、模板和空的 `html/`/`data/` 占位；不要手工维护或提交。

数据库模板体系是当前唯一真源：

- 当前生效页面模板和组件模板以 `templates` 表为准。
- 模板版本历史以 `template_versions` 表为准。
- 模板变体和组件绑定以 `template_variants`、`template_variant_components` 表为准。
- 当前模板引擎已收敛为单一 `TSX`：`templates.engine` 与 `template_versions.engine` 只允许 `tsx`。
- 不要继续恢复、新增或兼容数据库中的 `html` 模板引擎、`svelte` 组件引擎或额外的 island/hydrate 运行路径。

当前模板源码与样式存储规范：

- 模板源码默认按两个核心槽位理解和维护：
  - `tsx_source`：模板结构与渲染逻辑
  - `css_source`：模板样式源码
- `templates` 与 `template_versions` 已完成结构迁移；旧字段 `content`、`published_content` 不再作为模板存储结构的一部分，新增代码禁止恢复、回写或依赖这套旧字段。
- 不要再把 `export const scss` / `export const css` 当成数据库模板存储规范；模板真实数据只能写入 `tsx_source / css_source`，发布态只能写入对应的 `published_*` 字段。
- 如果遇到历史模板源码中仍内嵌样式，应视为一次性迁移输入，而不是长期兼容格式；迁移完成后应直接删除兼容路径，而不是继续保留双写或回退逻辑。
- 页面级、模板级、家族级、站点级的样式归属不再由数据库字段直接表达，而由静态构建器基于模板依赖分析自动分层打包。
- 修改模板导入脚本、模板管理后台、静态构建器、模板预览链路时，必须保证 `tsx_source / css_source / published_*` 在保存、发布、预览、历史版本、静态生成上的语义一致。
- 如果需要处理历史双槽位样式，应先迁移合并到单一 `css_source`，再删除兼容逻辑，不要新增新的双写路径。

## 构建、测试与开发命令
日常开发以根级单入口启动为主；前台页面和组件模板以数据库中的 TSX 模板为准，遗留模板目录仅作参考。

- 根级启动统一服务：`npm start`
- 根级开发模式：`npm run dev`
- 仅启动后端开发服务：`npm run dev:server`
- 仅启动后台前端：`npm run dev:admin`
- 生成统一发布包：`npm run build`
- 显式生成统一发布包：`npm run build:dist`
- 仅构建后台前端：`npm run build:admin`
- 仅生成前台静态页：`npm run build:site`
- 初始化 SQLite：`npm run db:init`
- 创建后台管理员：`npm run admin:create -- <username> <password>`

后端常用命令：

- 后端安装依赖：`npm install -w system/server`
- 启动后端开发服务：`npm --prefix system/server run dev`
- 初始化数据库：`npm --prefix system/server run db:init`
- 导入 CSV：`npm --prefix system/server run db:import`
- 导入站点配置：`npm --prefix system/server run db:import:spirax-site`
- 导入模板：`npm --prefix system/server run db:import:spirax-templates`
- 回填媒体资源：`npm --prefix system/server run db:backfill-media`
- 迁移上传目录：`npm --prefix system/server run db:migrate-uploads`
- 修复旧编码：`npm --prefix system/server run db:repair-encoding`
- 创建管理员：`npm --prefix system/server run admin:create -- <username> <password>`
- 执行静态生成：`npm --prefix system/server run build:static`
- 输出到调试目录：`STATIC_OUTPUT_DIR=generated-debug npm --prefix system/server run build:static`

后台常用命令：

- 前端安装依赖：`npm install -w system/admin`
- 启动后台前端：`npm --prefix system/admin run dev`
- 构建后台前端：`npm --prefix system/admin run build`
- 检查后台前端 lint：`npm --prefix system/admin run lint`
- 类型检查：`npm --prefix system/admin run typecheck`

快速排查：

- 路由或服务：`rg -n "fastify|route|services|buildStaticSite|legacy" system/server/src`
- 栏目与内容模型：`rg -n "content_model|column|path|template_variant" system/server/src system/admin/src`
- TSX 模板与组件引用：`rg -n "component\\(|renderTsxTemplate|cms-template-runtime|TemplateVariantsPage|templates.engine" system/server/src system/admin/src`

提交前至少运行受影响子项目的构建或 lint；若改动涉及部署包结构，还需运行 `npm run build`。若改动涉及模板、内容、栏目、路径、模型字段或站点配置，还需执行一次静态生成并确认 `html/` 下输出正常。

## 部署流程
当前推荐部署模式是上传统一 `dist/` 包，`html/` 不随包上传，由服务器根据数据库和模板现场生成。

- 本地生成发布包：`npm run build`
- 上传根目录 `dist/` 内的内容到服务器目标目录
- 服务器安装根级依赖：`npm install`
- 服务器精简后端为生产依赖：`npm install -w system/server --omit=dev`
- 服务器准备运行数据库：保留或恢复 `data/site.sqlite`；全新环境可先执行 `npm run db:init` 并创建管理员
- 服务器生成前台静态内容：`npm run build:site`
- 服务器启动统一入口：`PORT=3000 HOST=0.0.0.0 NODE_ENV=production npm start`

发布更新时不要覆盖服务器已有 `data/site.sqlite`，也不要把本地 `html/` 当作发布源上传。

## 编码风格与实现约束
- `system/server/` 使用 ES Modules，保持现有 `*.mjs` 风格；路由层尽量薄，业务逻辑优先放入 `src/services/`。
- `system/admin/` 使用 TypeScript + React 函数组件；沿用现有页面/API/对话框拆分，不要把请求、表单和布局重新耦合到单文件。
- 修改栏目、内容模型、模板、模板变量、静态生成逻辑时，优先思考是否符合帝国CMS式“栏目 + 模型 + 模板 + 静态发布”的主链路。
- 不要把当前生效模板硬编码到 `system/server/scripts/`、服务代码、前端源码或遗留模板目录中。
- `system/templates/` 仅用于遗留模板参考和兼容资料，不用于维护当前主题。
- 当前数据库模板只允许 `TSX`；不要再新增、恢复或兼容 `html` 模板引擎、`svelte` 组件引擎或其它并行模板体系。
- 模板结构迁移完成后，不要保留“新旧字段双写”“运行时回退解析旧结构”“发布时再拼回旧结构”这类过渡实现；应直接迁移数据并删除兼容层。
- 静态资源、上传目录和生成页文件名保持现有小写规则；不要随意重命名历史目录，否则会破坏旧链接兼容。
- 除非任务明确要求，不要直接手改 `html/` 下批量生成的静态页面，优先修改数据库 TSX 模板、`system/server/src/static-builder.mjs`、渲染链路或对应服务层后再重新生成。
- 涉及栏目路径、内容 URL、分页 URL、列表/详情路由时，优先复用现有栏目树、栏目路径和旧路由兼容逻辑，不要新开一套路径算法。
- 涉及新闻、产品、单页等内容结构时，优先抽象到内容模型和字段配置，不要继续为某一类内容增加专用硬编码字段。

## 测试与验收指南
当前仓库没有完整自动化测试，回归以手工验证和构建检查为主。

- 修改 `system/server/` 后，至少验证：`/` 首页、`/admin/` 后台入口、登录、一个列表接口、一个保存接口、静态文件访问，以及受影响的旧兼容路径如 `/search`、`/ajaxcode/msg`、`/admin/build`。
- 修改 `system/admin/` 后，至少运行 `npm --prefix system/admin run build`，必要时再跑 `npm --prefix system/admin run lint` 和 `npm --prefix system/admin run typecheck`，并手工检查对应页面的列表、弹窗表单、分页、上传或模板编辑流程。
- 修改模板、站点配置、栏目、栏目路径、新闻、产品、公司信息或内容模型字段后，运行静态生成并抽查 `html/index.html`、`html/contact.html`、`html/msg.html`、一个产品详情页、一个新闻详情页，以及受影响的栏目列表页。
- 如果改动涉及模板管理后台，还要确认模板编辑、历史版本、预览、变体绑定和组件关联正常。
- 修改数据库 schema、导入脚本或编码修复脚本后，额外检查 `data/site.sqlite` 的迁移结果，并确认生成页未出现乱码、字段丢失、旧路径失效，且旧模板字段或旧模板引擎没有被重新引入。
- 如果改动目标是“更接近帝国CMS”，验收时至少要回答三个问题：是否更接近栏目驱动、是否减少硬编码、是否仍保持旧链接兼容。

## 提交与合并请求
提交信息建议使用简短祈使句，聚焦一个改动主题，例如：`fix static builder contact links`、`refactor content model field storage`、`align column paths with empirecms-style hierarchy`。

PR 应说明：

- 影响范围：`system/server`、`system/admin`、`system/templates`、`html`、`data`，或其中组合
- 是否需要执行 `npm run build` 或至少 `npm run build:site`
- 手工验证页面、接口或后台流程
- 是否涉及数据库、环境变量、上传目录、旧 URL 兼容或部署路径调整
- 这次改动与“对标帝国CMS”的关系，是增强了栏目/模型/模板能力，还是仅做旧路径/旧资源访问层面的兼容性修复

涉及后台界面变更时附截图；涉及静态输出变化时说明是否需要重新发布 `html/` 目录内容。

## 安全与配置提示
- 不要提交真实生产账号、Cookie 密钥或外部数据库路径；环境相关配置重点在 `html/.user.ini`、`html/web.config`、`system/server/src/config.mjs`。
- `data/site.sqlite` 属于运行数据，改 schema 或导入逻辑前先确认迁移方案，不要无说明覆盖现有库文件。
- 上传接口仅允许站点既有图片类型，修改上传逻辑时同步检查 `html/upload/`、`html/uploadfile/` 路径和静态访问兼容性。
- 静态生成默认会清理并重写 `html/` 或指定输出目录；执行 `build:static` 前先确认目标目录与部署预期一致，避免误覆盖人工文件。
- `npm run build` 会清理并重写根目录 `dist/`；不要在 `dist/` 下保存人工文件。
- 任何会影响栏目树、内容 URL、模板发布或静态生成的大改，都要先考虑回滚路径和数据库备份，不要直接在生产库上试错。
