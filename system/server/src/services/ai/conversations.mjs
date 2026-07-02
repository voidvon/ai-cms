import { randomUUID } from 'node:crypto';
import { execute, getDb, queryAll, queryOne } from '../../db.mjs';

let schemaEnsured = false;

const DEFAULT_CAPABILITY = 'general_chat';
const MAX_CONVERSATION_LIMIT = 50;
const MAX_MESSAGE_LIMIT = 200;

export function ensureAiConversationsSchema() {
  if (schemaEnsured) {
    return;
  }

  getDb().exec(`
    CREATE TABLE IF NOT EXISTS ai_conversations (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      capability TEXT NOT NULL DEFAULT 'general_chat',
      selected_tool_names_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_updated
      ON ai_conversations(user_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS ai_conversation_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
      content_json TEXT NOT NULL DEFAULT '{}',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_ai_conversation_messages_conversation_created
      ON ai_conversation_messages(conversation_id, created_at ASC, id ASC);
  `);

  schemaEnsured = true;
}

export function listAiConversations({ user, limit = 20 } = {}) {
  ensureAiConversationsSchema();
  const userId = requireUserId(user);
  const normalizedLimit = clampInteger(limit, 1, MAX_CONVERSATION_LIMIT, 20);
  return queryAll(
    `
      SELECT
        id,
        user_id,
        title,
        capability,
        selected_tool_names_json,
        status,
        created_at,
        updated_at,
        deleted_at
      FROM ai_conversations
      WHERE user_id = ? AND deleted_at IS NULL
      ORDER BY updated_at DESC, created_at DESC
      LIMIT ?
    `,
    [userId, normalizedLimit]
  ).map(hydrateConversation);
}

export function getAiConversationById(id, { user } = {}) {
  ensureAiConversationsSchema();
  const userId = requireUserId(user);
  const row = queryOne(
    `
      SELECT
        id,
        user_id,
        title,
        capability,
        selected_tool_names_json,
        status,
        created_at,
        updated_at,
        deleted_at
      FROM ai_conversations
      WHERE id = ? AND user_id = ? AND deleted_at IS NULL
      LIMIT 1
    `,
    [String(id || '').trim(), userId]
  );
  return hydrateConversation(row);
}

export function createAiConversation(input = {}, { user } = {}) {
  ensureAiConversationsSchema();
  const userId = requireUserId(user);
  const id = normalizeConversationId(input.id) || randomUUID();
  const now = new Date().toISOString();
  const title = normalizeTitle(input.title) || '新对话';
  const capability = normalizeCapability(input.capability);
  const selectedToolNames = normalizeToolNames(input.selected_tool_names || input.selectedToolNames || input.toolNames);

  execute(
    `
      INSERT INTO ai_conversations (
        id,
        user_id,
        title,
        capability,
        selected_tool_names_json,
        status,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        capability = excluded.capability,
        selected_tool_names_json = excluded.selected_tool_names_json,
        updated_at = excluded.updated_at
    `,
    [
      id,
      userId,
      title,
      capability,
      JSON.stringify(selectedToolNames),
      now,
      now,
    ]
  );

  return getAiConversationById(id, { user });
}

export function updateAiConversation(id, updates = {}, { user } = {}) {
  ensureAiConversationsSchema();
  const existing = getAiConversationById(id, { user });
  if (!existing) {
    return null;
  }

  const title = Object.prototype.hasOwnProperty.call(updates, 'title')
    ? normalizeTitle(updates.title) || existing.title
    : existing.title;
  const capability = Object.prototype.hasOwnProperty.call(updates, 'capability')
    ? normalizeCapability(updates.capability)
    : existing.capability;
  const selectedToolNames = Object.prototype.hasOwnProperty.call(updates, 'selected_tool_names')
    || Object.prototype.hasOwnProperty.call(updates, 'selectedToolNames')
    || Object.prototype.hasOwnProperty.call(updates, 'toolNames')
    ? normalizeToolNames(updates.selected_tool_names || updates.selectedToolNames || updates.toolNames)
    : existing.selected_tool_names;
  const now = new Date().toISOString();

  execute(
    `
      UPDATE ai_conversations
      SET
        title = ?,
        capability = ?,
        selected_tool_names_json = ?,
        updated_at = ?
      WHERE id = ? AND user_id = ? AND deleted_at IS NULL
    `,
    [
      title,
      capability,
      JSON.stringify(selectedToolNames),
      now,
      existing.id,
      existing.user_id,
    ]
  );

  return getAiConversationById(id, { user });
}

export function touchAiConversation(id, { user, title, capability, selectedToolNames } = {}) {
  ensureAiConversationsSchema();
  const existing = getAiConversationById(id, { user });
  if (!existing) {
    return createAiConversation({
      id,
      title,
      capability,
      selectedToolNames,
    }, { user });
  }

  const shouldUpdateTitle = title
    && (!existing.title || existing.title === '新对话');

  return updateAiConversation(id, {
    ...(shouldUpdateTitle ? { title } : {}),
    ...(capability ? { capability } : {}),
    ...(Array.isArray(selectedToolNames) ? { selectedToolNames } : {}),
  }, { user });
}

export function deleteAiConversation(id, { user } = {}) {
  ensureAiConversationsSchema();
  const existing = getAiConversationById(id, { user });
  if (!existing) {
    return false;
  }

  execute(
    `
      UPDATE ai_conversations
      SET deleted_at = ?, updated_at = ?
      WHERE id = ? AND user_id = ?
    `,
    [new Date().toISOString(), new Date().toISOString(), existing.id, existing.user_id]
  );
  return true;
}

export function listAiConversationMessages(conversationId, { user, limit = 100 } = {}) {
  ensureAiConversationsSchema();
  const conversation = getAiConversationById(conversationId, { user });
  if (!conversation) {
    return [];
  }

  const normalizedLimit = clampInteger(limit, 1, MAX_MESSAGE_LIMIT, 100);
  return queryAll(
    `
      SELECT
        id,
        conversation_id,
        user_id,
        role,
        content_json,
        metadata_json,
        created_at
      FROM ai_conversation_messages
      WHERE conversation_id = ? AND user_id = ?
      ORDER BY created_at ASC, id ASC
      LIMIT ?
    `,
    [conversation.id, conversation.user_id, normalizedLimit]
  ).map(hydrateMessage);
}

export function appendAiConversationMessage(conversationId, message = {}, { user } = {}) {
  ensureAiConversationsSchema();
  const userId = requireUserId(user);
  const conversation = getAiConversationById(conversationId, { user })
    || createAiConversation({ id: conversationId }, { user });
  const role = normalizeRole(message.role);
  const content = normalizeJsonObject(message.content);
  const metadata = normalizeJsonObject(message.metadata);
  const now = new Date().toISOString();

  execute(
    `
      INSERT INTO ai_conversation_messages (
        conversation_id,
        user_id,
        role,
        content_json,
        metadata_json,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    [
      conversation.id,
      userId,
      role,
      JSON.stringify(content),
      JSON.stringify(metadata),
      now,
    ]
  );

  const text = String(content.text || '').trim();
  const shouldUpdateTitle = role === 'user'
    && text
    && (!conversation.title || conversation.title === '新对话');

  updateAiConversation(conversation.id, {
    title: shouldUpdateTitle ? text.slice(0, 24) : conversation.title,
    selectedToolNames: metadata.toolNames || conversation.selected_tool_names,
    capability: metadata.capability || conversation.capability,
  }, { user });

  return listAiConversationMessages(conversation.id, { user }).at(-1) || null;
}

export function replaceAiConversationMessages(conversationId, messages = [], { user } = {}) {
  ensureAiConversationsSchema();
  const conversation = touchAiConversation(conversationId, { user });
  execute(
    'DELETE FROM ai_conversation_messages WHERE conversation_id = ? AND user_id = ?',
    [conversation.id, conversation.user_id]
  );

  for (const message of Array.isArray(messages) ? messages : []) {
    appendAiConversationMessage(conversation.id, message, { user });
  }

  return listAiConversationMessages(conversation.id, { user });
}

function hydrateConversation(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    selected_tool_names_json: String(row.selected_tool_names_json || '[]'),
    selected_tool_names: normalizeToolNames(safeParseJson(row.selected_tool_names_json, [])),
  };
}

function hydrateMessage(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    conversation_id: row.conversation_id,
    user_id: row.user_id,
    role: row.role,
    content_json: String(row.content_json || '{}'),
    metadata_json: String(row.metadata_json || '{}'),
    content: normalizeJsonObject(safeParseJson(row.content_json, {})),
    metadata: normalizeJsonObject(safeParseJson(row.metadata_json, {})),
    created_at: row.created_at,
  };
}

function requireUserId(user) {
  const userId = Number.parseInt(String(user?.id || user?.admin_id || ''), 10);
  if (!Number.isFinite(userId) || userId <= 0) {
    const error = new Error('需要登录才能访问 AI 会话');
    error.statusCode = 401;
    throw error;
  }
  return userId;
}

function normalizeConversationId(value) {
  return String(value || '').trim();
}

function normalizeTitle(value) {
  return String(value || '').trim().slice(0, 120);
}

function normalizeCapability(value) {
  return String(value || DEFAULT_CAPABILITY).trim() || DEFAULT_CAPABILITY;
}

function normalizeToolNames(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(new Set(
    value
      .map((item) => String(item || '').trim())
      .filter(Boolean)
  ));
}

function normalizeRole(value) {
  const normalized = String(value || '').trim();
  return ['user', 'assistant', 'system', 'tool'].includes(normalized) ? normalized : 'user';
}

function normalizeJsonObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function safeParseJson(value, fallback) {
  try {
    return JSON.parse(String(value || ''));
  } catch {
    return fallback;
  }
}

function clampInteger(value, min, max, fallback) {
  const number = Number.parseInt(String(value), 10);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, number));
}
