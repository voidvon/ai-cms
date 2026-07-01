import { randomUUID } from 'node:crypto';
import { execute, getDb, queryAll, queryOne } from '../../db.mjs';
import { getDocumentDraftById, updateDocumentDraft } from '../document-drafts.mjs';

let schemaEnsured = false;

export function ensureDocumentAgentSchema() {
  if (schemaEnsured) {
    return;
  }

  getDb().exec(`
    CREATE TABLE IF NOT EXISTS document_draft_conversations (
      id TEXT PRIMARY KEY,
      draft_id TEXT NOT NULL,
      theme_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      agent_key TEXT NOT NULL DEFAULT 'document_workspace_agent',
      session_key TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (draft_id) REFERENCES document_drafts(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_document_draft_conversations_draft
      ON document_draft_conversations(draft_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS document_draft_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      draft_id TEXT NOT NULL,
      role TEXT NOT NULL,
      message_type TEXT NOT NULL DEFAULT 'text',
      content_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conversation_id) REFERENCES document_draft_conversations(id) ON DELETE CASCADE,
      FOREIGN KEY (draft_id) REFERENCES document_drafts(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_document_draft_messages_conversation
      ON document_draft_messages(conversation_id, created_at ASC, id ASC);

    CREATE TABLE IF NOT EXISTS document_draft_runs (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      draft_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      model TEXT,
      user_message_id TEXT,
      assistant_message_id TEXT,
      started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conversation_id) REFERENCES document_draft_conversations(id) ON DELETE CASCADE,
      FOREIGN KEY (draft_id) REFERENCES document_drafts(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_document_draft_runs_conversation
      ON document_draft_runs(conversation_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS document_draft_tool_calls (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      draft_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      input_json TEXT NOT NULL DEFAULT '{}',
      output_json TEXT,
      error_message TEXT,
      started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (run_id) REFERENCES document_draft_runs(id) ON DELETE CASCADE,
      FOREIGN KEY (draft_id) REFERENCES document_drafts(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_document_draft_tool_calls_run
      ON document_draft_tool_calls(run_id, created_at ASC);

    CREATE TABLE IF NOT EXISTS document_draft_mutations (
      id TEXT PRIMARY KEY,
      draft_id TEXT NOT NULL,
      run_id TEXT,
      mutation_type TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      before_json TEXT NOT NULL DEFAULT '{}',
      after_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (draft_id) REFERENCES document_drafts(id) ON DELETE CASCADE,
      FOREIGN KEY (run_id) REFERENCES document_draft_runs(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_document_draft_mutations_draft
      ON document_draft_mutations(draft_id, created_at DESC);
  `);

  schemaEnsured = true;
}

export function getOrCreateDocumentConversation(draftId) {
  ensureDocumentAgentSchema();
  const draft = getDocumentDraftById(draftId);
  if (!draft) {
    const error = new Error('文档草稿不存在');
    error.statusCode = 404;
    throw error;
  }

  const existing = queryOne(
    `
      SELECT *
      FROM document_draft_conversations
      WHERE draft_id = ? AND status = 'active'
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
    `,
    [draftId]
  );

  if (existing) {
    return hydrateConversation(existing);
  }

  const id = randomUUID();
  const now = new Date().toISOString();
  execute(
    `
      INSERT INTO document_draft_conversations (
        id,
        draft_id,
        theme_id,
        status,
        agent_key,
        session_key,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, 'active', 'document_workspace_agent', ?, ?, ?)
    `,
    [id, draftId, draft.theme_id, `document-draft:${draftId}`, now, now]
  );

  return getDocumentConversationById(id);
}

export function getDocumentConversationById(id) {
  ensureDocumentAgentSchema();
  return hydrateConversation(queryOne(
    `
      SELECT *
      FROM document_draft_conversations
      WHERE id = ?
      LIMIT 1
    `,
    [id]
  ));
}

export function appendDocumentConversationMessage({
  conversationId,
  draftId,
  role,
  messageType = 'text',
  content = {},
  createdAt,
}) {
  ensureDocumentAgentSchema();
  const id = randomUUID();
  const timestamp = createdAt || new Date().toISOString();
  execute(
    `
      INSERT INTO document_draft_messages (
        id,
        conversation_id,
        draft_id,
        role,
        message_type,
        content_json,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [id, conversationId, draftId, role, messageType, JSON.stringify(content || {}), timestamp]
  );
  touchConversation(conversationId, timestamp);
  return getDocumentConversationMessageById(id);
}

export function getConversationMessages(conversationId) {
  ensureDocumentAgentSchema();
  return queryAll(
    `
      SELECT *
      FROM document_draft_messages
      WHERE conversation_id = ?
      ORDER BY created_at ASC, id ASC
    `,
    [conversationId]
  ).map(hydrateMessage);
}

export function createDocumentRun({
  conversationId,
  draftId,
  model,
  userMessageId,
}) {
  ensureDocumentAgentSchema();
  const id = randomUUID();
  const now = new Date().toISOString();
  execute(
    `
      INSERT INTO document_draft_runs (
        id,
        conversation_id,
        draft_id,
        status,
        model,
        user_message_id,
        started_at,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, 'running', ?, ?, ?, ?, ?)
    `,
    [id, conversationId, draftId, model || '', userMessageId || null, now, now, now]
  );
  touchConversation(conversationId, now);
  return getDocumentRunById(id);
}

export function completeDocumentRun(runId, updates = {}) {
  ensureDocumentAgentSchema();
  const existing = getDocumentRunById(runId);
  if (!existing) {
    return null;
  }
  const now = new Date().toISOString();
  execute(
    `
      UPDATE document_draft_runs
      SET
        status = ?,
        assistant_message_id = ?,
        completed_at = ?,
        error_message = ?,
        updated_at = ?
      WHERE id = ?
    `,
    [
      updates.status || 'completed',
      updates.assistantMessageId || existing.assistant_message_id || null,
      updates.completedAt || now,
      updates.errorMessage || null,
      now,
      runId,
    ]
  );
  touchConversation(existing.conversation_id, now);
  return getDocumentRunById(runId);
}

export function failDocumentRun(runId, errorMessage) {
  return completeDocumentRun(runId, {
    status: 'failed',
    errorMessage,
  });
}

export function createToolCallRecord({
  runId,
  draftId,
  toolName,
  input,
  startedAt,
}) {
  ensureDocumentAgentSchema();
  const id = randomUUID();
  const now = startedAt || new Date().toISOString();
  execute(
    `
      INSERT INTO document_draft_tool_calls (
        id,
        run_id,
        draft_id,
        tool_name,
        status,
        input_json,
        started_at,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, 'running', ?, ?, ?, ?)
    `,
    [id, runId, draftId, toolName, JSON.stringify(input || {}), now, now, now]
  );
  return getToolCallRecordById(id);
}

export function finishToolCallRecord(toolCallId, updates = {}) {
  ensureDocumentAgentSchema();
  const existing = getToolCallRecordById(toolCallId);
  if (!existing) {
    return null;
  }
  const now = new Date().toISOString();
  execute(
    `
      UPDATE document_draft_tool_calls
      SET
        status = ?,
        output_json = ?,
        error_message = ?,
        completed_at = ?,
        updated_at = ?
      WHERE id = ?
    `,
    [
      updates.status || 'completed',
      updates.output ? JSON.stringify(updates.output) : existing.output_json,
      updates.errorMessage || null,
      updates.completedAt || now,
      now,
      toolCallId,
    ]
  );
  return getToolCallRecordById(toolCallId);
}

export function recordDraftMutation({
  draftId,
  runId,
  mutationType,
  summary,
  before,
  after,
}) {
  ensureDocumentAgentSchema();
  const id = randomUUID();
  execute(
    `
      INSERT INTO document_draft_mutations (
        id,
        draft_id,
        run_id,
        mutation_type,
        summary,
        before_json,
        after_json,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      id,
      draftId,
      runId || null,
      mutationType,
      String(summary || '').trim(),
      JSON.stringify(before || {}),
      JSON.stringify(after || {}),
      new Date().toISOString(),
    ]
  );
  return getDraftMutationById(id);
}

export function syncLegacyDraftMessages(draftId, conversationId) {
  const messages = getConversationMessages(conversationId)
    .filter((entry) => entry.role === 'user' || entry.role === 'assistant')
    .map((entry) => ({
      role: entry.role,
      text: String(entry.content?.text || '').trim(),
      created_at: entry.created_at,
    }))
    .filter((entry) => entry.text);

  return updateDocumentDraft(draftId, {
    messages,
  });
}

export function getDocumentRunById(id) {
  ensureDocumentAgentSchema();
  return hydrateRun(queryOne(
    `
      SELECT *
      FROM document_draft_runs
      WHERE id = ?
      LIMIT 1
    `,
    [id]
  ));
}

export function getToolCallRecordById(id) {
  ensureDocumentAgentSchema();
  return hydrateToolCall(queryOne(
    `
      SELECT *
      FROM document_draft_tool_calls
      WHERE id = ?
      LIMIT 1
    `,
    [id]
  ));
}

export function getDraftMutationById(id) {
  ensureDocumentAgentSchema();
  return hydrateMutation(queryOne(
    `
      SELECT *
      FROM document_draft_mutations
      WHERE id = ?
      LIMIT 1
    `,
    [id]
  ));
}

function getDocumentConversationMessageById(id) {
  ensureDocumentAgentSchema();
  return hydrateMessage(queryOne(
    `
      SELECT *
      FROM document_draft_messages
      WHERE id = ?
      LIMIT 1
    `,
    [id]
  ));
}

function touchConversation(conversationId, timestamp) {
  execute(
    `
      UPDATE document_draft_conversations
      SET updated_at = ?
      WHERE id = ?
    `,
    [timestamp || new Date().toISOString(), conversationId]
  );
}

function hydrateConversation(row) {
  if (!row) {
    return null;
  }
  return {
    ...row,
    messages: getConversationMessages(row.id),
  };
}

function hydrateMessage(row) {
  if (!row) {
    return null;
  }
  return {
    ...row,
    content_json: String(row.content_json || '{}'),
    content: safeParse(row.content_json, {}),
  };
}

function hydrateRun(row) {
  if (!row) {
    return null;
  }
  return { ...row };
}

function hydrateToolCall(row) {
  if (!row) {
    return null;
  }
  return {
    ...row,
    input_json: String(row.input_json || '{}'),
    output_json: row.output_json == null ? null : String(row.output_json),
    input: safeParse(row.input_json, {}),
    output: safeParse(row.output_json, null),
  };
}

function hydrateMutation(row) {
  if (!row) {
    return null;
  }
  return {
    ...row,
    before_json: String(row.before_json || '{}'),
    after_json: String(row.after_json || '{}'),
    before: safeParse(row.before_json, {}),
    after: safeParse(row.after_json, {}),
  };
}

function safeParse(value, fallback) {
  if (!value) {
    return fallback;
  }
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}
