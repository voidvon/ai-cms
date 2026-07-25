import OpenAI from 'openai';
import { Agent, Runner, setDefaultOpenAIClient } from '@openai/agents';
import { setDefaultModelProvider } from '@openai/agents-core';
import { OpenAIProvider } from '@openai/agents-openai';
import { getDefaultAiModelRuntimeConfig } from '../ai-models.mjs';
import { createEventSourcedResponsesFetch } from './responses-event-stream.mjs';

let openaiClient = null;
let openaiProvider = null;
let openaiRunner = null;
let runtimeConfigSignature = '';

export function assertAiConfig() {
  const config = getAiRuntimeConfig();
  if (!config?.api_key) {
    const error = new Error('尚未配置可用的默认 AI 模型，请先到后台“模型管理”完成配置');
    error.statusCode = 400;
    throw error;
  }
  return config;
}

export function getAiRuntimeConfig() {
  return getDefaultAiModelRuntimeConfig();
}

export function createAiAgent(config) {
  const runtimeConfig = assertAiConfig();
  const modelSettings = config?.modelSettings || {};
  const reasoning = modelSettings.reasoning || {};

  return new Agent({
    model: runtimeConfig.model,
    ...config,
    modelSettings: {
      store: false,
      ...modelSettings,
      reasoning: {
        effort: runtimeConfig.reasoning_effort,
        ...reasoning,
      },
    },
  });
}

export async function runAiAgent(agent, input, options) {
  const runner = getOpenAIRunner();
  const shouldReturnStream = options?.stream === true;
  const streamed = await runner.run(agent, input, {
    ...(options || {}),
    stream: true,
  });

  if (shouldReturnStream) {
    return streamed;
  }

  for await (const event of streamed) {
    void event;
  }
  await streamed.completed;
  assertAiRunCompleted(streamed);
  return streamed;
}

export function assertAiRunCompleted(result) {
  if (!result?.cancelled) {
    return;
  }

  const error = new Error('AI 响应超时，请稍后重试');
  error.statusCode = 504;
  throw error;
}

export function getOpenAIClient() {
  const config = assertAiConfig();
  if (!openaiClient || runtimeConfigSignature !== buildRuntimeConfigSignature(config)) {
    initializeOpenAIRuntime(config);
  }
  return openaiClient;
}

export function getOpenAIModelProvider() {
  getOpenAIClient();
  return openaiProvider;
}

function getOpenAIRunner() {
  getOpenAIClient();
  return openaiRunner;
}

function initializeOpenAIRuntime(config) {
  openaiClient = new OpenAI({
    apiKey: config.api_key,
    ...(config.base_url ? { baseURL: config.base_url } : {}),
    fetch: createEventSourcedResponsesFetch(),
    timeout: 120_000,
  });
  setDefaultOpenAIClient(openaiClient);

  openaiProvider = new OpenAIProvider({
    openAIClient: openaiClient,
    useResponses: true,
    strictFeatureValidation: true,
    useResponsesWebSocket: false,
    cacheResponsesWebSocketModels: false,
  });
  openaiRunner = new Runner({
    modelProvider: openaiProvider,
    tracingDisabled: true,
  });

  runtimeConfigSignature = buildRuntimeConfigSignature(config);
  setDefaultModelProvider(openaiProvider);
}

function buildRuntimeConfigSignature(config) {
  return [config.id, config.updated_at, config.base_url, config.api_key, config.model].join('|');
}
