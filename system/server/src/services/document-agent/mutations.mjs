import {
  normalizeDocumentDraftPayload,
  summarizeDocumentMissingFields,
} from '../document-draft-patch.mjs';
import { getDocumentDraftById, updateDocumentDraft } from '../document-drafts.mjs';
import { upsertDocumentCompanyFromParty } from '../document-companies.mjs';
import { recordDraftMutation, syncLegacyDraftMessages } from './store.mjs';
import { assertAiServicePermission } from '../ai/query-service.mjs';

export function mergeDocumentDraftPatch(baseValue, overrideValue) {
  if (overrideValue === null || overrideValue === undefined) {
    return baseValue;
  }

  if (Array.isArray(baseValue) || Array.isArray(overrideValue)) {
    return Array.isArray(overrideValue)
      ? overrideValue
      : (Array.isArray(baseValue) ? baseValue : []);
  }

  if (!isPlainObject(baseValue) || !isPlainObject(overrideValue)) {
    return overrideValue == null ? baseValue : overrideValue;
  }

  const result = { ...baseValue };
  for (const key of Object.keys(overrideValue)) {
    result[key] = mergeDocumentDraftPatch(result[key], overrideValue[key]);
  }
  return result;
}

export function applyDocumentPatchMutation({
  draftId,
  runId,
  patch,
  summary,
  syncConversationId,
  user,
}) {
  assertAiServicePermission(user, ['write:documents']);

  const draft = getDocumentDraftById(draftId);
  if (!draft) {
    const error = new Error('文档草稿不存在');
    error.statusCode = 404;
    throw error;
  }

  const beforePayload = draft.draft_payload || {};
  const mergedPayload = mergeDocumentDraftPatch(beforePayload, patch || {});
  const normalizedPayload = normalizeDocumentDraftPayload(mergedPayload, draft.document_type);

  const nextDraft = updateDocumentDraft(draftId, {
    draft_payload: normalizedPayload,
    replace_payload: true,
  });

  if (nextDraft?.draft_payload?.seller) {
    upsertDocumentCompanyFromParty(nextDraft.draft_payload.seller, { themeId: nextDraft.theme_id });
  }
  if (nextDraft?.draft_payload?.customer) {
    upsertDocumentCompanyFromParty(nextDraft.draft_payload.customer, { themeId: nextDraft.theme_id });
  }

  recordDraftMutation({
    draftId,
    runId,
    mutationType: 'apply_document_patch',
    summary: String(summary || '更新文档草稿').trim(),
    before: beforePayload,
    after: nextDraft?.draft_payload || normalizedPayload,
  });

  if (syncConversationId) {
    syncLegacyDraftMessages(draftId, syncConversationId);
  }

  return {
    draft: nextDraft,
    missingFields: summarizeDocumentMissingFields(nextDraft?.draft_payload || normalizedPayload, draft.document_type),
  };
}

export function setDocumentPartyMutation({
  draftId,
  runId,
  role,
  party,
  summary,
  syncConversationId,
  user,
}) {
  return applyDocumentPatchMutation({
    draftId,
    runId,
    patch: { [role]: party },
    summary: summary || `更新${role === 'customer' ? '客户' : '我方公司'}信息`,
    syncConversationId,
    user,
  });
}

export function replaceDocumentItemsMutation({
  draftId,
  runId,
  items,
  pricing,
  summary,
  syncConversationId,
  user,
}) {
  const patch = {
    items,
    ...(pricing ? { pricing } : {}),
  };

  return applyDocumentPatchMutation({
    draftId,
    runId,
    patch,
    summary: summary || '更新产品明细',
    syncConversationId,
    user,
  });
}

export function setDocumentTermsMutation({
  draftId,
  runId,
  terms,
  summary,
  syncConversationId,
  user,
}) {
  return applyDocumentPatchMutation({
    draftId,
    runId,
    patch: { terms },
    summary: summary || '更新条款信息',
    syncConversationId,
    user,
  });
}

export function setDocumentPricingMutation({
  draftId,
  runId,
  pricing,
  summary,
  syncConversationId,
  user,
}) {
  return applyDocumentPatchMutation({
    draftId,
    runId,
    patch: { pricing },
    summary: summary || '更新价格信息',
    syncConversationId,
    user,
  });
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
