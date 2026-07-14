import OpenAI from 'openai';
import { Agent, run, setDefaultOpenAIClient } from '@openai/agents';
import { setDefaultModelProvider } from '@openai/agents-core';
import { OpenAIProvider } from '@openai/agents-openai';
import { getDefaultAiModelRuntimeConfig } from '../ai-models.mjs';

let openaiClient = null;
let openaiProvider = null;
let normalizedOpenAIProvider = null;
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

export function runAiAgent(agent, input, options) {
  const modelProvider = getOpenAIModelProvider();
  return run(agent, input, {
    ...(options || {}),
    modelProvider,
  });
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
  if (!normalizedOpenAIProvider) {
    normalizedOpenAIProvider = createFlyapiResponsesCompatibilityProvider(openaiProvider);
  }
  return normalizedOpenAIProvider;
}

function initializeOpenAIRuntime(config) {
  openaiClient = new OpenAI({
    apiKey: config.api_key,
    ...(config.base_url ? { baseURL: config.base_url } : {}),
  });
  setDefaultOpenAIClient(openaiClient);

  openaiProvider = new OpenAIProvider({
    openAIClient: openaiClient,
    useResponses: true,
    strictFeatureValidation: true,
    useResponsesWebSocket: false,
    cacheResponsesWebSocketModels: false,
  });

  normalizedOpenAIProvider = createFlyapiResponsesCompatibilityProvider(openaiProvider);
  runtimeConfigSignature = buildRuntimeConfigSignature(config);
  setDefaultModelProvider(normalizedOpenAIProvider);
}

function buildRuntimeConfigSignature(config) {
  return [config.id, config.updated_at, config.base_url, config.api_key, config.model].join('|');
}

function createFlyapiResponsesCompatibilityProvider(provider) {
  return {
    name: 'flyapi-responses-compatibility-provider',
    async getModel(modelName) {
      const model = await provider.getModel(modelName);
      return createFlyapiResponsesCompatibilityModel(model);
    },
    async close() {
      if (typeof provider.close === 'function') {
        await provider.close();
      }
    },
  };
}

function createFlyapiResponsesCompatibilityModel(model) {
  return {
    async getResponse(request) {
      return model.getResponse(request);
    },
    async *getStreamedResponse(request) {
      for await (const event of model.getStreamedResponse(request)) {
        yield normalizeResponsesStreamEvent(event);
      }
    },
    async getRetryAdvice(args) {
      if (typeof model.getRetryAdvice !== 'function') {
        return undefined;
      }
      return model.getRetryAdvice(args);
    },
  };
}

function normalizeResponsesStreamEvent(event) {
  if (event?.type !== 'response_done' || !Array.isArray(event.response?.output)) {
    return event;
  }

  return {
    ...event,
    response: {
      ...event.response,
      output: event.response.output.map((item) => normalizeResponseOutputItem(item)),
    },
  };
}

function normalizeResponseOutputItem(item) {
  if (item?.type !== 'message' || item.role !== 'assistant') {
    return item;
  }

  if (item.status === 'in_progress' || item.status === 'completed' || item.status === 'incomplete') {
    return item;
  }

  return {
    ...item,
    status: 'completed',
  };
}
