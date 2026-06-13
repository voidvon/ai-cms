# Spirax Global 迁移进度

## 文档目的

本文档用于记录旧项目 `spirax-global` 向当前 CMS/静态站体系迁移的阶段性进度，便于后续继续补齐、回归验证和部署交接。

当前目标不是简单导入原始文件，而是将旧项目中的内容、结构和页面能力迁移到当前系统中，统一落在以下体系内：

- 数据库存储内容与模板
- 后台可管理
- 使用 `TSX` 模板渲染
- 通过 `system/server/src/static-builder.mjs` 生成最终静态页面

## 迁移范围

本轮迁移覆盖的核心范围包括：

- 多语言基础能力
- 后台语言管理与翻译字段支持
- 单页栏目、多层栏目与内容编辑联动
- 静态站按语言输出
- 旧 `spirax-global` 项目的模板、页面数据、内容数据、站点配置与静态资源导入
- 产品、新闻/服务、手工单页的页面还原

## 已完成

### 1. 多语言基础能力

已完成：

- 新增语言管理入口，可在后台维护语言
- 支持站点按单独域名或子目录方式部署多语言站点
- 后台内容编辑支持按语言切换并保存对应语言内容
- 翻译字段与非翻译字段已做区分，翻译字段优先展示
- `/admin/columns` 编辑区已增加语言切换 Tab，切换后可编辑对应语言字段并保存

已处理过的相关问题包括：

- `defaultLanguageCode` 初始化时序报错
- 页面内嵌按钮导致的 `<button>` 嵌套 hydration 报错
- 富文本工具栏重复渲染问题

### 2. 内容模型翻译字段机制

已完成：

- 支持在模型字段层面配置哪些字段为翻译字段
- 后台编辑时可根据字段配置动态渲染多语言输入区
- 分类名称、栏目名称、内容标题、摘要、正文、SEO 字段等已纳入翻译体系

当前设计结论：

- 不单独维护“分类翻译表”的手工业务概念
- 同一个分类仍然是同一条分类数据
- 多语言值通过翻译能力附着在同一个实体上

### 3. 开发与运行链路修复

已完成：

- 修正开发环境启动逻辑，避免 `npm run dev` 直接走打包产物
- 处理开发环境重定向循环问题
- 处理开发环境静态资源访问异常
- 修复 `ColumnsPage`、管理页交互和构建链路中的多处运行时问题

### 4. 静态生成与多语言输出

已完成：

- 静态生成支持按语言输出
- 子目录语言站点可单独生成，例如 `html/en/`
- 静态生成会同步语言目录下的共享资源
- 修复多语言子站生成时 `css/js/images/uploadfile` 等共享资源丢失或路径错误的问题
- 修复 `ENOENT: ... html/en/js` 这类生成异常
- 修复 `/en/css/webmain.css` 等静态资源 404 问题

当前状态：

- 静态生成可以区分语言输出
- 共享静态目录会复制到语言子站输出目录
- 英文等子站的基本资源链路已经可用

### 5. 产品与图片字段能力

已完成：

- 产品图片字段从单值扩展为多值存储
- 后台产品编辑支持多图上传/保存
- 原先命名不合理的图片字段已按迁移目标调整

当前结论：

- 不再新建第二个图片字段
- 保持一个字段支持多图
- 数据结构兼容从旧 CMS/旧项目导入的多图内容

### 6. 旧站模板导入与数据库模板体系

已完成：

- 新增模板导入脚本：
  - `system/server/scripts/import-spirax-global-templates.mjs`
- 旧站模板已导入数据库
- 当前模板引擎统一收敛到 `TSX`
- 页面模板、组件模板、模板绑定改由数据库统一维护
- 不再依赖旧 Astro/MDX 运行时直接出站

当前模板侧成果：

- 首页模板
- 产品列表模板
- 产品详情模板
- 新闻列表模板
- 新闻详情模板
- 服务列表模板
- 服务详情模板
- 单页内容模板
- 联系页模板
- 留言页模板

已导入/构建的核心组件包括：

- `spirax_shell`
- `spirax_short_masthead`
- `spirax_content_card_grid`
- `spirax_brand_path_section`
- `spirax_button`
- 产品图集、下载、顶部信息、补充区块等组件

### 7. 旧站站点配置导入

已完成：

- 旧站基础站点信息已导入当前站点配置
- 包括站点名称、联系方式、底部信息等

### 8. 产品与文章内容迁移

已完成：

- 产品分类已导入
- 产品数据已导入
- 新闻/服务类内容已导入
- 产品详情、产品列表、新闻详情、新闻列表已有一轮较完整的页面还原
- 产品分类 `content_html` 支持已补齐并导入

当前导入脚本：

- `system/server/scripts/import-spirax-global.mjs`

### 9. 手工单页栏目迁移

已完成：

- 将旧 `spirax-global` 中非产品、非新闻的 MDX 页面导入为 `single_page` 单页栏目
- 支持多层级结构
- 允许 `single_page` 栏目拥有子级
- 为栏目表增加 `legacy_extra`
- 将结构化页面数据写入 `page_data`
- 清理源站已删除但数据库仍残留的旧导入栏目

已导入的典型栏目包括：

- `/about-us/`
- `/about-us/careers/`
- `/industries/`
- `/industries/...`
- `/resources-and-design-tools/`
- `/steam-expertise/`
- `/sustainability/...`
- `/training/`
- `/your-goals/...`
- `/privacy-policy/`
- `/product-compliance/`

当前静态生成结果：

- 单页栏目已可输出到 `html/`
- 当前导入单页数量为 27 个

### 10. 手工单页模板还原进展

已完成的能力补齐：

- `currentCategoryPageData` 注入到单页模板上下文
- 单页模板已支持渲染以下结构化数据：
  - `hero`
  - `heroImage`
  - `intro`
  - `introBlock`
  - `intro.action`
  - `featureHeading`
  - `features`
  - `advice`
  - `supportList`
  - `partnerHeading`
  - `calloutCards`
  - `promoCards`
  - `goals`
  - `sections`
  - `items`
  - `jobs`
  - `filterGroups`
  - `frame`
  - `spotlight`
  - `brandPathSection`

已明显改善的页面：

- `about-us`
- `about-us/careers`
- `industries`
- `your-goals`
- `resources-and-design-tools/savings-calculator/...`
- `steam-expertise`

其中：

- `about-us` 已可展示介绍图、特性卡、建议区、支持列表、CTA、spotlight
- `careers` 已可展示行动按钮、招聘摘要、过滤条件、卡片区
- `industries` 已可展示行业卡片列表
- `steam-expertise` 已修复为“产品手册”卡片区块，不再把源码常量喷进正文

### 11. MDX 数据提取增强

已完成：

- 清理模板包装标签，如：
  - `<AboutPage />`
  - `<GoalLandingPage />`
  - `<ResourceDetailPage />`
- 修复对象型 `intro` 被错误转成 `[object Object]`
- 支持提取页面级 `export const ...` 常量
- 支持识别 `BrandPathSection` 组件参数并转成 `pageData.brandPathSection`

## 当前状态总结

当前迁移已经进入“基础链路打通，逐页补齐表现”的阶段。

可认为已经完成的部分：

- 多语言编辑与站点输出链路
- 数据库存储与模板渲染体系切换
- 产品、新闻/服务、手工单页的主体导入
- 大部分核心页面的第一轮可用还原

当前系统已具备：

- 继续导入旧站数据的能力
- 通过数据库模板持续迭代页面表现的能力
- 静态化输出的生产链路

## 当前未完全补齐的部分

以下内容尚未达到“1:1 复刻”：

### 1. 手工页细节还原仍不完整

虽然主要结构已经有了，但部分页面仍存在视觉和结构差异，尤其是：

- `training`
- `your-goals` 下的若干明细页
- `industries` 明细页
- `resources-and-design-tools` 某些页面
- `sustainability` 某些页面

差异主要体现在：

- 排版层级仍偏通用
- 某些旧站专用视觉区块尚未拆成专门组件
- 局部 CTA、媒体区、布局比例与旧站不完全一致

### 2. 组件化还原深度仍可继续提升

当前很多页面已经通过统一内容模板承载，但如果要继续逼近旧站，后续可能需要继续抽象：

- `AboutPage` 风格专用组件
- `CareersPage` 风格专用组件
- `IndustryLandingPage` / `IndustryDetailPage`
- `GoalLandingPage` / `GoalDetailPage`
- `TrainingPage`
- `ResourcesToolsPage`

### 3. 后台模板管理虽然可用，但仍偏迁移期状态

当前模板已入库并能出站，但后续还需要继续确认：

- 后台模板编辑体验是否满足长期维护
- 模板版本管理与回滚是否顺手
- 页面组件拆分粒度是否合适

## 风险与注意事项

### 1. SQLite 锁库

已验证的风险：

- 导入脚本和静态生成并行执行时，容易出现 `database is locked`

当前要求：

- 模板导入、内容导入、静态生成必须串行执行

推荐顺序：

1. `npm --prefix system/server run db:import:spirax-templates`
2. `node system/server/scripts/import-spirax-global.mjs`
3. `npm --prefix system/server run build:static`

### 2. 不直接修改生成页

不要直接手改 `html/` 下的静态页面，应优先修改：

- 导入脚本
- `static-builder`
- 数据库模板
- 后端服务

### 3. 当前仍处于迁移中

虽然现在系统已可用，但还不能认为“旧站完全迁移结束”。目前更准确的状态是：

- 数据与模板迁移主链路已完成
- 核心页面已可生成
- 页面级表现仍在持续补齐阶段

## 已新增或重点改造的文件

本轮迁移过程中，重点文件包括：

- `system/server/scripts/import-spirax-global.mjs`
- `system/server/scripts/import-spirax-global-templates.mjs`
- `system/server/scripts/import-spirax-global-site-config.mjs`
- `system/server/src/static-builder.mjs`
- `system/server/src/services/columns.mjs`
- `system/server/src/services/templates.mjs`
- `system/server/src/services/products.mjs`
- `system/server/src/services/product-categories.mjs`
- `system/server/src/services/content-models.mjs`
- `system/server/src/services/content-model-fields.mjs`
- `system/admin/src/pages/ColumnsPage.tsx`
- `system/admin/src/pages/ContentModelsPage.tsx`
- `system/admin/src/components/ProductFormDialog.tsx`
- `system/admin/src/components/ImagesUploadField.tsx`

## 建议的下一步

建议后续按以下顺序继续推进：

1. 逐页比对旧 `spirax-global` 与当前 `html/` 输出，优先补 `training`、`your-goals` 明细页、`industries` 明细页。
2. 将已经稳定的页面结构继续拆成专用组件，减少统一内容模板里越来越多的条件分支。
3. 继续抽查多语言站点，确认中文之外语言启用时的模板、资源、静态路径表现。
4. 补一轮后台模板管理、栏目管理、内容编辑、多图上传、多语言保存的人工回归。
5. 在迁移收尾前整理“最终上线检查清单”和“重新生成/部署步骤”文档。

## 最近一次确认结果

最近一次已经确认可工作的页面示例：

- `html/about-us/index.html`
- `html/about-us/careers/index.html`
- `html/industries/index.html`
- `html/steam-expertise/index.html`
- `html/resources-and-design-tools/savings-calculator/savings-calculator/index.html`

最近一次已成功执行：

- `npm --prefix system/server run db:import:spirax-templates`
- `node system/server/scripts/import-spirax-global.mjs`
- `npm --prefix system/server run build:static`

## 结论

当前迁移进度可以概括为：

- 底层能力已完成
- 数据迁移主链路已完成
- 站点已能生成
- 核心页面已可用
- 页面表现仍在持续补齐

如果按阶段划分，当前大致可视为：

- 架构迁移：已完成
- 数据迁移：已完成主体
- 页面还原：已完成第一轮主体，还需继续精修
- 最终验收：未完成
