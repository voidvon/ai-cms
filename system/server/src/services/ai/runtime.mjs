import OpenAI from 'openai';
import { Agent, run, setDefaultOpenAIClient } from '@openai/agents';
import { normalizeText } from './shared.mjs';

export const DEFAULT_MODEL =
  normalizeText(process.env.OPENAI_AI_MODEL) ||
  normalizeText(process.env.OPENAI_DEFAULT_MODEL) ||
  normalizeText(process.env.OPENAI_CONTRACT_MODEL) ||
  'gpt-5';

const OPENAI_BASE_URL = normalizeText(process.env.OPENAI_BASE_URL);

if (OPENAI_BASE_URL) {
  setDefaultOpenAIClient(
    new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || 'missing-key',
      baseURL: OPENAI_BASE_URL,
    })
  );
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
  return run(agent, input, options);
}
