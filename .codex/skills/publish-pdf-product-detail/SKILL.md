---
name: publish-pdf-product-detail
description: 接收产品信息 ID、新产品资料、一份或多份 PDF 及产品图片，生成保真图片编辑提示词并重绘产品图，转换语义化 HTML，安全处理主图和图库，固定先整理并验收英文 en 内容母版，再导入当前 Spirax Sarco CMS 产品详情，完成英文关键词与内链优化、全部启用语言翻译、本地化 SEO 和内链、媒体复用、数据库备份及静态发布验证。用于从 PDF 和产品图自动填充多语言产品详情、批量导入产品手册或技术资料、以英文为母版发布产品文档，或统一产品图片重绘、PDF 转换、SEO、内链和多语言发布流程时。
---

# 发布多语言 PDF 产品详情

把本 Skill 视为编排层，不要复制或绕开下列专业 Skill 的实现。开始前完整读取并按顺序使用：

1. `$convert-pdf-to-html`
2. `$import-pdf-html-to-product-detail`
3. `$product-detail-add-product`

导入 Skill 要求关键词分析时，再读取它指定的 `$seo-content` 和关键词优化参考。只有需要修改共享文档样式时才使用 `$modify-cms-template`。
存在产品图片输入或用户要求生成图片时，完整读取并使用 `$redraw-product-images`；由它生成提示词、编排 `$imagegen` 并验收输出。本 Skill 不直接临时拼接图片提示词。普通格式转换、方向校正和压缩必须复用 CMS 媒体服务。

## 核心约束

- 固定把 `en` 作为唯一内容母版。无论 PDF 原语言是什么，都先转换或整理成英文并验收，再从该英文版本直接翻译其他语言。
- 禁止从 `zh-CN` 或任意非英文语言生成其他翻译，禁止链式翻译。
- 区分“内容母版语言”和“CMS 默认语言”：`en` 是生产顺序的母版；`zh-CN` 仍可能是内容模型必填的数据库默认语言。
- 新产品不得用英文或空壳伪装 `zh-CN`。英文母版完成后生成真实中文名称和草稿内容，再创建产品草稿并取得产品 ID；所有目标语言完成前不要发布。
- 已有产品必须保留原产品简介为第一段可见正文。文档片段固定按“销售资料 → 技术资料 → 安装维修指南”排序。
- 关键词只证明搜索需求，不证明技术事实。型号、标准、文档编号、表格数值、单位、安全说明和适用条件必须来自 PDF 或可验证资料。
- 英文版完成关键词与内链验收后，其他语言分别建立本地化关键词计划；不能机械复制英文关键词或锚文本。
- 默认只处理当前启用语言。停用语言只有用户明确要求时才生成，不得自动发布。
- 区分产品图、PDF 文档图和 AI 生成图。产品图进入 `images`/`primary_image`，PDF 文档图只进入 `content_html`，二者不得互相替代。
- 用户提供产品图时默认先用 `$redraw-product-images` 的 `catalog-redraw` 生成并保存英文提示词，转换为无新增文案的 `16:10` 网站产品预览图，完成保真重绘和源图对比验收；用户明确要求使用原图时才跳过重绘。
- 第一张通过验收的目录重绘图设为主图，其余通过验收的图片加入图库；默认保留并去重现有图库，只有明确要求才替换。
- 没有产品源图时保持现状，不自动生成看似真实的产品主图。从零生成场景图仍需用户明确要求；任何生成图不得冒充真实产品、工程图、尺寸图、铭牌、认证或技术证据。
- 中间步骤不执行全站构建；全部数据库写入完成后只运行一次 `npm run build:site`。

详细的阶段输入、交接物和验收门见 [工作流交接契约](references/workflow-contract.md)。

## 工作流

### 1. 锁定任务范围

确认产品 ID（已有产品）或待建产品信息、PDF 清单、产品图片、是否替换旧文档、目标语言范围和图片策略。产品图默认按 `catalog-redraw` 处理；用户明确提出透明图、只换背景或工业场景时再切换模式。检查工作树，读取现有产品及所有翻译，记录原简介、图片、规格、发布状态和最终 URL。

已有产品优先用 ID 中的型号、英文名称和栏目自动定位关键词 CSV；未提供文档类型时根据 PDF 文件名、文档编号和正文识别销售资料、技术资料或安装维修指南。只有多个候选会实质改变结果时才向用户确认。

### 2. 转换 PDF

逐份使用 `$convert-pdf-to-html` 生成独立 HTML 和同级 `assets/`。保留原始转换结果，不在原文件上直接做关键词替换。技术资料和安装指南分别使用规定的固定框架、共享 CSS、语义表格及有真实尺寸的图片。

运行前置检查：

```bash
node .codex/skills/publish-pdf-product-detail/scripts/preflight.mjs \
  --keyword-csv docs/关键词列表/按产品系列类型拆分/<关键词文件>.csv \
  --product-id <ID> \
  --product-image <产品主图> \
  --pdf <销售资料.pdf> \
  --html <销售资料.html> \
  --pdf <技术资料.pdf> \
  --html <技术资料.html> \
  --pdf <安装维修指南.pdf> \
  --analysis-dir tmp/pdf-analysis/<产品或任务标识> \
  --html <安装维修指南.html>
```

`--product-image` 可重复传入；没有产品图时省略。前置检查会运行与 CMS 上传一致的转换链路，但不写库。只有检查通过后才能进入英文整理阶段。
`--pdf` 与 `--html` 数量一致时按参数顺序使用 PyMuPDF 生成页级清单和事实对账；先人工处理报告中的候选差异，确认必须零遗漏时增加 `--strict-pdf-facts`。

### 3. 建立并验收英文母版

如果 PDF 不是英文，先把所有可见文本翻译成英文；如果 PDF 已是英文，仍要统一术语、断行和文档结构。不得改变图片、表格结构、数值、单位、标准或文档编号。

把现有英文产品简介放在第一段，然后按既定文档顺序组装英文 HTML。结合产品型号、英文名称、栏目语义和关键词 CSV 建立英文关键词计划，统一主表达、同义词、SEO 标题、摘要及内链。排除 `manual`、`guide`、`calculator` 等非产品意图，除非当前页面确实承接资料下载意图。

英文验收必须同时通过事实、结构、术语、关键词、内链和图片检查。英文未通过时不得开始任何其他语言。

### 4. 准备产品记录

- 已有产品：复用现有产品 ID、栏目、URL、图片和规格，不创建重复条目。
- 新产品：英文母版验收后，先生成真实 `zh-CN` 名称和草稿摘要，使用 `$product-detail-add-product` 创建草稿产品并取得 ID；栏目必须是绑定 `product` 模型的最具体 `list` 栏目。

首次写库前创建一致性数据库备份。不要只复制仍处于 WAL 状态的 `site.sqlite` 主文件。

### 5. 处理产品图片

如果用户提供产品图，先使用 `$redraw-product-images` 为每张源图生成并保存英文提示词，完成重绘、技术检查和人工视觉对比。只有状态为 `accepted` 的输出才能进入上传步骤；提示词和源图到输出图的对应关系必须保留在最终报告。

在产品记录存在且数据库备份完成后，把通过验收的结果图传给上传脚本：

```bash
node .codex/skills/publish-pdf-product-detail/scripts/set-product-images.mjs \
  --product-id <ID> \
  --image <第一张通过验收的目录重绘图> \
  --image <其他通过验收的图片>
```

脚本必须通过现有 `uploadMediaAsset(... purpose: 'product_cover')` 完成格式转换、方向校正、压缩、上传和内容服务写入。默认保留现有图库并追加新图，第一张新图作为主图；用户明确要求替换图库时才加 `--replace-gallery`，要求保留原主图时才加 `--keep-primary`。被替换的旧媒体保留到全流程验证完成，以保证数据库备份仍可回滚；清理时只能走媒体引用检查。

产品图提示词和重绘只能通过 `$redraw-product-images` 编排。产品图编辑必须保留产品轮廓、接口、材质、颜色、铭牌、品牌和型号；无法可靠保持时停在图片验收门，不得静默改用失败图。`industrial-scene` 结果默认只加入图库，不得自动设为主图。

### 6. 导入英文正文

使用 `$import-pdf-html-to-product-detail` 导入英文 HTML，并把同一语言的多份文档按最终顺序一次传入。中间导入使用 `--no-build`。导入前必须显式把原英文产品简介包含在最终 HTML 中，避免导入脚本整段替换时丢失简介。

英文导入负责上传文档图片并把正文路径改成 `/uploads/...`。导入后重新读取数据库中的英文 `content_html`，将其作为后续翻译的结构和媒体母版。

随后把原始 PDF 作为英文附件上传，文档类型必须与转换阶段一致：

```bash
node .codex/skills/publish-pdf-product-detail/scripts/set-product-pdf-attachments.mjs \
  --product-id <ID> \
  --language en \
  --pdf technical_information=<技术资料.pdf> \
  --pdf installation_guide=<安装维修指南.pdf> \
  --backup-path <本次工作流基线备份>
```

脚本默认合并和按文件哈希复用已有媒体；英文 PDF 只关联 `en`，其他语言没有本地化 PDF 时使用现有英文附件 fallback，不重复上传。只有用户要求替换该语言附件引用时使用 `--replace`；旧媒体保留到最终验证后再通过引用检查清理。

### 7. 从英文翻译全部启用语言

逐语言直接从已验收、已导入的英文正文翻译。使用 `parse5` 只替换可见文本和需要本地化的属性；保留 HTML 层级、类名、表格、图片 URL、尺寸、型号、标准、数值、单位和文档编号。

先使用可断点续传的草稿生成脚本，不要临时重写逐节点翻译代码：

```bash
node .codex/skills/publish-pdf-product-detail/scripts/generate-translation-drafts.mjs \
  --product-id <ID> \
  --output-dir tmp/product-<ID>-translation-drafts \
  --batch-size 100 \
  --concurrency 2
```

脚本按完整段落或表格单元翻译，把内联 HTML 替换为顺序不可变的占位符，过滤纯数字单元，并校验型号、文档编号、数字和占位符没有漂移。启动批次前先探测已启用 provider 的最终文本能力，默认 provider 不可用时自动 fallback；每批成功后单独落盘，相同英文母版哈希可断点续传。先用 `--prepare-only` 只生成清单；provider 或凭据不可用时停在草稿阶段，不写数据库。

生成的 `draft.json` 状态固定为 `needs-local-seo-and-link-review`。逐语言完成关键词、SEO 长度、术语和内链本地化验收后，才通过 `$product-detail-add-product` 的内容服务契约统一写回；禁止直接把未验收草稿发布。

默认复用英文导入后已有的 `/uploads/...` 图片 URL，不为每种语言重复上传相同图片。只有某语言确实使用不同图片时，才单独走媒体上传链路。
产品主图和图库属于基础字段，全部语言共用；除非图片包含必须本地化的文字，不为语言创建重复产品图。

每种语言独立完成：

- 产品名称、摘要、正文、`template_data_json`、SEO 标题与描述；
- 关键词主表达和同义词本地化；
- 默认语言的信息架构复用；
- 锚文本、语言前缀、标点和西文空格边界检查；
- 发布状态判断。没有真实本地化正文时保持草稿。

通过 `$product-detail-add-product` 规定的 `{ base, translations }` 契约写回，不直接更新翻译表。

### 8. 统一验证并发布

写入完成后先审计数据库内容，再执行一次全站构建：

```bash
node .codex/skills/publish-pdf-product-detail/scripts/audit-product-languages.mjs \
  --product-id <ID> \
  --canonical-language en \
  --required-keyword "<英文主关键词>"

npm run build:site

node .codex/skills/publish-pdf-product-detail/scripts/audit-product-languages.mjs \
  --product-id <ID> \
  --canonical-language en \
  --required-keyword "<英文主关键词>" \
  --check-static
```

最后抽查英文、简体中文、一个带路径前缀的语言和一个独立域名语言；验证首页、联系页、所属栏目、产品详情、有规格和无规格产品的询盘控件。检查主图和图库路径均存在、主图属于预期图片集合、PDF 文档图片没有误入产品图库。报告产品 ID、栏目、URL、英文母版、发布语言、关键词 CSV、内链数量、源产品图、实际英文提示词、重绘模式、验收结果、媒体策略、备份路径和构建结果。

## 失败处理

- 任一阶段失败都停在当前验收门，不继续翻译、写库或构建。
- 不用字符串替换破坏复杂 HTML，不绕过媒体引用检查，不直接修补静态生成页。
- AI 图片未通过产品真实性检查时停止使用该图，不因图片步骤失败而虚构或自动重绘产品。
- 数据库失败时使用本次工作流生成的备份回滚，并核对失败过程中新增的媒体是否已清理。
- 构建失败时先确认旧进程已经结束，再修复数据库内容或生成链路；不得并发启动第二次静态构建。
