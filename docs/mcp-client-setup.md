# MCP 客户端接入说明

## 前提

当前仓库的 MCP server 位于：

- `mcp/src/index.mjs`

它通过 stdio 方式运行，并读取以下环境变量：

- `CMS_BASE_URL`
- `CMS_TOKEN`

此外，服务启动时会自动尝试读取：

- `mcp/.env`

因此，本地接入时可以二选一：

1. 在 MCP 客户端配置里显式传环境变量
2. 在仓库内创建 `mcp/.env`

## 推荐做法

先在仓库中创建：

- `mcp/.env`

内容参考：

```env
CMS_BASE_URL=http://127.0.0.1:3000
CMS_TOKEN=replace-with-your-admin-token
```

然后在 MCP 客户端中把 server 命令指向：

```bash
node /Users/yytest/Documents/projects/spiraxsarcocn/mcp/src/index.mjs
```

## Claude Desktop 示例

如果你的客户端配置支持以下字段，可参考：

```json
{
  "mcpServers": {
    "spiraxsarcocn-cms": {
      "command": "node",
      "args": [
        "/Users/yytest/Documents/projects/spiraxsarcocn/mcp/src/index.mjs"
      ],
      "env": {
        "CMS_BASE_URL": "http://127.0.0.1:3000",
        "CMS_TOKEN": "replace-with-your-admin-token"
      }
    }
  }
}
```

如果你已经使用 `mcp/.env`，则可只保留命令和参数，不必在客户端里重复写环境变量。

## 当前工具范围

当前 MCP server 已提供：

- 栏目工具
- 栏目节点工具
- 内容模型工具
- 内容项工具
- 静态发布工具

不包含：

- 搜索工具
- 后台对话 UI
- 模板源码编辑
- 高风险批量操作保护
