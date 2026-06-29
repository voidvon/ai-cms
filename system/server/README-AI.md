# AI Assistant Integration

当前后台 AI 合同助手接入点：

- 路由：`system/server/src/routes/api/ai-assistant.mjs`
- 服务：`system/server/src/services/ai-assistant.mjs`
- 后台页面：`system/admin/src/pages/AiAssistantPage.tsx`

## 必需环境变量

- `OPENAI_API_KEY`

## 可选环境变量

- `OPENAI_BASE_URL`
- `OPENAI_CONTRACT_MODEL`
- `OPENAI_DEFAULT_MODEL`

默认模型优先级：

1. `OPENAI_CONTRACT_MODEL`
2. `OPENAI_DEFAULT_MODEL`
3. `gpt-5`

## 当前状态

- `contract_draft`：已接 OpenAI Agents SDK TypeScript
- `price_query`：stub
- `knowledge_qa`：stub
- `export_pdf`：stub，当前输出 HTML 占位文件到 `/uploads/pdfs/`

## 下一步建议

1. 将 `price_lookup` 工具替换为 ERP 或正式报价源
2. 将 `contract_clause_picker` 替换为数据库条款库
3. 为合同草稿增加数据库持久化
4. 将 HTML 占位导出替换为正式 PDF 渲染器
