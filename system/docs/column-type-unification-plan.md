# 栏目形态统一重构规划

## 目标

把当前以 `source_type` 为核心的栏目模型，收敛为真正通用的栏目体系。

最终栏目只保留三种形态：

- `single`：单页 / 封面式
- `list`：列表式
- `link`：链接式

本次规划明确两点：

- 不新增 `system_key`
- 不新增 `has_detail`
- 不保留 `source_type`
- 不保留 `source_id`

栏目是否生成详情页，必须通过已有字段和规则推导，而不是增加布尔字段。

## 当前问题

当前 `columns.source_type` 同时承担了多种职责：

- 表示栏目来源
- 表示栏目业务类型
- 表示栏目展示方式
- 表示栏目生成规则
- 表示栏目默认路由规则

例如下面这些值：

- `product_root`
- `product_category`
- `news_category`
- `corporation_root`
- `corporation_category`
- `contact_page`
- `single_page`
- `custom_link`

这说明当前系统并不是“栏目形态 + 内容模型”的结构，而是把：

- 栏目形态
- 内容类型
- 系统特殊页
- 静态生成规则

混在一个字段里。

这会导致：

- 代码中大量出现业务硬编码
- 后台和静态生成都依赖固定业务枚举
- 无法自然支持新的栏目模型
- 无法真正做到“只有栏目概念”

## 重构原则

### 1. 栏目形态只保留三种

统一新增或收敛为：

- `column_type = single`
- `column_type = list`
- `column_type = link`

说明：

- `single` 对应单页、封面式栏目
- `list` 对应栏目列表、文章列表、产品列表、案例列表等
- `link` 对应跳转型栏目

### 2. 内容类型不再由栏目类型承担

“产品栏目”和“新闻栏目”不应是栏目类型。

它们应当只是：

- 同为 `list`
- 但绑定了不同的 `content_model_id`

也就是说：

- 栏目类型决定“怎么展示”
- 内容模型决定“内容长什么样”

### 3. 是否有详情页不单独存字段

不增加 `has_detail`。

详情页是否存在通过以下条件推导：

- `column_type = list`
- `content_model_id` 非空
- `detail_rule` 非空

满足以上条件，则栏目拥有内容详情页生成能力。

否则：

- `single` 只有单页
- `link` 不生成内容页
- `list` 可以是“只有列表”或“列表 + 详情”

### 4. 系统特殊页不单独加字段

不增加 `system_key`。

系统特殊页的处理方式改为：

- 通过约定路径识别，例如 `/contact.html`
- 或通过独立配置识别
- 或通过模板绑定识别

而不是在栏目表中再加一个新的系统枚举字段。

## 目标数据模型

## 栏目表建议保留字段

建议 `columns` 逐步收敛为以下核心字段：

- `id`
- `parent_id`
- `column_type`
- `content_model_id`
- `custom_url`
- `route_path`
- `dir_name`
- `detail_rule`
- `is_visible`
- `sort_order`
- `legacy_extra`
- `created_at`
- `updated_at`

说明：

- `column_type` 决定栏目形态
- `content_model_id` 决定栏目绑定哪一个内容模型
- `detail_rule` 决定详情页输出规则
- `route_path` / `dir_name` 决定栏目访问路径

## 明确删除的字段

以下字段不进入新模型：

- `source_type`
- `source_id`

说明：

- `source_type` 是旧架构里把栏目形态、业务类型、生成规则混在一起的字段，必须拆掉
- `source_id` 当前主要只是旧 `source_type` 体系下的配套编号，用来做分组、映射、排序补位
- 一旦栏目模型改为 `column_type + content_model_id + detail_rule + route_path`，`source_id` 不再有独立存在价值

因此这次迁移目标不是“弱化使用”，而是：

- 完成数据迁移
- 完成代码切换
- 直接删除这两个字段

## 三种栏目形态的行为定义

### `single`

单页栏目。

特点：

- 栏目本身就是页面
- 不绑定列表数据集也可以工作
- 不依赖 `detail_rule`
- 使用 `route_path` 直接生成页面

典型场景：

- 联系我们
- 关于我们
- 服务说明
- 任意独立介绍页

### `list`

列表栏目。

特点：

- 可以绑定内容模型
- 可以只生成列表页
- 也可以同时生成列表页和内容页

推导规则：

- `content_model_id` 为空：仅作为结构性列表栏目
- `content_model_id` 非空，`detail_rule` 为空：只有列表页
- `content_model_id` 非空，`detail_rule` 非空：列表页 + 内容页

典型场景：

- 新闻
- 产品
- 案例
- 资料下载
- 招聘
- FAQ

### `link`

链接栏目。

特点：

- 不生成栏目页面
- 使用 `custom_url` 跳转
- 不绑定 `detail_rule`

典型场景：

- 外部站点
- 独立系统入口
- 特定活动链接

## 旧值到新模型的映射

当前 `source_type` 到目标结构的建议映射如下：

- `custom_link`
  - `column_type = link`
  - `content_model_id = null`
  - `detail_rule = null`

- `single_page`
  - `column_type = single`
  - `content_model_id = null`
  - `detail_rule = null`

- `contact_page`
  - `column_type = single`
  - `content_model_id = null`
  - `detail_rule = null`
  - `route_path = /contact.html`

- `product_root`
  - `column_type = list`
  - `content_model_id = product`
  - `detail_rule` 保留现有规则

- `product_category`
  - `column_type = list`
  - `content_model_id = product`
  - `detail_rule` 保留现有规则

- `news_category`
  - `column_type = list`
  - `content_model_id = news`
  - `detail_rule` 保留现有规则

- `corporation_root`
  - `column_type = single` 或 `list`
  - 需要结合现有业务确认

- `corporation_category`
  - 更合理的目标是 `single`
  - 因为当前一条栏目对应一个内容页，而不是一组内容记录

这里特别说明：

`corporation_root / corporation_category` 当前更接近“页面树”，不是标准内容列表。

因此重构时建议把这条线优先收敛成：

- 根栏目作为结构节点
- 子栏目统一为 `single`

而不是继续保留一套特殊的“公司栏目类别”体系。

## 静态生成规则调整

重构后静态生成不再按 `source_type` 分支，而按栏目形态与内容模型推导：

### 规则 1：`single`

生成一个页面：

- 输出路径来自 `route_path`

### 规则 2：`link`

不生成页面。

### 规则 3：`list`

总是允许生成列表页。

当同时满足以下条件时生成详情页：

- `content_model_id` 非空
- `detail_rule` 非空

这意味着静态生成器最终只需要判断：

- 栏目形态
- 模型绑定
- 详情页规则

而不需要知道“这是产品还是新闻”。

## 迁移策略

本次迁移采用一次性切换，不做兼容层，不做双写，不保留旧字段。

原则：

- 新旧模型不能长期并存
- 不接受在核心链路里继续判断 `product_root/news_category/contact_page`
- 不接受为了平滑迁移继续保留 `source_type -> column_type` 的映射层
- 一次迁移完成后，所有核心读写路径都只认新模型

### 一次性切换步骤

1. 数据库 schema 直接调整
   - 为 `columns` 增加 `column_type`
   - 确认 `content_model_id`、`detail_rule`、`route_path` 能覆盖栏目行为
   - 删除 `source_type`
   - 删除 `source_id`

2. 执行一次性数据迁移
   - 把旧 `source_type` 映射到 `column_type`
   - 把“产品/新闻/资料”等业务归属迁移到 `content_model_id`
   - 把特殊页面行为迁移到 `route_path`、模板绑定或独立配置

3. 同步重写所有读取链路
   - `columns`
   - `public-sections`
   - `content-entries`
   - `column-tree`
   - `templates`
   - `static-builder`

4. 同步重写所有写入链路
   - 栏目新增
   - 栏目编辑
   - 手工栏目创建
   - 栏目分类初始化脚本
   - 导入脚本和修复脚本

5. 同步重写后台界面
   - 只展示三种栏目形态
   - 不再展示 `source_type`
   - 不再传递 `source_id`

6. 清理遗留逻辑
   - 删除所有 `product/news/corporation/contact` 作为栏目类型的分支
   - 删除所有基于 `source_type` 的判断
   - 删除所有基于 `source_id` 的映射和唯一性约束

## 后台管理界面调整

重构后后台栏目编辑不再出现：

- 产品栏目
- 新闻栏目
- 公司栏目

只出现：

- 栏目形态
  - 单页
  - 列表
  - 链接

以及：

- 绑定内容模型
- 栏目访问路径
- 详情页规则
- 模板绑定

这才是通用 CMS 的后台抽象。

## 风险与注意事项

### 1. `corporation` 线最容易混淆

它当前既像栏目，又像单页集合。

重构时不要简单按“列表模型”处理，否则会继续保留错误抽象。

### 2. 特殊页面只保留“栏目 + 路径”语义

新架构中“联系我们”只是一个 `single` 栏目，路径刚好是 `/contact.html`。

不能再保留 `contact_page` 这种特殊栏目类型。

### 3. `detail_rule` 必须继续保留

因为它承担了“详情页是否存在”和“详情页路径规则”两层职责。

如果删除它，就必须引入等价替代规则，否则静态生成能力会退化。

### 4. 一次性迁移必须按“schema + 代码 + 数据”整体切换

因为本次不做兼容层，所以不能只改其中一部分。

必须在同一次迁移中同时完成：

1. schema 调整
2. 数据回填
3. 服务层切换
4. 后台接口切换
5. 静态生成切换

否则系统会直接进入不可用状态。

## 当前建议

按当前仓库状态，建议下一步执行顺序为：

1. 文档确认目标模型和删除范围
2. 设计 `columns` 新 schema
3. 先整理所有 `source_type/source_id` 使用点，分成：
   - 必须重写的运行时服务
   - 必须重写的后台页面
   - 可以删除的脚本
4. 编写一次性迁移脚本
5. 同步改造前后台与静态生成
6. 最后执行 schema 切换并删除旧字段

## 结论

对于通用 CMS，栏目本身只应保留三种形态：

- 单页
- 列表
- 链接

“产品”“新闻”“公司”不应再是栏目类型。

它们最多只是：

- 某个栏目绑定的内容模型
- 某套模板绑定
- 某种详情页规则

因此本次重构的核心不是再补几个字段，而是把当前 `source_type` 的混合职责彻底拆开。
