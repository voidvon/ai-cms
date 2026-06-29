# Repository Guidelines

## Product Baseline
本项目是在当前 Node.js 架构上重建一套“前台静态化 + 后台可配置 + 数据库驱动模板”的 CMS，产品能力和信息架构明确对标帝国 CMS，但不复制其 PHP 技术形态。

- 对标的是帝国 CMS 的栏目树、内容模型、字段配置、模板绑定、静态发布、后台操作流。
- 目标产物必须更像“栏目/模型/模板驱动系统”，而不是“局部页面定制代码”。
- 前台正式交付以根目录 `html/` 静态产物为主；动态服务主要承担后台、接口、预览、静态生成和旧路径兼容。

## Hard Constraints
以下规则是强约束。若当前任务会违反任一条，先停止实现并说明原因，不要直接编码。

1. 栏目是核心组织单元。
   涉及导航、列表、详情、分页、栏目首页、栏目路径时，优先走栏目树、栏目节点、栏目路径服务。

2. 内容类型优先走内容模型。
   新增或调整新闻、产品、单页、下载、案例等内容结构时，优先修改 `content_models`、`content_model_fields`、翻译表和模板变量。
   不要继续为单一内容类型新增长期硬编码字段或专用渲染分支，除非用户明确要求。

3. 模板真源只能在数据库。
   当前生效页面模板、组件模板、模板版本、模板绑定、模板变体都以数据库表为准：
   `templates`、`template_versions`、`template_bindings`、`template_variants`、`template_variant_components`。
   不要在源码目录或 `system/templates/` 维护另一套真实模板。

4. 模板引擎只能是 `tsx`。
   禁止新增、恢复或兼容 `html` 模板引擎、`svelte` 组件引擎或其它并行模板体系。

5. 模板源码字段只能使用当前双槽位结构。
   允许读写的模板源码字段只有：
   `tsx_source`、`css_source`、`published_tsx_source`、`published_css_source`。
   禁止新增或恢复对旧字段 `content`、`published_content` 的依赖、双写、回填或发布回退。

6. 不要新增过渡兼容层来长期保留旧模板结构。
   如果遇到历史模板源码内嵌样式、旧双槽位样式、旧模板存储格式，应迁移到当前结构后删除兼容逻辑，而不是继续扩展兼容层。

7. 静态发布链路不能绕开当前运行时。
   数据库 TSX 模板渲染必须复用 `system/server/src/cms-template-runtime.mjs`、`tsx-template-renderer.mjs`、`static-builder.mjs`。
   不要再造一套平行的模板执行或静态发布机制。

8. 不要直接手改 `html/` 下的批量生成页面。
   除非用户明确要求修改生成产物本身，否则应修改数据库模板、静态构建器、渲染链路或服务逻辑，然后重新生成。

9. 栏目 URL 和内容 URL 必须复用现有路径服务。
   涉及栏目路径、详情 URL、分页 URL、兼容旧路径时，优先复用：
   `column-paths.mjs`、`public-sections.mjs`、`column-tree.mjs`、`columns.mjs`、`column-nodes.mjs`。
   禁止新建第二套路径算法。

10. 后端路由保持薄层。
    `system/server/src/routes/` 负责参数、权限、响应；业务和数据逻辑优先放入 `system/server/src/services/`。

11. 后台前端保持页面/API/组件分层。
    `system/admin/src/pages/` 放页面，`src/api/` 放接口封装，`src/components/` 放复用组件。
    不要把请求、表单、布局重新耦合进一个大文件。

## Required Workflow
处理涉及栏目、内容模型、模板、静态生成、站点配置的任务时，默认按以下顺序执行：

1. 先定位本次改动属于哪条主链路：
   `栏目` / `内容模型` / `模板` / `静态生成` / `兼容层` / `后台管理`

2. 先检查当前真源和复用点，再决定改哪里：
   - 栏目与路径：`columns.mjs`、`column-tree.mjs`、`column-paths.mjs`、`public-sections.mjs`
   - 内容模型：`content-models.mjs`、`content-model-fields.mjs`、`content-model-storage.mjs`
   - 模板：`templates.mjs`、`template-variants.mjs`、`cms-template-runtime.mjs`
   - 静态生成：`static-builder.mjs`、`site-renderer.mjs`
   - 后台：`TemplateVariantsPage.tsx`、`ColumnsPage.tsx`、`ContentModelsPage.tsx`、`StaticGenerationPage.tsx`

3. 编码前先判断：
   - 是否绕开数据库模板真源
   - 是否引入新的硬编码内容结构
   - 是否新开第二套路径/模板/发布算法
   - 是否会引入新的路径回归风险

4. 如果实现方案更像“定制页面代码”而不是“栏目/模型/模板驱动”，先停下来说明偏差，再继续。

5. 完成后至少自检这三点：
   - 是否更接近栏目驱动
   - 是否减少硬编码
   - 是否保持路径行为一致且可验证

## Current Architecture Map
当前仓库的有效架构如下，新增代码应服从这套组织方式。

### Root
- `server.mjs`：统一启动入口，直接加载 `system/server/src/server.mjs`
- `package.json`：根级启动、开发、构建、静态生成命令
- `scripts/`：开发和发布包脚本
- `dist/`：统一发布包输出目录，不是源码

### Runtime Data And Output
- `data/site.sqlite`：运行数据库，属于运行数据，不要无说明覆盖
- `html/`：前台静态发布目录，包含页面、静态资源、上传文件、部署配置

### Server
- `system/server/src/server.mjs`、`app.mjs`：服务入口
- `system/server/src/routes/`：后台接口、认证、旧站兼容入口
- `system/server/src/services/`：栏目、内容模型、模板、媒体、SEO、站点配置、会话等核心逻辑
- `system/server/src/cms-template-runtime.mjs`：数据库 TSX 模板运行时
- `system/server/src/tsx-template-renderer.mjs`：TSX 模板渲染
- `system/server/src/static-builder.mjs`：静态生成主链路
- `system/server/src/site-renderer.mjs`：站点页面渲染协作层
- `system/server/src/static-file-handler.mjs`：静态访问与兼容处理

### Admin
- `system/admin/src/pages/`：后台页面
- `system/admin/src/api/`：接口封装
- `system/admin/src/components/`：表单、编辑器、上传等复用组件
- `system/admin/src/layouts/`：后台框架
- `system/admin/src/site/`：部分遗留页面预览/渲染辅助

### Legacy And Reference
- `system/templates/`：遗留模板与迁移参考，不是当前模板真源
- `docs/`、`system/docs/`：架构说明和迁移文档，不是运行配置

## Template System Rules
当前模板系统的有效事实如下，修改模板相关代码时必须与之保持一致。

1. `templates.engine` 与 `template_versions.engine` 只允许 `tsx`。

2. 页面模板类型目前为：
   `home`、`list`、`content`、`single`、`component`

3. 数据库存储语义：
   - `tsx_source`：模板结构与渲染逻辑草稿
   - `css_source`：模板样式草稿
   - `published_tsx_source`：已发布结构与逻辑
   - `published_css_source`：已发布样式

4. 模板保存、发布、预览、历史版本、静态生成必须对上述四个字段保持同一语义。

5. 组件引用、模板依赖、样式抽取、预览兜底都应复用现有模板服务和运行时，不要在页面里手写另一套解释器。

6. 历史模板如仍包含内嵌样式，只能视为迁移输入；迁移后应落入 `css_source`，不要继续保留双写。

## Content And Column Rules
1. 栏目树和栏目节点优先于散页面。
   单页栏目、列表栏目、链接栏目、根栏目语义应通过栏目及其节点配置表达。

2. 产品、新闻等虽然当前仍有 `products.mjs`、`news.mjs` 等服务，但新增能力应优先向内容模型抽象，而不是继续扩大历史专用分支。

3. 涉及栏目模板绑定、栏目内容模板、单页模板、栏目首页模板时，优先走模板绑定和模板变体，不要把模板选择逻辑写死在页面或脚本里。

4. 栏目根路径、列表页、详情页、分页页的 URL 必须保持现有小写与兼容规则，避免破坏旧外链和收录。

## Static Build Rules
1. 正式静态输出目录默认是根目录 `html/`。

2. `system/server/generated/`、`system/server/generated-debug/` 只用于调试产物，不是正式交付目录。

3. 静态生成会清理并重写目标目录；执行前先确认目标路径。

4. 修改模板、栏目、站点配置、栏目路径、内容 URL、模型字段、SEO 输出后，应优先通过重新生成来验证结果，而不是直接补丁式修改 `html/`。

## Build And Dev Commands
### Root
- `npm start`
- `npm run dev`
- `npm run dev:server`
- `npm run dev:admin`
- `npm run build`
- `npm run build:dist`
- `npm run build:admin`
- `npm run build:site`
- `npm run db:init`
- `npm run admin:create -- <username> <password>`

### Server
- `npm --prefix system/server run dev`
- `npm --prefix system/server run db:init`
- `npm --prefix system/server run db:import`
- `npm --prefix system/server run db:import:spirax-site`
- `npm --prefix system/server run db:import:spirax-templates`
- `npm --prefix system/server run db:sync:home-meta`
- `npm --prefix system/server run db:sync:list-meta`
- `npm --prefix system/server run db:sync:content-meta`
- `npm --prefix system/server run db:sync:single-meta`
- `npm --prefix system/server run db:repair-encoding`
- `npm --prefix system/server run admin:create -- <username> <password>`
- `npm --prefix system/server run build:static`

### Admin
- `npm --prefix system/admin run dev`
- `npm --prefix system/admin run build`
- `npm --prefix system/admin run lint`
- `npm --prefix system/admin run typecheck`

## Validation Checklist
当前仓库自动化测试不完整，默认以构建检查和手工回归为主。

### Server Changes
- 至少验证首页 `/`
- 至少验证后台入口 `/admin/`
- 至少验证登录
- 至少验证一个列表接口和一个保存接口
- 至少验证静态文件访问
- 至少验证受影响的历史入口或替代路径行为符合本次预期

### Admin Changes
- 至少运行 `npm --prefix system/admin run build`
- 需要时运行 `npm --prefix system/admin run lint`
- 需要时运行 `npm --prefix system/admin run typecheck`
- 手工检查对应页面的列表、弹窗、分页、上传、模板编辑或绑定流程

### Template / Column / Content / Site Changes
- 运行一次静态生成
- 抽查 `html/index.html`
- 抽查 `html/contact.html`
- 抽查 `html/msg.html`
- 抽查一个产品详情页
- 抽查一个新闻详情页
- 抽查受影响栏目列表页

### Template Management Changes
- 检查模板编辑
- 检查历史版本
- 检查预览
- 检查变体绑定
- 检查组件关联

### Schema Or Import Changes
- 检查 `data/site.sqlite` 迁移结果
- 确认没有重新引入旧模板字段依赖
- 确认没有重新引入非 `tsx` 模板引擎
- 确认生成页没有乱码、字段丢失或旧路径失效

## Deployment Notes
- 发布包来源是 `dist/`
- `html/` 不应作为本地发布源上传覆盖服务器
- 发布更新时不要覆盖服务器已有 `data/site.sqlite`
- 服务器上如需正式前台内容，应在目标环境执行 `npm run build:site`

## Safety Notes
- 不要提交真实生产账号、Cookie 密钥或外部数据库路径
- 不要把人工文件保存在 `dist/`
- 修改上传逻辑时同步检查 `html/upload/`、`html/uploadfile/` 和静态访问兼容
- 涉及栏目树、内容 URL、模板发布、静态生成的大改，先考虑数据库备份和回滚路径

## Preferred Review Standard
如果用户要求“review”或审查代码，默认按架构审查和回归风险审查处理，优先报告：

- 是否绕开栏目驱动
- 是否新增硬编码内容结构
- 是否重新引入旧模板字段或旧模板引擎
- 是否新开第二套路径/模板/发布逻辑
- 是否引入路径兼容性回归或未清理的历史入口残留
- 是否缺少必要验证
