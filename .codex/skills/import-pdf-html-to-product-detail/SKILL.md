---
name: import-pdf-html-to-product-detail
description: 将 convert-pdf-to-html 生成的一份或多份固定结构 HTML 经过人工关键词研究、全文术语统一和多语言内链优化后，安全导入当前 Spirax Sarco CMS 的产品详情正文，并重新上传文档图片、清理旧图片及只生成目标产品页。用于用户要求把 PDF HTML 导入或重新导入产品详情、结合 docs/关键词列表优化产品文档、替换产品正文中的技术资料或安装手册、更新对应文档图片时。
---

# 导入 PDF HTML 到产品详情

只处理当前数据库驱动 CMS。HTML 结构与图片来自 `$convert-pdf-to-html`；产品正文、模板 CSS、媒体记录和静态产物必须继续走项目现有链路。

## 前置检查

1. 读取仓库 `AGENTS.md`、`$convert-pdf-to-html` 和 `$modify-cms-template`。
2. 确认产品内容 ID、语言、产品 URL、HTML 文件和对应 `assets/` 目录。
3. 确认 HTML 使用 `.pdf-document`、`.pdf-document__body`、`.document-main` 和 `pdf-document--technical` 或 `pdf-document--manual`。
4. 默认不把 `document-header`、`title-band`、`document-footer` 导入 CMS 正文；这些节点只供独立 HTML 预览使用。
5. 禁止直接编辑生成后的 `html/` 或 `html_zh_cn/` 页面。

## 关键词优化

导入前必须完成关键词处理。读取 [关键词优化规则](references/keyword-optimization.md)，并使用 `$seo-content` 的关键词、内容质量和内链原则进行人工判断。

1. 根据产品所属栏目和 URL 语义，在 `docs/关键词列表/按产品系列类型拆分/` 选择主 CSV。AE30 排空气阀页面优先读取 `40-80-排空气阀.csv`。
2. 用产品型号、当前名称、英文名称和常见同义词在主 CSV 中查找主关键词；主文件不足时再用 `rg` 搜索该目录下其他 CSV。优先直接使用关键词行的 `内链` 列，不再为已有映射重复分析 URL。
3. 为当前语言单独建立关键词计划，记录原词、统一后的规范词、关键词类型、搜索量/意图、使用位置和内链目标。不同语言不得共用未经本地化判断的替换表。
4. 对同一概念选择一个规范主表达，并检查全部待导入 HTML。类似 `Spirax Sarco Air release valve` 与 `spirax sarco air vent` 的表达必须结合 CSV 和语义统一，不能只修改一处。
5. 保留型号、文档编号、标准名称、表格数值和技术含义。不得为了关键词改变产品能力、适用介质或安全说明。
6. 只使用关键词 CSV `内链` 列中已有的目标，并确认目标语言和语义相关。`内链` 为空表示具体型号尚无可用详情页，必须保持不链接；不得临时回退到品类页、臆造 URL 或链接当前页面自身。
7. 已确认的规范关键词如果在可见正文中精确匹配且语义相同，所有出现位置必须使用同一内链，不能只链接一处而让其他精确匹配保持纯文本。属性值、代码、已有链接内部或语义不同的同形词除外；非精确变体仍以自然阅读和避免堆砌为准。
8. 优化完成后检查两份或多份文档的全文术语一致性，再将优化后的临时 HTML 交给导入脚本。不要覆盖 `$convert-pdf-to-html` 的原始转换结果，除非用户明确要求。

## 执行导入

在仓库根目录对每种语言分别运行，并传入该语言已完成关键词优化的 HTML：

```bash
node .codex/skills/import-pdf-html-to-product-detail/scripts/import.mjs \
  --product-id 357 \
  --language zh-CN \
  --html tmp/ae30-pdf-html/ae30-detail.html \
  --html tmp/ae30-im-html/ae30-installation-maintenance.html
```

脚本按 HTML 参数顺序拼接正文，并执行：

- 先检查产品翻译记录、全部 HTML、结构和本地图片；全部通过后才使用 SQLite `VACUUM INTO` 创建时间戳备份。
- 从每份 HTML 的 `<body>` 提取文档片段。
- 移除 `document-header`、`title-band`、`document-footer`。
- 拒绝 `<style>`、内联 `style` 和正文 `<link>`。
- 通过现有 `uploadMediaAsset` 上传所有本地图片，不复用旧媒体 URL。
- 把图片路径替换为 `/uploads/images/...`。
- 更新指定产品语言的 `content_html`。
- 提交新正文后，通过 `deleteMediaAsset` 删除旧正文不再引用的媒体；仍被其他内容引用的资源不会强删。
- 默认只生成目标产品详情页。

多语言内容必须逐语言执行上述研究、优化、导入和验证流程。中文、英文及其他语言可选择不同规范词和内链锚文本，但产品事实、型号和技术数据应保持一致。

可选参数：

- `--keep-chrome`：保留文档页眉、标题带和页脚。
- `--keep-old-images`：不删除旧正文中的媒体。
- `--no-build`：只导入，不生成目标页面。
- `--backup-path <文件>`：创建或复用本次工作流的同一份一致性备份；复用前执行完整性检查，避免每个子步骤重复生成大体积备份。

## 验证

导入后必须确认：

- 正文含预期数量的 `pdf-document--technical` / `pdf-document--manual`。
- 正文不含 `src="assets/`、`<style>`、`style=` 或 `<link>`。
- 默认模式下正文不含 `document-header`、`title-band`、`document-footer`。
- 主关键词和同义词已按该语言的关键词计划统一；不存在一部分使用旧词、一部分使用规范词的非预期混用。
- 内链目标真实存在、语言匹配、不是当前页面，且锚文本自然；同一规范关键词的所有语义一致精确匹配均使用相同目标，不存在部分链接、部分未链接的情况。
- 新媒体记录及磁盘文件存在，旧媒体记录仅在引用数为零时删除。
- 单页静态生成成功，目标页面引用新图片和最新模板 CSS。

导入动作不得修改产品详情模板或创建模板版本。`$convert-pdf-to-html` 必须始终输出固定框架并复用既有共享 CSS；只有用户明确提出修改公共样式时，才另行使用 `$modify-cms-template` 更新数据库模板。

脚本执行失败时先读取错误，不要绕过引用检查或用 `force` 删除旧媒体。使用脚本输出的备份路径回滚数据库，并检查新上传文件是否已由失败清理逻辑删除。
