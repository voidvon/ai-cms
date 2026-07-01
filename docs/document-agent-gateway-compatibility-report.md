# Document Agent Gateway Compatibility Report

## 背景

本次排查目标是解决后台 AI 文档工作台在以下接口上的持续失败问题：

- `POST /api/document-drafts/:id/assistant/stream`

历史报错主要表现为：

- `503 auth_unavailable: no auth available (providers=codex, model=gpt-5.4)`

在排查过程中，先后更换了两个不同的 OpenAI 兼容网关：

1. `https://cpa.0122.vip/v1`
2. `https://api.flyapi.tech/v1`

本报告用于沉淀已验证结论、兼容边界和后续改造目标。

## 最终结论

问题并不在前端页面，也不在 SSE 路由本身，更不在“服务没有重启”。

真正影响 `document-agent` 可用性的，是不同网关对 OpenAI `Responses` / `Chat Completions` / `@openai/agents` 能力的兼容范围不同，且部分工具 schema 会触发网关校验失败。

当前阶段已经确认：

- `@openai/agents` 不是完全不可用
- `chat/completions` 不是不能用工具链
- `responses` 也不是完全不可用
- 真正的约束是：
  - 网关是否支持 `Responses conversation`
  - 网关是否支持 `Responses tools`
  - 网关是否接受当前工具 schema

## 已验证证据

### 第一阶段：旧网关 `https://cpa.0122.vip/v1`

已验证行为：

- `GET /v1/models` 可用
- `POST /v1/responses` 基础调用可用
- `POST /v1/chat/completions` 基础调用可用

但以下能力失败：

- `responses + conversation`
- `responses + function tools`
- `@openai/agents` 在文档工作台真实链路上的工具调用

直接现象：

- 原始 document-agent SSE 返回：
  - `503 auth_unavailable: no auth available (providers=codex, model=gpt-5.4)`

结论：

- 旧网关只能兼容基础 `Responses` / `Chat Completions`
- 不兼容文档工作台所需的 `Responses conversation/tools`

### 第二阶段：切换到 Chat Completions 兼容模式

为兼容旧网关，运行时曾切换为：

- `@openai/agents`
- `OpenAIProvider({ useResponses: false })`
- 本地 `MemorySession`
- 不使用上游 `conversationId`

已验证行为：

- `@openai/agents + chat/completions + stream` 可用
- `@openai/agents + chat/completions + simple tool` 可用
- `@openai/agents + chat/completions + local session` 可用

但旧网关下，只要挂上 `document-agent/tools.mjs` 中的真实文档工具，仍可能失败。

这一步证明：

- agent 架构本身没有问题
- 真正问题开始收敛到“网关兼容能力 + 工具 schema”

### 第三阶段：新网关 `https://api.flyapi.tech/v1`

已验证行为：

- `responses_plain` 可用
- `responses + tools` 可用
- `chat_plain` 可用
- `chat + tools` 可用
- `@openai/agents + useResponses: true + tools` 可用
- `document-agent` 在 `responses` 模式下可跑

但以下能力仍失败：

- `responses + conversation`
- `@openai/agents + useResponses: true + conversationId`

结论：

- 新网关已经支持 `responses + tools`
- 但仍不支持 `Responses conversation`
- 因此“最初完整方案”仍然不能原样恢复

## 当前发现的具体 schema 问题

在新网关上，真实 `document-agent` 继续失败后，已定位到明确的 schema 校验错误：

- 工具：`apply_document_patch`
- 原参数定义：
  - `patch: z.record(z.string(), z.unknown())`

该 schema 被转换为 JSON Schema 后包含：

- `propertyNames`

而新网关明确报错：

- `Invalid schema for function 'apply_document_patch': In context=('properties', 'patch'), 'propertyNames' is not permitted.`

这说明：

- 问题不再是 agent 整体不可用
- 而是具体工具 schema 超出了网关允许的 JSON Schema 子集

## 已落地修复

为了兼容新网关，`apply_document_patch` 已修改为：

- 输入参数从结构化对象改为：
  - `patch_json: string`
- 服务端再执行 `JSON.parse`

这样可以避开：

- `z.record(...)`
- `propertyNames`

在该修改后，真实链路本地验证结果为：

- `startDocumentAgentRun(...)` 成功启动
- stream 返回正常
- 模型可回复：`收到`

## 当前兼容矩阵

### 旧网关 `https://cpa.0122.vip/v1`

- `responses_plain`: 支持
- `responses + tools`: 不稳定 / 失败
- `responses + conversation`: 不支持
- `chat/completions`: 支持
- `chat/completions + tools`: 支持
- `@openai/agents + responses`: 不适合文档工作台
- `@openai/agents + chat/completions + local session`: 可作为兼容方案

### 新网关 `https://api.flyapi.tech/v1`

- `responses_plain`: 支持
- `responses + tools`: 支持
- `responses + conversation`: 不支持
- `chat/completions`: 支持
- `chat/completions + tools`: 支持
- `@openai/agents + responses + tools`: 支持
- `@openai/agents + responses + conversationId`: 不支持

## 当前推荐方案

对于文档工作台，当前最稳妥的 agent 方案不是“完全回到最初设计”，而是：

- 保留 `@openai/agents` 编排层
- 使用 `responses + tools`
- 不依赖上游 `conversationId`
- 多轮上下文仍由本地消息和本地 session 重建

这意味着：

- 可以回到 `responses`
- 可以继续使用工具链
- 但不能把多轮会话状态托管给上游 `Responses conversation`

## 我的目标

当前阶段我的目标是：

1. 保持文档工作台继续使用 `@openai/agents`
2. 在新网关上优先恢复：
   - stream
   - tools
   - 多轮上下文
3. 避免依赖网关不支持的 `Responses conversation`
4. 将 document-agent 的工具 schema 收敛到网关兼容子集
5. 保持现有文档草稿真源、模板真源、预览链路和变更审计不变

## 下一步改造目标

下一步工作的技术目标如下：

1. 将当前文档工作台运行时稳定在：
   - `@openai/agents`
   - `useResponses: true`
   - `useResponsesWebSocket: false`
   - 本地 session / 本地消息重建

2. 系统性清理文档工具 schema 中可能继续触发兼容问题的结构：
   - `z.record(...)`
   - 网关不支持的 JSON Schema 关键字
   - 过度复杂的嵌套结构

3. 保持工具语义不变，只做 schema 兼容改造：
   - `get_document_workspace_context`
   - `set_document_customer`
   - `set_document_seller`
   - `replace_document_items`
   - `set_document_terms`
   - `set_document_pricing`
   - `apply_document_patch`
   - `price_lookup`
   - `contract_clause_picker`

4. 在真实接口上复测：
   - `/api/document-drafts/:id/assistant/stream`
   - 多轮消息连续发送
   - 至少一次真实工具调用
   - 文档预览同步更新

## 一句话结论

当前问题本质上不是“OpenAI API 不能用”，而是“网关只支持一部分 Agent/Responses 能力，document-agent 必须在这个兼容边界内落地”。  
目前已经确认新网关可支持 `responses + tools`，但仍不支持 `responses + conversation`，因此最终落地方向应是：

- `responses + tools + local session`

而不是最初那种：

- `responses + tools + upstream conversation memory`
