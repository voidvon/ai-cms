# 当前仓库产品新增参考

## 真源与复用点

| 关注点 | 当前真源/入口 |
| --- | --- |
| 产品模型 | `content_models.code = 'product'` |
| 产品基础数据 | `content_product` |
| 多语言内容 | `content_product_translations` |
| 字段配置 | `content_model_fields` |
| 产品栏目 | `columns` + `column_translations`，根路径 `/products/` |
| 模板 | `templates`、`template_versions`、`template_bindings`、`template_variants` |
| 路径 | `system/server/src/services/column-paths.mjs` |
| 内容写入 | `system/server/src/services/content-items.mjs`、`content-entries.mjs` |
| 静态生成 | `system/server/src/static-builder.mjs` |
| 图片 | `html/uploads/images/YYYYMM/` + `media_assets`/上传 API |
| 产品规格 | `docs/价格汇总表.csv` |

模板只允许 `tsx`，源码字段只允许 `tsx_source`、`css_source`、`published_tsx_source`、`published_css_source`。

## 写入前检查

优先使用 MCP/API 查询；调试时可对数据库做只读查询：

```sql
SELECT p.id, p.column_id, p.custom_url, p.code, p.is_visible,
       p.is_featured_home, t.name, t.seo_title, t.publish_status, l.code AS language
FROM content_product p
LEFT JOIN content_product_translations t ON t.entry_id = p.id
LEFT JOIN languages l ON l.id = t.language_id
WHERE lower(p.code) = lower(?)
   OR lower(t.name) LIKE lower(?);
```

确认以下事项：

- 型号和别名均未命中已有产品。
- 目标栏目是 `column_type = 'list'`，`content_model_id` 指向 `product`。
- 栏目位于 `/products/` 树中，`route_path`、`dir_name` 和 `detail_rule` 符合已有同级栏目。
- 现有详情模板及栏目绑定足够，不因单个产品创建模板变体。

## 当前字段

基础表字段：

- `column_id`: 必填，决定列表归属和详情路径。
- `custom_url`: 可空；只能是相对/站内文件名，末段必须包含扩展名，例如 `td52/index.html`。
- `code`: 产品型号或编号。
- `images`: JSON 字符串数组；API payload 可直接提交数组。
- `primary_image`: 主图 URL。
- `spec_options_json`: JSON 字符串数组；API payload 可直接提交字符串数组。
- `is_visible`: `0/1`。
- `is_featured_home`: `0/1`。
- `sort_order`: 数字，产品列表当前按 `sort_order ASC, id DESC` 排序。
- `created_at`: 可选 ISO 时间；不承担旧项目 `launchDate` 的专用语义。

翻译表字段：

- `name`: 产品名，默认语言必填。
- `summary`: 列表摘要/详情摘要。
- `content_html`: 富文本 HTML。
- `template_data_json`: 可选模板扩展数据，只传对象或数组；没有既有模板契约时不要自行发明键。
- `seo_title`、`seo_description`: 多语言 SEO 字段。
- `publish_status`: `draft` 或 `published`（以当前服务可接受值为准）。

运行时会将主图标准化为 `primary_image || images[0]`。不要再使用 `coverImages`、`frontmatter`、`topPanel`、`pageData`、`launchDate` 或 `showInLatestProducts`。

## Payload 示例

写入前通过 `/api/content-models` 和 `/api/content-models/:id/fields` 获取实时字段。典型 payload：

```json
{
  "base": {
    "column_id": 60,
    "custom_url": "td52/index.html",
    "code": "TD52",
    "images": ["/uploads/images/202607/td52-cover.jpg"],
    "primary_image": "/uploads/images/202607/td52-cover.jpg",
    "spec_options_json": ["TD52 DN15, material code ..."],
    "is_visible": 1,
    "is_featured_home": 0,
    "sort_order": 100
  },
  "translations": {
    "zh-CN": {
      "name": "TD52 热动力式蒸汽疏水阀",
      "summary": "可验证的简短产品定位。",
      "content_html": "<p>可验证的产品详情。</p>",
      "template_data_json": null,
      "seo_title": "TD52 热动力式蒸汽疏水阀 | 斯派莎克",
      "seo_description": "面向搜索结果的准确描述。",
      "publish_status": "published"
    }
  }
}
```

示例中的栏目 ID、图片、规格和文案仅展示结构，不能直接复用为事实。

可用写入入口：

- MCP: `create_content_item` / `update_content_item`，`modelCode: "product"`。
- API: `POST /api/content-items/product` / `PUT /api/content-items/product/:id`。
- 后台：产品/信息管理页中的统一 `ContentItemFormDialog`。

MCP 会按实时内容模型过滤基础字段；检查返回的 `ignored_base_fields`，任何被忽略的预期字段都应先查明原因。

## 栏目与 URL

产品必须挂到最具体的现有产品栏目。不要为型号默认创建栏目，也不要手工维护父级 `models` 或 `cards`。

路径由 `buildContentDetailPathFromColumn(entry, column, columnPath)` 生成：

- 有 `custom_url` 时，按栏目基路径解析该文件名。
- 无 `custom_url` 时，使用栏目 `detail_rule` 与内容 ID。
- 当前产品栏目通常使用 `{id}/index.html`，但必须读取目标栏目的真实配置。

栏目列表模板从该栏目及绑定规则读取产品条目；验证归属和可见性即可，不增加第二份入口数据。

## 规格规则

`spec_options_json` 当前是平铺字符串数组，不是对象矩阵。例如：

```json
["SP7-10, HART, material code 123456", "SP7-11, PROFIBUS PA, material code 123457"]
```

- `docs/价格汇总表.csv` 是 `spec_options_json` 的唯一规格来源，不从正文、关键词表或旧页面反推规格。
- 先根据产品名称、正文和价格表分组确定该详情页覆盖的明确型号集合，再对集合内每个型号在 `型号` 列做不区分大小写的精确匹配；系列页标题、`文档名` 或其他字段中仅提及型号不算命中。
- 只放整机/主机的实际可选规格。排除 spare parts、kits、gasket、filter、spring、seat assembly 等备件行，以及型号名称中仅以 `for <型号>` 表示适用对象的行。
- 规格文本按存在的字段稳定拼装：`型号`、`口径`、`规格`、`材质`，最后附 `物料代码`；去重后保持价格表原顺序。不要把价格、库存、内部来源文件或空字段写入展示文本。
- 同一详情页覆盖明确变体型号时应全部纳入。例如 AE30 系列页在价格表同一整机表中明确列出 `AE30` 和 `AE30A`，两者都应作为规格；但不能只因名称相近就自动扩展型号集合。
- 没有精确整机记录时使用 `[]`，不得用近似型号或技术资料中的可能选项补齐。
- 不新增 `groups`、`variants`、联动矩阵或产品专属 JS。

价格表应使用支持带 BOM UTF-8 和 CSV 引号的解析器读取，不用按逗号拆行。写入后必须再次解析 JSON 并逐项回查价格表。

## 询盘控件契约

- 所有产品详情页固定显示数量选择和联系按钮。
- `spec_options_json` 非空时，在数量控件前显示规格选择；为空时只省略规格选择区。
- 数量和联系按钮不得依赖 `topPanel.ctaLabel`、规格数量、下载或其他可选内容。
- 联系按钮优先使用站点模板数据的本地化文案，没有配置时提供中英文 fallback，并始终指向现有 `/contact-us/` 路径。
- 该行为属于数据库组件模板 `product_top_panel`，不得在单个产品正文或生成后的 `html/` 中补丁实现。

## 图片规则

遵循 `docs/images-management.md`：

- 上传文件：`html/uploads/images/YYYYMM/<filename>`。
- 数据库 URL：`/uploads/images/YYYYMM/<filename>`。
- 先通过现有上传接口保存图片，再写产品字段。
- 未提供或未授权选图时，`images` 保持空数组，`primary_image` 保持空字符串。
- 不从 PDF 截图、关键词资料或其他产品中擅自挑图。
- 不放到 `public/images/global/products/`，不使用 `/uploadfile/` 等旧路径。

如用户要求图片规格，沿用其明确要求；否则优先保持原图质量并使用现有图片优化/上传链路，不在 skill 中强加旧项目的 4:3/JPG 规则。

## 多语言与 SEO

- 当前启用语言从 `languages` 表实时读取，不硬编码旧站目录名。
- 默认语言是 `zh-CN`，但仍应读取 `languages.is_default` 确认。
- 同一产品的多语言版本写入一个条目的 `translations`，不创建多个产品文件或重复基础记录。
- 未完成的语言不设 `published`；验证页面时检查 `resolved_language_code` 和 `is_language_fallback`。
- 每种语言独立编写 `name`、`summary`、正文和 SEO 字段，不机械翻译技术术语。
- 关键词资料只指导搜索表达，产品事实必须来自技术资料。

### 多语言正文内链

内链优化按“默认语言信息架构 + 各语言自然表达”执行：

1. 从默认语言正文提取正文站内 URL、锚文本和上下文，不把 `#section` 页内目录与正文跨页链接混为一类。
2. 从 `docs/关键词列表/按产品系列类型拆分/*.csv` 找与当前产品、父分类和使用场景直接相关的词及其 `内链` 列。
3. 对候选 URL 检查数据库发布状态和实际静态文件。类似关键词表中存在但站点未生成的 `/topics/.../` 不得使用。
4. 非默认语言原则上复用默认语言的链接目标和语义位置。本地化锚文本时优先采用目标栏目/内容的已发布翻译名称，再结合关键词表达调整为句内自然形式。
5. 只有能明确帮助选型且目标页已发布时才增加默认语言没有的相关产品链接；不要以链接数量作为优化目标。

站内 `<a>` 契约：

- `href` 必须来自当前路径服务产生的已验证 URL，并保留正确语言前缀。
- 不使用 `rel="nofollow"`、`rel="sponsored"`、`rel="ugc"` 或 `target="_blank"`。这些属性若来自 PDF/HTML 导入，应在产品正文整理时清除。
- 对使用空格分词的语言，序列化后检查锚点前后文本节点。需要空格的位置必须保留，例如 `compare <a ...>check valves</a> before...`，不能生成 `compare<a ...>`。
- 锚点后的逗号、句号等标点直接跟随链接，不额外插入空格；非中文翻译不得残留中文句号 `。`。
- 使用 `parse5` 操作文档树；不要对长篇富文本做无边界正则替换。写回时走 `updateContentItem`/`updateContentEntry` 的 `{ base, translations }` 契约。

建议分别统计每种语言：正文跨页链接数、页内锚点数、带 `rel/target` 的站内链接数、目标不存在数和锚点边界异常数。默认语言不应因“同步多语言”被无意修改。

## 验证清单

数据库/API：

- 重新读取产品并包含 `includeTranslations`。
- 核对 `column_id`、`code`、`custom_url`、图片、规格、推荐、显示和排序。
- 将每个规格选项回查 `docs/价格汇总表.csv`，确认没有近似型号、备件，也没有遗漏当前详情页明确覆盖的变体。
- 核对每个翻译的名称、SEO、正文和发布状态。
- 对每个已发布语言核对正文内链目标、语言前缀、本地化锚文本、边界空格和标点；站内链接的 `nofollow/target` 数必须为 `0`。
- 再次搜索型号，确认只有一个基础条目。

静态生成：

```bash
npm run build:site
```

构建后至少抽查：

- 首页公开路由 `/`
- 联系栏目 `/contact-us/`
- 新产品详情输出文件
- 一个有规格和一个无规格的产品详情页，均包含数量控件与 `/contact-us/` 联系按钮
- 所属产品栏目 `index.html`
- 一个既有新闻详情页

检查页面 title/description、产品名、主图、正文、栏目导航、规范 URL 和静态资源。不要通过修改 `html/*.html` 修复问题；回到数据库内容、栏目、模板或静态生成链路修复后重建。

静态生成是最后一步。若构建被交互中断但进程仍在后台运行，先检查并等待该进程结束；不要在旧构建尚未结束时修改数据后再启动新构建，否则不同语言目录可能混入不同版本的真源。
