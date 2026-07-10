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

- 只放整机/主机的实际可选规格。
- 排除 spare parts、kits、gasket、filter、spring、seat assembly 等备件行。
- 没有可靠的价格/产品数据时使用 `[]`。
- 不新增 `groups`、`variants`、联动矩阵或产品专属 JS。

若当前仓库没有对应价格表，不得沿用旧项目路径或假定文件存在；改用用户提供的可验证数据或保持空数组。

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

## 验证清单

数据库/API：

- 重新读取产品并包含 `includeTranslations`。
- 核对 `column_id`、`code`、`custom_url`、图片、规格、推荐、显示和排序。
- 核对每个翻译的名称、SEO、正文和发布状态。
- 再次搜索型号，确认只有一个基础条目。

静态生成：

```bash
npm run build:site
```

构建后至少抽查：

- 首页公开路由 `/`
- 联系栏目 `/contact-us/`
- 新产品详情输出文件
- 所属产品栏目 `index.html`
- 一个既有新闻详情页

检查页面 title/description、产品名、主图、正文、栏目导航、规范 URL 和静态资源。不要通过修改 `html/*.html` 修复问题；回到数据库内容、栏目、模板或静态生成链路修复后重建。
