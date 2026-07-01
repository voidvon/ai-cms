import { getDocumentDraftById } from '../document-drafts.mjs';
import { summarizeDocumentMissingFields } from '../document-draft-patch.mjs';
import { getDocumentTemplateById } from '../document-templates.mjs';
import {
  getConversationMessages,
  getOrCreateDocumentConversation,
} from './store.mjs';

export function buildDocumentAgentContext(draftId) {
  const draft = getDocumentDraftById(draftId);
  if (!draft) {
    const error = new Error('文档草稿不存在');
    error.statusCode = 404;
    throw error;
  }

  const conversation = getOrCreateDocumentConversation(draftId);
  const template = getDocumentTemplateById(draft.document_template_id, { themeId: draft.theme_id });
  const missingFields = summarizeDocumentMissingFields(draft.draft_payload, draft.document_type);
  const messages = getConversationMessages(conversation.id);

  return {
    draft,
    template,
    conversation,
    messages,
    missingFields,
  };
}
