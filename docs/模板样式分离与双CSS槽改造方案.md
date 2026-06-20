# 模板样式分离与双CSS槽改造方案

## 背景

当前 CMS 模板以数据库 `templates` / `template_versions` 为真源，模板源码主要存放在 `content` 与 `published_content` 字段中，样式通过 TSX 导出 `export const css` 或 `export const scss` 的方式内嵌在同一段模板源码里。

现状可用，但已经暴露出几个明显问题：

- 模板结构与样式混写，人工和 AI 修改时容易互相误伤。
- 一个模板内同时存在结构、局部样式、全局样式时，职责边界不清。
- 后台编辑器只能编辑一整段源码，无法清晰表达“模板内容”和“样式输出策略”。
- 构建链路只能从 TSX 导出里抽取样式，不利于后续做更清晰的模板管理。

本次目标不是把模板拆成两个互不相干的资源，而是保持“模板仍是一份模板”，但在数据库层把结构与样式分开存储，并为每个模板提供两个独立的 CSS 编辑入口：

- 局部样式
- 全局样式

这更符合通用 CMS 和帝国CMS 式的“后台可配置、模板可控、发布结果可预测”的方向。

## 设计结论

### 1. 每个模板都提供三个源码槽

所有模板统一提供以下三个源码字段：

- `tsx_source`
  保存模板结构与渲染逻辑。
- `css_source`
  保存当前模板的局部样式。
- `global_css_source`
  保存需要进入全站公共样式包的全局样式。

不再推荐继续把样式写进 `tsx_source` 内部的 `export const scss`。

### 2. 不做“是否全局样式”勾选，直接做两个独立编辑区

不建议使用：

- 一个 `css_source`
- 一个 `is_global_style` 勾选

原因：

- 局部样式和全局样式本质上是两种不同职责，不适合混在同一个编辑区。
- 用户往往同时需要写两类样式，而不是二选一。
- 勾选方式会让同一段样式内既有局部规则又有全局规则，长期维护会混乱。

因此统一改为：

- “模板样式”编辑区，对应 `css_source`
- “全局样式”编辑区，对应 `global_css_source`

并且所有模板类型都支持这两个入口，不预判某类模板是否“应该”全局。

## 对现有系统的对应关系

### 当前数据库结构

当前后端在 [system/server/src/services/templates.mjs](/Users/yytest/Documents/projects/spiraxsarcocn/system/server/src/services/templates.mjs:68) 中定义：

- `templates.content`
- `templates.published_content`
- `template_versions.content`

当前样式抽取逻辑在 [system/server/src/tsx-template-styles.mjs](/Users/yytest/Documents/projects/spiraxsarcocn/system/server/src/tsx-template-styles.mjs:1) 中，通过解析 TSX 模块导出的 `css/scss` 收集样式。

当前后台新建组件模板时，也会直接往 `content` 里预填 `export const scss`，见 [system/admin/src/pages/TemplateVariantsPage.tsx](/Users/yytest/Documents/projects/spiraxsarcocn/system/admin/src/pages/TemplateVariantsPage.tsx:373)。

因此本方案本质上是对现有模板系统的结构化升级，而不是重做模板系统。

## 数据库改造方案

### `templates` 表新增字段

建议在 `templates` 表新增：

- `tsx_source TEXT NOT NULL DEFAULT ''`
- `css_source TEXT NOT NULL DEFAULT ''`
- `global_css_source TEXT NOT NULL DEFAULT ''`
- `published_tsx_source TEXT`
- `published_css_source TEXT`
- `published_global_css_source TEXT`

保留现有字段一段时间用于兼容迁移：

- `content`
- `published_content`

### `template_versions` 表新增字段

建议在 `template_versions` 表新增：

- `tsx_source TEXT NOT NULL DEFAULT ''`
- `css_source TEXT NOT NULL DEFAULT ''`
- `global_css_source TEXT NOT NULL DEFAULT ''`

保留现有：

- `content`

### 字段职责

各字段职责建议如下：

- `tsx_source`
  只保存模板结构、组件调用、渲染逻辑。
- `css_source`
  只保存当前模板的局部样式。
- `global_css_source`
  只保存需要进入全站公共样式包的样式。

禁止在新数据规范里继续把以下内容写入 `tsx_source`：

- `export const css`
- `export const scss`

## 后端服务改造

### 模板读写层

在 `templates.mjs` 中逐步调整：

- 创建模板时写入 `tsx_source / css_source / global_css_source`
- 更新模板时更新这三个字段
- 发布模板时发布这三个字段到对应 `published_*` 字段
- 版本保存时记录三段源码，而不是只记录 `content`

建议新增统一的模板源码归一化结构，例如：

```js
{
  tsx_source: '',
  css_source: '',
  global_css_source: ''
}
```

供以下链路共享：

- create
- update
- publish
- restore version
- preview
- validate

### 模板验证规则

发布前应分别验证：

- `tsx_source`
  必须能通过 TSX 编译，并导出默认组件。
- `css_source`
  如果非空，必须能独立通过 CSS/SCSS 编译。
- `global_css_source`
  如果非空，必须能独立通过 CSS/SCSS 编译。

推荐继续允许 CSS 或 SCSS 语法，但字段职责分离后，样式验证应直接针对字段内容本身进行，不再依赖 TSX 导出解析。

### 兼容层

迁移期需要保留兼容读取逻辑：

1. 优先读取新字段：
   - `published_tsx_source`
   - `published_css_source`
   - `published_global_css_source`
2. 若新字段为空，再回退到旧 `published_content`
3. 旧内容若包含 `export const css/scss`，则按旧逻辑解析

这样可以保证老模板在未迁移完之前仍可继续发布和渲染。

## 构建与静态发布改造

### 页面样式与全站样式分离

构建链路改为明确输出两类样式：

- 页面级 CSS
  收集当前页面模板及其依赖组件的 `css_source`
- 全站级 CSS
  收集所有启用模板的 `global_css_source`

最终页面加载方式建议为：

- 先加载全站公共 CSS
- 再加载当前页面 CSS

这与现有页面级 CSS 输出模式兼容，也更符合站点壳层、头部、页脚、通用组件的复用场景。

### 全站 CSS 输出建议

建议新增统一公共样式文件，例如：

- `/assets/cms-templates/shared.css`

规则建议如下：

- 按当前已启用主题下的模板收集 `published_global_css_source`
- 去重后按模板排序稳定输出
- 仅在存在内容时生成

### 页面 CSS 输出建议

现有页面级输出可继续保持，例如：

- `/assets/cms-templates/page-spirax_content_page.css`

但内部收集来源改为：

- 页面模板的 `published_css_source`
- 页面依赖组件的 `published_css_source`

不再依赖 TSX 文件中的 `export const scss`。

## 后台编辑器改造

### 编辑器布局

模板编辑器建议改为至少三个标签页或三个编辑区：

- 模板内容
- 模板样式
- 全局样式

对应：

- `tsx_source`
- `css_source`
- `global_css_source`

### 后台提示文案

建议在“全局样式”编辑区明确提示：

- 此区域样式会进入全站公共 CSS
- 会影响所有加载该主题公共样式的页面
- 建议只放壳层、头部、页脚、全站公用组件规则

### 新建模板默认内容

新建模板时默认值建议调整为：

- `tsx_source` 预填最小可运行组件
- `css_source` 预填最小局部样式
- `global_css_source` 默认空

不要再把 `export const scss` 作为 TSX 模板脚手架的一部分。

## 预览与依赖分析

### 模板预览

模板预览时需同时注入：

- 当前模板 `css_source`
- 当前模板 `global_css_source`
- 其依赖模板的 `css_source`
- 站点级需要模拟的 `global_css_source`

至少要保证预览结果与正式发布结果在样式来源上尽量一致。

### 模板依赖分析

后续依赖分析可以保持原有组件引用扫描逻辑，但样式收集要改为：

- 依赖树决定收集哪些模板
- 样式来源由模板字段决定

而不是由 TSX 导出是否存在来决定。

## 旧数据兼容与迁移策略

### 迁移目标

把旧模板中的：

- TSX 主体
- `export const css`
- `export const scss`

拆分迁移到新字段中。

### 迁移步骤

建议分三阶段：

#### 第一阶段：加字段，不切换读链路

- 数据库新增新字段
- 后端读写逻辑仍以旧 `content` 为主
- 提供后台只读展示或灰度入口

#### 第二阶段：双写兼容

- 编辑器保存时同时写新字段与旧 `content`
- 发布时同时写新 `published_*` 与旧 `published_content`
- 运行时优先新字段，缺失时回退旧字段

#### 第三阶段：正式切换

- 构建链路完全改为读取新字段
- 后台编辑器完全以新字段为主
- 停止生成新的 `export const scss` 风格模板

### 旧模板自动拆分规则

可编写迁移脚本处理旧 `content`：

1. 解析 TSX 模块导出
2. 提取默认导出组件源码作为 `tsx_source`
3. 提取 `export const css/scss` 作为 `css_source`
4. `global_css_source` 默认置空

注意：

- 旧模板里的 `scss` 默认只能迁移到 `css_source`
- 无法自动判断哪些规则应该进 `global_css_source`
- 因此全局样式需要后续由用户手工整理

这也是最稳妥的方案，避免错误自动提升为全站样式。

## 为什么不建议继续混写在 TSX 里

主要原因有四个：

- 结构和样式编辑粒度不同，混写容易误删。
- 局部样式和全局样式语义不同，混写会导致边界模糊。
- 后台难以做更清晰的编辑体验、校验和审计。
- 构建链路被迫依赖源码解析导出，不利于长期演进。

## 为什么不拆成两个独立模板对象

本方案虽然主张数据库字段分离，但不建议把模板和样式拆成两个独立资源，例如：

- 一个模板对象
- 一个样式对象

原因：

- 版本很容易不同步
- 后台管理复杂度会明显上升
- 结构和样式本来就是同一模板版本的一部分

因此应保持：

- 一条模板记录
- 一条模板版本记录
- 多个源码字段

这才符合 CMS 使用习惯。

## 实施顺序建议

建议按下面顺序落地：

1. 数据库 schema 扩展
2. `templates.mjs` 支持新字段读写
3. 模板预览接口支持新字段
4. 后台模板编辑器改为三编辑区
5. 构建器支持 `shared.css + page.css`
6. 编写旧模板迁移脚本
7. 完成灰度迁移后切换正式读链路

## 验收标准

完成后至少应满足：

- 模板结构修改不会误伤样式
- 模板局部样式与全局样式能独立编辑
- 页面发布后同时加载公共 CSS 和页面 CSS
- 老模板在迁移期内仍可正常渲染
- 新模板不再依赖 `export const scss`
- 更接近“模板驱动 + 可配置 + 静态发布”的帝国CMS式心智模型

## 结论

本方案的核心不是“把样式拿出去”，而是把模板源码结构化：

- 模板仍是一份模板
- 数据库存储拆成 `tsx_source / css_source / global_css_source`
- 所有模板都具备局部样式和全局样式两个入口
- 构建链路明确区分页面级样式与全站级样式

这会比当前 `TSX + export const scss` 的方式更稳、更可控，也更适合后续引入 AI 协作编辑。
