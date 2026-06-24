# AI CMS MCP 发布说明

## 发布目标

`mcp/` 现在可以直接作为 npm 包发布，包名默认是：

- `ai-cms-mcp`

推荐优先顺序：

1. 私有 npm 仓库
2. 团队内部制品仓库
3. 公网 npm

如果只是内部自用，没有必要一开始就发公网 npm。

## 发布前准备

确保以下信息不要写死在源码里：

- `CMS_BASE_URL`
- `CMS_TOKEN`

这些都应该通过 MCP 客户端配置或运行环境变量注入。

建议仓库内只保留：

- `mcp/.env.example`

不要提交：

- `mcp/.env`
- 任意包含生产 token 的本地环境文件

## 发布前检查

在仓库根目录执行：

```bash
npm --prefix mcp install
npm --prefix mcp run check
```

查看打包内容：

```bash
npm_config_cache=/private/tmp/ai-cms-npm-cache npm --prefix mcp run pack:dry-run
```

如果本机 npm cache 权限正常，也可以直接执行：

```bash
npm --prefix mcp run pack:dry-run
```

## 本地打包

```bash
npm --prefix mcp pack
```

产物类似：

```bash
ai-cms-mcp-0.1.0.tgz
```

## 发布到 npm

先登录目标仓库：

```bash
npm login
```

然后发布：

```bash
npm --prefix mcp publish
```

如果发布到私有 registry，通常还需要：

```bash
npm --prefix mcp publish --registry=https://your-registry.example.com
```

## 客户端接入

正式环境推荐直接在 MCP 客户端配置：

```json
{
  "mcpServers": {
    "ai-cms": {
      "command": "ai-cms-mcp",
      "env": {
        "CMS_BASE_URL": "https://cms.example.com",
        "CMS_TOKEN": "replace-with-ai-token"
      }
    }
  }
}
```

## 生产建议

- 不要复用长期超级管理员 token
- 单独发放 AI 专用 token
- 最好区分只读 token 和写入 token
- 后续补操作审计
- 后续补高风险操作确认

## 当前状态

当前包已经具备：

- npm CLI 入口
- 发布白名单
- 本地检查脚本
- dry-run 打包校验

当前还没有内建：

- AI 专用鉴权体系
- token 细粒度权限
- 审计日志
- 危险操作二次确认
