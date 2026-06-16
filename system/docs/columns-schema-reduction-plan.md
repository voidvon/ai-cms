# columns 表瘦身迁移方案

## 目标

把 `columns` 从“栏目 + 内容混合表”逐步收敛为：

- 栏目树结构
- 路由与导航属性
- 模板/模型绑定关系

并把单页栏目、联系页、公司栏目这类仍挂在 `columns` 上的内容字段迁出。

## 当前判断

### 已基本可迁出的字段

这些字段对产品/新闻内容已不应继续作为 `columns` 主存储：

- `images`
- `primary_image`
- `keywords`
- `seo_title`
- `seo_keywords`
- `seo_description`
- `publish_status`
- `published_at`
- `is_featured_home`

### 仍不能直接删除的字段

这些字段当前仍被单页栏目、联系页、公司栏目、部分静态生成逻辑直接使用：

- `content_html`
- `summary`
- `is_visible`

## 第一步方案

新增专用栏目内容表：

- `column_pages`
- `column_page_translations`

承接以下来源类型的栏目内容：

- `single_page`
- `contact_page`
- `corporation_category`

### `column_pages` 建议承接字段

- `column_id`
- `summary`
- `content_html`
- `keywords`
- `seo_title`
- `seo_keywords`
- `seo_description`
- `publish_status`
- `published_at`
- `is_visible`
- `is_featured_home`

### `column_page_translations` 建议承接字段

- `summary`
- `content_html`
- `keywords`
- `seo_title`
- `seo_keywords`
- `seo_description`
- `publish_status`
- `published_at`

## 第二步方案

把以下读取路径改为优先从 `column_pages` 读取：

- 单页栏目详情
- 联系页
- 公司栏目详情
- 静态生成相关上下文

完成后，`columns` 中的以下字段可进入弃用期：

- `content_html`
- `summary`
- `keywords`
- `seo_title`
- `seo_keywords`
- `seo_description`
- `publish_status`
- `published_at`
- `is_featured_home`

### 当前进展

已完成：

- 单页栏目、联系页、公司栏目读取改为优先从 `column_pages` / `column_page_translations` 获取
- 单页栏目、联系页、公司栏目保存改为优先写入 `column_pages`
- `columns` / `column_translations` 对上述来源类型停止承载真实正文与 SEO 内容
- 新增启动期清理：如果专用页面栏目已存在 `column_pages` 记录，则自动清空其旧影子字段
- 产品分类页内容与 SEO 也已切换为优先由 `column_pages` 承载
- 产品分类页静态生成已改为优先读取 `column_pages`

目前对于以下来源类型：

- `single_page`
- `contact_page`
- `corporation_category`
- `product_category`

`columns` 和 `column_translations` 中这些字段已经只应视为 legacy shadow：

- `content_html`
- `summary`
- `keywords`
- `seo_title`
- `seo_keywords`
- `seo_description`
- `publish_status`
- `published_at`
- `is_featured_home`

补充说明：

- `product_category` 当前已不再依赖 `columns.content_html / seo_*` 作为主读取来源
- `product_category.summary` 目前本身几乎未使用，可在后续 schema 收敛时一并评估删除
- `news_category` 当前库内内容字段基本为空，后续可视为下一批低风险收敛对象

### 当前数据库现状补充

按当前库内统计：

- `single_page` / `contact_page` / `corporation_category` 的旧内容字段已经清空
- `product_category` 的 `content_html / seo_title / seo_keywords / seo_description` 已经清空
- `news_category` 当前本来就几乎全部为空，不再是主要迁移阻力

因此，`columns` 上仍然真正承载内容的重点已收敛到：

- `product_item`
- `news_item`

而“栏目级内容”这条线的主要阻力已经基本拆掉。

### 关于 `product_item` / `news_item` 的当前判断

当前产品和新闻内容的业务读写已经切换到独立内容表：

- `content_product`
- `content_product_translations`
- `content_news`
- `content_news_translations`

但 `columns` 中仍保留 `product_item` / `news_item` 节点，主要原因不是正文存储，而是兼容用途，例如：

- 旧 URL 重定向
- 部分 sitemap / llms / 诊断链路仍通过 `columns` 树识别旧内容节点

因此下一阶段不建议直接删除 `product_item` / `news_item` 行，而应先完成：

1. 兼容链路改为直接使用内容表
2. 内容项 public URL / slug 查询不再依赖 `columns`
3. 再评估是否需要保留“轻量内容索引节点”，或完全去掉内容节点

## 第三步方案

当所有栏目内容读取都不再依赖这些字段后：

1. 新建 `columns_v2`
2. 仅保留栏目结构字段
3. 回填数据
4. 替换原表

## 预期保留字段

`columns` 最终建议保留：

- `id`
- `parent_id`
- `model_code`
- `source_type`
- `source_id`
- `node_type`
- `column_kind`
- `content_type`
- `custom_url`
- `route_path`
- `open_in_new_tab`
- `show_in_nav`
- `content_model_id`
- `slug`
- `sort_order`
- `legacy_extra`
- `is_system`
- `created_at`
- `updated_at`

## 后续可继续收敛的字段

以下字段存在语义重叠，后续可继续合并，但不建议现在立即删除：

- `model_code`
- `node_type`
- `content_type`
- `column_kind`

## 下一步建议

下一轮可执行动作：

1. 补一个显式迁移脚本或 schema 版本步骤，保证生产库能稳定完成“清空旧影子”
2. 排查后台列表/详情页中是否还有必须展示 legacy shadow 字段的地方
3. 设计 `columns_v2` / `column_translations_v2`，正式删除专用页面栏目与产品分类不再需要的内容列
4. 在 `columns_v2` 里把“内容字段保留范围”收敛到仅 `product_item / news_item` 必需部分

## 再下一步建议

完成 `columns_v2` 之前，优先做下面这批兼容拆除：

1. 产品旧链接重定向改为直接查询 `content_product`
2. sitemap / llms 中与内容项有关的查询改为优先走内容表
3. 明确 `product_item / news_item` 是否只保留 `id / parent_id / slug / source_id` 这类轻量索引，还是完全移除
