# 全站 SEO 审计报告

## 审计概览

- 审计对象：`http://test.spiraxsteam.cn/`
- 审计日期：`2026-06-29`
- 审计方式：首页、`robots.txt`、`sitemap.xml`、代表性栏目页/内容页、搜索接口、兼容入口、`llms.txt` 抽样实测
- 站点类型判断：全球化 B2B 工业蒸汽系统、产品与服务解决方案站点
- 审计范围说明：本次未接入 GSC、GA4、CrUX、Moz、DataForSEO 等外部数据源，结论基于可访问页面与 HTTP 响应

## 总体评分

- 整体 SEO 健康分：`58 / 100`

### 分类评分

| 维度 | 分数 | 说明 |
|---|---:|---|
| Technical SEO | 46 | 规范化、站点地图、HTTPS 证书、旧路径兼容存在明显问题 |
| Content Quality | 70 | 核心产品/服务页内容完整，但新闻列表为空、语言混杂 |
| On-Page SEO | 63 | 标题、描述、H1、hreflang 基本齐全，但域名与语言信号不一致 |
| Schema / Structured Data | 68 | JSON-LD 覆盖较广，但主体、URL、语言仍指向英文正式站 |
| Performance | 64 | 首页资源较重，图片多，未拿到真实 CWV 字段数据 |
| AI Search Readiness | 76 | `llms.txt` 已上线，但 canonical 与引用源仍统一到英文站 |
| Images | 60 | alt 基础不错，但图片大多走 `http` 静态域，社交图策略不稳 |

## 执行摘要

### 主要优点

1. 首页及抽样页普遍具备 `title`、`meta description`、`H1`、`canonical`、`hreflang`、OG、Twitter 和 JSON-LD。
2. 内容页不是简单薄页，产品与服务页具备较强的主题覆盖、面包屑与内部推荐路径。
3. `llms.txt` 已部署，说明站点已经考虑 AI 搜索抓取和引用场景。
4. 响应头安全基线较完整，包含 CSP、HSTS、`x-frame-options`、`x-content-type-options` 等。

### Top 5 Critical Issues

1. 测试域页面 canonical、OG URL、结构化数据 URL 全部指向 `https://www.spiraxsteam.com/`，测试域没有自身规范化信号。
2. `robots.txt` 与 `sitemap.xml` 也都指向英文正式站，而不是当前域名或当前语言站。
3. `https://test.spiraxsteam.cn/` SSL 证书域名不匹配，`curl` 校验证书失败，属于严重技术信任问题。
4. `html lang="en"`、页面正文英文、页脚语言显示 English，但 `hreflang` 又声明 `zh-CN` 替代版本，语言/站点定位混乱。
5. 旧兼容入口 `/search` 与 `/ajaxcode/msg` 返回 `404`，不符合旧站兼容优先原则。

### Top 5 Quick Wins

1. 先把当前域名的 canonical、OG URL、Schema URL 切到当前公开域名或正确目标域名。
2. 修正 `robots.txt` 和 `sitemap.xml` 输出，避免继续把抓取与索引信号导向英文站。
3. 修复 `test.spiraxsteam.cn` HTTPS 证书。
4. 如果这是中文站，统一 `html lang`、文案语言、结构化数据 `inLanguage` 与页脚语言显示。
5. 恢复 `/search` 与 `/ajaxcode/msg` 的兼容落点或 301 跳转。

## Technical SEO

### 1. 抓取与索引控制

#### 发现

- `http://test.spiraxsteam.cn/robots.txt` 返回 `200`
- 内容为：
  - `User-agent: *`
  - `Allow: /`
  - `Sitemap: https://www.spiraxsteam.com/sitemap.xml`
- `http://test.spiraxsteam.cn/sitemap.xml` 返回的是 `https://www.spiraxsteam.com/sitemap-1.xml`

#### 结论

- 当前测试域允许抓取，但把 sitemap 信号全部导向英文正式站。
- 如果此域名希望被搜索引擎视为独立站点、预发站或中文站镜像，这种配置会让索引归属全部落到英文正式站。
- 如果这是纯测试站，应考虑 `noindex` 或受限访问，而不是输出正式站 canonical/sitemap。

### 2. 规范化问题

#### 抽样结果

- 首页 canonical：`https://www.spiraxsteam.com/`
- 产品栏目页 `/products/steam-traps/` canonical：`https://www.spiraxsteam.com/products/steam-traps/`
- 联系页 `/contact-us/` canonical：`https://www.spiraxsteam.com/contact-us/`
- 新闻页 `/news/` canonical：`https://www.spiraxsteam.com/news/`
- 服务页 `/services/wireless-steam-trap-monitoring/` canonical：`https://www.spiraxsteam.com/services/wireless-steam-trap-monitoring/`

#### 风险

- 当前域名几乎没有自有索引价值，所有权重都会被要求归并到英文正式站。
- 若内容与英文正式站不完全一致，搜索引擎可能将其视为跨域重复内容。
- 若目标其实是中文站，这会直接压制中文站收录。

### 3. HTTPS / 证书问题

#### 实测

- `https://test.spiraxsteam.cn/` 访问时证书域名不匹配
- `curl` 返回：`SSL: no alternative certificate subject name matches target host name 'test.spiraxsteam.cn'`

#### 影响

- 浏览器会出现安全告警或降级信任。
- 搜索引擎和部分抓取器会降低对该域的抓取可靠性判断。
- 对外分享、AI 抓取、SEO 调试都会受影响。

### 4. 兼容入口

#### 实测

- `/search`：`404 Not Found`
- `/ajaxcode/msg`：`404 Not Found`
- `/admin/build`：`401 Unauthorized`

#### 结论

- `/admin/build` 至少存在路由保护，优于 `404`。
- `/search` 和 `/ajaxcode/msg` 当前未兼容，不符合仓库对旧入口兼容的要求。

## Content Quality

### 正面观察

- `/products/steam-traps/` 内容体量足够，包含选型说明、路线表格、FAQ 式段落和相关链接。
- `/services/wireless-steam-trap-monitoring/` 内容结构清晰，包含价值说明、工作方式、下一步路径和相关内容。
- 联系页具备明确 CTA、电话与多种联系渠道。

### 问题

1. `/news/` 当前显示 `All articles (0)`，且空状态文案为 “News updates are coming soon”。
2. 空新闻页被设置为 `noindex, follow`，这本身合理，但它仍然作为完整栏目页存在，建议与 sitemap 策略保持一致。
3. 服务页出现语言混杂，正文后部出现中文标题“相关内容”，但条目标题和描述仍是英文，说明模板或内容源存在中英拼接。

## On-Page SEO

### 正常项

- 抽样页面均只有一个主 H1。
- 多数页面 title 与 description 可读性尚可。
- 面包屑存在且同时进入 JSON-LD。

### 主要问题

1. 站点语言信号混乱：
   - `html lang="en"`
   - 页脚当前语言显示 `English`
   - 页面主体几乎全英文
   - 站点又以 `.cn` 域名出现，并声明 `zh-CN` 版本
2. 如果目标是中文站，这套信号会显著削弱中文搜索表现。
3. 联系页有重复价值文案：
   - 两个 highlight 卡片重复 “Steam expertise when you need it”

## Schema / Structured Data

### 已有实现

- 首页：`Organization`、`WebSite`、`WebPage`
- 栏目页：补充 `BreadcrumbList`
- 服务内容页：补充 `Article`

### 问题

1. Schema 中 `Organization.url`、`WebSite.url`、`WebPage.url` 全部指向 `https://www.spiraxsteam.com`
2. `inLanguage` 多数为 `en`
3. 如果当前域要承载中文站或中国区版本，这些结构化数据没有正确表达站点身份

## Performance

### 观察

- 首页 HTML 体积约 `46KB`
- 搜索接口可正常响应，但结果量较大
- 大量首屏和卡片图片来自 `http://static.spiraxsteam.com/...`
- 首页预加载多张图片，联系页也预加载多张二维码/装饰图

### 风险

- 图片数量和预加载策略可能影响首屏加载。
- 静态图片大量使用 `http` 而非 `https`，会增加混合内容和抓取不一致风险。

## AI Search Readiness

### 正面项

- `llms.txt` 返回 `200`
- 包含 AI crawler guidance、归因说明、页面清单

### 问题

1. `llms.txt` 中核心 HTML Source 仍统一指向 `https://www.spiraxsteam.com/...`
2. 多数条目主链接使用 `.md` 镜像 URL，而不是直接以公开 HTML URL 为主
3. 如果 `.cn` 站希望建立独立 AI 可见性，这套输出仍在为英文正式站服务

## 代表性页面抽样

### 首页 `/`

- 优点：标签完整、导航清晰、JSON-LD 存在
- 问题：canonical 指向英文站；语言为英文；站点地图信号不属于当前域

### 产品栏目页 `/products/steam-traps/`

- 优点：内容丰富、表格和内部链接较完善
- 问题：canonical/OG/Schema 全部指向英文站

### 联系页 `/contact-us/`

- 优点：强转化页，联系信息和渠道丰富
- 问题：重复文案，且属于英文站身份信号

### 新闻页 `/news/`

- 当前状态：空列表，`noindex, follow`
- 结论：可保留为过渡状态，但不应作为主要 SEO 资产页面

### 服务页 `/services/wireless-steam-trap-monitoring/`

- 优点：内容深度足够，具备 `Article` schema
- 问题：后半段出现中英混排，说明模板或内容聚合存在质量控制问题

## 优先级结论

### Critical

1. 修复测试域 canonical、OG、Schema URL 指向错误
2. 修复 `robots.txt` / `sitemap.xml` 指向错误
3. 修复 HTTPS 证书
4. 明确当前站点到底是英文测试站还是中文站，并统一语言信号
5. 恢复旧兼容入口 `/search`、`/ajaxcode/msg`

### High

1. 清理中英混排内容
2. 统一 `llms.txt` 的站点归属与 HTML Source
3. 优化空新闻页与 sitemap/内链策略

### Medium

1. 精简联系页重复文案
2. 评估首页和联系页图片预加载数量
3. 将静态图片资源统一到 `https`

## 审计限制

- 未连接 Search Console，无法确认真实索引状态
- 未连接 CrUX，无法确认字段级 CWV
- 未调用外链数据库，无法评估 backlinks
- 本次为抽样审计，不是 500 页全量爬取

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
