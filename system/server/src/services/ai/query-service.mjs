import { getColumnById, listColumns } from '../columns.mjs';
import { buildColumnTreeIndex, getDescendantColumnIds, isColumnUnderRoot } from '../column-tree.mjs';
import { listContentItems, listContentItemsAdmin, searchContentItemsPaged } from '../content-items.mjs';
import { getDb } from '../../db.mjs';
import { hasAiPermissions } from './core/permissions.mjs';

export function assertAiServicePermission(user, requiredPermissions = []) {
  if (!requiredPermissions || requiredPermissions.length === 0) {
    return;
  }

  if (!user) {
    const error = new Error('需要登录才能访问该 AI 查询能力');
    error.statusCode = 401;
    throw error;
  }

  if (!hasAiPermissions(user, requiredPermissions)) {
    const error = new Error(`缺少权限：${requiredPermissions.join(', ')}`);
    error.statusCode = 403;
    throw error;
  }
}

export function queryColumnsForAi({
  user,
  keyword,
  parentId = null,
  rootColumnId = null,
  limit = 10,
} = {}) {
  assertAiServicePermission(user, ['read:content']);

  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 50);
  const normalizedKeyword = String(keyword || '').trim().toLowerCase();
  const safeParentId = Number.isInteger(Number(parentId)) && Number(parentId) > 0
    ? Number(parentId)
    : null;
  const safeRootColumnId = Number.isInteger(Number(rootColumnId)) && Number(rootColumnId) > 0
    ? Number(rootColumnId)
    : null;
  const allColumns = listColumns({ includeTranslations: true });
  const tree = buildColumnTreeIndex(allColumns);

  const filtered = allColumns
    .filter((item) => {
      if (safeParentId !== null && Number(item.parent_id || 0) !== safeParentId) {
        return false;
      }

      if (safeRootColumnId !== null && !isColumnUnderRoot(tree.byId, item.id, safeRootColumnId)) {
        return false;
      }

      if (!normalizedKeyword) {
        return true;
      }

      const haystack = [
        item.name,
        item.summary,
        item.model_code,
        item.route_path,
        item.dir_name,
      ].map((value) => String(value || '').toLowerCase()).join('\n');

      return haystack.includes(normalizedKeyword);
    })
    .slice(0, safeLimit);

  return {
    total: filtered.length,
    columns: filtered.map((item) => ({
      id: item.id,
      parent_id: item.parent_id,
      name: item.name,
      column_type: item.column_type,
      model_code: item.model_code || '',
      route_path: item.route_path || '',
      dir_name: item.dir_name || '',
      is_visible: Boolean(item.is_visible),
    })),
  };
}

export function queryContentItemsForAi({
  user,
  keyword,
  columnId = null,
  rootColumnId = null,
  limit = 10,
  visibleOnly = true,
} = {}) {
  assertAiServicePermission(user, ['read:content']);

  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 50);
  const normalizedKeyword = String(keyword || '').trim().toLowerCase();
  const safeColumnId = Number.isInteger(Number(columnId)) && Number(columnId) > 0
    ? Number(columnId)
    : null;
  const safeRootColumnId = Number.isInteger(Number(rootColumnId)) && Number(rootColumnId) > 0
    ? Number(rootColumnId)
    : null;
  const targetColumn = safeColumnId ? getColumnById(safeColumnId, { includeTranslations: true }) : null;
  const rootColumn = safeRootColumnId ? getColumnById(safeRootColumnId, { includeTranslations: true }) : null;
  const resolvedModelCode = String(
    targetColumn?.model_code
    || rootColumn?.model_code
    || ''
  ).trim();

  if (!resolvedModelCode) {
    const error = new Error('缺少栏目内容模型，无法查询内容');
    error.statusCode = 400;
    throw error;
  }

  const tree = buildColumnTreeIndex(listColumns({ includeTranslations: true }));
  const descendantIds = safeRootColumnId
    ? new Set(getDescendantColumnIds(tree.childrenByParentId, safeRootColumnId, { includeSelf: true }))
    : null;
  const listOptions = {
    limit: safeColumnId || safeRootColumnId ? Math.min(safeLimit * 5, 200) : safeLimit,
    ...(safeColumnId ? { columnId: safeColumnId, includeDescendants: true } : {}),
  };

  const items = visibleOnly
    ? listContentItems(resolvedModelCode, {
      visibleOnly: true,
      ...listOptions,
    })
    : listContentItemsAdmin(resolvedModelCode, {
      page: 1,
      ...listOptions,
    }).items;

  const filteredItems = items
    .filter((item) => {
      if (descendantIds && !descendantIds.has(Number(item.column_id || 0))) {
        return false;
      }

      if (!normalizedKeyword) {
        return true;
      }

      const haystack = [
        item.name,
        item.code,
        item.summary,
        item.column_name,
      ].map((value) => String(value || '').toLowerCase()).join('\n');

      return haystack.includes(normalizedKeyword);
    })
    .slice(0, safeLimit);

  return {
    total: filteredItems.length,
    items: filteredItems.map((item) => ({
      id: item.id,
      column_id: item.column_id,
      column_name: item.column_name || '',
      model_code: resolvedModelCode,
      name: item.name,
      code: item.code || '',
      summary: item.summary || '',
      is_visible: Boolean(item.is_visible),
      is_featured_home: Boolean(item.is_featured_home),
    })),
  };
}

export function searchAiMentions({
  user,
  keyword,
  type = '',
  limit = 8,
} = {}) {
  assertAiServicePermission(user, ['read:content']);

  const normalizedKeyword = String(keyword || '').trim().toLowerCase();
  const normalizedType = ['column', 'content'].includes(String(type || '').trim())
    ? String(type || '').trim()
    : '';
  const safeLimit = Math.min(Math.max(Number(limit) || 8, 1), 20);

  if (!normalizedKeyword) {
    return {
      total: 0,
      columns_total: 0,
      content_total: 0,
      items: [],
    };
  }

  const columns = listColumns({ includeTranslations: true });
  const matchedColumns = normalizedType === 'content'
    ? []
    : columns
      .map((column) => {
        const score = scoreAiMentionColumn(column, normalizedKeyword);
        if (score <= 0) {
          return null;
        }

        return {
          type: 'column',
          id: Number(column.id || 0),
          title: String(column.name || '').trim(),
          subtitle: buildAiColumnSubtitle(column),
          column_id: Number(column.id || 0),
          column_name: String(column.name || '').trim(),
          model_code: String(column.model_code || '').trim(),
          summary: String(column.summary || '').trim(),
          route_path: String(column.route_path || '').trim(),
          score,
        };
      })
      .filter(Boolean)
      .sort(compareAiMentionItems)
      .slice(0, safeLimit);

  const modelCodes = Array.from(new Set(
    columns
      .map((column) => String(column.model_code || '').trim())
      .filter(Boolean)
  ));

  const matchedContentItems = normalizedType === 'column'
    ? []
    : modelCodes
      .flatMap((modelCode) => {
        const page = searchContentItemsPaged(modelCode, normalizedKeyword, {
          page: 1,
          limit: Math.min(safeLimit * 2, 20),
          visibleOnly: true,
        });

        return page.items.map((item) => ({
          type: 'content',
          id: Number(item.id || 0),
          title: String(item.name || '').trim(),
          subtitle: buildAiContentSubtitle(item, modelCode),
          model_code: modelCode,
          column_id: Number(item.column_id || 0) || null,
          column_name: String(item.column_name || '').trim(),
          code: String(item.code || '').trim(),
          summary: String(item.search_excerpt || item.summary || '').trim(),
          score: Number(item.search_score || 0),
        }));
      })
      .filter((item) => item.score > 0)
      .sort(compareAiMentionItems)
      .slice(0, safeLimit);

  const items = [...matchedContentItems, ...matchedColumns]
    .sort(compareAiMentionItems)
    .slice(0, safeLimit);

  return {
    total: items.length,
    columns_total: matchedColumns.length,
    content_total: matchedContentItems.length,
    items,
  };
}

export function getAiContentStats({ user, rootColumnId = null, modelCode = '' } = {}) {
  assertAiServicePermission(user, ['read:content']);

  const normalizedModelCode = String(modelCode || '').trim();
  if (!normalizedModelCode) {
    return {
      itemCount: 0,
      recentItems: [],
    };
  }

  const page = listContentItemsAdmin(normalizedModelCode, {
    page: 1,
    limit: 10,
    ...(rootColumnId ? { columnId: rootColumnId, includeDescendants: true } : {}),
  });

  return {
    itemCount: Number(page?.pagination?.total || 0),
    recentItems: Array.isArray(page?.items)
      ? page.items.slice(0, 10).map((item) => ({
        id: item.id,
        column_id: item.column_id,
        column_name: item.column_name || '',
        name: item.name,
        code: item.code || '',
        summary: item.summary || '',
      }))
      : [],
  };
}

export function lookupPriceForAi({
  user,
  sku,
  quantity = 1,
  region = 'CN',
  currency = 'CNY',
} = {}) {
  assertAiServicePermission(user, ['read:prices']);

  const normalizedSku = String(sku || '').trim().toUpperCase();
  const safeQuantity = Math.max(Number.parseInt(String(quantity || '1'), 10) || 1, 1);
  const normalizedRegion = String(region || 'CN').trim().toUpperCase() || 'CN';
  const normalizedCurrency = String(currency || 'CNY').trim().toUpperCase() || 'CNY';
  const unitPrice = estimateStubUnitPrice(normalizedSku, safeQuantity, normalizedRegion);

  return {
    sku: normalizedSku,
    quantity: safeQuantity,
    region: normalizedRegion,
    currency: normalizedCurrency,
    unit_price: unitPrice,
    line_total: Number((unitPrice * safeQuantity).toFixed(2)),
    price_source: 'stub_price_catalog',
    note: '当前为占位实现，后续应替换为正式价格服务或 ERP 接口',
  };
}

export function queryNewsForAi({
  user,
  keyword,
  categoryId = null,
  limit = 5,
} = {}) {
  assertAiServicePermission(user, ['read:all']);

  const db = getDb();
  const conditions = [];
  const params = [];
  const safeLimit = Math.min(Math.max(Number(limit) || 5, 1), 20);

  if (keyword) {
    conditions.push('(title LIKE ? OR summary LIKE ?)');
    const searchPattern = `%${String(keyword).trim()}%`;
    params.push(searchPattern, searchPattern);
  }

  if (Number.isInteger(Number(categoryId)) && Number(categoryId) > 0) {
    conditions.push('category_id = ?');
    params.push(Number(categoryId));
  }

  params.push(safeLimit);

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = db.prepare(`
    SELECT id, title, summary, category_name, created_at
    FROM news
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT ?
  `).all(...params);

  return {
    total: rows.length,
    news: rows.map((item) => ({
      id: item.id,
      title: item.title,
      summary: item.summary,
      category: item.category_name,
      date: item.created_at,
    })),
  };
}

export function queryContactsForAi({
  user,
  region,
} = {}) {
  assertAiServicePermission(user, ['read:all']);

  const db = getDb();
  const conditions = [];
  const params = [];

  if (region) {
    conditions.push('region LIKE ?');
    params.push(`%${String(region).trim()}%`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = db.prepare(`
    SELECT id, name, region, address, phone, email
    FROM contacts
    ${whereClause}
    ORDER BY sort_order ASC, id ASC
  `).all(...params);

  return {
    total: rows.length,
    contacts: rows.map((item) => ({
      id: item.id,
      name: item.name,
      region: item.region,
      address: item.address,
      phone: item.phone,
      email: item.email,
    })),
  };
}

function estimateStubUnitPrice(sku, quantity, region) {
  const skuScore = Array.from(String(sku || '')).reduce(
    (sum, char) => sum + char.charCodeAt(0),
    0
  );
  const base = 80 + (skuScore % 120);
  const regionFactor = String(region).toUpperCase() === 'CN' ? 1 : 1.15;
  const quantityFactor = quantity >= 10 ? 0.92 : quantity >= 5 ? 0.96 : 1;
  return Number((base * regionFactor * quantityFactor).toFixed(2));
}

function buildAiColumnSubtitle(column) {
  const parts = [];
  if (column.model_code) {
    parts.push(`模型 ${column.model_code}`);
  }
  if (column.route_path) {
    parts.push(column.route_path);
  } else if (column.dir_name) {
    parts.push(column.dir_name);
  }
  return parts.join(' · ');
}

function buildAiContentSubtitle(item, modelCode) {
  const parts = [];
  if (item.column_name) {
    parts.push(String(item.column_name).trim());
  }
  if (modelCode) {
    parts.push(`模型 ${modelCode}`);
  }
  if (item.code) {
    parts.push(`编号 ${String(item.code).trim()}`);
  }
  return parts.join(' · ');
}

function scoreAiMentionColumn(column, normalizedKeyword) {
  const fields = [
    { value: column.name, weight: 240 },
    { value: column.summary, weight: 100 },
    { value: column.model_code, weight: 80 },
    { value: column.route_path, weight: 60 },
    { value: column.dir_name, weight: 50 },
  ];

  let score = 0;
  for (const field of fields) {
    score += scoreAiMentionText(field.value, normalizedKeyword, field.weight);
  }
  return score;
}

function scoreAiMentionText(value, normalizedKeyword, weight) {
  const normalizedValue = String(value || '').trim().toLowerCase();
  if (!normalizedValue) {
    return 0;
  }

  const index = normalizedValue.indexOf(normalizedKeyword);
  if (index === -1) {
    return 0;
  }

  if (normalizedValue === normalizedKeyword) {
    return weight + 120;
  }
  if (normalizedValue.startsWith(normalizedKeyword)) {
    return weight + 60;
  }
  return Math.max(weight - Math.min(index, 40), 1);
}

function compareAiMentionItems(left, right) {
  const scoreDiff = Number(right?.score || 0) - Number(left?.score || 0);
  if (scoreDiff !== 0) {
    return scoreDiff;
  }

  return String(left?.title || '').localeCompare(String(right?.title || ''));
}
