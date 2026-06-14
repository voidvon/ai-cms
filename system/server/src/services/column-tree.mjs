function toInteger(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export function buildColumnTreeIndex(columns, predicate = null) {
  const rows = Array.isArray(columns) ? columns.filter((item) => (predicate ? predicate(item) : true)) : [];
  const byId = new Map(rows.map((item) => [toInteger(item.id, 0), item]));
  const childrenByParentId = new Map();

  for (const item of rows) {
    const parentId = toInteger(item.parent_id, 0);
    if (!childrenByParentId.has(parentId)) {
      childrenByParentId.set(parentId, []);
    }
    childrenByParentId.get(parentId).push(item);
  }

  return {
    rows,
    byId,
    childrenByParentId
  };
}

export function getChildColumns(childrenByParentId, parentId) {
  return childrenByParentId.get(toInteger(parentId, 0)) || [];
}

export function getDescendantColumnIds(childrenByParentId, rootId, { includeSelf = true } = {}) {
  const pending = includeSelf ? [toInteger(rootId, 0)] : getChildColumns(childrenByParentId, rootId).map((item) => toInteger(item.id, 0));
  const visited = new Set();

  while (pending.length > 0) {
    const currentId = pending.pop();
    if (visited.has(currentId)) {
      continue;
    }

    visited.add(currentId);
    for (const child of getChildColumns(childrenByParentId, currentId)) {
      const childId = toInteger(child.id, 0);
      if (!visited.has(childId)) {
        pending.push(childId);
      }
    }
  }

  return Array.from(visited);
}

export function isColumnUnderRoot(columnById, columnId, rootId) {
  const targetId = toInteger(rootId, 0);
  let currentId = toInteger(columnId, 0);

  while (currentId > 0) {
    if (currentId === targetId) {
      return true;
    }
    currentId = toInteger(columnById.get(currentId)?.parent_id, 0);
  }

  return false;
}

export function mergeLegacyCategoriesWithColumns({
  columns,
  categories,
  categorySourceType,
  rootSourceType = null
}) {
  const relevantRows = Array.isArray(columns)
    ? columns.filter((item) => (
      String(item?.column_kind || 'category') === 'category'
      && (
        String(item?.source_type || '') === categorySourceType
        || (rootSourceType && String(item?.source_type || '') === rootSourceType)
      )
    ))
    : [];
  const { byId } = buildColumnTreeIndex(relevantRows);
  const legacyById = new Map((Array.isArray(categories) ? categories : []).map((item) => [toInteger(item.id, 0), item]));

  return relevantRows
    .filter((item) => String(item.source_type || '') === categorySourceType)
    .map((item) => {
      const sourceId = toInteger(item.source_id, 0);
      const parent = byId.get(toInteger(item.parent_id, 0)) || null;
      const legacy = legacyById.get(sourceId) || {};
      let parentSourceId = 0;

      if (parent) {
        if (String(parent.source_type || '') === categorySourceType) {
          parentSourceId = toInteger(parent.source_id, 0);
        } else if (rootSourceType && String(parent.source_type || '') === rootSourceType) {
          parentSourceId = 0;
        }
      }

      return {
        ...legacy,
        id: sourceId,
        name: String(item.name || legacy.name || '').trim(),
        parent_id: parentSourceId,
        sort_order: toInteger(item.sort_order, toInteger(legacy.sort_order, 0)),
        content_html: legacy.content_html ?? item.content_html ?? '',
        seo_title: legacy.seo_title ?? item.seo_title ?? '',
        seo_keywords: legacy.seo_keywords ?? item.seo_keywords ?? '',
        seo_description: legacy.seo_description ?? item.seo_description ?? '',
        legacy_extra: legacy.legacy_extra ?? item.legacy_extra ?? null
      };
    })
    .sort((left, right) => {
      const parentDiff = toInteger(left.parent_id, 0) - toInteger(right.parent_id, 0);
      if (parentDiff !== 0) {
        return parentDiff;
      }
      const sortDiff = toInteger(left.sort_order, 0) - toInteger(right.sort_order, 0);
      if (sortDiff !== 0) {
        return sortDiff;
      }
      return toInteger(left.id, 0) - toInteger(right.id, 0);
    });
}
