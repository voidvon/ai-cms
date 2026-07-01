import OpenAI from 'openai';
import { Agent, run, setDefaultOpenAIClient } from '@openai/agents';
import { setDefaultModelProvider } from '@openai/agents-core';
import { OpenAIProvider } from '@openai/agents-openai';
import { normalizeText } from './shared.mjs';

export const DEFAULT_MODEL =
  normalizeText(process.env.OPENAI_AI_MODEL) ||
  normalizeText(process.env.OPENAI_DEFAULT_MODEL) ||
  normalizeText(process.env.OPENAI_CONTRACT_MODEL) ||
  'gpt-5';

const OPENAI_BASE_URL = normalizeText(process.env.OPENAI_BASE_URL);
let openaiClient = null;
let openaiProvider = null;
let normalizedOpenAIProvider = null;

if (normalizeText(process.env.OPENAI_API_KEY)) {
  openaiClient = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || 'missing-key',
    ...(OPENAI_BASE_URL ? { baseURL: OPENAI_BASE_URL } : {}),
  });
}

if (openaiClient) {
  setDefaultOpenAIClient(openaiClient);
  openaiProvider = new OpenAIProvider({
    openAIClient: openaiClient,
    useResponses: true,
    strictFeatureValidation: true,
    useResponsesWebSocket: false,
    cacheResponsesWebSocketModels: false,
  });
  normalizedOpenAIProvider = createFlyapiResponsesCompatibilityProvider(openaiProvider);
  setDefaultModelProvider(normalizedOpenAIProvider);
}

export function assertAiConfig() {
  if (!normalizeText(process.env.OPENAI_API_KEY)) {
    const error = new Error('缺少 OPENAI_API_KEY，无法调用 OpenAI Agents SDK');
    error.statusCode = 400;
    throw error;
  }
}

export function createAiAgent(config) {
  return new Agent({
    model: DEFAULT_MODEL,
    ...config,
    modelSettings: {
      store: false,
      ...(config?.modelSettings || {}),
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
  assertAiConfig();
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || 'missing-key',
      ...(OPENAI_BASE_URL ? { baseURL: OPENAI_BASE_URL } : {}),
    });
    setDefaultOpenAIClient(openaiClient);
    openaiProvider = new OpenAIProvider({
      openAIClient: openaiClient,
      useResponses: true,
      strictFeatureValidation: true,
      useResponsesWebSocket: false,
      cacheResponsesWebSocketModels: false,
    });
    normalizedOpenAIProvider = null;
    normalizedOpenAIProvider = createFlyapiResponsesCompatibilityProvider(openaiProvider);
    setDefaultModelProvider(normalizedOpenAIProvider);
  }
  return openaiClient;
}

export function getOpenAIModelProvider() {
  assertAiConfig();
  if (!openaiProvider) {
    getOpenAIClient();
  }
  if (!normalizedOpenAIProvider) {
    normalizedOpenAIProvider = createFlyapiResponsesCompatibilityProvider(openaiProvider);
  }
  return normalizedOpenAIProvider;
}

export function getAiRuntimeDebug() {
  return {
    defaultModel: DEFAULT_MODEL,
    openaiApiKeyPresent: Boolean(normalizeText(process.env.OPENAI_API_KEY)),
    openaiBaseUrl: normalizeText(process.env.OPENAI_BASE_URL),
    openaiAiModel: normalizeText(process.env.OPENAI_AI_MODEL),
    openaiDefaultModel: normalizeText(process.env.OPENAI_DEFAULT_MODEL),
    openaiContractModel: normalizeText(process.env.OPENAI_CONTRACT_MODEL),
    providerConstructor: openaiProvider?.constructor?.name || '',
    providerUsesResponses: true,
    providerUsesResponsesWebSocket: false,
    providerApiMode: 'responses',
    providerConversationMemory: 'local_session',
    pid: process.pid,
  };
}

function createFlyapiResponsesCompatibilityProvider(provider) {
  return {
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
