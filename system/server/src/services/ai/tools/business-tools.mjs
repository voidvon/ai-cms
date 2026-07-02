import { z } from 'zod';
import { toolRegistry } from '../core/tool-registry.mjs';
import { isAiDataSourceAvailable } from '../data-source-registry.mjs';
import { lookupPriceForAi } from '../query-service.mjs';

/**
 * 注册所有业务工具到全局工具注册中心
 */
export function registerBusinessTools() {
  // 价格查询工具
  toolRegistry.register({
    name: 'price_lookup',
    description: '根据产品型号、数量和区域查询价格。返回单价、总价和价格来源。',
    category: 'business',
    requiresAuth: true,
    accessLevel: 'read',
    requiredPermissions: ['read:prices'],
    dataSources: ['stub_price_catalog'],
    isEnabled: () => isAiDataSourceAvailable('stub_price_catalog'),
    parameters: z.object({
      sku: z.string().describe('产品型号/SKU'),
      quantity: z.number().int().positive().default(1).describe('数量'),
      region: z.string().default('CN').describe('区域代码，如 CN, US'),
      currency: z.string().default('CNY').describe('币种，如 CNY, USD'),
    }),
    async execute({ sku, quantity, region, currency }, context) {
      return lookupPriceForAi({
        user: context.user,
        sku,
        quantity,
        region,
        currency,
      });
    },
  });

  // 合同条款工具
  toolRegistry.register({
    name: 'contract_clause_picker',
    description: '获取标准合同条款建议。支持查询交期、付款、质保、争议解决等条款模板。',
    category: 'business',
    requiresAuth: false,
    accessLevel: 'read',
    dataSources: ['contract_clause_stub'],
    isEnabled: () => isAiDataSourceAvailable('contract_clause_stub'),
    parameters: z.object({
      clause_type: z
        .enum(['delivery', 'payment', 'warranty', 'dispute_resolution', 'breach_liability'])
        .describe('条款类型'),
      contract_type: z.enum(['sales', 'service']).default('sales').describe('合同类型'),
    }),
    async execute({ clause_type, contract_type }, context) {
      const clauses = getStandardClauses(contract_type);
      const selected = clauses[clause_type];

      if (!selected) {
        return {
          clause_type,
          found: false,
          suggestion: '未找到对应条款模板',
        };
      }

      return {
        clause_type,
        contract_type,
        found: true,
        heading: selected.heading,
        content: selected.content,
        note: '当前为占位实现，后续接入真实条款库',
      };
    },
  });
}

/**
 * 获取标准条款（占位实现）
 */
function getStandardClauses(contractType) {
  const salesClauses = {
    delivery: {
      heading: '交货期限',
      content: '卖方应在合同签订后 30 个工作日内完成交货，具体交货时间以双方确认的订单为准。',
    },
    payment: {
      heading: '付款方式',
      content: '买方应在收到货物并验收合格后 30 日内支付全部货款。',
    },
    warranty: {
      heading: '质量保证',
      content: '卖方保证所供产品符合国家相关标准，质保期为交货后 12 个月。',
    },
    dispute_resolution: {
      heading: '争议解决',
      content: '因本合同引起的或与本合同有关的任何争议，双方应友好协商解决；协商不成的，提交合同签订地人民法院诉讼解决。',
    },
    breach_liability: {
      heading: '违约责任',
      content: '任何一方违反本合同约定，应向守约方支付合同总金额 10% 的违约金。',
    },
  };

  return contractType === 'sales' ? salesClauses : salesClauses;
}
