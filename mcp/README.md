# AI CMS MCP

## 定位

这是 CMS 的第一阶段 MCP 适配层。

目标：

- 直接复用现有 CMS HTTP API
- 向 AI 客户端暴露稳定的工具接口
- 不直接读写数据库
- 不重写栏目、内容、模板或静态发布逻辑

## 包形态

这个目录现在可以直接作为 npm 包发布，默认包名：

- `ai-cms-mcp`

发布后，客户端可以直接通过可执行命令启动：

```bash
ai-cms-mcp
```

不需要额外构建步骤。

正式发布流程见：

- [PUBLISHING.md](/Users/yytest/Documents/projects/spiraxsarcocn/mcp/PUBLISHING.md)

## 环境变量

参考 `.env.example`：

- `CMS_BASE_URL`
- `CMS_TOKEN`

`CMS_TOKEN` 目前复用现有后台管理员 token。

服务启动时会自动尝试读取：

- `mcp/.env`

正式环境建议不要把 token 写进仓库，而是在 MCP 客户端配置里注入：

```env
CMS_BASE_URL=https://cms.example.com
CMS_TOKEN=replace-with-production-token
```

仓库中只应保留 `.env.example`，不要提交真实的 `mcp/.env`。

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
- `list_templates`
- `get_template`
- `create_template`
- `update_template`
- `preview_template`
- `publish_template`
- `list_template_versions`
- `get_template_version`
- `restore_template_version`
- `get_template_dependencies`
- `delete_template`
- `list_template_variants`
- `get_selected_template_variant`
- `get_template_variant`
- `create_template_variant`
- `update_template_variant`
- `select_template_variant`
- `delete_template_variant`
- `list_template_bindings`
- `upsert_template_binding`
- `delete_template_binding`
- `build_static`

`build_static` 当前默认行为：

- 如果不传 `language`，MCP 会默认按 `en` 调用静态生成
- 只有显式传入其他语言时，才会构建对应语言

这样做的原因是当前模板改动通常只需要先验证英文站，避免默认全语言生成导致耗时过长。

## 本地启动

```bash
npm --prefix mcp install
CMS_BASE_URL=http://127.0.0.1:3000 CMS_TOKEN=your-token npm --prefix mcp run start
```

或者直接在 `mcp/.env` 中配置后运行：

```bash
npm --prefix mcp run start
```

## 作为 npm 包使用

如果后续发布到私有 npm 或公网 npm，客户端可以直接调用包命令。

全局安装示例：

```bash
npm install -g ai-cms-mcp
```

然后在 MCP 客户端里配置：

```json
{
  "mcpServers": {
    "ai-cms": {
      "command": "ai-cms-mcp",
      "env": {
        "CMS_BASE_URL": "https://cms.example.com",
        "CMS_TOKEN": "replace-with-production-token"
      }
    }
  }
}
```

如果不想全局安装，也可以用 `npx`：

```json
{
  "mcpServers": {
    "ai-cms": {
      "command": "npx",
      "args": ["-y", "ai-cms-mcp"],
      "env": {
        "CMS_BASE_URL": "https://cms.example.com",
        "CMS_TOKEN": "replace-with-production-token"
      }
    }
  }
}
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

## 发布前检查

```bash
npm --prefix mcp run check
npm --prefix mcp run pack:dry-run
```

建议正式发布前至少确认：

- 包内只包含 `src/`、`README.md`、`.env.example`
- `CMS_BASE_URL` 指向正式后台域名
- `CMS_TOKEN` 使用专门的 AI token，而不是超级管理员长期 token

## 当前验证结果

- `npm --prefix mcp install` 已完成
- `node mcp/src/index.mjs` 在提供环境变量后可正常启动
- 包已具备 npm 发布所需的 `bin` 和 `files` 配置

## 当前限制

- 还没有 AI 专用 token
- 还没有审计日志
- 还没有 dry-run / preview
- 还没有高风险操作确认
- 内容写工具会按模型字段定义裁剪 `base` 字段，并在返回中附带 `mcp_meta.ignored_base_fields`
- 栏目和栏目节点写工具也会返回 `mcp_meta`，用于提示被忽略字段和当前支持字段
- 模板工具默认返回摘要；只有显式传 `includeHeavyFields=true` 时，模板源码和版本源码才会回传
- 删除类工具会在 `mcp_meta` 中附带 `dangerous_operation: true`
- `build_static` 会在 `mcp_meta` 中附带 `effective_language`；未传 `language` 时默认值为 `en`

## 上下文控制建议

AI 对话接 MCP 时，上下文消耗主要来自“返回结果太大”，而不是工具数量本身。

当前建议：

- 优先让 AI 先调用列表工具，再按 id 调详情
- 默认避免一次性读取整站栏目、整页 `content_html`、整段模板源码
- 对高频管理动作，优先使用轻量工具，例如：
  - `list_template_variants`
  - `list_template_bindings`
  - `list_column_nodes`
- 对删除、切主题、静态发布这类动作，只返回必要结果和 `mcp_meta`

如果后续你希望继续压缩上下文占用，下一步应做两类增强：

1. 给大对象工具增加 `summaryOnly` / `includeHeavyFields` 开关
2. 给列表类工具增加更强的分页、筛选和字段裁剪能力

## 远端模板验证

修改远端模板时，不要只看模板源码是否已更新，必须按这个顺序核对：

1. 先确认修改落在远端 `draft`，再确认已 `publish`
2. 再重新执行 `build_static`
3. 再抓取线上 HTML，确认实际 DOM
4. 再核对 CSS 选择器是否命中该 DOM

如果页面视觉没变化，优先怀疑：

- 选择器没命中
- 外层页面类名不对
- 只更新了 draft，没发布到 published
- 只发布了模板，没重新生成静态页
- 命中了旧缓存而不是新产物

对产品页这类模板，尤其要先确认页面外层类名和样式前缀一致，再判断样式细节。
