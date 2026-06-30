import { tool } from '@openai/agents';
import { z } from 'zod';
import { normalizeText } from '../shared.mjs';

export function buildDefaultClauses(contractType, region) {
  const normalizedType = normalizeText(contractType).toLowerCase();
  const normalizedRegion = normalizeText(region).toUpperCase() || 'CN';

  const baseClauses = [
    {
      heading: '交付条款',
      content: `卖方在确认订单与付款条件后安排发货，交付区域为 ${normalizedRegion}。`,
    },
    {
      heading: '付款条款',
      content: '默认采用预付款或双方约定账期，最终条款需人工复核。',
    },
    {
      heading: '质量与验收',
      content: '产品按约定型号、数量和标准交付，收货后按双方约定流程验收。',
    },
  ];

  if (normalizedType === 'service') {
    baseClauses.push({
      heading: '服务范围',
      content: '服务工作内容、时间窗口与验收标准需按实际项目单独确认。',
    });
  }

  return baseClauses;
}

export function createContractClauseTool() {
  return tool({
    name: 'contract_clause_picker',
    description: '按合同类型返回建议条款，后续替换为正式条款库。',
    parameters: z.object({
      contract_type: z.string().default('sales'),
      region: z.string().default('CN'),
    }),
    async execute({ contract_type, region }) {
      return buildDefaultClauses(contract_type, region);
    },
  });
}
