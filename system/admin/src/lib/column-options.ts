import type { Column } from '@/types'

export interface ColumnTreeOption {
  value: string
  label: string
  pathLabel: string
  depth: number
  column: Column
}

export function buildColumnTreeOptions(
  columns: Column[] = [],
  options: {
    selectableColumnIds?: Array<number | string>
  } = {},
) {
  const nodes = new Map<number, ColumnTreeNode>()
  const roots: ColumnTreeNode[] = []
  const selectableIds = options.selectableColumnIds
    ? new Set(options.selectableColumnIds.map((value) => Number(value)))
    : null

  for (const column of columns) {
    nodes.set(column.id, { column, children: [] })
  }

  for (const node of nodes.values()) {
    const parentId = Number(node.column.parent_id || 0)
    const parent = parentId > 0 ? nodes.get(parentId) || null : null
    if (parent) {
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  }

  const output: ColumnTreeOption[] = []
  for (const root of roots) {
    appendColumnNode(output, root, 0, [], selectableIds)
  }
  return output
}

export function buildColumnPathMap(columns: Column[] = []) {
  const options = buildColumnTreeOptions(columns)
  return new Map(options.map((option) => [option.column.id, option.pathLabel]))
}

interface ColumnTreeNode {
  column: Column
  children: ColumnTreeNode[]
}

function appendColumnNode(
  output: ColumnTreeOption[],
  node: ColumnTreeNode,
  depth: number,
  parentNames: string[],
  selectableIds: Set<number> | null,
) {
  const name = String(node.column.name || '').trim() || `#${node.column.id}`
  const pathNames = [...parentNames, name]
  const columnId = Number(node.column.id || 0)
  if (!selectableIds || selectableIds.has(columnId)) {
    output.push({
      value: String(node.column.id),
      label: `${buildTreePrefix(depth)}${name}`,
      pathLabel: pathNames.join(' / '),
      depth,
      column: node.column,
    })
  }

  const children = [...node.children].sort(compareColumns)
  for (const child of children) {
    appendColumnNode(output, child, depth + 1, pathNames, selectableIds)
  }
}

function compareColumns(left: ColumnTreeNode, right: ColumnTreeNode) {
  const sortDiff = Number(left.column.sort_order || 0) - Number(right.column.sort_order || 0)
  if (sortDiff !== 0) {
    return sortDiff
  }
  return Number(left.column.id || 0) - Number(right.column.id || 0)
}

function buildTreePrefix(depth: number) {
  if (depth <= 0) {
    return ''
  }
  return `${'\u00A0\u00A0\u00A0\u00A0'.repeat(Math.max(depth - 1, 0))}└ `
}
