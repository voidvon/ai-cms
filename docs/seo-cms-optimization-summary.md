# SEO 与通用 CMS 优化完整阶段记录

本文记录本轮从 SEO 审计开始到当前为止已经完成的全部处理，以及后续如需扩展到全部语言站点时的处理原则。

本轮重点不是“修某几个静态页面”，而是把问题尽量收敛到通用 CMS 的栏目、内容、模板、静态生成、SEO 服务和测试链路中处理。

## 基本原则

本轮处理始终遵守以下约束：

- 前台正式产物仍以 `html/` 静态生成为准。
- 不直接批量手改 `html/` 下的生成页面。
- 栏目、内容、模板、SEO 输出尽量通过 CMS 配置、数据库内容和静态生成链路处理。
- 模板真源仍在数据库，模板引擎仍为 TSX。
- 不为了单个页面在服务层或模板层新增长期硬编码。
- 已迁移完成的旧站入口不继续保留运行期兼容。
- 本轮多数内容优化优先处理英文站点；其它语言后续按同一规则分批推进。

## 处理范围

本轮覆盖过的问题包括：

- 404 与旧入口处理
- `/search` 相关 404 与搜索入口梳理
- JSON-LD 转义错误
- JSON-LD graph 合并
- Schema 类型硬编码清理
- BreadcrumbList
- 英文站本地化信号
- 英文站 title 超长
- 英文站 meta description 缺失或过长
- 英文站重复 H1
- 图片 alt
- 图片 `width` / `height`
- 图片 lazy loading
- 安全响应头
- `llms.txt` / `llms-full.txt`
- 测试结构标准化
- 临时 SEO 审计输出清理

## 已完成处理

### 1. SEO 审计输出与行动清单

最初通过 SEO 审计生成了本地审计目录，并以中文版行动清单为准推进修复。

后续用户确认暂时处理到当前阶段即可，因此已删除临时审计产物：

- `seo-audit-output/`
- `.seo-cache/`

同时移除了 `.gitignore` 中临时加入的 `.seo-cache/` 忽略规则。

后续如果继续优化，应重新生成新的审计结果，不依赖已删除的旧输出。

### 2. 404 与旧入口处理

本轮先处理过 404 问题，并明确区分：

- 当前 CMS 的正式路径
- 搜索 API
- 已迁移完成后不再保留的旧站入口

目前已清理运行期旧入口兼容：

- `/contact.html` 不再 301 到 `/contact-us/`
- `/ajaxcode/msg` 不再 301 到 `/contact-us/`
- `/products` 不再自动 301 到 `/products/`
- 正式栏目路径 `/products/` 保持可访问

当前验证结果：

```text
/contact.html 404
/ajaxcode/msg 404
/products 404
/products/ 200
```

相关文件：

- `system/server/src/static-file-handler.mjs`
- `system/server/tests/smoke/runtime-smoke.mjs`

### 3. `/search` 相关处理

本轮确认过 `/search` 开头的 404 来源，并按通用 CMS 思路处理：

- 不新增一个硬编码 `/search` 页面。
- 保留搜索 API 能力：`/api/search`。
- 前台模板不应硬编码跳转到旧搜索页面。
- 模板中的旧搜索入口应改为打开当前搜索交互或调用搜索 API。
- `WebSite` 的 `SearchAction` 只在站点配置明确提供 `searchActionUrl` 时输出。

当前测试中仍保留：

- `/search` 返回 404
- `/search.asp?action=search` 返回 404
- `/api/search` 正常工作

这样避免旧站搜索路径继续作为兼容入口存在，同时保留 CMS 内部搜索能力。

### 4. JSON-LD 转义问题

已修复 JSON-LD 输出中双引号被 HTML 实体转义的问题，避免结构化数据里出现 `&quot;`。

当前验证会解析首页 JSON-LD，确认：

- 存在 `application/ld+json`
- JSON 可正常 `JSON.parse`
- 输出中不包含 `&quot;`

相关文件：

- `system/server/src/cms-template-runtime.mjs`
- `system/server/tests/smoke/runtime-smoke.mjs`

### 5. JSON-LD Graph 合并

已将结构化数据统一整理为 `@graph` 输出。

当前首页核心节点包括：

- `Organization`
- `WebSite`
- `WebPage`

其它页面可合并既有结构化数据节点，例如：

- `Product`
- `Article`
- `BreadcrumbList`

相关文件：

- `system/server/src/services/seo-meta.mjs`
- `system/server/src/static-builder.mjs`

### 6. Schema 类型去硬编码

已移除 SEO 服务中根据 CMS 内部页面类型推断 Schema 类型的硬编码。

不再采用类似逻辑：

```js
home -> WebPage
contact -> ContactPage
list/root -> CollectionPage
```

当前规则：

- 页面上下文显式传入 `schemaType`
- 栏目或内容 `template_data` 可配置 `schemaType`
- 站点配置 `template_data.seo.schema` 可提供默认值或类型映射
- 未配置时只兜底为通用 `WebPage`

示例站点配置：

```json
{
  "seo": {
    "schema": {
      "defaultPageType": "WebPage",
      "columnTypes": {
        "managed": "CollectionPage"
      }
    }
  }
}
```

示例栏目配置：

```json
{
  "schemaType": "CollectionPage"
}
```

相关文件：

- `system/server/src/services/seo-meta.mjs`
- `system/server/src/static-builder.mjs`

### 7. BreadcrumbList

已补充非首页页面的面包屑结构化数据能力。

面包屑数据来源优先使用页面上下文中的：

- `currentSection`
- `currentColumn`
- `parentColumn`
- `currentContent`

这保持了栏目驱动，不在 SEO 服务里写死页面层级。

相关文件：

- `system/server/src/static-builder.mjs`
- `system/server/src/services/seo-meta.mjs`

### 8. 英文站本地化信号

本轮优先处理英文站点的本地化 SEO 信号。

涉及方向：

- `lang`
- canonical
- hreflang
- Open Graph locale
- 站点基础公司与联系信息
- 英文默认文案

处理原则是通过语言站点配置、站点翻译配置和 SEO 生成服务输出，不为英文站写单独页面分支。

相关文件主要包括：

- `system/server/src/services/seo-meta.mjs`
- `system/server/src/services/site.mjs`
- `system/server/src/static-builder.mjs`

### 9. 英文站 title 超长优化

本轮根据用户提供的关键词表和页面内容，优先优化英文站 title 超过 65 字符的问题。

处理原则：

- title 应优先来自内容数据、栏目翻译或站点翻译。
- 不在模板中为某个页面硬编码标题。
- 对产品、栏目、详情页分别按搜索意图和页面主体内容压缩。
- 保持品牌后缀，但避免机械堆叠。

相关数据入口：

- `site_config_translations`
- `column_translations`
- 内容翻译表
- 栏目或内容 `template_data_json`

### 10. 英文站 meta description 优化

本轮处理过英文站：

- meta description 缺失
- meta description 过长
- meta description 文案不自然

处理原则：

- 优先写入内容或栏目数据。
- 静态生成器只负责兜底与输出，不写具体页面文案。
- description 应概括页面真实内容，不为 SEO 堆关键词。

### 11. 重复 H1 处理

本轮处理过英文站 H1 不唯一的问题。

讨论后确认目标逻辑：

- 页面主标题应放在壳层 hero。
- 正文区域通常不再重复输出同一个 H1。
- 正文内部如需分区标题，应使用 H2/H3 等层级。

该处理方向符合通用模板体系：模板壳层负责页面标题，正文内容不重复抢主标题。

### 12. 图片 alt

本轮处理过图片缺失 alt 的问题。

处理原则：

- 优先使用媒体、栏目、内容中的标题、名称或上下文生成 alt。
- 装饰性图片可为空 alt。
- 不直接批量改生成后的 HTML。

相关处理主要落在静态生成和模板输出规范化中。

### 13. 图片 width / height

本轮处理过图片缺少尺寸属性的问题。

目的：

- 降低 CLS 风险。
- 提升图片加载稳定性。
- 让生成页具备更完整的图片属性。

处理原则：

- 静态生成阶段尽量补齐真实尺寸。
- 不在模板里为特定图片写死宽高。

### 14. 图片 lazy loading

本轮处理过图片缺少原生 lazy loading 的问题。

处理原则：

- 首屏关键图不应盲目 lazy。
- 非首屏图片默认可加 `loading="lazy"`。
- 需要结合后续 LCP 优化再判断哪些首屏图应 `eager` 或设置 `fetchpriority`。

### 15. 安全响应头

已新增统一安全响应头服务，并通过 Fastify `onSend` hook 全局输出。

覆盖：

- `Content-Security-Policy`
- `Strict-Transport-Security`
- `X-Frame-Options`
- `X-Content-Type-Options`
- `Referrer-Policy`
- `Permissions-Policy`

配置入口：

```text
site.template_data.security.headers
```

相关文件：

- `system/server/src/services/security-headers.mjs`
- `system/server/src/app.mjs`
- `system/server/tests/smoke/runtime-smoke.mjs`

### 16. llms.txt 与 AI 爬虫说明

已优化 `llms.txt` / `llms-full.txt` 默认生成逻辑。

处理内容：

- 英文站默认文案更自然。
- 修复标签拼接问题。
- 修复 section suffix 格式问题。
- 增加 AI crawler guidance。
- 增加 Usage and attribution。
- 保留通过 `site.template_data.ui.llms` 覆盖默认文案的能力。

相关文件：

- `system/server/src/services/llms.mjs`

### 17. robots.txt 与 sitemap.xml

本轮曾讨论过：

- robots.txt 和 sitemap.xml 可访问。
- 本地预览中 sitemap 指向生产 URL。

该项用户选择暂时略过，因此未作为本轮实现重点。

后续如果继续处理，应优先做环境化配置，避免把本地、预览、生产 host 写死。

### 18. LCP 性能风险

本轮解释过“本地性能 LCP 风险”的含义。

当前判断：

- 这不是硬错误，更像性能优化提示。
- 图片 alt、尺寸、lazy loading 修复已经降低了一部分风险。
- 后续如继续优化，应围绕首屏关键 CSS、首屏图片优先级、非关键资源延迟加载处理。

本轮未继续做专项 LCP 改造。

### 19. Playwright 视觉验证

本轮曾保留过视觉验证项：

- 移动端遮挡
- 触控区域
- 首屏表现

由于当时未继续安装或运行 Playwright，该项本轮未深入处理。

后续如继续做，应使用桌面和移动端截图检查首页、栏目页、详情页、联系页。

### 20. 测试结构标准化

已将冒烟测试从 `scripts/` 移到标准测试目录：

```text
system/server/tests/smoke/runtime-smoke.mjs
```

新增命令：

```bash
npm --prefix system/server run test:smoke
npm --prefix system/server run test
npm test
```

`scripts/` 后续主要保留构建、导入、迁移、维护类脚本；测试代码放入 `tests/`。

相关文件：

- `system/server/tests/smoke/runtime-smoke.mjs`
- `system/server/package.json`
- `package.json`
- `scripts/build-dist.mjs`

## 当前验证方式

当前可以从项目根目录执行：

```bash
npm test
```

当前覆盖：

- 搜索 API 基础行为
- `/search` 与旧搜索入口保持 404
- 安全响应头
- 已移除旧入口兼容后的 404 行为
- 正式栏目路径 `/products/` 可访问
- 首页 JSON-LD 可解析
- 首页 JSON-LD 包含 `Organization`、`WebSite`、`WebPage`
- 静态生成链路可正常生成英文首页

本轮也曾执行过英文站静态生成与 JSON-LD 扫描，结果显示英文生成页 JSON-LD 可解析，且核心 Schema 节点符合预期。

## 后续全语言处理方案

如果后续要对全部语言进行同样处理，建议按以下顺序推进。

### 1. 先重新生成审计结果

由于旧的 `seo-audit-output/` 已删除，后续继续优化时应重新生成审计结果。

新审计至少包含：

- title 长度
- meta description 缺失、过长、过短或不自然
- H1 数量
- 图片 alt
- 图片尺寸属性
- lazy loading
- canonical
- hreflang
- JSON-LD 是否可解析
- BreadcrumbList 是否缺失
- sitemap host
- robots.txt
- LCP 风险
- 移动端视觉问题

### 2. 按语言分批处理

建议不要一次性混改全部语言。

推荐顺序：

1. `zh-CN`
2. `en`
3. 其它已启用语言

每个语言单独生成、单独验证、单独记录问题。

### 3. title 和 description 继续走数据

多语言 title / description 应优先修改：

- `site_config_translations`
- `column_translations`
- 内容翻译表
- 栏目或内容 `template_data_json`

不应在模板或静态生成器中为某个语言写固定标题或描述。

### 4. H1 继续走模板结构

如果其它语言也出现多个 H1，应优先检查模板结构：

- 壳层 hero 是否已经输出主 H1
- 正文模板是否重复输出主 H1
- 富文本内容是否带入了多余 H1

处理方式应是模板或内容结构调整，不是对生成 HTML 做替换。

### 5. 图片问题继续走静态生成和内容上下文

其它语言图片问题应继续沿用本轮方式：

- alt 来自媒体、栏目、内容或上下文
- 尺寸由静态生成阶段补齐
- lazy loading 区分首屏和非首屏

### 6. Schema 类型继续走配置

其它语言如需特殊 Schema 类型，应配置：

- 页面上下文 `schemaType`
- 栏目 `template_data_json.schemaType`
- 站点 `template_data.seo.schema`

不要再在 `seo-meta.mjs` 中添加内部页面类型判断。

### 7. 每批处理后验证

每个语言批次至少执行：

```bash
npm test
npm --prefix system/server run build:static
```

并抽查：

- 首页
- 联系页
- 产品栏目页
- 一个产品详情页
- 一个新闻详情页
- 一个服务详情页
- sitemap
- robots.txt
- llms.txt

## 本轮暂未继续处理的项

以下项目本轮没有继续深入：

- robots.txt / sitemap.xml 在不同环境下的 host 策略
- LCP 专项性能优化
- Playwright 桌面与移动端视觉验证
- 全语言 title / description 批量优化
- 全语言 H1 与图片问题批量复查

这些建议在下一轮重新审计后继续。
