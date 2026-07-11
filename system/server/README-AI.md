# AI Integration

当前后台 AI 对话接入点：

- 路由：`system/server/src/routes/api/ai.mjs`
- 服务：`system/server/src/services/ai/`
- 后台页面：`system/admin/src/pages/AiChatPage.tsx`

## 必需环境变量

- `OPENAI_API_KEY`

## 可选环境变量

- `OPENAI_BASE_URL`
- `OPENAI_AI_MODEL`
- `OPENAI_DEFAULT_MODEL`
- `OPENAI_CONTRACT_MODEL`
- `OPENAI_IMAGE_MODEL`（可选的 GPT Image 工具模型；未配置时由 Responses 自动选择）

默认模型优先级：

1. `OPENAI_AI_MODEL`
2. `OPENAI_DEFAULT_MODEL`
3. `OPENAI_CONTRACT_MODEL`
4. `gpt-5`

## 当前状态

- 统一入口：`AI 对话`
- `/admin/ai` 的 Responses 对话会自动判断是否调用文生图工具；生成图片保存到媒体库
- 生成图片后的后续请求先由 Responses 判断意图，仅在需要编辑时调用工具加载最近图片
- 当前默认对话能力：`contract_copilot`
- 任务能力：`contract_draft`、`price_query`、`knowledge_qa`、`export_pdf`
- `export_pdf` 当前输出 HTML 占位文件到 `/uploads/pdfs/`

## 下一步建议

1. 将 `price_lookup` 工具替换为 ERP 或正式报价源
2. 将 `contract_clause_picker` 替换为数据库条款库
3. 为对话与任务执行增加数据库持久化
4. 将 HTML 占位导出替换为正式 PDF 渲染器
