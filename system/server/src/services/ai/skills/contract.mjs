import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { UPLOADS_PDFS_ROOT } from '../../../config.mjs';
import { normalizeText, extractJsonString, normalizeChecklist, safeParseJson } from '../shared.mjs';
import { createAiAgent, getAiRuntimeConfig, runAiAgent } from '../runtime.mjs';
import { createContractClauseTool } from '../tools/contract-clause-picker.mjs';
import { createPriceLookupTool, estimateUnitPrice } from '../tools/price-lookup.mjs';

export const CONTRACT_COPILOT_CAPABILITY = {
  key: 'contract_copilot',
  label: '合同协作',
  description: '连续对话收集价格、条款与合同上下文，适合作为 AI 对话的首个业务能力。',
};

const CONTRACT_TASKS = [
  {
    key: 'contract_draft',
    label: '合同草稿',
    description: '生成结构化合同草稿，供销售与法务后续审核。',
  },
  {
    key: 'price_query',
    label: '价格查询',
    description: '按产品型号、区域与数量返回价格占位结果。',
  },
  {
    key: 'knowledge_qa',
    label: '知识问答',
    description: '保留通用知识问答任务入口，后续接检索与引用链路。',
  },
  {
    key: 'export_pdf',
    label: '导出 PDF',
    description: '当前保存 HTML 占位文件，后续替换为正式导出渲染器。',
  },
];

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
        name,
      };
    })
    .filter(Boolean);
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
    productLines || '无',
  ].join('\n');
}

export function listContractTasks() {
  return CONTRACT_TASKS;
}

export function buildContractConversationAgent() {
  return createAiAgent({
    name: 'AI Contract Copilot',
    instructions: [
      '你是管理后台里的 AI 对话助手，当前首个内置能力是销售合同协作。',
      '你的职责包括：查询价格、收集合同所需字段、解释缺失信息、生成合同草稿。',
      '当用户问价格时，优先调用 price_lookup 工具。',
      '当用户要生成合同或补充合同条款时，可以调用 contract_clause_picker 工具。',
      '如果信息不足，不要假装完成合同，而要明确追问缺少的字段。',
      '生成合同时，请输出清晰的中文结果，包含：已知信息、待确认项、建议下一步。',
      '如果用户明确要求“生成合同草稿”，再给出结构化草稿摘要；否则优先保持对话式回复。',
    ].join('\n'),
    tools: [createPriceLookupTool(), createContractClauseTool()],
  });
}

async function draftContractTask(payload = {}) {
  const normalizedPayload = {
    customer_name: normalizeText(payload.customer_name),
    contract_type: normalizeText(payload.contract_type) || 'sales',
    region: normalizeText(payload.region) || 'CN',
    currency: normalizeText(payload.currency) || 'CNY',
    notes: normalizeText(payload.notes),
    products: normalizeProducts(payload.products),
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

  const agent = createAiAgent({
    name: 'Contract Draft Assistant',
    instructions: [
      '你是一名合同起草助手，负责生成可供销售和法务审核的结构化合同草稿。',
      '必须优先调用价格工具和条款工具，不要凭空编造价格来源。',
      '输出只允许是 JSON 文本，不要附加解释。',
      '如果信息不足，仍然生成草稿，但在 approval_notes 里明确写出待人工确认项。',
    ].join('\n'),
    tools: [createPriceLookupTool(), createContractClauseTool()],
  });

  const result = await runAiAgent(agent, buildContractPrompt(normalizedPayload));
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
      checklist: normalizeChecklist(parsed.approval_notes),
      payload: {
        request: normalizedPayload,
        draft: parsed,
        model: getAiRuntimeConfig().model,
      },
    },
  };
}

function priceQueryTask(payload = {}) {
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
        '返回价格、币种、有效期与来源',
      ],
      payload: {
        sku,
        region,
        quantity,
        currency,
        preview_price: sku ? estimateUnitPrice(sku, quantity, region) : null,
      },
    },
  };
}

function knowledgeQaTask(payload = {}) {
  return {
    task: 'knowledge_qa',
    status: 'stub',
    question: normalizeText(payload.question),
    result: {
      summary: '知识问答接口已保留占位实现，建议下一步接内容检索或向量库。',
      checklist: [
        '识别问题主题',
        '检索知识源',
        '拼接答案与引用',
      ],
      payload,
    },
  };
}

function exportPdfTask(payload = {}) {
  const draftId = normalizeText(payload.draft_id) || `draft-${Date.now()}`;
  mkdirSync(UPLOADS_PDFS_ROOT, { recursive: true });

  const fileName = `${draftId}.html`;
  const outputPath = path.join(UPLOADS_PDFS_ROOT, fileName);
  const html =
    normalizeText(payload.html) ||
    '<html><body><h1>Contract Draft Placeholder</h1><p>待接入 PDF 渲染器。</p></body></html>';
  writeFileSync(outputPath, html, 'utf8');

  return {
    task: 'export_pdf',
    status: 'stub',
    draft_id: draftId,
    file: {
      url: `/uploads/pdfs/${fileName}`,
      name: fileName,
    },
    result: {
      summary: '已输出 HTML 占位文件到 /uploads/pdfs，后续替换为真实 PDF 渲染。',
      checklist: [
        '接收结构化合同内容',
        '套用版式模板',
        '调用 HTML 或 DOCX 转 PDF 工具',
      ],
      payload: {
        saved_as: outputPath,
        template_code: normalizeText(payload.template_code),
      },
    },
  };
}

export async function executeContractTask(taskKey, payload = {}) {
  switch (taskKey) {
    case 'contract_draft':
      return draftContractTask(payload);
    case 'price_query':
      return priceQueryTask(payload);
    case 'knowledge_qa':
      return knowledgeQaTask(payload);
    case 'export_pdf':
      return exportPdfTask(payload);
    default: {
      const error = new Error(`不支持的 AI 任务：${taskKey}`);
      error.statusCode = 404;
      throw error;
    }
  }
}
