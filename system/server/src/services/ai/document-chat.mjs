import { appendDocumentDraftMessages, getDocumentDraftById, updateDocumentDraft } from '../document-drafts.mjs';
import { documentChatResponseSchema, normalizeDocumentDraftPayload, summarizeDocumentMissingFields } from '../document-draft-patch.mjs';
import { assertAiConfig, DEFAULT_MODEL, getOpenAIClient } from './runtime.mjs';
import { normalizeText } from './shared.mjs';
import { zodResponseFormat } from 'openai/helpers/zod';

function buildDocumentChatMessages(draft, message) {
  return [
    {
      role: 'system',
      content: [
        '你是 AI 文档工作台里的文档协作助手。',
        '你的职责是把用户消息直接转成结构化文档 patch。',
        '不要输出 HTML，不要输出 markdown，不要输出解释性前缀。',
        '如果用户提供了报价明细、客户资料、条款、编号或签署信息，必须直接写入 patch。',
        'items 必须是结构化数组，每项尽量填写 description, model, qty, unit, unitPrice, amount。',
        '所有字段都必须返回，但这是一份稀疏 patch：本轮没有修改的顶级字段必须返回 null，不要返回空字符串、空数组或空对象来清空旧数据。',
        '只有当你明确要替换某个顶级字段时，才返回该字段的新值。例如只有在用户明确提供报价明细时才返回 items 数组。',
        '如果用户是在追问问题而不是补字段，patch 的所有顶级字段都应为 null，但 assistant_message 仍必须回答。',
        '不要只写 subtotal 而漏掉 items；当用户给了明细，必须输出 items。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `文档类型: ${draft.document_type}`,
        `当前标题: ${draft.title}`,
        `当前草稿 JSON: ${JSON.stringify(draft.draft_payload)}`,
        '',
        `用户消息: ${message}`,
      ].join('\n'),
    },
  ];
}

export async function sendDocumentDraftMessage({ draftId, message }) {
  assertAiConfig();

  const draft = getDocumentDraftById(draftId);
  if (!draft) {
    const error = new Error('文档草稿不存在');
    error.statusCode = 404;
    throw error;
  }

  const normalizedMessage = normalizeText(message);
  if (!normalizedMessage) {
    const error = new Error('message 不能为空');
    error.statusCode = 400;
    throw error;
  }

  const parsed = await runStructuredDocumentCompletion({
    draft,
    message: normalizedMessage,
  });

  const assistantMessage = normalizeText(parsed.assistant_message) || '我已经更新了文档草稿。';
  const patch = parsed.patch && typeof parsed.patch === 'object' && !Array.isArray(parsed.patch) ? parsed.patch : {};
  const suggestedQuestions = Array.isArray(parsed.suggested_questions)
    ? parsed.suggested_questions.map((item) => normalizeText(item)).filter(Boolean)
    : [];

  let nextDraft = updateDocumentDraft(draft.id, {
    draft_payload: normalizeDocumentDraftPayload(mergePatch(draft.draft_payload, patch), draft.document_type),
    replace_payload: true,
  });

  const missingFields = nextDraft
    ? summarizeDocumentMissingFields(nextDraft.draft_payload, nextDraft.document_type)
    : [];

  nextDraft = appendDocumentDraftMessages(
    draft.id,
    { role: 'user', text: normalizedMessage },
    { role: 'assistant', text: assistantMessage }
  ) || nextDraft;

  return {
    assistant_message: assistantMessage,
    patch,
    missing_fields: missingFields,
    suggested_questions: suggestedQuestions,
    draft: nextDraft,
  };
}

async function runStructuredDocumentCompletion({ draft, message }) {
  const client = getOpenAIClient();
  const completion = await client.chat.completions.parse({
    model: DEFAULT_MODEL,
    messages: buildDocumentChatMessages(draft, message),
    response_format: zodResponseFormat(documentChatResponseSchema, 'document_chat_response'),
  });

  const parsed = completion.choices[0]?.message?.parsed;
  if (!parsed) {
    const error = new Error('模型未返回符合文档结构的 JSON');
    error.statusCode = 502;
    throw error;
  }

  return parsed;
}

function mergePatch(baseValue, overrideValue) {
  if (overrideValue === null || overrideValue === undefined) {
    return baseValue;
  }

  if (Array.isArray(baseValue) || Array.isArray(overrideValue)) {
    return Array.isArray(overrideValue) ? overrideValue : (Array.isArray(baseValue) ? baseValue : []);
  }

  if (!isPlainObject(baseValue) || !isPlainObject(overrideValue)) {
    return overrideValue == null ? baseValue : overrideValue;
  }

  const result = { ...baseValue };
  for (const key of Object.keys(overrideValue)) {
    result[key] = mergePatch(result[key], overrideValue[key]);
  }
  return result;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
