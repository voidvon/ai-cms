# AI Integration

当前后台 AI 对话接入点：

- 路由：`system/server/src/routes/api/ai.mjs`
- 服务：`system/server/src/services/ai/`
- 后台页面：`system/admin/src/pages/AiChatPage.tsx`

## 模型配置

AI 模型配置以数据库表 `ai_models` 为真源，通过后台“系统 -> 模型管理”维护，不再从环境变量读取。

每条配置包含：

- OpenAI 兼容接口 Base URL
- API Key
- 文本模型
- 可选图片模型
- 思考程度：`low`、`medium`、`high`
- 启用状态与默认模型状态

运行时只使用已启用的默认模型。修改默认模型或接口配置后无需重启服务，下一次 AI 请求会自动使用最新配置。

## 当前状态

- 统一入口：`AI 对话`
- `/admin/ai` 的 Responses 对话会自动判断是否调用文生图工具；生成图片保存到媒体库
- 生成图片后的后续请求先由 Responses 判断意图，仅在需要编辑时调用工具加载最近图片
- 对话输入支持一次上传最多 8 张图片；Responses 判断需要编辑时才加载本轮全部附件并执行多图修改或组合
- 对话输入支持 `@栏目`、`@信息`、`@专题`；专题可按数据库语言读取，并可字段级修改指定语言的 SEO 标题、关键词、富文本简介和发布状态
- 当前默认对话能力：`contract_copilot`
- 任务能力：`contract_draft`、`price_query`、`knowledge_qa`、`export_pdf`
- `export_pdf` 当前输出 HTML 占位文件到 `/uploads/pdfs/`

## 下一步建议

1. 将 `price_lookup` 工具替换为 ERP 或正式报价源
2. 将 `contract_clause_picker` 替换为数据库条款库
3. 为对话与任务执行增加数据库持久化
4. 将 HTML 占位导出替换为正式 PDF 渲染器
