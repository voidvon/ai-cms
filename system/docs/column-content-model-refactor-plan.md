# 栏目 + 内容模型重构实施方案

## 1. 文档目的

这份文档承接上一份分析文档：

- [column-content-model-architecture-analysis.md](/Users/yytest/Documents/projects/www.spiraxsarcocn.com/system/docs/column-content-model-architecture-analysis.md)

目标不是讨论“要不要改”，而是明确“怎么改”。

本文按五个层面拆解：

1. 数据库
2. 后端服务与 API
3. 后台管理界面
4. 静态生成与模板上下文
5. 数据迁移与分阶段上线

本文默认目标架构为：

- 栏目统一使用 `columns`
- 内容模型统一使用 `content_models` / `content_model_fields`
- 每个内容模型使用独立内容表
- 栏目绑定一个内容模型
- 内容记录写入模型表，不再写入 `columns`

## 2. 现状摘要

当前代码已经确认存在以下问题：

- `columns` 同时存栏目和内容记录
- `products.mjs` / `news.mjs` 只是 `columns.mjs` 的包装层
- `/admin/content-models` 只能查看字段，不是真正的模型管理
- `/admin/columns` 仍然是固定模型逻辑，模型选项写死为：
  - `product`
  - `news`
  - `corporation`
- 产品和新闻仍使用专用表单组件：
  - `ProductFormDialog`
  - `NewsFormDialog`
- 静态生成器通过 `listProducts()` / `listNews()` 读取内容，而这两个接口当前仍从 `columns` 读取

因此这次重构的核心不是“加一个模型页面”，而是把整个内容层从 `columns` 里拆出去。

## 3. 最终目标架构

## 3.1 栏目层

保留：

- `columns`
- `column_translations`

栏目层仅负责：

- 树形结构
- 栏目路径
- 导航属性
- 栏目类型
- 模板绑定
- 内容模型绑定

栏目层不再直接保存：

- 内容正文
- 摘要
- 图片列表
- 内容详情 SEO

这些属于内容层。

## 3.2 模型定义层

保留并增强：

- `content_models`
- `content_model_fields`

它们要从“字段配置辅助表”升级为“真正的模型定义中心”。

## 3.3 内容数据层

新增按模型拆分的数据表，例如：

- `content_product`
- `content_product_translations`
- `content_news`
- `content_news_translations`

后续用户新增模型后，可以继续生成：

- `content_case`
- `content_case_translations`
- `content_job`
- `content_job_translations`

## 3.4 模板与生成层

模板体系保留现状：

- `templates`
- `template_variants`
- `template_bindings`

但模板上下文改为：

- 栏目数据从 `columns` 来
- 内容数据从模型表来

## 4. 数据库改造方案

## 4.1 `columns` 表需要保留的字段

建议保留：

- `id`
- `parent_id`
- `source_type`
- `source_id`
- `column_kind`
- `custom_url`
- `route_path`
- `open_in_new_tab`
- `show_in_nav`
- `slug`
- `sort_order`
- `legacy_extra`
- `is_system`
- `created_at`
- `updated_at`

建议新增：

- `content_model_id`
- `column_type`
- `list_mode`
- `detail_mode`

说明：

- `content_model_id` 用于绑定模型
- `column_type` 明确栏目类型，如：
  - `list`
  - `cover`
  - `single`
  - `link`
  - `form`

当前 `model_code` 不再适合作为长期核心字段，因为它表达的是“固定模型枚举”，而不是“栏目绑定用户模型”。

建议阶段性保留 `model_code` 做兼容，最终再逐步退场。

## 4.2 `columns` 表建议迁出的字段

这些字段应逐步从栏目层迁出：

- `content_html`
- `summary`
- `images`
- `primary_image`
- `keywords`
- `seo_title`
- `seo_keywords`
- `seo_description`
- `publish_status`
- `published_at`
- `is_visible`
- `is_featured_home`

说明：

- 对 `single_page` 这类栏目，可以保留“栏目内容”概念
- 但对列表型栏目，这些字段应属于内容记录，不应留在栏目表

所以最终建议区分两类栏目：

- `single/link/form` 类栏目可以保留栏目级内容字段
- `list/cover` 类栏目不应直接承载内容详情字段

## 4.3 `content_models` 表升级建议

当前 `content_models` 结构过轻，建议增加以下字段：

- `table_name`
- `translation_table_name`
- `status`
- `supports_category`
- `supports_list`
- `supports_detail`
- `supports_translation`
- `icon`
- `settings_json`

建议结构意图：

- `table_name`：主表名
- `translation_table_name`：翻译表名
- `supports_category`：是否允许栏目挂此模型
- `supports_translation`：是否启用多语言翻译

## 4.4 `content_model_fields` 表升级建议

当前表适合作为基础，但需要更明确字段定义职责。

建议至少支持：

- `field_name`
- `field_label`
- `field_type`
- `db_type`
- `is_required`
- `is_listed`
- `is_editable`
- `is_translatable`
- `is_searchable`
- `is_filterable`
- `default_value`
- `settings_json`

建议字段类型至少支持：

- `text`
- `textarea`
- `richtext`
- `number`
- `boolean`
- `datetime`
- `date`
- `image`
- `images`
- `file`
- `select`
- `multiselect`
- `relation`

## 4.5 新内容表命名规则

建议统一命名：

- 主表：`content_<model_code>`
- 翻译表：`content_<model_code>_translations`

例如：

- `content_product`
- `content_product_translations`

不要继续使用：

- `products`
- `news`

因为它们会让“系统内置模型”和“用户自定义模型”在命名规范上不一致。

## 4.6 新内容表最小字段集合

建议每个模型主表都至少包含：

- `id`
- `column_id`
- `slug`
- `sort_order`
- `is_visible`
- `is_featured_home`
- `publish_status`
- `published_at`
- `created_at`
- `updated_at`
- `legacy_extra`

如果模型有“标题型字段”，建议统一约定：

- 主显示字段名固定为 `title`

如果必须兼容产品名称，也可以允许：

- 产品模型主字段仍叫 `name`

但从长期统一角度，更建议新增一个“显示标题字段”元数据，而不是依赖特殊字段名。

## 4.7 翻译表最小字段集合

建议每个翻译表至少包含：

- `id`
- `<content>_id`
- `language_id`
- `title` 或显示名
- `summary`
- `content_html`
- `seo_title`
- `seo_keywords`
- `seo_description`
- `created_at`
- `updated_at`

模型字段中 `is_translatable = 1` 的字段应出现在翻译表。

## 5. 后端重构方案

## 5.1 服务层重构方向

当前服务层依赖关系是：

- `products.mjs` -> `columns.mjs`
- `news.mjs` -> `columns.mjs`

目标应改成：

- `columns.mjs` 只处理栏目
- `content-models.mjs` 处理模型元数据
- `content-entries.mjs` 处理通用模型内容
- `products.mjs` / `news.mjs` 阶段性保留为模型适配层

建议新增服务：

- `system/server/src/services/content-model-storage.mjs`
- `system/server/src/services/content-entries.mjs`

职责拆分：

- `content-model-storage.mjs`
  - 创建模型表
  - 校验字段与表结构
  - 迁移模型表结构
- `content-entries.mjs`
  - 通用内容 CRUD
  - 通用分页查询
  - 通用翻译读写

## 5.2 `columns.mjs` 的职责收缩

当前 `columns.mjs` 中需要逐步下沉的职责包括：

- `createContentColumn()`
- `updateContentColumn()`
- `getContentColumnById()`
- `listContentColumns()`
- `listContentColumnsPaged()`
- `searchContentColumns()`
- `deleteContentColumn()`

这些函数最终不应留在栏目服务中。

建议做法：

第一阶段：

- 保留这些函数，但标记为兼容层
- 内部开始转调 `content-entries.mjs`

第二阶段：

- 上层业务不再直接依赖它们
- 再从 `columns.mjs` 移除

## 5.3 产品/新闻服务的过渡改造

当前：

- `products.mjs` 和 `news.mjs` 是对 `columns` 内容记录的包装

目标：

- 它们变成“系统模型适配器”

例如：

- `products.mjs`
  - 内部调用 `content-entries.mjs`，指定模型为 `product`
- `news.mjs`
  - 内部调用 `content-entries.mjs`，指定模型为 `news`

这样可以做到：

- 外部调用方暂时不变
- 内部存储逐步切换

## 5.4 API 改造路线

### 第一阶段保留的兼容 API

继续保留：

- `/api/products`
- `/api/products/admin`
- `/api/products/:id`
- `/api/news`
- `/api/news/admin`
- `/api/news/:id`

但底层改成读新模型表。

### 第二阶段新增通用 API

建议新增：

- `GET /api/content-models`
- `POST /api/content-models`
- `PUT /api/content-models/:id`
- `DELETE /api/content-models/:id`
- `POST /api/content-models/:id/fields`
- `PUT /api/content-models/:id/fields/:fieldName`
- `DELETE /api/content-models/:id/fields/:fieldName`

再新增通用内容 API：

- `GET /api/content-models/:id/entries`
- `GET /api/content-models/:id/entries/:entryId`
- `POST /api/content-models/:id/entries`
- `PUT /api/content-models/:id/entries/:entryId`
- `DELETE /api/content-models/:id/entries/:entryId`

或者按栏目入口暴露：

- `GET /api/columns/:id/entries`
- `POST /api/columns/:id/entries`

对后台使用来说，按栏目入口更自然。

## 5.5 栏目 API 改造

当前栏目 API 需要增加：

- `content_model_id`
- `column_type`

新增/更新栏目时的规则建议：

- `single/link/form` 类型：
  - `content_model_id` 可为空
- `list/cover` 类型：
  - `content_model_id` 必填

这样后台创建栏目时才真正表达出“这是哪个模型的栏目”。

## 6. 后台改造方案

## 6.1 `/admin/content-models` 升级目标

当前页面文件：

- `system/admin/src/pages/ContentModelsPage.tsx`

目标升级为真正的模型中心，至少要支持：

- 模型列表
- 新增模型
- 编辑模型
- 删除模型
- 字段列表
- 新增字段
- 编辑字段
- 删除字段
- 查看已绑定栏目

建议拆分组件：

- `ContentModelFormDialog`
- `ContentModelFieldFormDialog`
- `ContentModelBindingPanel`

## 6.2 栏目页改造

当前页面：

- `system/admin/src/pages/ColumnsPage.tsx`

当前问题：

- 根栏目模型下拉写死为：
  - 产品
  - 新闻
  - 公司

目标改造：

- 新增栏目时先选栏目类型
- 如果是可挂内容的栏目，再选择内容模型
- 展示绑定的模型名称，而不是固定 `model_code`

建议页面中新增显示：

- 栏目类型
- 绑定模型
- 模型数据表
- 模板绑定

## 6.3 内容管理入口改造

当前内容编辑依赖：

- `ProductFormDialog`
- `NewsFormDialog`

目标：

- 新增通用内容编辑组件 `ContentEntryFormDialog`
- 根据模型字段定义动态渲染控件

建议第一阶段不要立即删除产品/新闻表单，而是：

- 先保留专用表单
- 在底层存储完成切换
- 再逐步替换成通用表单

这样风险更低。

## 6.4 后台导航改造

当前 `/admin/content-models` 已经在导航下方。

建议后续增加：

- “模型内容”统一入口
- 或在栏目详情区增加“管理此栏目内容”按钮

更推荐后者，因为内容通常是按栏目组织，而不是按模型孤立管理。

## 7. 静态生成与模板改造

## 7.1 当前依赖点

当前静态生成器 `system/server/src/static-builder.mjs` 直接依赖：

- `listProducts()`
- `listNews()`

模板预览和站点服务中也有同样依赖：

- `services/templates.mjs`
- `services/site.mjs`
- `services/sitemap.mjs`
- `services/llms.mjs`

## 7.2 目标改造方式

建议不要让静态生成器直接知道“产品表”“新闻表”的具体结构。

改造方向：

- 引入统一的内容读取层
- 由读取层根据模型返回标准化结构

例如统一输出：

- `id`
- `column_id`
- `title`
- `summary`
- `content_html`
- `slug`
- `primary_image`
- `images`
- `is_visible`
- `published_at`
- `created_at`
- `translations`

这样静态生成器只关心：

- 当前栏目是什么模型
- 如何取该模型的内容列表
- 如何取该模型的详情内容

## 7.3 模板上下文建议

建议模板上下文分两类：

- `column`
  - 当前栏目
  - 父栏目
  - 子栏目
  - 面包屑
- `entry`
  - 当前内容
  - 模型定义
  - 关联栏目

以后列表页与详情页都通过标准化上下文渲染，而不是硬编码“产品字段”“新闻字段”。

## 8. 数据迁移方案

## 8.1 总体原则

不要直接删除现有 `columns` 内容记录。

建议迁移分两步：

1. 复制迁移
2. 验证完成后再停用旧路径

## 8.2 产品/新闻迁移步骤

### 第一步：创建新模型表

先创建：

- `content_product`
- `content_product_translations`
- `content_news`
- `content_news_translations`

### 第二步：从 `columns` 中导出内容记录

筛选规则：

- 产品内容：
  - `source_type = 'product_item'`
  - `node_type = 'content'`
- 新闻内容：
  - `source_type = 'news_item'`
  - `node_type = 'content'`

### 第三步：写入新模型表

映射建议：

- `columns.id` 不直接复用为内容主键
- `columns.source_id` 作为旧内容 ID 记录到 `legacy_extra` 或专门的 `legacy_id`

这样更稳，不会把“栏目 ID 空间”和“内容 ID 空间”继续耦合在一起。

### 第四步：翻译迁移

从 `column_translations` 中抽取对应内容记录的翻译，写入新的翻译表。

### 第五步：双读验证

验证阶段建议：

- 后台仍显示旧页面
- 查询层同时支持新旧读取比对
- 抽查：
  - 列表数量
  - 详情内容
  - 图片
  - SEO
  - 多语言

### 第六步：切换读路径

确认无误后：

- `products.mjs` / `news.mjs` 改为只读新模型表
- 静态生成全部切到新模型表

### 第七步：停写旧内容到 `columns`

最后再停止向 `columns` 写内容记录。

## 8.3 单页栏目如何处理

单页栏目不建议进入模型表。

建议保留在 `columns` 中，因为它本身就是“栏目自身带内容”的场景。

所以最终系统会存在两种内容来源：

- 栏目自身内容
  - `single_page`
- 模型内容记录
  - `product/news/case/...`

这不是问题，反而符合 CMS 实际场景。

## 9. 分阶段实施建议

## 阶段 1：架构拨正，不改后台交互习惯

目标：

- 建好新模型内容表
- `columns` 增加 `content_model_id`
- 产品/新闻内容迁移到新表
- `products.mjs` / `news.mjs` 切到底层新表
- 保留现有 API 和页面

收益：

- 用户界面几乎不变
- 先把最危险的“内容混进栏目表”问题解决

建议优先改动文件：

- `system/server/src/services/content-models.mjs`
- `system/server/src/services/content-model-fields.mjs`
- 新增 `system/server/src/services/content-entries.mjs`
- 新增 `system/server/src/services/content-model-storage.mjs`
- `system/server/src/services/products.mjs`
- `system/server/src/services/news.mjs`
- `system/server/src/services/columns.mjs`

## 阶段 2：栏目改为绑定模型

目标：

- 栏目新增/编辑时支持选择模型
- 栏目详情显示模型绑定信息
- 产品/新闻栏目逐步从 `model_code` 过渡到 `content_model_id`

建议改动文件：

- `system/admin/src/pages/ColumnsPage.tsx`
- `system/server/src/routes/api/columns.mjs`
- `system/server/src/services/column-categories.mjs`

## 阶段 3：内容模型页面真正可用

目标：

- 新增模型
- 新增字段
- 生成模型表
- 绑定栏目

建议改动文件：

- `system/admin/src/pages/ContentModelsPage.tsx`
- `system/admin/src/api/advanced.ts`
- `system/server/src/routes/api/content-models.mjs`
- `system/server/src/routes/api/content-model-fields.mjs`

## 阶段 4：通用内容管理

目标：

- 通用内容列表页
- 通用内容表单页
- 根据模型字段动态渲染

这一步完成后，新增模型不再需要额外开发产品/新闻式专用页面。

## 阶段 5：静态生成全面模型化

目标：

- 静态生成不再写死产品/新闻读取逻辑
- 模板上下文统一

## 10. 风险点与控制方案

## 10.1 最大风险

最大风险不是数据库，而是“静态生成 + 模板上下文 + 后台内容编辑”三者之间的耦合。

因为当前项目里：

- 后台页面
- API
- 列表读取
- 模板预览
- sitemap
- llms
- 静态生成

都默认“产品/新闻”是固定模型。

## 10.2 控制方式

建议采用“兼容壳 + 底层替换”的策略：

- 外层 API 先不改
- 内层存储先切换
- 验证完成后再收口 UI 和路由

这样能避免一次性大爆炸。

## 10.3 不建议的做法

不建议：

- 一次性删除 `columns` 中的内容逻辑
- 一次性删除产品/新闻专用 API
- 一次性上通用模型后台
- 一次性重写静态生成器

这样风险过高，也不利于定位问题。

## 11. 推荐执行顺序

建议实际执行顺序如下：

1. 先补数据库设计和迁移脚本设计
2. 先把产品/新闻底层存储迁出 `columns`
3. 再让栏目绑定模型
4. 再增强 `/admin/content-models`
5. 最后做通用内容管理页和静态生成统一化

## 12. 下一步开发建议

如果按这份方案往下做，我建议下一个具体开发任务不是直接“大重构”，而是先完成一个最小里程碑：

### 里程碑 A

- 给 `columns` 增加 `content_model_id`
- 设计 `content_product` / `content_news` 及其翻译表
- 新增通用内容读取服务
- 把 `products.mjs` / `news.mjs` 切到新表
- 保持后台页面和 API 不变

这一步完成后，系统架构方向就已经被扳正了。

后面再继续做：

### 里程碑 B

- 栏目页支持绑定模型
- 内容模型页支持新增模型和字段

### 里程碑 C

- 通用内容管理页面
- 通用静态生成入口

## 13. 结论

这次重构不应理解为“恢复旧表结构”，而应理解为：

- 把当前错误的“栏目/内容混存”重新拆层
- 恢复成“栏目统一 + 模型独立 + 内容按模型存储”的 CMS 架构

这条路线既符合你希望的帝国 CMS 思路，也更适合当前项目已经具备的：

- 多语言
- 模板绑定
- 静态生成
- 后台可视化管理

如果继续推进编码，我建议直接从“里程碑 A”开始。
