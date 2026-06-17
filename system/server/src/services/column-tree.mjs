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
