import { tool } from '@openai/agents';
import { z } from 'zod';
import { normalizeText } from '../shared.mjs';

export function estimateUnitPrice(sku, quantity, region) {
  const skuScore = Array.from(String(sku || ''))
    .reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const base = 80 + (skuScore % 120);
  const regionFactor = normalizeText(region).toUpperCase() === 'CN' ? 1 : 1.15;
  const quantityFactor = quantity >= 10 ? 0.92 : quantity >= 5 ? 0.96 : 1;
  return Number((base * regionFactor * quantityFactor).toFixed(2));
}

export function createPriceLookupTool() {
  return tool({
    name: 'price_lookup',
    description: '根据产品型号、数量和区域生成价格占位结果。后续替换为 ERP 或正式报价接口。',
    parameters: z.object({
      sku: z.string(),
      quantity: z.number().int().positive().default(1),
      region: z.string().default('CN'),
      currency: z.string().default('CNY'),
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
        price_source: 'stub_price_catalog',
      };
    },
  });
}
