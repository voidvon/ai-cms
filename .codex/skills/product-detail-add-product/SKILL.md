---
name: product-detail-add-product
description: 在当前数据库驱动的 Spirax Sarco Node.js CMS 中筛选并新增产品详情内容，接入既有产品栏目树、product 内容模型、数据库 TSX 模板、产品图片和多语言翻译，并完成静态生成验证。适用于新增商品/产品详情页、从 docs/关键词列表选择产品型号、补建缺失型号、添加多语言产品内容、设置产品主图或首页推荐、检查产品栏目归属与静态 URL 等任务。
---

# 新增产品详情

把产品新增到当前 CMS 的 `product` 内容模型中。产品详情是栏目所属的内容条目，不是 MDX 文件，也不是新建一套产品专用页面代码。

## 开始前

1. 阅读仓库根目录 `AGENTS.md`，将本任务归类为“内容模型 + 栏目 + 静态生成”。
2. 阅读 [references/repository-rules.md](references/repository-rules.md)，确认当前字段、写入接口、URL 和验证规则。
3. 检查工作树；不要覆盖用户已有修改。
4. 修改 `data/site.sqlite` 前先备份。若只通过已运行 CMS 的 API/MCP 写入，也要确认目标是当前工作区数据库。

## 工作流

### 1. 选定产品与语言

- 用户已指定型号时直接处理；未指定时，从 `docs/关键词列表/按产品系列类型拆分/*.csv` 和 `docs/关键词列表/全部产品型号列表.md` 中筛选“明确型号 + 明确产品意图”的候选。
- 关键词只证明搜索需求，不证明产品参数。优先读取对应国家/语言数据；无命中时才参考其他英文国家数据。
- 排除 `manual`、`guide`、`calculator`、`steam tables` 等资料或工具意图，以及只能承接泛家族概念的词。
- 明确要发布的语言。当前默认语言代码是 `zh-CN`；只为真实有内容的语言写翻译，不用默认语言文本伪装多语言版本。

### 2. 查重并定位栏目

- 用内容 API/MCP 或数据库只读查询，按型号、名称、`code`、`custom_url` 检查 `content_product` 及 `content_product_translations`，避免同产品不同拼写或不同 URL 的重复条目。
- 从 `/products/` 栏目树中选择最具体且语义正确的现有 `list` 栏目。栏目必须绑定 `product` 内容模型。
- 复用 `columns.mjs`、`column-tree.mjs`、`column-paths.mjs`、`column-nodes.mjs` 的栏目和路径语义。不要自行拼接第二套产品路径。
- 只有确实缺少可表达的产品分类时才新增栏目；单一型号通常是内容条目，不是新栏目。

### 3. 建立事实边界

- 优先检索相邻工作区 `../source-markdown` 中的技术资料、安装维护指南、销售手册和 guides；再用当前数据库中的同系列产品、父栏目内容和已存在下载信息交叉核对。
- 不从关键词 CSV 推断参数、材质、口径、压力等级、认证或下载 URL。
- 不把内部资料路径、搜索量、关键词筛选过程、数据库或仓库术语写入用户可见内容。
- 资料不足时只写可验证的产品定位和应用范围；不要为填满页面而编造规格。

### 4. 组装 product 内容条目

使用当前内容模型字段，不新增产品专属硬编码字段：

- 基础字段：`column_id`、`custom_url`、`code`、`images`、`primary_image`、`spec_options_json`、`is_visible`、`is_featured_home`、`sort_order`、`created_at`。
- 翻译字段：`name`、`summary`、`content_html`、`template_data_json`、`seo_title`、`seo_description`、`publish_status`。
- `custom_url` 是可选的内容文件名，必须包含文件名，例如 `td52/index.html`；留空时由栏目 `detail_rule` 和内容 ID 生成 URL。
- `spec_options_json` 是字符串数组，每项是一条可展示、可用于询盘的规格文本。仅写有可靠数据依据的整机选项；无可靠选项时使用空数组。
- `publish_status` 只在内容完成并应公开时设为 `published`。同时设置 `is_visible: 1` 才能正常参与公开列表和生成。
- 首页展示使用 `is_featured_home`，不是旧项目的 `showInLatestProducts`/`launchDate`。是否推荐由用户需求和现有首页排序语义决定，不默认强制开启。

文案应自然覆盖型号词、产品类型和应用/选型意图。`name` 保持清晰产品名；站点或品牌后缀放入 `seo_title`。正文使用适合富文本字段的 HTML，不写 MDX/frontmatter。

### 5. 写入数据库真源

- 首选当前 CMS MCP 的 `create_content_item`，或后台/API `POST /api/content-items/product`；更新时使用 `update_content_item` 或 `PUT /api/content-items/product/:id`。
- payload 必须使用 `{ base, translations }` 双层结构，并先读取当前内容模型字段，避免提交不存在的旧字段。
- 没有可用 API/MCP 时，复用 `content-items.mjs` / `content-entries.mjs` 服务完成校验和写入。不要通过散乱 SQL 绕过规范化、多语言和字段校验。
- 新增产品通常不需要修改模板。若现有详情模板确实缺少通用产品字段支持，修改数据库中的 `templates`/`template_versions` 及绑定，并复用现有 TSX 运行时；不得把源码目录或 `system/templates/` 当模板真源。

### 6. 处理图片

- 仅在用户提供图片或明确要求选用现有图片时处理图片；否则保持 `images: []`、`primary_image: ""`。
- 使用后台媒体上传链路，将图片存入 `html/uploads/images/YYYYMM/`，数据库保存 `/uploads/images/YYYYMM/<file>`。
- `images` 是图库数组；`primary_image` 是主图。主图为空时服务会回退到 `images[0]`。
- 不写入旧 `public/images/`，不维护额外封面映射，不直接修补生成 HTML。

### 7. 验证

1. 重新读取条目并核对栏目、所有目标语言、发布状态、图片、SEO 和规格字段。
2. 用 `buildContentDetailPathFromColumn` 对应的现有规则确认预期 URL，检查没有与既有内容冲突。
3. 运行 `npm run build:site`。如通过 MCP 触发构建，显式指定目标语言；不要依赖工具的默认 EN 行为。
4. 通过公开路由抽查首页 `/`、联系栏目 `/contact-us/`、新增产品详情页、所属产品列表页和一个新闻详情页。
5. 检查列表页能从栏目树进入新产品、详情模板为数据库发布态 TSX 模板、图片存在且无旧路径、目标语言未错误回退。
6. 报告条目 ID、栏目、最终 URL、发布语言、首页推荐状态、图片状态和构建结果。

## 禁止事项

- 不创建 `docs/<site>/products/**/*.mdx`、frontmatter、`models`/`cards` 入口或 Rspress 组件。
- 不新建产品专属渲染分支、路径算法、图片映射或规格选择脚本。
- 不恢复 `html`/`svelte` 模板引擎，或模板旧字段 `content`/`published_content`。
- 不直接批量修改 `html/` 页面；`html/uploads/` 中经媒体链路管理的上传文件除外。
- 不覆盖或无说明替换 `data/site.sqlite`，也不清理服务器运行数据。
