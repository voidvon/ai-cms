# SpiraxSarcoCN CMS MCP

## 当前定位

这是 CMS 的第一阶段 MCP 适配层。

目标：

- 直接复用现有 CMS HTTP API
- 向 AI 客户端暴露稳定的工具接口
- 不直接读写数据库
- 不重写栏目、内容、模板或静态发布逻辑

## 环境变量

参考 `.env.example`：

- `CMS_BASE_URL`
- `CMS_TOKEN`

`CMS_TOKEN` 目前复用现有后台管理员 token。

服务启动时会自动尝试读取：

- `mcp/.env`

## 当前工具范围

- `list_columns`
- `get_column`
- `create_manual_column`
- `update_column`
- `list_column_nodes`
- `list_column_node_options`
- `get_column_node`
- `create_column_node`
- `update_column_node`
- `delete_column_node`
- `list_content_models`
- `get_content_model`
- `get_model_fields`
- `search_content_items`
- `get_content_item`
- `create_content_item`
- `update_content_item`
- `delete_content_item`
- `build_static`

## 启动

```bash
npm --prefix mcp install
CMS_BASE_URL=http://127.0.0.1:3000 CMS_TOKEN=your-token npm --prefix mcp run start
```

或者直接在 `mcp/.env` 中配置后运行：

```bash
npm --prefix mcp run start
```

## 连接本地 AI 客户端

该服务当前使用 stdio 传输，适合被支持 MCP 的本地 AI 客户端直接拉起。

启动命令：

```bash
node /Users/yytest/Documents/projects/spiraxsarcocn/mcp/src/index.mjs
```

需要同时提供环境变量：

```bash
CMS_BASE_URL=http://127.0.0.1:3000
CMS_TOKEN=your-token
```

如果你的客户端支持为 MCP server 配置环境变量，直接把这两个变量写进去即可。

## 当前验证结果

- `npm --prefix mcp install` 已完成
- `node mcp/src/index.mjs` 在提供环境变量后可正常启动
- 当前还没有对接具体 AI 客户端配置文件示例

## 当前限制

- 还没有 AI 专用 token
- 还没有审计日志
- 还没有 dry-run / preview
- 还没有高风险操作确认
- 还没有模板相关工具
- 内容写工具会按模型字段定义裁剪 `base` 字段，并在返回中附带 `mcp_meta.ignored_base_fields`
- 栏目和栏目节点写工具也会返回 `mcp_meta`，用于提示被忽略字段和当前支持字段
- 删除类工具会在 `mcp_meta` 中附带 `dangerous_operation: true`
