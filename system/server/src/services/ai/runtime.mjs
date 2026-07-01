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
    useResponses: false,
    strictFeatureValidation: true,
    useResponsesWebSocket: false,
    cacheResponsesWebSocketModels: false,
  });
  setDefaultModelProvider(openaiProvider);
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
      useResponses: false,
      strictFeatureValidation: true,
      useResponsesWebSocket: false,
      cacheResponsesWebSocketModels: false,
    });
    setDefaultModelProvider(openaiProvider);
  }
  return openaiClient;
}

export function getOpenAIModelProvider() {
  assertAiConfig();
  if (!openaiProvider) {
    getOpenAIClient();
  }
  return openaiProvider;
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
    providerUsesResponses: false,
    providerUsesResponsesWebSocket: false,
    providerApiMode: 'chat_completions',
    providerConversationMemory: 'local_session',
    pid: process.pid,
  };
}
