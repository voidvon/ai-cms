# FULL AUDIT REPORT

## 审计概览

- 审计对象：`http://localhost:1231/`
- 审计日期：2026-06-26
- 审计类型：全站 SEO 审计（基于首页、`robots.txt`、`sitemap.xml`、`sitemap-1.xml` 与代表性页面抽样）
- 站点类型判断：全球化 B2B 工业蒸汽系统与产品解决方案网站
- 审计范围说明：本次为可访问页面与站点结构的实测审计，不含 GSC、GA4、CrUX、DataForSEO、外链平台等外部数据源

## 总体评分

- 整体 SEO 健康分：`66 / 100`

### 分类评分

| 维度 | 分数 | 说明 |
|---|---:|---|
| Technical SEO | 55 | 存在 canonical、重复 URL、兼容路由、开发环境暴露等结构性问题 |
| Content Quality | 72 | 产品详情页内容质量不错，但存在空新闻页和部分弱描述 |
| On-Page SEO | 60 | 站点基础标签齐全，但部分页面元描述过于泛化 |
| Schema / Structured Data | 74 | JSON-LD 覆盖较稳定，但部分对象 URL/图片源仍不理想 |
| Performance | 68 | 未接入真实 CWV 数据；页面资源较多，存在图片和脚本优化空间 |
| AI Search Readiness | 78 | 已提供 `llms.txt`，但 canonical 与 `.md` 引用策略仍需纠正 |
| Images | 65 | 页面图片有 alt，但社交/结构化数据图片 URL 使用本地端口 |

## Executive Summary

### 站点当前的主要优点

1. `robots.txt` 已配置，且允许抓取，同时声明了站点地图。
2. 抽样页面普遍具备 `title`、`meta description`、`canonical`、`hreflang`、OG、Twitter Card 与 JSON-LD。
3. 产品详情页不是简单 SKU 空壳，而是具备产品语义说明、面包屑、下载资料、相关推荐和后续路径引导。
4. 响应头安全性较好，已配置 CSP、HSTS、`x-content-type-options`、`x-frame-options` 等。
5. `llms.txt` 已存在，说明站点已开始考虑 AI 搜索与引用场景。

### Top 5 Critical Issues

1. 产品详情页 canonical 指向错误的数字 ID URL，而该数字 URL 实际返回 `404`。
2. `sitemap-1.xml` 收录了大量非唯一版本 URL，例如 `/` 与 `/index.html` 同时存在。
3. OG 图、结构化数据图片等资源 URL 使用 `http://localhost:1232/`，不适合作为公开可抓取资源地址。
4. 新闻栏目页 `/news/` 可索引且在 sitemap 中，但当前没有任何已发布内容，属于薄内容索引页。
5. 兼容路径 `/search` 与 `/ajaxcode/msg` 直接返回 `404`，对旧站兼容和历史外链不利。

### Top 5 Quick Wins

1. 先修正 canonical 生成逻辑，让每个公开页面自指向当前真实公开 URL。
2. 从 sitemap 中移除 `/index.html` 类别名，只保留规范 URL。
3. 把 `localhost:1232` 图片地址改为公开域名地址或站点可访问的相对地址。
4. 对空新闻页临时 `noindex` 或从 sitemap 移除，直到有真实内容。
5. 修复 `llms.txt` 中对 `.md` 地址的引用，统一改为 HTML 规范 URL。

## Technical SEO

### 1. 抓取与索引控制

#### 正常项

- `robots.txt` 可访问。
- `robots.txt` 当前内容允许所有 User-agent 抓取。
- `robots.txt` 中声明了 sitemap：`https://www.spiraxsteam.com/sitemap.xml`。
- 首页与抽样页面都带有 `meta name="robots" content="index, follow"`。

#### 主要问题

##### 问题 A：canonical 与真实页面 URL 不一致

抽样页面：
- 可访问详情页：`/products/steam-traps/thermodynamic-steam-traps/td52-thermodynamic-steam-trap/`
- 页面 canonical：`https://www.spiraxsteam.com/products/steam-traps/thermodynamic-steam-traps/349/`
- 实测 `http://localhost:1231/products/steam-traps/thermodynamic-steam-traps/349/` 返回：`404 Not Found`

影响：
- 搜索引擎会把权重收敛到一个不存在的 canonical 目标。
- 正常 slug 页面可能被视作重复页或错误 canonical 页。
- 产品详情页的收录、排名和稳定性会明显受损。

结论：
- 这是当前最严重的索引层问题，应立即修复。

##### 问题 B：站点地图包含重复 URL 版本

`sitemap-1.xml` 中可见以下重复模式：
- `https://www.spiraxsteam.com/`
- `https://www.spiraxsteam.com/index.html`
- `https://www.spiraxsteam.com/news/`
- `https://www.spiraxsteam.com/news/index.html`
- `https://www.spiraxsteam.com/learn-about-steam/`
- `https://www.spiraxsteam.com/learn-about-steam/index.html`
- 其他栏目页也存在同类重复

影响：
- 稀释抓取预算。
- 让搜索引擎在多个近重复 URL 之间做选择。
- 与 canonical 不一致时会加剧重复收录和错误归并。

建议：
- sitemap 只能输出最终规范 URL。
- 所有 `/index.html` 页面应视为历史别名或技术别名，不应进入正式 sitemap。

##### 问题 C：兼容路由未就绪

实测：
- `/search` 返回 `404`
- `/ajaxcode/msg` 返回 `404`

影响：
- 如果这些是旧站入口或历史收录链接，会产生大量死链。
- 用户、爬虫、旧书签和旧外链访问体验都会受影响。
- 不符合旧站兼容优先的迁移策略。

建议：
- 若仍需兼容，应返回有效内容、301 跳转，或至少提供业务可接受的替代落点。

##### 问题 D：`/admin/` 暴露开发环境跳转

实测：
- `/admin/` 返回 `302 Found`
- 跳转目标：`http://127.0.0.1:5173/admin/`

影响：
- 这是明显的开发环境泄漏。
- 搜索引擎虽然一般不会索引后台，但这类响应会降低站点整体工程质量。
- 对部署环境和反向代理配置是风险信号。

建议：
- 生产/预览环境下后台入口应指向真实后台路径，不应暴露本地 dev server。

### 2. 站点地图质量

#### 正常项

- `sitemap.xml` 可访问。
- sitemap index 可正常指向 `sitemap-1.xml`。
- `sitemap-1.xml` 页面规模较大，说明站点已进入可爬取状态。

#### 问题汇总

- 收录了重复 URL 版本。
- 收录了空内容页，如 `/news/`。
- 站点地图 URL 看起来是正式域名版本，但当前本地渲染出的部分 meta/image 资源仍混入本地资源端口，说明生成链路仍不统一。

### 3. 安全与协议层

#### 正常项

首页实测包含：
- `content-security-policy`
- `strict-transport-security`
- `x-frame-options`
- `x-content-type-options`
- `referrer-policy`
- `permissions-policy`

评价：
- 这一层做得较好，属于正向信号。

## Content Quality

### 1. 产品详情内容质量

抽样页面：
- `/products/steam-traps/thermodynamic-steam-traps/td52-thermodynamic-steam-trap/`

优点：
- 页面标题明确，包含型号与品类。
- 页面正文不是简单罗列参数，而是解释“该产品在产品族中的位置”“适用边界”“选型前需要确认的事项”。
- 包含相关产品、资料下载、知识页链接、联系团队 CTA。
- 具备较好的主题清晰度和商业转化路径。

评价：
- 这是站点内容质量较强的板块，适合继续扩展。

### 2. 栏目/知识列表内容质量

抽样页面：
- `/learn-about-steam/introduction/`

优点：
- 有明确的内容列表、文章标题、摘要、发布时间。
- 侧边导航能帮助用户与爬虫理解信息架构。

问题：
- `meta description` 仅为 `Learn about steam`，过于宽泛。
- 页面标题 `Introduction | Learn about steam` 可用，但摘要与元描述未充分表达主题价值。

建议：
- 每个知识栏目页应生成更具体的说明，例如覆盖内容范围、用户意图和业务语义。

### 3. 新闻栏目存在薄内容问题

抽样页面：
- `/news/`

现状：
- 页面标题、描述、canonical 等基础标签完整。
- 页面正文显示：`All articles (0)`，并提示“News updates are coming soon”。

问题：
- 这是典型的“可索引但没有实质内容”的空栏目页。
- 若长期保留在 sitemap 中，会拖累站点整体内容质量信号。

建议：
- 短期方案：从 sitemap 中移除，并加 `noindex`。
- 中期方案：至少发布首批新闻内容，再恢复索引。

### 4. 联系页内容质量

抽样页面：
- `/contact-us/`

优点：
- 页面文本目标明确，转换路径清晰。
- 提供多种联系方式和可视化即时联系模块。
- 适合承接品牌词、导航词和转化意图。

问题：
- 联系页中局部文案存在重复，例如两个 highlight 模块复用相同主文案，略有模板感。
- 不影响索引，但会影响页面精炼度与专业感。

## On-Page SEO

### 正常项

抽样页面基本具备：
- 唯一 `title`
- `meta description`
- `h1`
- `canonical`
- `hreflang`
- OG / Twitter 标签
- 面包屑

### 主要问题

#### 1. canonical 逻辑错误

这既是技术问题，也是最核心的 On-Page 问题，因为页面级规范化信号直接错误。

#### 2. 部分页面元描述过弱

案例：
- `/learn-about-steam/introduction/` 的描述仅为：`Learn about steam`

问题：
- 无法有效覆盖页面真实主题。
- CTR 吸引力不足。
- 无法帮助搜索引擎区分不同子栏目。

#### 3. 首页 canonical 指向正式域名，适合作为生产语义，但需确保与部署环境一致

首页当前：
- 本地访问地址：`http://localhost:1231/`
- canonical：`https://www.spiraxsteam.com/`

说明：
- 这在本地预览阶段可以接受。
- 但必须确保正式生成环境中所有页面都按同一公开域名逻辑输出，不能部分页面仍落到 `localhost` 资源。

## Schema / Structured Data

### 正常项

抽样页面已覆盖以下结构化数据类型：
- `Organization`
- `WebSite`
- `WebPage`
- `BreadcrumbList`
- 产品详情页附带 `Product`

优点：
- 覆盖基础较完整。
- 面包屑、组织信息、页面语义表达清晰。

### 问题

#### 1. 结构化数据中的图片 URL 使用本地资源端口

例如产品页、首页、联系页、新闻页中的 `primaryImageOfPage` / `image` 均使用：
- `http://localhost:1232/...`

影响：
- 这类资源不适合作为搜索引擎和社交平台抓取对象。
- 可能导致 rich result 资源不可访问或预览失效。

#### 2. 产品页 `Product.url` 与 canonical 绑定到数字 ID 路径

影响：
- schema 中的主实体 URL 与用户可访问 URL 脱节。
- 会加剧规范化冲突。

## Performance

### 当前判断

由于本次未接入 CrUX、PageSpeed 或 Lighthouse 自动测量，性能评估仅基于页面结构与资源线索。

### 风险信号

- 首页与联系页预加载图片较多。
- 页面中存在较多绝对图片资源与多个运行时脚本。
- 联系页内容复杂，包含多个弹窗/二维码/图像模块。

### 保守结论

- 当前无法给出真实 LCP / INP / CLS 数值。
- 从页面体量和图片使用方式看，仍有优化空间。

建议：
- 后续补跑 Lighthouse 或真实 CWV 数据。
- 优先检查 Hero 图、联系页多图、JS 运行时体积和延迟加载策略。

## Images

### 正常项

- 抽样页面图片普遍具备 `alt`。
- 页面使用了 `loading="lazy"` 的场景较多。

### 问题

#### 1. 图片 host 使用本地端口

这是本次图片层最重要问题：
- `localhost:1232` 仅适用于本地资源服务。
- 不应出现在 OG、Twitter、Schema 等对外元数据中。

#### 2. 资源统一性不足

- 页面 HTML 主体通过 `localhost:1231` 提供。
- 图片元数据却由 `localhost:1232` 承载。
- 在预览期可运行，但不利于对外抓取和环境一致性。

## AI Search Readiness

### 正常项

- `llms.txt` 可访问。
- 文档明确允许 AI 搜索爬虫在遵守规则的前提下使用公开内容。
- 已写明归因要求和使用说明。

### 问题

#### 1. `llms.txt` 中大量链接指向 `.md` URL

示例：
- `https://www.spiraxsteam.com/index.md`
- `https://www.spiraxsteam.com/products/index.md`
- `https://www.spiraxsteam.com/contact-us/index.md`

问题：
- 对公开网站而言，AI 引用最佳实践应优先指向公开 HTML canonical URL。
- `.md` 路径更像内部派生内容接口，而非真实公开 URL。
- 这会降低 AI 引用一致性，增加 URL 混淆。

#### 2. `llms.txt` 的引用建议与 canonical 实际状态不一致

- 文档写明应使用 canonical URL。
- 但站内实际 canonical 尤其在产品详情页上存在错误。

影响：
- AI 爬虫会收到互相冲突的规范化信号。

## 抽样页面结论

### 首页 `/`

- 优点：品牌、导航、结构化数据、OG、hreflang 完整。
- 问题：`/index.html` 同时存在于 sitemap，构成重复 URL。

### 新闻页 `/news/`

- 优点：标签完整。
- 问题：空内容页被索引、被收录进 sitemap。

### 联系页 `/contact-us/`

- 优点：转化路径强，结构清晰。
- 问题：图像与元数据资源依赖本地端口；局部文案有重复。

### 知识栏目页 `/learn-about-steam/introduction/`

- 优点：内容结构良好，栏目层级清晰。
- 问题：元描述过弱。

### 产品详情页 `/products/steam-traps/thermodynamic-steam-traps/td52-thermodynamic-steam-trap/`

- 优点：内容质量高，适合承接搜索意图。
- 问题：canonical 指向错误 404 数字路径，属于最高优先级问题。

## 优先级结论

### Critical

1. 修复详情页 canonical，使其指向真实 slug URL。
2. 若数字 ID 路径是历史路径，应统一 `301` 到 slug URL，而不是作为 canonical 目标。
3. 清理 sitemap 中的 `/index.html` 和其他重复 URL，只保留规范 URL。
4. 将页面元数据中的 `localhost:1232` 图片 URL 改为公开可访问资源地址。
5. 对空新闻页执行 `noindex` 或暂时从 sitemap 移除。

### High

1. 恢复 `/search`、`/ajaxcode/msg` 等旧兼容入口，或配置正确跳转。
2. 修正 `/admin/` 到本地开发端口的跳转暴露。
3. 修复 `llms.txt` 中 `.md` 链接，统一引用 HTML canonical URL。

### Medium

1. 为知识栏目、列表栏目生成更精确的 `meta description`。
2. 清理联系页中重复表达的模块文案。
3. 进一步评估图片体积、首屏预加载与运行时脚本数量。

### Low

1. 持续扩充新闻/知识板块内容规模。
2. 进一步增强产品页的规格参数、FAQ、应用场景结构化表达。

## 审计限制

- 本次不是完整 500 页自动爬取，而是基于 sitemap 与代表性页面抽样。
- 未接入 Search Console、GA4、CrUX、DataForSEO、Moz/Bing 外链等数据源。
- 未生成截图、PDF 报告，也未写入 `.seo-cache/`。
- 由于环境限制，未执行 Lighthouse、真实 CWV 或移动端截图测试。

## 最终结论

当前站点已经具备较完整的模板化 SEO 基础能力，包括标题、描述、结构化数据、hreflang、站点地图与 AI 可读说明文件。但最核心的问题出在“规范化信号不一致”：

- canonical 错误指向
- sitemap 重复 URL
- 元数据图片资源使用本地端口
- 空栏目仍被索引
- 旧兼容入口未恢复

这些问题会直接影响收录稳定性、权重归并、抓取效率以及对外分享表现。优先修复 URL 规范化与资源域名一致性后，这个站点的 SEO 基础分数有机会从 `66` 提升到 `78+`。
