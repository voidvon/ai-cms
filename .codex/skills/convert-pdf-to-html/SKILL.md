---
name: convert-pdf-to-html
description: 将 PDF 文档高保真转换为可编辑、可访问、响应式的 HTML 页面，并处理文本、表格、矢量图、工程图、曲线图、图片裁切和打印布局。用于用户要求把 PDF 转成 HTML、将技术资料或产品手册嵌入详情页、复刻 PDF 版式、把 PDF 表格结构化、从 PDF 精确提取图表，或修正转换后的留白、双栏关系、裁图和 A4 打印问题。
---

# PDF 转 HTML

将 PDF 视为内容与版式来源，而不是整页图片。优先生成语义化 HTML；仅将难以可靠重建的复杂图形提取为独立视觉资源。

## 工作流程

### 0. 统一 CSS 强约束

所有 PDF 转 HTML 结果必须复用同一份规范样式：

`assets/pdf-document.css`

该路径相对于本 skill 目录，即仓库中的：

`.codex/skills/convert-pdf-to-html/assets/pdf-document.css`

- 禁止在生成的 HTML 中写入 `<style>`、`style` 属性或文档专属 CSS。
- 禁止在每个输出目录复制或新建 `style.css`、`document.css` 等重复样式文件。
- 仓库内的独立 HTML 必须通过计算后的相对路径直接 `<link>` 到上述共享 CSS。
- 输出目录位于仓库外时，先确认可访问的共享样式 URL；不得静默复制出另一份 CSS。
- 正式接入 CMS 时，正文只保存语义 HTML 和统一类名，不保存 `<link>` 或 `<style>`；共享 CSS 只能在数据库页面模板的 `css_source` 和 `published_css_source` 中加载一次。
- 当前统一文档根结构为：

```html
<body class="pdf-document-host">
  <section class="pdf-document pdf-document--technical">
    <div class="pdf-document__body">
      <main class="document-main">
        <header class="document-header">
          <p class="document-code"><!-- 文档编号 --></p>
          <div class="document-brand"><!-- 品牌 --></div>
          <p class="document-issue"><!-- 版本信息 --></p>
        </header>
        <div class="title-band">
          <h1>文档主标题</h1>
        </div>
        <section class="document-section">
          <!-- 文档正文；技术资料需要保留 PDF 分页关系时可外包 document-page -->
        </section>
        <footer class="document-footer"><!-- 文档页脚 --></footer>
      </main>
    </div>
  </section>
</body>
```

- 技术资料、产品数据表优先使用 `pdf-document--technical`；安装维修指南使用 `pdf-document--manual`。
- 安装维修指南的 `intro-grid` 中，`.contents` 目录区的 `h2` 必须固定为“安装维修指南”，不得使用“内容”“目录”或 PDF 原文中的其它标题替代。
- 所有文档统一使用 `document-main`、`document-header`、`document-code`、`document-brand`、`document-issue`、`title-band`、`document-section`、`document-footer` 这组框架类；技术资料需要表达原 PDF 页分组时使用 `document-page`。
- 所有正文表格统一使用 `document-table`；需要表达布局密度或表格语义时增加可复用的修饰类，不得另用 `thin`、`compact` 等文档类型私有类代替基础类。
- `document-header` 和 `title-band` 必须位于 `document-main` 的起始内容区并保持先后顺序；`document-page` 可按原文分页包裹它们和正文区块。各文档类型的视觉差异只能通过 `pdf-document--technical`、`pdf-document--manual` 修饰类在共享 CSS 中表达。
- 禁止为相同框架另造 `wrap`、`manual`、`sheet`、`sheet-header`、`title`、`chapter`、`section`、`footer` 等泛化或文档专属类名。
- 优先复用共享 CSS 已有的布局类，包括 `page-grid`、`section-grid`、`sheet`、`chapter`、`figure`、`compact`、`note`、`steps` 等。
- 不得新增型号、文档编号或单个 PDF 专属选择器。现有公共类确实无法表达新布局时，只能把可复用能力补充到这份共享 CSS，并同步验证所有已使用该 CSS 的文档。
- 修改共享 CSS 属于公共变更，必须同时检查至少一个技术资料页面和一个安装维修页面的桌面、手机及打印布局。

### 1. 检查约束和目标

- 读取当前仓库的 `AGENTS.md` 和相关项目说明。
- 确认输出是独立预览、现有详情页片段，还是正式 CMS 内容。
- 正式接入数据库驱动 CMS 时，复用其内容模型、模板和发布链路；不得把临时 HTML 当作正式模板真源。
- 用户未指定输出位置时，在安全的临时目录创建一个 HTML 文件及同级 `assets/`。
- `assets/` 只保存该文档提取出的图片等媒体，不保存新的 CSS；HTML 样式始终引用统一 CSS。

### 2. 分析 PDF

- 检查页数、页面尺寸、字体、可提取文本、嵌入图片和矢量路径。
- 优先使用 `pdfinfo`、`pdftotext`、`pdffonts`、MuPDF 或 PyMuPDF；缺少工具时再选择本机可用的等价工具。
- 判断 PDF 属于扫描件还是原生排版文件。
- 为每页建立内容清单：标题、段落、列表、表格、注释、产品剖面图、尺寸图、曲线图和页眉页脚。
- 先渲染整页预览用于理解关系，不把整页预览直接作为最终内容。

### 3. 为元素选择转换方式

按以下优先级处理：

1. 标题、段落、编号、公式和注释：使用 HTML 文本。
2. 参数、尺寸、重量、材料、自由排量数据等行列数据：使用原生 `<table>`。
3. 简单线条、分隔线和常规布局：使用 CSS。
4. 复杂剖面图、爆炸图、尺寸工程图和难以可靠重绘的曲线图：提取为独立图片；矢量导出稳定时可使用 SVG，否则使用高分辨率 PNG 或 WebP。
5. 图表标题、单位、公式和紧邻图表的数据表：能结构化时留在 HTML 中，不要一并截入图片。

禁止用整页截图或大范围截图代替可结构化的正文和表格。

### 4. 精确提取图形

- 以 PDF 坐标裁切目标图形，不凭肉眼截取大概区域。
- 每张图只包含目标视觉对象，去掉相邻标题、段落、页码、无关线条和大块空白。
- 保留完整边界、尺寸标注、图例、底部零件和引出线，不得裁掉任何有效内容。
- 对复杂图形使用足够高的渲染倍率，通常从 3 到 4 倍开始，再按显示尺寸压缩。
- 不要通过扩大裁切框来掩盖边界不确定性；重新检查 PDF 坐标和整页预览。
- 输出后逐张查看图片本身，确认顶部、底部、左右边缘完整且裁切紧凑。

### 5. 重建版式关系

- 还原内容之间的关系，不机械模拟纸张外框。
- 标题原本跨越左右栏时，让标题占满整个网格；正文插图位于简介右侧时，把插图放入简介所在内容区的右栏，不要放到标题右侧。
- 使用 CSS Grid 或 Flexbox 表达双栏、表格和图文关系。
- 除非用户要求纸张预览，不添加居中的固定宽度纸张、阴影、灰色画布或分页卡片。
- 用户要求填满页面时，移除父级最大宽度、外框和模拟页边距，同时保留合理的内容内边距。
- 合并 PDF 分页造成的无意义空白，使 HTML 成为连续内容流。
- 品牌名、型号等在网页中应按语义连续显示；除非用户明确要求，不照搬 PDF 中仅为排版而产生的断行。

### 6. 处理响应式与打印

- 桌面端保持 PDF 的主要栏关系；仅在窄屏手机上切换单列。
- 将移动端断点限定为屏幕介质，例如：

```css
@media screen and (max-width: 820px) {
  .pdf-document .page-grid {
    grid-template-columns: 1fr;
  }
}
```

- 不要使用未限定介质类型的窄屏查询控制主网格，否则 Chrome 的 A4 打印预览可能因可打印宽度小于断点而变成单列。
- 只有用户明确要求纸张尺寸、分页或页边距时，才增加 `@page` 和复杂的 `@media print` 规则。

### 7. 验证结果

- 检查 HTML 引用的每个本地资源都存在。
- 在桌面宽度检查标题跨栏、正文双栏、图文位置、表格宽度和连续内容流。
- 在手机宽度检查单列顺序、文本溢出和图片缩放。
- 使用 Chrome 打印预览检查 A4 模式；确认移动端断点没有影响打印栏数。
- 对照 PDF 逐项核验所有段落、数值、单位、表头、图例和标注。
- 重点检查每张裁图是否过宽、包含无关内容或缺失底部和边缘。
- 修正后重新检查受影响区域，不仅验证 CSS 或文件存在性。

## 交付要求

- 提供可直接打开或通过项目开发服务器访问的 HTML。
- HTML 必须引用 `assets/pdf-document.css` 这份 skill 级共享样式，不得携带内嵌 CSS 或输出目录私有 CSS。
- 将图片放入清晰命名的 `assets/` 目录，不使用页码或随机字符串作为最终文件名。
- 简要说明哪些内容已结构化为 HTML，哪些复杂图形保留为图片。
- 明确说明未能验证的浏览器、字体或打印行为。
