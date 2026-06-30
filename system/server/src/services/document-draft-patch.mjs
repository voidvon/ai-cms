import { z } from 'zod';

const nullableString = z.union([z.string(), z.null()]);
const nullableNumber = z.union([z.number(), z.null()]);

const partyPatchSchema = z.object({
  name: nullableString,
  company: nullableString,
  contact: nullableString,
  address: nullableString,
  email: nullableString,
  phone: nullableString,
}).strict();

const itemPatchSchema = z.object({
  id: nullableString,
  sku: nullableString,
  model: nullableString,
  description: nullableString,
  qty: nullableNumber,
  unit: nullableString,
  unitPrice: nullableNumber,
  amount: nullableNumber,
  notes: nullableString,
}).strict();

const pricingPatchSchema = z.object({
  currency: nullableString,
  subtotal: nullableNumber,
  taxRate: nullableNumber,
  taxAmount: nullableNumber,
  shippingFee: nullableNumber,
  total: nullableNumber,
}).strict();

const termsPatchSchema = z.object({
  validity: nullableString,
  delivery: nullableString,
  payment: nullableString,
  warranty: nullableString,
  disputeResolution: nullableString,
  breachLiability: nullableString,
  remarks: nullableString,
}).strict();

const signaturesPatchSchema = z.object({
  sellerSigner: nullableString,
  buyerSigner: nullableString,
}).strict();

export const documentPatchSchema = z.object({
  title: nullableString,
  language: nullableString,
  quoteNumber: nullableString,
  contractNumber: nullableString,
  customer: z.union([partyPatchSchema, z.null()]),
  seller: z.union([partyPatchSchema, z.null()]),
  items: z.union([z.array(itemPatchSchema), z.null()]),
  pricing: z.union([pricingPatchSchema, z.null()]),
  terms: z.union([termsPatchSchema, z.null()]),
  signatures: z.union([signaturesPatchSchema, z.null()]),
  meta: z.union([z.object({}).strict(), z.null()]),
}).strict();

export const documentChatResponseSchema = z.object({
  assistant_message: nullableString,
  patch: documentPatchSchema,
  suggested_questions: z.array(z.string()),
}).strict();

export function normalizeDocumentDraftPayload(payload, documentType) {
  const normalizedType = String(documentType || payload?.type || '').trim() || 'quote';
  const next = {
    ...payload,
    type: normalizedType,
    title: normalizeStringValue(payload?.title),
    language: normalizeStringValue(payload?.language, 'zh-CN'),
    quoteNumber: normalizeStringValue(payload?.quoteNumber),
    contractNumber: normalizeStringValue(payload?.contractNumber),
    customer: normalizeParty(payload?.customer),
    seller: normalizeParty(payload?.seller),
    pricing: normalizePricing(payload?.pricing),
    terms: normalizeTerms(payload?.terms),
    signatures: normalizeSignatures(payload?.signatures),
    meta: normalizeMeta(payload?.meta),
    items: Array.isArray(payload?.items) ? payload.items.map((item, index) => normalizeItem(item, index)) : [],
  };

  const subtotal = next.items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  if (subtotal > 0 || next.items.length > 0) {
    next.pricing.subtotal = subtotal;
  }

  const shippingFee = toNumber(next.pricing.shippingFee, 0);
  const taxAmount = hasNumber(next.pricing.taxAmount)
    ? Number(next.pricing.taxAmount || 0)
    : calculateTaxAmount(next.pricing.subtotal, next.pricing.taxRate);

  if (taxAmount > 0) {
    next.pricing.taxAmount = taxAmount;
  }

  const total = Number(next.pricing.subtotal || 0) + shippingFee + taxAmount;
  if (total > 0 || next.items.length > 0) {
    next.pricing.total = total;
  }

  return next;
}

export function buildEmptyDocumentPatch() {
  return {
    title: null,
    language: null,
    quoteNumber: null,
    contractNumber: null,
    customer: null,
    seller: null,
    items: null,
    pricing: null,
    terms: null,
    signatures: null,
    meta: null,
  };
}

export function summarizeDocumentMissingFields(payload, documentType) {
  const missing = [];
  const customerName = String(payload?.customer?.company || payload?.customer?.name || '').trim();
  if (!customerName) {
    missing.push('customer.name');
  }

  if (!Array.isArray(payload?.items) || payload.items.length === 0) {
    missing.push('items');
  }

  if (!String(payload?.terms?.delivery || '').trim()) {
    missing.push('terms.delivery');
  }

  if (!String(payload?.terms?.payment || '').trim()) {
    missing.push('terms.payment');
  }

  if (documentType === 'quote' && !String(payload?.terms?.validity || '').trim()) {
    missing.push('terms.validity');
  }

  if (documentType === 'contract') {
    if (!String(payload?.terms?.disputeResolution || '').trim()) {
      missing.push('terms.disputeResolution');
    }
    if (!String(payload?.terms?.breachLiability || '').trim()) {
      missing.push('terms.breachLiability');
    }
  }

  return missing;
}

function normalizeParty(value) {
  const source = normalizePlainObject(value);
  return {
    name: normalizeStringValue(source.name),
    company: normalizeStringValue(source.company),
    contact: normalizeStringValue(source.contact),
    address: normalizeStringValue(source.address),
    email: normalizeStringValue(source.email),
    phone: normalizeStringValue(source.phone),
  };
}

function normalizePricing(value) {
  const source = normalizePlainObject(value);
  return {
    currency: normalizeStringValue(source.currency, 'CNY'),
    subtotal: toNumber(source.subtotal, null),
    taxRate: toNumber(source.taxRate, null),
    taxAmount: toNumber(source.taxAmount, null),
    shippingFee: toNumber(source.shippingFee, null),
    total: toNumber(source.total, null),
  };
}

function normalizeTerms(value) {
  const source = normalizePlainObject(value);
  return {
    validity: normalizeStringValue(source.validity),
    delivery: normalizeStringValue(source.delivery),
    payment: normalizeStringValue(source.payment),
    warranty: normalizeStringValue(source.warranty),
    disputeResolution: normalizeStringValue(source.disputeResolution),
    breachLiability: normalizeStringValue(source.breachLiability),
    remarks: normalizeStringValue(source.remarks),
  };
}

function normalizeSignatures(value) {
  const source = normalizePlainObject(value);
  return {
    sellerSigner: normalizeStringValue(source.sellerSigner),
    buyerSigner: normalizeStringValue(source.buyerSigner),
  };
}

function normalizeMeta(value) {
  return normalizePlainObject(value);
}

function normalizeItem(item, index) {
  const source = normalizePlainObject(item);
  const qty = toNumber(source.qty, 0);
  const unitPrice = toNumber(source.unitPrice, null);
  const amount = hasNumber(source.amount)
    ? Number(source.amount || 0)
    : (hasNumber(unitPrice) ? qty * Number(unitPrice || 0) : null);

  return {
    id: normalizeStringValue(source.id, `item-${index + 1}`),
    sku: normalizeStringValue(source.sku),
    model: normalizeStringValue(source.model || source.sku),
    description: normalizeStringValue(source.description),
    qty,
    unit: normalizeStringValue(source.unit),
    unitPrice,
    amount,
    notes: normalizeStringValue(source.notes),
  };
}

function calculateTaxAmount(subtotal, taxRate) {
  if (!hasNumber(subtotal) || !hasNumber(taxRate)) {
    return 0;
  }
  return Number(subtotal || 0) * Number(taxRate || 0) / 100;
}

function normalizePlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeStringValue(value, fallbackValue = '') {
  const text = String(value ?? '').trim();
  return text || fallbackValue;
}

function toNumber(value, fallbackValue) {
  if (value == null || value === '') {
    return fallbackValue;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallbackValue;
}

function hasNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}
