# MCP 客户端接入说明

## 支持两种接入方式

当前 `AI CMS` MCP 支持两种启动方式：

1. 直接指向仓库源码里的 `mcp/src/index.mjs`
2. 安装 `ai-cms-mcp` npm 包后，用包命令启动

本地开发建议用源码模式。  
正式环境或多机复用建议用 npm 包模式。

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

## 本地源码模式

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
    "ai-cms": {
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

## npm 包模式

如果后续你将 `mcp/` 发布为私有 npm 包或公网 npm 包，推荐改用包命令：

```bash
npm install -g ai-cms-mcp
```

客户端配置示例：

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

如果不想全局安装，也可以用：

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

正式环境建议：

- `CMS_BASE_URL` 指向正式后台域名
- `CMS_TOKEN` 使用专门的 AI token
- 不把生产 token 写入仓库内的 `.env`

## 当前工具范围

当前 MCP server 已提供：

- 栏目工具
- 栏目节点工具
- 内容模型工具
- 内容项工具
- 模板工具
- 模板变体工具
- 模板绑定工具
- 静态发布工具

不包含：

- 搜索工具
- 后台对话 UI
- 高风险批量操作保护

其中模板工具默认返回摘要，不会直接回传整段 TSX/CSS 源码。

如果确实需要读模板源码或历史版本源码，应在对应工具里显式传 `includeHeavyFields=true`。

## 工具更新后的重载

MCP server 新增工具或修改工具定义后，通常需要让客户端重新加载一次工具清单。

如果你发现：

- `mcp/src/` 代码已经改了
- 本地 `node --check` 正常
- 但 AI 会话里仍然找不到新工具

通常不是后端问题，而是客户端还没重新注册最新的 MCP tools。

推荐顺序：

1. 确认 MCP server 进程已经重启
2. 在 AI 客户端里断开再重新连接该 MCP server
3. 必要时直接重开当前 AI 会话
