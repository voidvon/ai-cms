import OpenAI from 'openai';
import { Agent, Runner, tool } from '@openai/agents';
import { OpenAIProvider } from '@openai/agents-openai';
import { z } from 'zod';
import { execute, getDb, queryAll, queryOne } from '../db.mjs';
import { createResponsesWireFetch } from './ai/responses-wire-adapter.mjs';

const PROVIDER_OPENAI_RESPONSES = 'openai_responses';
const REASONING_EFFORTS = new Set(['low', 'medium', 'high']);

let schemaEnsured = false;

export function ensureAiModelsSchema() {
  if (schemaEnsured) {
    return;
  }

  getDb().exec(`
    CREATE TABLE IF NOT EXISTS ai_models (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT '${PROVIDER_OPENAI_RESPONSES}',
      base_url TEXT NOT NULL DEFAULT '',
      api_key TEXT NOT NULL,
      model TEXT NOT NULL,
      image_model TEXT NOT NULL DEFAULT '',
      reasoning_effort TEXT NOT NULL DEFAULT 'medium',
      responses_verified_at TEXT,
      responses_verification_error TEXT NOT NULL DEFAULT '',
      is_enabled INTEGER NOT NULL DEFAULT 1,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_models_default
    ON ai_models(is_default)
    WHERE is_default = 1;
  `);
  addAiModelsColumnIfMissing('responses_verified_at', 'TEXT');
  addAiModelsColumnIfMissing('responses_verification_error', "TEXT NOT NULL DEFAULT ''");
  execute(
    "UPDATE ai_models SET provider = ? WHERE provider = 'openai_compatible'",
    [PROVIDER_OPENAI_RESPONSES]
  );

  schemaEnsured = true;
}

export function listAiModels() {
  ensureAiModelsSchema();
  return queryAll(`
    SELECT *
    FROM ai_models
    ORDER BY is_default DESC, is_enabled DESC, id ASC
  `).map(toPublicAiModel);
}

export function getAiModelById(id) {
  ensureAiModelsSchema();
  const row = queryOne('SELECT * FROM ai_models WHERE id = ?', [normalizeId(id)]);
  return row ? toPublicAiModel(row) : null;
}

export function getDefaultAiModelRuntimeConfig() {
  ensureAiModelsSchema();
  const row = queryOne(`
    SELECT *
    FROM ai_models
    WHERE is_default = 1 AND is_enabled = 1
    LIMIT 1
  `);

  return row ? toRuntimeAiModel(row) : null;
}

export function createAiModel(input) {
  ensureAiModelsSchema();
  const payload = normalizeAiModelInput(input, { isCreate: true });
  const existingCount = Number(queryOne('SELECT COUNT(*) AS total FROM ai_models')?.total || 0);
  const shouldBeDefault = payload.is_default || existingCount === 0;
  const now = new Date().toISOString();
  let result;

  getDb().exec('BEGIN');
  try {
    if (shouldBeDefault) {
      execute('UPDATE ai_models SET is_default = 0, updated_at = ?', [now]);
    }

    result = execute(`
      INSERT INTO ai_models (
        name,
        provider,
        base_url,
        api_key,
        model,
        image_model,
        reasoning_effort,
        is_enabled,
        is_default,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      payload.name,
      payload.provider,
      payload.base_url,
      payload.api_key,
      payload.model,
      payload.image_model,
      payload.reasoning_effort,
      shouldBeDefault ? 1 : payload.is_enabled,
      shouldBeDefault ? 1 : 0,
      now,
      now,
    ]);
    getDb().exec('COMMIT');
  } catch (error) {
    getDb().exec('ROLLBACK');
    throw error;
  }

  return getAiModelById(result.lastInsertRowid);
}

export function updateAiModel(id, input) {
  ensureAiModelsSchema();
  const normalizedId = normalizeId(id);
  const existing = queryOne('SELECT * FROM ai_models WHERE id = ?', [normalizedId]);
  if (!existing) {
    return null;
  }

  const payload = normalizeAiModelInput({ ...existing, ...input }, {
    isCreate: false,
    existingApiKey: existing.api_key,
  });
  const shouldBeDefault = Boolean(input?.is_default) || Number(existing.is_default || 0) === 1;
  if (shouldBeDefault && !payload.is_enabled) {
    throw new Error('默认模型不能停用');
  }

  const now = new Date().toISOString();
  const connectionChanged = existing.base_url !== payload.base_url
    || existing.model !== payload.model
    || Boolean(String(input?.api_key || '').trim() && existing.api_key !== payload.api_key);
  const responsesVerifiedAt = connectionChanged ? null : existing.responses_verified_at;
  const responsesVerificationError = connectionChanged ? '' : existing.responses_verification_error;
  getDb().exec('BEGIN');
  try {
    if (Boolean(input?.is_default)) {
      execute('UPDATE ai_models SET is_default = 0, updated_at = ? WHERE id <> ?', [now, normalizedId]);
    }

    execute(`
      UPDATE ai_models
      SET
        name = ?,
        provider = ?,
        base_url = ?,
        api_key = ?,
        model = ?,
        image_model = ?,
        reasoning_effort = ?,
        responses_verified_at = ?,
        responses_verification_error = ?,
        is_enabled = ?,
        is_default = ?,
        updated_at = ?
      WHERE id = ?
    `, [
      payload.name,
      payload.provider,
      payload.base_url,
      payload.api_key,
      payload.model,
      payload.image_model,
      payload.reasoning_effort,
      responsesVerifiedAt,
      responsesVerificationError,
      payload.is_enabled,
      shouldBeDefault ? 1 : 0,
      now,
      normalizedId,
    ]);
    getDb().exec('COMMIT');
  } catch (error) {
    getDb().exec('ROLLBACK');
    throw error;
  }

  return getAiModelById(normalizedId);
}

export function setDefaultAiModel(id) {
  ensureAiModelsSchema();
  const normalizedId = normalizeId(id);
  const existing = queryOne('SELECT * FROM ai_models WHERE id = ?', [normalizedId]);
  if (!existing) {
    return null;
  }
  if (Number(existing.is_enabled || 0) !== 1) {
    throw new Error('请先启用该模型，再设为默认模型');
  }
  const now = new Date().toISOString();
  getDb().exec('BEGIN');
  try {
    execute('UPDATE ai_models SET is_default = 0, updated_at = ?', [now]);
    execute('UPDATE ai_models SET is_default = 1, updated_at = ? WHERE id = ?', [now, normalizedId]);
    getDb().exec('COMMIT');
  } catch (error) {
    getDb().exec('ROLLBACK');
    throw error;
  }

  return getAiModelById(normalizedId);
}

export function deleteAiModel(id) {
  ensureAiModelsSchema();
  const normalizedId = normalizeId(id);
  const existing = queryOne('SELECT * FROM ai_models WHERE id = ?', [normalizedId]);
  if (!existing) {
    return null;
  }
  if (Number(existing.is_default || 0) === 1) {
    throw new Error('默认模型不能删除，请先设置另一个默认模型');
  }

  execute('DELETE FROM ai_models WHERE id = ?', [normalizedId]);
  return toPublicAiModel(existing);
}

export async function testAiModelConnection(id) {
  ensureAiModelsSchema();
  const row = queryOne('SELECT * FROM ai_models WHERE id = ?', [normalizeId(id)]);
  if (!row) {
    return null;
  }

  const config = toRuntimeAiModel(row);
  const client = createOpenAIClient(config);
  const provider = new OpenAIProvider({
    openAIClient: client,
    useResponses: true,
    strictFeatureValidation: true,
    useResponsesWebSocket: false,
    cacheResponsesWebSocketModels: false,
  });
  const startedAt = Date.now();
  let toolCalled = false;

  const protocolProbe = tool({
    name: 'responses_protocol_probe',
    description: '验证 Responses API 的函数调用和函数结果回传能力。',
    parameters: z.object({
      value: z.string(),
    }),
    async execute(input) {
      toolCalled = true;
      return { ok: input.value === 'ok' };
    },
  });

  const agent = new Agent({
    name: 'Responses Protocol Probe',
    model: config.model,
    instructions: [
      'Call responses_protocol_probe exactly once with {"value":"ok"}.',
      'After the tool result, reply with exactly OK.',
    ].join('\n'),
    tools: [protocolProbe],
    modelSettings: {
      store: false,
      reasoning: {
        effort: config.reasoning_effort,
      },
    },
  });
  const runner = new Runner({
    modelProvider: provider,
    tracingDisabled: true,
  });

  try {
    const streamed = await runner.run(agent, 'Run the Responses API protocol probe now.', {
      stream: true,
      maxTurns: 3,
    });
    for await (const event of streamed) {
      void event;
    }
    await streamed.completed;

    if (!toolCalled) {
      throw new Error('模型没有完成标准函数工具调用');
    }

    const verifiedAt = new Date().toISOString();
    execute(`
      UPDATE ai_models
      SET responses_verified_at = ?, responses_verification_error = '', updated_at = ?
      WHERE id = ?
    `, [verifiedAt, verifiedAt, normalizeId(id)]);

    return {
      ok: true,
      model: config.model,
      protocol: 'responses',
      streaming: true,
      tool_call: true,
      verified_at: verifiedAt,
      duration_ms: Date.now() - startedAt,
    };
  } catch (error) {
    const message = `Responses 协议验证失败：${getErrorMessage(error)}`;
    execute(`
      UPDATE ai_models
      SET responses_verified_at = NULL, responses_verification_error = ?, updated_at = ?
      WHERE id = ?
    `, [message.slice(0, 4000), new Date().toISOString(), normalizeId(id)]);
    throw new Error(message, { cause: error });
  } finally {
    await provider.close();
  }
}

export function createOpenAIClient(config) {
  return new OpenAI({
    apiKey: config.api_key,
    ...(config.base_url ? { baseURL: config.base_url } : {}),
    fetch: createResponsesWireFetch(),
  });
}

function normalizeAiModelInput(input, options = {}) {
  const name = String(input?.name || '').trim();
  const provider = String(input?.provider || PROVIDER_OPENAI_RESPONSES).trim().toLowerCase();
  const baseUrl = normalizeBaseUrl(input?.base_url);
  const model = String(input?.model || '').trim();
  const imageModel = String(input?.image_model || '').trim();
  const submittedApiKey = String(input?.api_key || '').trim();
  const apiKey = submittedApiKey || String(options.existingApiKey || '').trim();
  const reasoningEffort = String(input?.reasoning_effort || 'medium').trim().toLowerCase();

  if (!name) {
    throw new Error('请输入配置名称');
  }
  if (provider !== PROVIDER_OPENAI_RESPONSES) {
    throw new Error('当前仅支持 OpenAI Responses API 兼容接口');
  }
  if (!model) {
    throw new Error('请输入模型名称');
  }
  if (!apiKey) {
    throw new Error(options.isCreate ? '请输入 API Key' : 'API Key 不能为空');
  }
  if (!REASONING_EFFORTS.has(reasoningEffort)) {
    throw new Error('思考程度只支持 low、medium、high');
  }

  return {
    name,
    provider,
    base_url: baseUrl,
    api_key: apiKey,
    model,
    image_model: imageModel,
    reasoning_effort: reasoningEffort,
    is_enabled: input?.is_enabled === false || Number(input?.is_enabled) === 0 ? 0 : 1,
    is_default: input?.is_default === true || Number(input?.is_default) === 1,
  };
}

function normalizeBaseUrl(value) {
  const normalized = String(value || '').trim().replace(/\/+$/g, '');
  if (!normalized) {
    return '';
  }

  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error('Base URL 必须是有效的 http/https 地址');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Base URL 只支持 http/https 地址');
  }
  return normalized;
}

function toPublicAiModel(row) {
  return {
    id: Number(row.id),
    name: row.name,
    provider: row.provider,
    base_url: row.base_url || '',
    model: row.model,
    image_model: row.image_model || '',
    reasoning_effort: row.reasoning_effort,
    responses_verified_at: row.responses_verified_at || '',
    responses_verification_error: row.responses_verification_error || '',
    is_enabled: Number(row.is_enabled || 0),
    is_default: Number(row.is_default || 0),
    has_api_key: Boolean(row.api_key),
    masked_api_key: maskApiKey(row.api_key),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function toRuntimeAiModel(row) {
  return {
    ...toPublicAiModel(row),
    api_key: row.api_key,
  };
}

function maskApiKey(value) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return '';
  }
  if (normalized.length <= 8) {
    return '********';
  }
  return `${normalized.slice(0, 3)}********${normalized.slice(-4)}`;
}

function normalizeId(value) {
  const id = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error('模型配置 ID 无效');
  }
  return id;
}

function getErrorMessage(error) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error || '未知错误');
}

function addAiModelsColumnIfMissing(columnName, definition) {
  const columns = queryAll('PRAGMA table_info(ai_models)');
  if (columns.some((column) => column.name === columnName)) {
    return;
  }
  getDb().exec(`ALTER TABLE ai_models ADD COLUMN ${columnName} ${definition}`);
}
