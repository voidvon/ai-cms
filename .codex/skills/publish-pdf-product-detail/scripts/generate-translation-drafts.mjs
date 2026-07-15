#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import OpenAI from 'openai';
import * as parse5 from 'parse5';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '../../../..');
process.chdir(PROJECT_ROOT);

const { queryAll } = await import('../../../../system/server/src/db.mjs');
const { getContentItemById } = await import('../../../../system/server/src/services/content-items.mjs');

const BLOCK_TAGS = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'dt', 'dd', 'td', 'th',
  'caption', 'figcaption', 'summary', 'blockquote',
]);
const SKIP_TAGS = new Set(['script', 'style', 'noscript', 'code', 'pre', 'svg', 'math']);
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const TRANSLATABLE_ATTRIBUTES = new Set(['alt', 'title', 'aria-label']);
const PROTECTED_TOKEN_RE = /\b(?:IM|TI|TIS|SB|SP|GP)-[A-Z0-9]+(?:-[A-Z0-9]+){1,5}\b|\b(?=[A-Z0-9.-]*[A-Z])(?=[A-Z0-9.-]*\d)[A-Z]{1,6}\d[A-Z0-9.-]{0,14}\b|[-+]?\d+(?:[.,]\d+)?/gi;
const PLACEHOLDER_RE = /⟦HTML_\d{4}⟧/g;

function usage() {
  console.log(`用法:
  node generate-translation-drafts.mjs --product-id <ID>
    [--language <语言代码> ...] [--output-dir <目录>]
    [--batch-size 100] [--concurrency 2] [--prepare-only]

默认读取全部启用语言（排除 en），直接从产品 en 母版生成可审计 JSON 草稿。
草稿不会写数据库；完成本地关键词、SEO 和内链验收后再通过内容服务统一写入。`);
}

function fail(message) {
  throw new Error(message);
}

function requiredValue(value, flag) {
  if (!value || value.startsWith('--')) fail(`${flag} 缺少参数值`);
  return value;
}

function positiveInt(value, flag, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(requiredValue(value, flag), 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > maximum) {
    fail(`${flag} 必须是 1-${maximum} 的整数`);
  }
  return parsed;
}

function parseArgs(argv) {
  const output = {
    languages: [],
    outputDir: '',
    batchSize: 100,
    concurrency: 2,
    prepareOnly: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') output.help = true;
    else if (token === '--prepare-only') output.prepareOnly = true;
    else if (token === '--product-id') output.productId = positiveInt(argv[++index], token);
    else if (token === '--language') output.languages.push(requiredValue(argv[++index], token));
    else if (token === '--output-dir') output.outputDir = requiredValue(argv[++index], token);
    else if (token === '--batch-size') output.batchSize = positiveInt(argv[++index], token, 200);
    else if (token === '--concurrency') output.concurrency = positiveInt(argv[++index], token, 4);
    else fail(`未知参数: ${token}`);
  }
  if (!output.help && !output.productId) fail('必须提供 --product-id');
  return output;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function splitBoundaryWhitespace(value) {
  const prefix = value.match(/^\s*/)?.[0] || '';
  const suffix = value.match(/\s*$/)?.[0] || '';
  const end = suffix ? value.length - suffix.length : value.length;
  return { prefix, core: value.slice(prefix.length, end), suffix };
}

function escapeAttribute(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function openingTag(node) {
  const attrs = (node.attrs || [])
    .map((attr) => ` ${attr.name}="${escapeAttribute(attr.value)}"`)
    .join('');
  return `<${node.tagName}${attrs}>`;
}

function isSkipped(node) {
  let current = node;
  while (current) {
    if (current.tagName && SKIP_TAGS.has(current.tagName)) return true;
    current = current.parentNode;
  }
  return false;
}

function walk(node, visitor) {
  visitor(node);
  for (const child of node?.childNodes || []) walk(child, visitor);
}

function containsDescendantBlock(node) {
  let found = false;
  for (const child of node.childNodes || []) {
    walk(child, (candidate) => {
      if (candidate !== node && candidate.tagName && BLOCK_TAGS.has(candidate.tagName)) found = true;
    });
    if (found) break;
  }
  return found;
}

function visibleText(node) {
  const parts = [];
  walk(node, (candidate) => {
    if (candidate.nodeName === '#text' && !isSkipped(candidate)) parts.push(candidate.value || '');
  });
  return parts.join('');
}

function encodeInlineChildren(node) {
  const placeholders = new Map();
  let placeholderIndex = 0;
  const nextPlaceholder = (markup) => {
    const token = `⟦HTML_${String(++placeholderIndex).padStart(4, '0')}⟧`;
    placeholders.set(token, markup);
    return token;
  };
  const encode = (candidate) => {
    if (candidate.nodeName === '#text') return candidate.value || '';
    if (candidate.nodeName === '#comment') return nextPlaceholder(`<!--${candidate.data || ''}-->`);
    if (!candidate.tagName) return '';
    const open = nextPlaceholder(openingTag(candidate));
    if (VOID_TAGS.has(candidate.tagName)) return open;
    const children = (candidate.childNodes || []).map(encode).join('');
    const close = nextPlaceholder(`</${candidate.tagName}>`);
    return `${open}${children}${close}`;
  };
  return {
    text: (node.childNodes || []).map(encode).join(''),
    placeholders,
  };
}

function placeholderSequence(value) {
  return value.match(PLACEHOLDER_RE) || [];
}

function protectedTokens(value) {
  const withoutPlaceholders = value.replace(PLACEHOLDER_RE, ' ');
  return (withoutPlaceholders.match(PROTECTED_TOKEN_RE) || [])
    .map((token) => token.toUpperCase().replace(/\s+/g, ''))
    .sort();
}

function arraysEqual(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function validateTranslation(source, target, id) {
  if (!String(target || '').trim()) fail(`${id}: 翻译结果为空`);
  if (!arraysEqual(placeholderSequence(source), placeholderSequence(target))) {
    fail(`${id}: HTML 占位符数量或顺序发生变化`);
  }
  if (!arraysEqual(protectedTokens(source), protectedTokens(target))) {
    fail(`${id}: 型号、文档编号或数字发生变化`);
  }
}

function restorePlaceholders(value, placeholders) {
  let output = value;
  for (const [token, markup] of placeholders) output = output.split(token).join(markup);
  if (PLACEHOLDER_RE.test(output)) fail('存在未还原的 HTML 占位符');
  PLACEHOLDER_RE.lastIndex = 0;
  return output;
}

function shouldTranslateJsonString(value) {
  const normalized = String(value || '').trim();
  return Boolean(normalized)
    && !/^(?:https?:|\/|#|mailto:|tel:)/i.test(normalized)
    && !/^[a-z0-9_.-]+$/i.test(normalized);
}

function addJsonUnits(value, addUnit, pathParts = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => addJsonUnits(item, addUnit, [...pathParts, index]));
    return;
  }
  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, item]) => addJsonUnits(item, addUnit, [...pathParts, key]));
    return;
  }
  if (typeof value === 'string' && shouldTranslateJsonString(value)) {
    addUnit(value, { kind: 'template-json', path: pathParts });
  }
}

function setAtPath(target, pathParts, value) {
  let current = target;
  for (let index = 0; index < pathParts.length - 1; index += 1) current = current[pathParts[index]];
  current[pathParts.at(-1)] = value;
}

function buildSource(product) {
  const canonical = product.translations?.en;
  if (!canonical) fail(`产品 ${product.id} 缺少 en 母版`);
  const fragment = parse5.parseFragment(String(canonical.content_html || ''));
  const units = [];
  const coveredTextNodes = new Set();
  let unitIndex = 0;
  const addUnit = (source, binding) => {
    const { prefix, core, suffix } = splitBoundaryWhitespace(String(source || ''));
    if (!core) return null;
    if (!/\p{L}/u.test(core.replace(PLACEHOLDER_RE, ''))) return null;
    const unit = {
      id: `u${String(++unitIndex).padStart(5, '0')}`,
      source: core,
      prefix,
      suffix,
      binding,
    };
    units.push(unit);
    return unit;
  };

  for (const [field, value] of [
    ['name', canonical.name],
    ['summary', canonical.summary],
    ['seo_title', canonical.seo_title],
    ['seo_description', canonical.seo_description],
  ]) addUnit(value, { kind: 'metadata', field });

  walk(fragment, (node) => {
    if (!node.tagName || !BLOCK_TAGS.has(node.tagName) || isSkipped(node)) return;
    if (containsDescendantBlock(node) || !visibleText(node).trim()) return;
    const encoded = encodeInlineChildren(node);
    addUnit(encoded.text, { kind: 'block', node, placeholders: encoded.placeholders });
    walk(node, (candidate) => {
      if (candidate.nodeName === '#text') coveredTextNodes.add(candidate);
    });
  });

  walk(fragment, (node) => {
    if (node.nodeName === '#text' && !coveredTextNodes.has(node) && !isSkipped(node) && String(node.value || '').trim()) {
      addUnit(node.value, { kind: 'text', node });
    }
    if (node.tagName && !isSkipped(node)) {
      for (const attr of node.attrs || []) {
        if (TRANSLATABLE_ATTRIBUTES.has(attr.name) && String(attr.value || '').trim()) {
          addUnit(attr.value, { kind: 'attribute', attr });
        }
      }
    }
  });

  let templateData = null;
  try {
    templateData = canonical.template_data_json ? JSON.parse(canonical.template_data_json) : null;
  } catch {
    fail('英文 template_data_json 不是有效 JSON');
  }
  if (templateData) addJsonUnits(templateData, addUnit);

  const uniqueBySource = new Map();
  for (const unit of units) {
    const key = unit.source;
    if (!uniqueBySource.has(key)) uniqueBySource.set(key, { key: `t${String(uniqueBySource.size + 1).padStart(5, '0')}`, text: key });
    unit.translationKey = uniqueBySource.get(key).key;
  }
  const requests = [...uniqueBySource.values()];
  const sourceHash = sha256(JSON.stringify({
    productId: product.id,
    canonicalLanguage: 'en',
    fields: requests,
    html: canonical.content_html,
    templateData,
  }));
  return { canonical, fragment, templateData, units, requests, sourceHash };
}

function loadProviders() {
  return queryAll(
    `SELECT id, name, base_url, api_key, model, reasoning_effort, is_default
     FROM ai_models
     WHERE is_enabled = 1
     ORDER BY is_default DESC, id ASC`,
  ).map((row) => ({
    ...row,
    client: new OpenAI({
      apiKey: row.api_key,
      ...(row.base_url ? { baseURL: row.base_url } : {}),
      timeout: 180_000,
      maxRetries: 1,
    }),
  }));
}

function parseJsonResponse(value) {
  const normalized = String(value || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  if (!normalized) fail('模型没有返回最终文本');
  try {
    return JSON.parse(normalized);
  } catch {
    const start = normalized.indexOf('{');
    const end = normalized.lastIndexOf('}');
    if (start < 0 || end <= start) fail('模型返回不是 JSON');
    return JSON.parse(normalized.slice(start, end + 1));
  }
}

function responseOutputText(response) {
  if (String(response?.output_text || '').trim()) return response.output_text;
  for (const item of response?.output || []) {
    if (item?.type !== 'message') continue;
    for (const content of item.content || []) {
      if (content?.type === 'output_text' && String(content.text || '').trim()) return content.text;
    }
  }
  return '';
}

function buildPrompt(items, language) {
  return JSON.stringify({
    task: `Translate every text value from English to ${language.name} (${language.code}).`,
    rules: [
      'Return JSON only with shape {"translations":[{"id":"...","text":"..."}]}.',
      'Return every input id exactly once and in the original order.',
      'Preserve every ⟦HTML_0000⟧ placeholder exactly and in the same order.',
      'Do not translate or alter brands, product models, document codes, standards, numbers, units, URLs, or HTML placeholders.',
      'Do not introduce numeric digits or model-like codes when the source text contains none; write translated number words as words.',
      'Translate complete sentences naturally for technical industrial readers; do not add explanations.',
    ],
    items,
  });
}

async function callProvider(provider, items, language) {
  const prompt = buildPrompt(items, language);
  let text = '';
  let responsesError = null;
  try {
    const response = await provider.client.responses.create({
      model: provider.model,
      input: prompt,
      store: false,
      reasoning: { effort: provider.reasoning_effort || 'medium' },
    });
    text = responseOutputText(response);
  } catch (error) {
    responsesError = error;
  }
  if (!text) {
    try {
      const response = await provider.client.chat.completions.create({
        model: provider.model,
        messages: [
          { role: 'system', content: 'You are a precise industrial technical translator. Return JSON only.' },
          { role: 'user', content: prompt },
        ],
      });
      text = response.choices?.[0]?.message?.content || '';
    } catch (chatError) {
      throw new Error(`${responsesError?.message || 'Responses API 没有最终文本'}; Chat API: ${chatError.message}`);
    }
  }
  const parsed = parseJsonResponse(text);
  if (!Array.isArray(parsed.translations)) fail('模型 JSON 缺少 translations 数组');
  const byId = new Map(parsed.translations.map((item) => [String(item?.id || ''), String(item?.text || '')]));
  if (byId.size !== items.length) fail(`模型返回 ${byId.size} 项，预期 ${items.length} 项`);
  const output = {};
  for (const item of items) {
    if (!byId.has(item.id)) fail(`模型遗漏 ${item.id}`);
    validateTranslation(item.text, byId.get(item.id), item.id);
    output[item.id] = byId.get(item.id);
  }
  return output;
}

async function translateWithFallback(providers, items, language) {
  const failures = [];
  for (const provider of providers) {
    try {
      return {
        translations: await callProvider(provider, items, language),
        provider: { id: provider.id, name: provider.name, model: provider.model },
        failures,
      };
    } catch (error) {
      failures.push({ id: provider.id, name: provider.name, error: error.message });
    }
  }
  fail(`所有 AI provider 均失败: ${failures.map((item) => `${item.name}: ${item.error}`).join(' | ')}`);
}

async function selectCapableProviders(providers, language) {
  const failures = [];
  for (let index = 0; index < providers.length; index += 1) {
    const provider = providers[index];
    try {
      await callProvider(provider, [{ id: 'probe', text: 'Steam separator' }], language);
      return {
        providers: providers.slice(index),
        selected: { id: provider.id, name: provider.name, model: provider.model },
        failures,
      };
    } catch (error) {
      failures.push({ id: provider.id, name: provider.name, error: error.message });
    }
  }
  fail(`没有可用的 AI provider: ${failures.map((item) => `${item.name}: ${item.error}`).join(' | ')}`);
}

async function runPool(tasks, concurrency) {
  const results = new Array(tasks.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < tasks.length) {
      const index = nextIndex++;
      results[index] = await tasks[index]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
  return results;
}

function loadBatchIfValid(filePath, sourceHash, languageCode, items) {
  if (!fs.existsSync(filePath)) return null;
  try {
    const saved = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (saved.source_hash !== sourceHash || saved.language !== languageCode) return null;
    for (const item of items) validateTranslation(item.text, saved.translations?.[item.key], item.key);
    return saved;
  } catch {
    return null;
  }
}

function applyDraft(source, translatedByKey) {
  const metadata = {};
  const templateData = structuredClone(source.templateData);
  for (const unit of source.units) {
    const translatedCore = translatedByKey[unit.translationKey];
    validateTranslation(unit.source, translatedCore, unit.id);
    const value = `${unit.prefix}${translatedCore}${unit.suffix}`;
    const binding = unit.binding;
    if (binding.kind === 'metadata') metadata[binding.field] = value;
    else if (binding.kind === 'text') binding.node.value = value;
    else if (binding.kind === 'attribute') binding.attr.value = value;
    else if (binding.kind === 'template-json') setAtPath(templateData, binding.path, value);
    else if (binding.kind === 'block') {
      const restored = restorePlaceholders(value, binding.placeholders);
      const replacement = parse5.parseFragment(restored);
      binding.node.childNodes = replacement.childNodes;
      for (const child of binding.node.childNodes) child.parentNode = binding.node;
    }
  }
  return {
    ...metadata,
    content_html: parse5.serialize(source.fragment),
    template_data_json: templateData == null ? null : JSON.stringify(templateData),
  };
}

async function generateLanguageDraft(source, language, options, providers, outputRoot) {
  const languageDir = path.join(outputRoot, language.code);
  const batchesDir = path.join(languageDir, 'batches');
  fs.mkdirSync(batchesDir, { recursive: true });
  const batches = [];
  for (let index = 0; index < source.requests.length; index += options.batchSize) {
    batches.push(source.requests.slice(index, index + options.batchSize));
  }
  const tasks = batches.map((items, index) => async () => {
    const filePath = path.join(batchesDir, `batch-${String(index + 1).padStart(4, '0')}.json`);
    const existing = loadBatchIfValid(filePath, source.sourceHash, language.code, items);
    if (existing) return existing;
    const result = await translateWithFallback(providers, items.map((item) => ({ id: item.key, text: item.text })), language);
    const saved = {
      source_hash: source.sourceHash,
      language: language.code,
      batch: index + 1,
      provider: result.provider,
      provider_failures: result.failures,
      translations: result.translations,
    };
    fs.writeFileSync(filePath, JSON.stringify(saved, null, 2));
    return saved;
  });
  const results = await runPool(tasks, options.concurrency);
  const translatedByKey = Object.assign({}, ...results.map((result) => result.translations));
  for (const request of source.requests) {
    if (!Object.hasOwn(translatedByKey, request.key)) fail(`${language.code}: 缺少 ${request.key}`);
  }
  const fields = applyDraft(source, translatedByKey);
  const draft = {
    schema_version: 1,
    product_id: options.productId,
    source_language: 'en',
    language: language.code,
    language_name: language.name,
    source_hash: source.sourceHash,
    generated_at: new Date().toISOString(),
    status: 'needs-local-seo-and-link-review',
    fields,
    batches: results.map((result) => ({ batch: result.batch, provider: result.provider, provider_failures: result.provider_failures })),
  };
  const draftPath = path.join(languageDir, 'draft.json');
  fs.writeFileSync(draftPath, JSON.stringify(draft, null, 2));
  return { language: language.code, draft: draftPath, batchCount: batches.length };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }
  const languages = queryAll(
    `SELECT id, code, name, is_enabled
     FROM languages
     WHERE is_enabled = 1
     ORDER BY sort_order ASC, id ASC`,
  );
  const selectedCodes = options.languages.length ? new Set(options.languages) : null;
  const targets = languages.filter((language) => language.code !== 'en' && (!selectedCodes || selectedCodes.has(language.code)));
  if (selectedCodes) {
    const missing = [...selectedCodes].filter((code) => !targets.some((language) => language.code === code));
    if (missing.length) fail(`语言未启用、不存在或不能作为目标: ${missing.join(', ')}`);
  }

  const product = getContentItemById('product', options.productId, {
    languageCode: 'en',
    includeTranslations: true,
    includeTranslationStatuses: true,
  });
  if (!product) fail(`产品 ${options.productId} 不存在`);
  const source = buildSource(product);
  const outputRoot = path.resolve(
    PROJECT_ROOT,
    options.outputDir || `tmp/product-${options.productId}-translation-drafts`,
  );
  fs.mkdirSync(outputRoot, { recursive: true });
  const sourceManifest = {
    schema_version: 1,
    product_id: product.id,
    canonical_language: 'en',
    source_hash: source.sourceHash,
    visible_unit_count: source.units.length,
    unique_translation_count: source.requests.length,
    target_languages: targets.map((language) => language.code),
    requests: source.requests,
  };
  fs.writeFileSync(path.join(outputRoot, 'source-manifest.json'), JSON.stringify(sourceManifest, null, 2));

  if (options.prepareOnly) {
    const identityMap = Object.fromEntries(source.requests.map((item) => [item.key, item.text]));
    const identityDraft = applyDraft(source, identityMap);
    const canonicalSerializedHtml = parse5.serialize(parse5.parseFragment(String(source.canonical.content_html || '')));
    if (identityDraft.content_html !== canonicalSerializedHtml) {
      fail('块级占位符恒等还原测试失败，HTML 结构发生变化');
    }
    console.log(JSON.stringify({
      success: true,
      prepareOnly: true,
      outputRoot,
      sourceManifest: path.join(outputRoot, 'source-manifest.json'),
      productId: product.id,
      canonicalLanguage: 'en',
      sourceHash: source.sourceHash,
      visibleUnitCount: source.units.length,
      uniqueTranslationCount: source.requests.length,
      identityHtmlRoundTrip: true,
      targetLanguages: targets.map((language) => language.code),
    }, null, 2));
    return;
  }
  const configuredProviders = loadProviders();
  if (!configuredProviders.length) fail('没有启用的 AI provider');
  const providerSelection = await selectCapableProviders(configuredProviders, targets[0]);
  const providers = providerSelection.providers;

  const reports = [];
  // Languages are sequential; batches within a language use bounded concurrency and resumable files.
  for (const language of targets) {
    reports.push(await generateLanguageDraft(source, language, options, providers, outputRoot));
  }
  console.log(JSON.stringify({
    success: true,
    productId: product.id,
    sourceHash: source.sourceHash,
    outputRoot,
    batchSize: options.batchSize,
    concurrency: options.concurrency,
    selectedProvider: providerSelection.selected,
    providerProbeFailures: providerSelection.failures,
    reports,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
