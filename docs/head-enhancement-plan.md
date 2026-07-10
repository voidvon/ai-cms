# HTML头部增强方案

## 问题描述

当前项目（spiraxsarcocn）生成的HTML头部过于简化，缺少完整的SEO优化元素。与线上项目（spirax-global @ https://www.spiraxsteam.cn）对比：

### 当前项目头部（缺失内容）
```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charSet="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Spirax Sarco</title>
  <link rel="stylesheet" href="/assets/cms-templates/page-spirax_home.css">
  <link rel="stylesheet" href="/assets/cms-templates/shared.css">
</head>
```

### 线上项目头部（完整）
包含：
- ✅ SEO meta标签（description, robots, canonical）
- ✅ Open Graph标签（og:title, og:description, og:image等）
- ✅ Twitter Card标签
- ✅ Favicon完整集合（多尺寸png, apple-touch-icon, webmanifest）
- ✅ 结构化数据（JSON-LD Schema.org）
- ✅ hreflang多语言标签
- ✅ 主题色配置

## 增强方案

### 方案一：修改数据库中的TSX模板（推荐）

**优点：**
- 符合现有架构
- 灵活可配置
- 每个页面类型可定制

**实施步骤：**

1. **更新 `spirax_shell` 模板**，在`<head>`部分添加SEO元素生成函数
2. **创建新的服务模块** `system/server/src/services/seo-meta.mjs`
3. **更新静态生成器** 传递必要的SEO数据

### 方案二：在静态生成器后处理

**优点：**
- 不需修改模板
- 集中管理

**缺点：**
- HTML解析开销
- 难以针对不同页面定制

## 具体实施（方案一）

### 1. 创建SEO元数据服务

文件：`system/server/src/services/seo-meta.mjs`

```javascript
export function buildSeoMeta({
  title,
  description,
  url,
  image,
  type = 'website',
  site
}) {
  const siteConfig = site || {};
  const canonicalUrl = url || siteConfig.web_url;
  const defaultImage = '/uploads/images/global/generic-header-images/header_engineers_07-60993fae75.jpg';
  
  return {
    basic: {
      description: description || `探索 Spirax Sarco 斯派莎克蒸汽系统解决方案`,
      robots: 'index, follow',
      canonical: canonicalUrl
    },
    openGraph: {
      title: title || siteConfig.web_name,
      site_name: 'Spirax Sarco',
      locale: 'zh_CN',
      localeAlternates: ['ar', 'en', 'fr', 'pt', 'ru', 'th', 'tr'],
      description: description,
      url: canonicalUrl,
      type: type,
      image: image || defaultImage,
      imageWidth: 1440,
      imageHeight: 810
    },
    twitter: {
      card: 'summary_large_image',
      site: '@spiraxsarco',
      title: title,
      description: description,
      image: image || defaultImage
    },
    hreflang: [
      { lang: 'ar', url: 'https://www.spiraxsteam.ae/' },
      { lang: 'en', url: 'https://www.spiraxsteam.com/' },
      { lang: 'fr', url: 'https://www.spiraxsteam.com/fr/' },
      { lang: 'pt', url: 'https://www.spiraxsteam.com/pt/' },
      { lang: 'ru', url: 'https://www.spiraxsteam.ru/' },
      { lang: 'th', url: 'https://www.spiraxsteam.com/th/' },
      { lang: 'tr', url: 'https://www.spiraxsteam.com/tr/' },
      { lang: 'zh-CN', url: 'https://www.spiraxsteam.cn/' },
      { lang: 'x-default', url: 'https://www.spiraxsteam.com/' }
    ]
  };
}

export function buildJsonLdOrganization(site) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Spirax Sarco',
    url: site.web_url || 'https://www.spiraxsteam.cn',
    logo: `${site.web_url || 'https://www.spiraxsteam.cn'}/logo.svg`,
    sameAs: [
      'https://www.linkedin.com/company/spirax-sarco',
      'https://twitter.com/spiraxsarco'
    ],
    contactPoint: {
      telephone: site.company_phone || '+86-157-9019-6438',
      contactType: 'customer service',
      availableLanguage: ['ar', 'en', 'zh', 'ru']
    }
  };
}

export function generateFaviconLinks() {
  return [
    { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
    { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' },
    { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon-16x16.png' },
    { rel: 'manifest', href: '/site.webmanifest' },
    { rel: 'mask-icon', href: '/safari-pinned-tab.svg', color: '#002d72' },
    { rel: 'shortcut icon', href: '/favicon.ico' }
  ];
}
```

### 2. 更新TSX模板生成SEO标签

需要在数据库中更新 `spirax_shell` 模板，在 `<head>` 部分添加：

```tsx
{/* SEO Meta Tags */}
<meta name="description" content={seoMeta.basic.description} />
<meta name="robots" content={seoMeta.basic.robots} />
<link rel="canonical" href={seoMeta.basic.canonical} />

{/* Open Graph */}
<meta property="og:title" content={seoMeta.openGraph.title} />
<meta property="og:site_name" content={seoMeta.openGraph.site_name} />
<meta property="og:locale" content={seoMeta.openGraph.locale} />
{seoMeta.openGraph.localeAlternates.map(locale => (
  <meta key={locale} property="og:locale:alternate" content={locale} />
))}
<meta property="og:description" content={seoMeta.openGraph.description} />
<meta property="og:url" content={seoMeta.openGraph.url} />
<meta property="og:type" content={seoMeta.openGraph.type} />
<meta property="og:image" content={seoMeta.openGraph.image} />
<meta property="og:image:width" content={seoMeta.openGraph.imageWidth} />
<meta property="og:image:height" content={seoMeta.openGraph.imageHeight} />

{/* Twitter Card */}
<meta name="twitter:card" content={seoMeta.twitter.card} />
<meta name="twitter:site" content={seoMeta.twitter.site} />
<meta name="twitter:title" content={seoMeta.twitter.title} />
<meta name="twitter:description" content={seoMeta.twitter.description} />
<meta name="twitter:image" content={seoMeta.twitter.image} />

{/* Favicons */}
{faviconLinks.map((link, i) => (
  <link key={i} {...link} />
))}

{/* Theme Colors */}
<meta name="msapplication-TileColor" content="#002d72" />
<meta name="msapplication-config" content="/browserconfig.xml" />
<meta name="theme-color" content="#ffffff" />

{/* hreflang */}
{hreflangLinks.map(({ lang, url }) => (
  <link key={lang} rel="alternate" hrefLang={lang} href={url} />
))}

{/* Structured Data */}
<script type="application/ld+json"
  dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
/>
```

### 3. 更新静态生成器传递SEO数据

在 `static-builder.mjs` 中：

```javascript
import { buildSeoMeta, buildJsonLdOrganization, generateFaviconLinks } from './services/seo-meta.mjs';

function buildLegacyHomePageProps(templateContext) {
  const { site } = templateContext;
  
  return {
    site,
    siteColumns: templateContext.siteColumns,
    // ... 其他props
    
    // 新增SEO数据
    seoMeta: buildSeoMeta({
      title: `斯派莎克阀门 蒸汽系统解决方案 | SpiraxSarco 中国`,
      description: `探索 Spirax Sarco 斯派莎克蒸汽系统解决方案，包括蒸汽疏水阀、压力控制阀、流量计、冷凝水回收以及蒸汽系统服务。`,
      url: site.web_url,
      site
    }),
    jsonLd: buildJsonLdOrganization(site),
    faviconLinks: generateFaviconLinks(),
    hreflangLinks: buildSeoMeta({}).hreflang
  };
}
```

## 静态资源准备

需要准备以下favicon文件（放在 `html/` 根目录）：

- `favicon.ico` (经典ICO格式)
- `favicon-16x16.png`
- `favicon-32x32.png`
- `apple-touch-icon.png` (180x180)
- `safari-pinned-tab.svg`
- `site.webmanifest`
- `browserconfig.xml`

## 实施步骤

### 第一阶段：创建服务模块
1. ✅ 创建 `seo-meta.mjs` 服务
2. ✅ 准备favicon资源文件

### 第二阶段：更新模板
3. ⏳ 修改数据库中的 `spirax_shell` 模板
4. ⏳ 测试首页生成

### 第三阶段：扩展到所有页面
5. ⏳ 为产品详情页添加专属SEO
6. ⏳ 为新闻详情页添加专属SEO
7. ⏳ 为列表页添加专属SEO

## 验证

生成后检查：
```bash
# 查看首页头部
curl -s http://localhost:3000/ | grep -A 50 "<head>"

# 或重新生成静态文件
npm run build:site
curl -s http://localhost:3000/ | head -100
```

## 参考资料

- 线上项目：https://www.spiraxsteam.cn
- Open Graph协议：https://ogp.me/
- Twitter Cards：https://developer.twitter.com/en/docs/twitter-for-websites/cards
- Schema.org：https://schema.org/Organization
