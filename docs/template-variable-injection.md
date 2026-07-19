# 模板变量注入说明

本文档说明静态生成时注入到 CMS 模板中的变量。当前模板存储在 `data/site.sqlite` 的 `templates` 表中，模板类型分为 `home`、`list`、`content`、`component`，模板引擎支持 `tsx` 和 `html`。

## 基本写法

TSX 模板必须默认导出一个 React 组件：

```tsx
export default function Template({ site, title, items, component, Raw }) {
  return (
    <html>
      <body>
        <h1>{title}</h1>
        <Raw html={component('breadcrumb')} />
      </body>
    </html>
  )
}
```

HTML 模板可使用变量占位符：

```html
<title>{{title}}_{{site.web_name}}</title>
<div>{{{bodyHtml}}}</div>
#component("breadcrumb")#
```

- `{{name}}`：HTML 转义输出。
- `{{{name}}}`：原样输出 HTML。
- `#component("code")#`：渲染组件模板。
- TSX 中用 `<Raw html={...} />` 输出可信 HTML 片段。
- TSX 中用 `component('code', extraProps)` 调用组件，并可传入额外变量。

## TSX 运行边界

TSX 模板运行在服务端渲染环境中，只提供模板变量、`React`、`Raw`、`ClientOnly`、`component` 等模板能力。

- 可以写 JSX、数组循环、条件渲染、字符串处理。
- 可以 `import React from 'react'`，也可以直接使用全局 `React`。
- 不能使用 Node.js API、文件系统、网络请求或任意第三方包。
- 如果模板包含 `ClientOnly` 或导出客户端逻辑，静态生成会额外输出模板客户端 JS。

## 公共变量

以下变量会注入到大多数页面模板和组件模板中。

### `site`

站点配置对象，常用字段：

| 字段 | 说明 |
| --- | --- |
| `site.web_name` | 网站名称 |
| `site.company_name` | 公司名称 |
| `site.company_phone` | 电话 |
| `site.company_fax` | 传真 |
| `site.web_mobile` | 手机 |
| `site.company_email` | 邮箱 |
| `site.company_address` | 地址 |
| `site.web_url` | 网站地址 |
| `site.icp_number` | ICP 备案号 |
| `site.web_qq` | QQ |

### `meta`

SEO 元信息对象，以类型 ID 作为字符串 key：

```tsx
const homeMeta = meta['1'] || {}
const jobMeta = meta['5'] || {}
```

常用字段：

| 字段 | 说明 |
| --- | --- |
| `meta[id].title` | SEO 标题 |
| `meta[id].meta_keywords` | SEO 关键词 |
| `meta[id].meta_descriptions` | SEO 描述 |

### `fragments`

兼容历史结构的 HTML 片段：

| 字段 | 说明 |
| --- | --- |
| `fragments.productsMenuHtml` | 产品分类菜单 HTML |
| `fragments.productsMenuCompactHtml` | 顶部产品快捷导航 HTML |
| `fragments.aboutCategoryHtml` | 公司栏目分类 HTML |
| `fragments.newsCategoryHtml` | 新闻分类 HTML |
| `fragments.serviceCategoryHtml` | 服务/知识分类 HTML |
| `fragments.indextopHtml` | 历史首页头部标签内容 |
| `fragments.topHtml` | 历史通用头部标签内容 |
| `fragments.bottomHtml` | 历史底部标签内容 |
| `fragments.indexFootHtml` | 历史首页底部标签内容 |
| `fragments.aboutHtml` | 历史关于我们片段 |

### 当前页面上下文

除首页外，列表页和内容页通常会注入以下上下文。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `currentPage` | object | 当前页面信息 |
| `currentPage.type` | string | 页面类型，如 `product-list`、`article-detail` |
| `currentPage.title` | string | 当前页面标题 |
| `currentPage.url` | string | 当前页面 URL |
| `currentSection` | object \| null | 当前站点板块，如产品、新闻、招聘 |
| `currentColumn` | array | 当前栏目路径数组，从父级到当前栏目 |
| `currentColumnItem` | object \| null | 当前栏目路径的最后一级 |
| `parentColumn` | object \| null | 当前栏目父级 |
| `currentContent` | object \| null | 当前内容对象的摘要信息 |
| `breadcrumb` | object | 面包屑上下文 |

栏目对象结构：

| 字段 | 说明 |
| --- | --- |
| `id` | 分类 ID |
| `type` | 分类类型，如 `product`、`news`、`service`、`corporation` |
| `name` | 分类名称 |
| `url` | 分类 URL |
| `parentId` | 父分类 ID |
| `parentName` | 父分类名称 |
| `seoKeywords` | 分类 SEO 关键词 |
| `seoDescription` | 分类 SEO 描述 |

面包屑对象结构：

| 字段 | 说明 |
| --- | --- |
| `breadcrumb.items` | 面包屑数组 |
| `breadcrumb.items[].label` | 显示名称 |
| `breadcrumb.items[].url` | 链接；为空时表示当前项 |
| `breadcrumb.separatorHtml` | 分隔符 HTML |
| `breadcrumb.prefixHtml` | 前缀 HTML |
| `breadcrumb.html` | 已拼好的历史 HTML |

## 首页模板变量

适用模板：`home_default`。

首页模板会注入公共变量，并额外注入：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `newsIndexHtml` | string | 首页新闻列表 HTML |
| `featuredProductsHtml` | string | 首页推荐产品滚动区域 HTML |
| `featuredProductLinksHtml` | string | 首页推荐产品链接 HTML |
| `serviceIndexHtml` | string | 首页阀门知识/服务列表 HTML |

示例：

```tsx
export default function HomeTemplate({ meta, newsIndexHtml, component, Raw }) {
  const homeMeta = meta['1'] || {}
  return (
    <html>
      <head><title>{homeMeta.title || ''}</title></head>
      <body>
        <Raw html={component('site_header')} />
        <ul><Raw html={newsIndexHtml} /></ul>
      </body>
    </html>
  )
}
```

## 列表页模板变量

### 产品列表

适用模板：`list_product`。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `smallName` | string | 当前产品分类名 |
| `bigId` | number | 父级分类 ID；没有父级时为当前栏目 ID |
| `bigName` | string | 父级分类名；没有父级时为当前栏目名 |
| `prodKeywords` | string | 产品分类 SEO 关键词 |
| `productsSmallCatHtml` | string | 同级/子级产品小分类 HTML |
| `items` | array | 当前页产品列表 |
| `pagerHtml` | string | 分页 HTML |

`items` 元素结构：

| 字段 | 说明 |
| --- | --- |
| `id` | 产品 ID |
| `name` | 产品名称 |
| `url` | 产品详情 URL |
| `image` | 产品图片 |
| `summary` | 产品摘要 HTML |

示例：

```tsx
export default function ProductList({ items = [], component, Raw }) {
  return (
    <div>
      {items.map((item) => (
        <Raw key={item.id} html={component('product_list_item', { item })} />
      ))}
    </div>
  )
}
```

### 文章列表

适用模板：`list_article`，包含新闻和阀门知识分类列表。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `section` | string | `news` 或 `service` |
| `sectionDir` | string | URL 目录，`news` 或 `service` |
| `sectionLabel` | string | 板块名称 |
| `sectionCategoryHtml` | string | 当前板块分类菜单 HTML |
| `columnId` | number | 当前栏目 ID |
| `title` | string | 当前栏目名称 |
| `items` | array | 当前页文章列表 |
| `pagerHtml` | string | 分页 HTML |

`items` 元素结构：

| 字段 | 说明 |
| --- | --- |
| `id` | 文章 ID |
| `title` | 文章标题 |
| `url` | 文章详情 URL |
| `date` | 发布日期 |
| `summary` | 摘要 HTML |
| `summaryClassName` | 摘要 CSS 类名 |

### 招聘列表

适用模板：`list_job`。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `items` | array | 当前页招聘列表 |
| `pagerHtml` | string | 分页 HTML |

`items` 元素结构：

| 字段 | 说明 |
| --- | --- |
| `id` | 招聘 ID |
| `title` | 职位名称 |
| `url` | 招聘详情 URL |
| `openings` | 需求人数 |
| `address` | 工作地点 |
| `date` | 发布日期 |

## 内容页模板变量

### 默认公司栏目内容

适用模板：`content_default`。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `title` | string | 栏目名称 |
| `contentHtml` | string | 栏目内容 HTML |

### 产品详情

适用模板：`content_product`。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `title` | string | 产品名称 |
| `prodKeywords` | string | 产品关键词 |
| `prodDescription` | string | 产品描述 |
| `image` | string | 产品图片 |
| `code` | string | 产品型号 |
| `relatedProductsHtml` | string | 相关产品 HTML |
| `bodyHtml` | string | 产品正文 HTML |

`currentContent` 也会包含当前产品摘要：`id`、`type`、`title`、`name`、`url`。

### 文章详情

适用模板：`content_article`，包含新闻详情和阀门知识详情。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `section` | string | `news` 或 `service` |
| `sectionDir` | string | URL 目录 |
| `sectionLabel` | string | 板块名称 |
| `sectionCategoryHtml` | string | 当前板块分类 HTML |
| `title` | string | 文章标题 |
| `newsKeywords` | string | 文章关键词 |
| `newsDescription` | string | 文章描述 |
| `typeId` | number | 分类 ID |
| `catName` | string | 分类名称 |
| `bodyHtml` | string | 文章正文 HTML |
| `previousHtml` | string | 上一条链接 HTML |
| `nextHtml` | string | 下一条链接 HTML |

### 联系我们

适用模板：`content_contact`。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `contactTableHtml` | string | 联系方式表格 HTML |

### 招聘详情

适用模板：`content_job`。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `title` | string | 职位名称 |
| `address` | string | 工作地点 |
| `openings` | string | 需求人数 |
| `requirementsHtml` | string | 具体要求 HTML |
| `contactPerson` | string | 联系人 |
| `phone` | string | 联系电话 |
| `date` | string | 发布日期 |

## 组件模板变量

组件模板会继承调用它的页面模板变量。也就是说：

- 首页调用的组件可以读取首页变量和公共变量。
- 产品列表调用的组件可以读取产品列表变量和公共变量。
- `component('product_list_item', { item })` 调用的组件可以读取传入的 `item`。
- 组件内部继续调用组件时，也可以通过 `component('code', extraProps)` 追加变量。

所有组件模板还会收到：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `component` | function | 渲染其他组件 |
| `Raw` | component | 原样输出 HTML |
| `ClientOnly` | component | 声明客户端交互挂载点 |
| `raw` | function | 返回 React `dangerouslySetInnerHTML` 对象 |

当前常用组件模板：

| code | 说明 |
| --- | --- |
| `head_assets` | 页面头部 JS/CSS/验证标签片段 |
| `main_nav` | 主导航 |
| `product_quick_nav` | 顶部产品快捷导航 |
| `banner_slider` | 轮播图 |
| `site_header` | 站点头部组合组件 |
| `breadcrumb` | 面包屑 |
| `product_list_item` | 产品列表项 |
| `article_list_item` | 文章列表项 |
| `job_list_item` | 招聘列表项 |
| `botten` | 通用底部 |
| `indexfoot` | 首页底部 |
| `about` | 首页关于我们片段 |
| `search` | 站内搜索 |

## 面包屑组件示例

面包屑组件可直接读取当前页面的 `breadcrumb`，不需要外部手工传入分类。

```tsx
export default function Breadcrumb({ breadcrumb, Raw }) {
  const items = Array.isArray(breadcrumb?.items) ? breadcrumb.items : []
  const separatorHtml = breadcrumb?.separatorHtml || ' - '
  const prefixHtml = breadcrumb?.prefixHtml || ''

  return (
    <div className="site-nav">
      <Raw html={prefixHtml} />
      {items.map((item, index) => (
        <React.Fragment key={index}>
          {index > 0 && <Raw html={separatorHtml} />}
          {item.url ? <a href={item.url}>{item.label}</a> : <span>{item.label}</span>}
        </React.Fragment>
      ))}
    </div>
  )
}
```

如需完整栏目路径，可读取 `currentColumn`：

```tsx
export default function ColumnPath({ currentColumn = [] }) {
  return (
    <ol>
      {currentColumn.map((column) => (
        <li key={column.id}>
          {column.url ? <a href={column.url}>{column.name}</a> : column.name}
        </li>
      ))}
    </ol>
  )
}
```

## HTML 模板循环

HTML 模板仍支持简单循环：

```html
#loop(items)#
  #component("article_list_item")#
#/loop#
```

循环中会自动注入 `item`，因此组件模板可读取 `item.title`、`item.url` 等字段。

TSX 模板推荐直接使用 `items.map(...)`，逻辑更清晰：

```tsx
{items.map((item) => (
  <Raw key={item.id} html={component('article_list_item', { item })} />
))}
```
