import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Agent, MemorySession, run, tool } from '@openai/agents';
import { z } from 'zod';
import { UPLOADS_PDFS_ROOT } from '../config.mjs';

const DEFAULT_MODEL = process.env.OPENAI_CONTRACT_MODEL || process.env.OPENAI_DEFAULT_MODEL || 'gpt-5';
const chatSessions = new Map();

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeProducts(products) {
  if (!Array.isArray(products)) {
    return [];
  }

  return products
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const sku = normalizeText(item.sku);
      const quantity = Number.parseInt(String(item.quantity || '1'), 10) || 1;
      const name = normalizeText(item.name);
      if (!sku) {
        return null;
      }

      return {
        sku,
        quantity,
        name
      };
    })
    .filter(Boolean);
}

function assertOpenAIConfig() {
  if (!normalizeText(process.env.OPENAI_API_KEY)) {
    const error = new Error('缺少 OPENAI_API_KEY，无法调用 OpenAI Agents SDK');
    error.statusCode = 400;
    throw error;
  }
}

function buildContractPrompt(payload) {
  const productLines = payload.products
    .map((item, index) => `${index + 1}. SKU: ${item.sku}; Qty: ${item.quantity}; Name: ${item.name || '-'}`)
    .join('\n');

  return [
    '请根据以下信息生成一份结构化合同草稿。',
    '输出必须使用 JSON 字段，不要输出 markdown 代码块。',
    '字段要求：title, summary, currency, pricing, clauses, approval_notes, draft_html。',
    'summary 要简洁概述合同。',
    'pricing 必须是数组，每个元素包含 sku, quantity, unit_price, currency, line_total, price_source。',
    'clauses 必须是数组，每个元素包含 heading, content。',
    'approval_notes 必须说明哪些内容需要人工确认。',
    'draft_html 输出可直接用于后续生成 PDF 的简洁 HTML 片段。',
    '',
    `客户名称: ${payload.customer_name}`,
    `合同类型: ${payload.contract_type || 'sales'}`,
    `区域: ${payload.region || 'CN'}`,
    `币种: ${payload.currency || 'CNY'}`,
    `备注: ${payload.notes || '-'}`,
    '产品列表:',
    productLines || '无'
  ].join('\n');
}

function createPriceLookupTool() {
  return tool({
    name: 'price_lookup',
    description: '根据产品型号、数量和区域生成价格占位结果。后续替换为 ERP 或正式报价接口。',
    parameters: z.object({
      sku: z.string(),
      quantity: z.number().int().positive().default(1),
      region: z.string().default('CN'),
      currency: z.string().default('CNY')
    }),
    async execute({ sku, quantity, region, currency }) {
      const normalizedSku = normalizeText(sku).toUpperCase();
      const unitPrice = estimateUnitPrice(normalizedSku, quantity, region);
      return {
        sku: normalizedSku,
        quantity,
        region,
        currency,
        unit_price: unitPrice,
        line_total: Number((unitPrice * quantity).toFixed(2)),
        price_source: 'stub_price_catalog'
      };
    }
  });
}

function createClauseTool() {
  return tool({
    name: 'contract_clause_picker',
    description: '按合同类型返回建议条款，后续替换为正式条款库。',
    parameters: z.object({
      contract_type: z.string().default('sales'),
      region: z.string().default('CN')
    }),
    async execute({ contract_type, region }) {
      return buildDefaultClauses(contract_type, region);
    }
  });
}

function estimateUnitPrice(sku, quantity, region) {
  const skuScore = Array.from(String(sku || ''))
    .reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const base = 80 + (skuScore % 120);
  const regionFactor = normalizeText(region).toUpperCase() === 'CN' ? 1 : 1.15;
  const quantityFactor = quantity >= 10 ? 0.92 : quantity >= 5 ? 0.96 : 1;
  return Number((base * regionFactor * quantityFactor).toFixed(2));
}

function buildDefaultClauses(contractType, region) {
  const normalizedType = normalizeText(contractType).toLowerCase();
  const normalizedRegion = normalizeText(region).toUpperCase() || 'CN';

  const baseClauses = [
    {
      heading: '交付条款',
      content: `卖方在确认订单与付款条件后安排发货，交付区域为 ${normalizedRegion}。`
    },
    {
      heading: '付款条款',
      content: '默认采用预付款或双方约定账期，最终条款需人工复核。'
    },
    {
      heading: '质量与验收',
      content: '产品按约定型号、数量和标准交付，收货后按双方约定流程验收。'
    }
  ];

  if (normalizedType === 'service') {
    baseClauses.push({
      heading: '服务范围',
      content: '服务工作内容、时间窗口与验收标准需按实际项目单独确认。'
    });
  }

  return baseClauses;
}

function buildCapabilities() {
  return {
    provider: 'openai_agents_js',
    status: normalizeText(process.env.OPENAI_API_KEY) ? 'partial_ready' : 'stub',
    tasks: [
      {
        key: 'contract_draft',
        label: '合同草稿',
        description: '已接入 OpenAI Agents SDK TypeScript，可生成结构化合同草稿'
      },
      {
        key: 'price_query',
        label: '价格查询',
        description: '当前仍为占位接口，后续建议接 ERP、报价系统或网页抓取'
      },
      {
        key: 'knowledge_qa',
        label: '知识问答',
        description: '当前仍为占位接口，后续建议接内容表检索或向量检索'
      },
      {
        key: 'export_pdf',
        label: '导出 PDF',
        description: '当前先保存 HTML 草稿，后续替换为正式 PDF 渲染器'
      }
    ],
    recommendedArchitecture: {
      ui: 'system/admin',
      api: 'system/server/src/routes/api/ai-assistant.mjs',
      orchestration: 'OpenAI Agents SDK TypeScript',
      files: '/uploads/pdfs'
    }
  };
}

export function getAiAssistantCapabilities() {
  return buildCapabilities();
}

function getOrCreateChatSession(chatId) {
  const normalizedChatId = normalizeText(chatId) || `admin-chat-${Date.now()}`;
  const existing = chatSessions.get(normalizedChatId);
  if (existing) {
    return { chatId: normalizedChatId, session: existing };
  }

  const session = new MemorySession(normalizedChatId);
  chatSessions.set(normalizedChatId, session);
  return { chatId: normalizedChatId, session };
}

function buildConversationAgent() {
  const priceLookupTool = createPriceLookupTool();
  const clauseTool = createClauseTool();

  return new Agent({
    name: 'Sales Contract Copilot',
    model: DEFAULT_MODEL,
    instructions: [
      '你是管理后台里的销售合同助手，和用户通过中文多轮对话协作。',
      '你的职责包括：查询价格、收集合同所需字段、解释缺失信息、生成合同草稿。',
      '当用户问价格时，优先调用 price_lookup 工具。',
      '当用户要生成合同或补充合同条款时，可以调用 contract_clause_picker 工具。',
      '如果信息不足，不要假装完成合同，而要明确追问缺少的字段。',
      '生成合同时，请输出清晰的中文结果，包含：已知信息、待确认项、建议下一步。',
      '如果用户明确要求“生成合同草稿”，再给出结构化草稿摘要；否则优先保持对话式回复。'
    ].join('\n'),
    tools: [priceLookupTool, clauseTool]
  });
}

export async function chatWithAssistant({ chatId, message }) {
  assertOpenAIConfig();

  const normalizedMessage = normalizeText(message);
  if (!normalizedMessage) {
    const error = new Error('message 不能为空');
    error.statusCode = 400;
    throw error;
  }

  const { chatId: resolvedChatId, session } = getOrCreateChatSession(chatId);
  const agent = buildConversationAgent();
  const result = await run(agent, normalizedMessage, { session });
  const outputText = extractJsonString(result?.finalOutput);

  return {
    chat_id: resolvedChatId,
    message: outputText || '我已收到你的请求，但当前没有生成有效回复。',
    model: DEFAULT_MODEL
  };
}

export function resetAssistantChat(chatId) {
  const normalizedChatId = normalizeText(chatId);
  if (!normalizedChatId) {
    return { cleared: false };
  }
  chatSessions.delete(normalizedChatId);
  return { cleared: true, chat_id: normalizedChatId };
}

export async function draftContractWithAgent(payload = {}) {
  assertOpenAIConfig();

  const normalizedPayload = {
    customer_name: normalizeText(payload.customer_name),
    contract_type: normalizeText(payload.contract_type) || 'sales',
    region: normalizeText(payload.region) || 'CN',
    currency: normalizeText(payload.currency) || 'CNY',
    notes: normalizeText(payload.notes),
    products: normalizeProducts(payload.products)
  };

  if (!normalizedPayload.customer_name) {
    const error = new Error('customer_name 不能为空');
    error.statusCode = 400;
    throw error;
  }

  if (normalizedPayload.products.length === 0) {
    const error = new Error('products 不能为空');
    error.statusCode = 400;
    throw error;
  }

  const priceLookupTool = createPriceLookupTool();
  const clauseTool = createClauseTool();

  const agent = new Agent({
    name: 'Contract Draft Assistant',
    model: DEFAULT_MODEL,
    instructions: [
      '你是一名合同起草助手，负责生成可供销售和法务审核的结构化合同草稿。',
      '必须优先调用价格工具和条款工具，不要凭空编造价格来源。',
      '输出只允许是 JSON 文本，不要附加解释。',
      '如果信息不足，仍然生成草稿，但在 approval_notes 里明确写出待人工确认项。'
    ].join('\n'),
    tools: [priceLookupTool, clauseTool]
  });

  const result = await run(agent, buildContractPrompt(normalizedPayload));
  const finalOutput = extractJsonString(result?.finalOutput);
  const parsed = safeParseJson(finalOutput);

  if (!parsed) {
    const error = new Error('模型未返回有效 JSON，请调整提示词或检查模型输出');
    error.statusCode = 502;
    error.modelOutput = finalOutput;
    throw error;
  }

  return {
    task: 'contract_draft',
    status: 'ready',
    customer_name: normalizedPayload.customer_name,
    product_count: normalizedPayload.products.length,
    result: {
      summary: parsed.summary || '合同草稿已生成',
      checklist: Array.isArray(parsed.approval_notes) ? parsed.approval_notes : normalizeApprovalNotes(parsed.approval_notes),
      payload: {
        request: normalizedPayload,
        draft: parsed,
        model: DEFAULT_MODEL
      }
    }
  };
}

export function queryPriceStub(payload = {}) {
  const sku = normalizeText(payload.sku);
  const region = normalizeText(payload.region) || 'CN';
  const quantity = Number.parseInt(String(payload.quantity || '1'), 10) || 1;
  const currency = normalizeText(payload.currency) || 'CNY';

  return {
    task: 'price_query',
    status: 'stub',
    query: { sku, region },
    result: {
      summary: '价格查询接口已保留占位实现，建议下一步接 ERP 或正式报价源。',
      checklist: [
        '识别产品型号与区域',
        '调用正式价格源',
        '返回价格、币种、有效期与来源'
      ],
      payload: {
        sku,
        region,
        quantity,
        currency,
        preview_price: sku ? estimateUnitPrice(sku, quantity, region) : null
      }
    }
  };
}

export function answerKnowledgeStub(payload = {}) {
  const question = normalizeText(payload.question);
  return {
    task: 'knowledge_qa',
    status: 'stub',
    question,
    result: {
      summary: '知识问答接口已保留占位实现，建议下一步接内容检索或向量库。',
      checklist: [
        '识别问题主题',
        '检索知识源',
        '拼接答案与引用'
      ],
      payload
    }
  };
}

export function exportContractPdfStub(payload = {}) {
  const draftId = normalizeText(payload.draft_id) || `draft-${Date.now()}`;
  mkdirSync(UPLOADS_PDFS_ROOT, { recursive: true });

  const fileName = `${draftId}.html`;
  const outputPath = path.join(UPLOADS_PDFS_ROOT, fileName);
  const html = normalizeText(payload.html) || '<html><body><h1>Contract Draft Placeholder</h1><p>待接入 PDF 渲染器。</p></body></html>';
  writeFileSync(outputPath, html, 'utf8');

  return {
    task: 'export_pdf',
    status: 'stub',
    draft_id: draftId,
    file: {
      url: `/uploads/pdfs/${fileName}`,
      name: fileName
    },
    result: {
      summary: '已输出 HTML 占位文件到 /uploads/pdfs，后续替换为真实 PDF 渲染。',
      checklist: [
        '接收结构化合同内容',
        '套用版式模板',
        '调用 HTML 或 DOCX 转 PDF 工具'
      ],
      payload: {
        saved_as: outputPath,
        template_code: normalizeText(payload.template_code)
      }
    }
  };
}

function extractJsonString(value) {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (value && typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value || '').trim();
}

function safeParseJson(value) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    const fencedMatch = value.match(/```(?:json)?\s*([\s\S]+?)```/i);
    if (fencedMatch?.[1]) {
      try {
        return JSON.parse(fencedMatch[1].trim());
      } catch {
        return null;
      }
    }
  }

  return null;
}

function normalizeApprovalNotes(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(item)).filter(Boolean);
  }
  if (typeof value === 'string' && value.trim()) {
    return value
      .split(/\n+/)
      .map((item) => item.replace(/^[-*\d.\s]+/, '').trim())
      .filter(Boolean);
  }
  return ['请人工复核价格、付款条件、交期和法律条款。'];
}
