# CMS MCP 第一阶段实施计划

## 目标

在不改动当前栏目驱动、内容模型驱动、模板真源和静态发布主链路的前提下，为现有 CMS 提供一套可被 AI 客户端调用的 MCP 能力。

第一阶段重点是：

- 直接复用现有后端 HTTP API
- 不在后台页面内新增 AI 对话或搜索功能
- 不引入数据库直写
- 不新开第二套栏目、路径、模板或静态发布逻辑

## 为什么单独建立 `mcp/` 目录

建议在根目录新增独立目录 `mcp/`，而不是放进 `system/server` 或 `system/admin`。

原因：

1. `system/server` 是现有 CMS 服务端运行时，负责后台、接口、预览、静态生成和兼容层。MCP 不应混入主站运行时入口，避免把 AI 接入逻辑和站点核心运行时耦合。
2. `system/admin` 是后台前端，不适合作为 MCP 的承载位置。
3. MCP 是独立交付单元，本质上更像一个面向外部 AI 客户端的适配层，单独目录更利于独立开发、部署、鉴权和后续演进。
4. 第一阶段采用“复用现有 API”的方式，MCP 主要是协议适配与工具封装，不需要嵌入现有服务端内部。

## 第一阶段范围

第一阶段只覆盖低风险、最常用的 CMS 工具能力：

- `list_columns`
- `get_column`
- `list_content_models`
- `get_content_model`
- `get_model_fields`
- `list_column_nodes`
- `list_column_node_options`
- `get_column_node`
- `create_column_node`
- `update_column_node`
- `search_content_items`
- `get_content_item`
- `create_content_item`
- `update_content_item`
- `create_manual_column`
- `update_column`
- `build_static`

暂不纳入：

- 后台 AI 对话框
- 后台搜索功能
- 模板源码编辑
- 模板绑定管理
- 批量替换
- 管理员管理
- 高风险批量删除

## 架构原则

### 1. MCP 只做适配，不做业务真源

MCP 只负责：

- 暴露 tool schema
- 组织入参和出参
- 调用现有 CMS API
- 将错误格式化为 AI 易理解结果

MCP 不负责：

- 直接读写数据库
- 重写栏目路径算法
- 重写模板渲染逻辑
- 重写静态发布逻辑

### 2. 核心业务继续留在现有 CMS

所有栏目、内容、静态发布行为继续经过当前后端：

- 栏目：`columns.mjs`、`column-nodes.mjs`
- 内容模型：`content-models.mjs`、`content-model-fields.mjs`
- 内容：`content-items.mjs`
- 静态发布：`static-builder.mjs`

### 3. 认证先复用管理员 token

第一阶段先复用现有 `Authorization: Bearer <token>` 鉴权能力，不新增后端认证机制。

后续可演进为：

- AI 专用 token
- scope 权限
- 工具级操作审计

## 目录建议

建议新增：

```text
mcp/
  package.json
  src/
    index.mjs
    config.mjs
    cms-client.mjs
    tools/
      columns.mjs
      content-models.mjs
      content-items.mjs
      build.mjs
```

说明：

- `index.mjs`：MCP server 入口
- `config.mjs`：读取 `CMS_BASE_URL`、`CMS_TOKEN`
- `cms-client.mjs`：统一封装 HTTP 请求
- `tools/*.mjs`：按能力拆分 MCP tools

## 现有 API 复用关系

### 可直接包装

- `GET /api/columns`
- `GET /api/columns/:id`
- `POST /api/columns`
- `PUT /api/columns/:id`
- `GET /api/content-models`
- `GET /api/content-models/:id`
- `GET /api/content-models/:id/fields`
- `GET /api/content-items/:modelCode/:id`
- `POST /api/content-items/:modelCode`
- `PUT /api/content-items/:modelCode/:id`
- `POST /admin/build/generate`

### 需要 MCP 层重整参数

- `GET /api/content-items/:modelCode/admin`

建议包装为：

- `search_content_items(modelCode, page?, limit?, columnId?, includeDescendants?, languageCode?)`

原因：

- 现有接口偏后台分页参数风格
- MCP 层应提供更稳定、语义更直接的 tool 参数

## 第一阶段实施步骤

### 步骤 1：建立目录和基础配置

- 新建 `mcp/`
- 初始化独立 `package.json`
- 约定环境变量：
  - `CMS_BASE_URL`
  - `CMS_TOKEN`

### 步骤 2：实现 CMS HTTP client

- 统一附带 `Authorization: Bearer <token>`
- 统一处理超时、401、404、400 和后端错误消息
- 将错误转成 tool 友好的文本

### 步骤 3：实现只读工具

优先实现：

- `list_columns`
- `get_column`
- `list_content_models`
- `get_content_model`
- `get_model_fields`
- `search_content_items`
- `get_content_item`

### 步骤 4：实现低风险写工具

- `create_content_item`
- `update_content_item`
- `create_manual_column`
- `update_column`

### 步骤 5：实现静态发布工具

- `build_static`

第一阶段只做最小封装，不改变现有发布机制。

## 第二阶段预留项

后续如要增强生产可用性，优先考虑：

- AI 专用 token
- 审计日志
- 高风险操作确认
- dry-run / preview
- 栏目节点工具
- 删除类工具的安全门

## 当前建议结论

建议现在就按以下方向开始开发：

1. 在根目录新增独立 `mcp/` 目录
2. 第一阶段直接复用现有 HTTP API
3. 先做只读和低风险写工具
4. 暂不改动后台 UI 和后台搜索
5. 后续再根据使用情况决定是否补后端专用 AI 能力

## 当前已确认的模型行为差异

在第一轮真实联调中，已确认内容模型字段能力并不完全一致，MCP 调用时不能假设所有模型都支持相同字段。

例如：

- `news` 模型底层表 `content_news` 当前不包含 `is_visible`
- `news` 模型底层表 `content_news` 当前不包含 `sort_order`

这意味着：

- 对 `news` 调用 `create_content_item` 时，即使传入 `is_visible` 或 `sort_order`，后端也不会真正落库
- 这是现有内容模型存储结构差异，不是 MCP 传参错误

因此，后续 MCP 工具层应逐步增强为：

- 先读取模型字段定义
- 再决定允许 AI 传哪些字段
- 避免把并不存在于该模型的字段暴露为“可写且有效”的通用参数

## 当前联调结论补充

### 栏目节点删除链路

在真实联调中，`create_column_node`、`get_column_node`、`update_column_node` 已可正常工作，且 `update_column_node` 返回的 `mcp_meta` 已能正确提示：

- 被忽略的平铺字段
- 支持的 `base` 字段
- 支持的翻译字段

但 `delete_column_node` 在远端测试环境中仍可能返回：

- `当前栏目不支持直接编辑`

已确认这不是 MCP 配置问题，而是远端后端仍运行旧逻辑：

- `column-nodes.mjs` 删除栏目节点时复用了 `deleteManualColumn()`
- `deleteManualColumn()` 只允许删除 `single` / `link`
- 因此 `news` 这类 `list` 型栏目节点会被误判为不可删除

本地仓库已修正为：

- 栏目节点删除改走底层 `deleteColumnRecord()`
- `/api/columns/:id` 的“手工栏目直接删除限制”仍然保留
- 不会放宽后台通用栏目删除权限

这意味着：

- 本地代码已经支持 `list` 型栏目节点通过分类接口删除
- 当前 MCP 连到的远端测试站如果还没部署新后端，删除依然会失败

### 当前远端残留测试数据

远端测试站当前仍残留一个联调用测试节点：

- `rootColumnId = 69`
- `id = 353`
- `name = MCP Column Node Test 2026-06-24`
- `route_path = /news/mcp-column-node-test-20260624/`

清理方式：

1. 将后端部署到包含本次删除修复的版本
2. 再通过 MCP 调用 `delete_column_node(rootColumnId=69, id=353)` 删除
