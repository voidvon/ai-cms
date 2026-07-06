import { useMemo, type ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Tree, type TreeItemData } from '@/components/ui/tree'
import { cn } from '@/lib/utils'
import type { Column } from '@/types'

interface ColumnTreeNode extends Column {
  children: ColumnTreeNode[]
}

type ColumnDisplayKind = 'node' | 'link' | 'single'

const COLUMN_KIND_META: Record<ColumnDisplayKind, { label: string; showTreeBadge: boolean }> = {
  node: {
    label: '栏目',
    showTreeBadge: false,
  },
  link: {
    label: '链接',
    showTreeBadge: true,
  },
  single: {
    label: '单页',
    showTreeBadge: true,
  },
}

export interface ColumnTreeSelectorProps {
  columns: Column[]
  value?: number | null
  onValueChange?: (column: Column) => void
  renderAction?: (item: TreeItemData<Column>) => ReactNode
  filter?: (column: Column) => boolean
  getBadgeVariant?: (column: Column) => 'default' | 'secondary' | 'destructive' | 'outline'
  getMetaText?: (column: Column) => ReactNode
  emptyText?: string
  className?: string
}

export function ColumnTreeSelector({
  columns,
  value,
  onValueChange,
  renderAction,
  filter,
  getBadgeVariant,
  getMetaText,
  emptyText = '暂无栏目',
  className,
}: ColumnTreeSelectorProps) {
  const tree = useMemo(() => buildColumnTree(columns, filter), [columns, filter])
  const items = useMemo<TreeItemData<Column>[]>(() => (
    tree.map((column) => toTreeItem(column, getBadgeVariant, getMetaText))
  ), [tree, getBadgeVariant, getMetaText])

  if (items.length === 0) {
    return <div className={cn('text-sm text-muted-foreground', className)}>{emptyText}</div>
  }

  return (
    <div className={className}>
      <Tree
        items={items}
        value={value || undefined}
        defaultExpandedIds={tree.map((column) => column.id)}
        onValueChange={(item) => item.data && onValueChange?.(item.data)}
        renderAction={renderAction}
      />
    </div>
  )
}

function buildColumnTree(columns: Column[], filter?: (column: Column) => boolean) {
  const visibleColumns = columns.filter((column) => shouldShowInColumnTree(column) && (filter ? filter(column) : true))
  const nodes = new Map<number, ColumnTreeNode>()
  const roots: ColumnTreeNode[] = []

  for (const column of visibleColumns) {
    nodes.set(column.id, { ...column, children: [] })
  }

  for (const node of nodes.values()) {
    const parent = node.parent_id ? nodes.get(Number(node.parent_id)) : null
    if (parent) {
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  }

  sortColumnTree(roots)
  return roots
}

function shouldShowInColumnTree(column: Column) {
  const displayKind = getColumnDisplayKind(column)
  if (displayKind === 'link' || displayKind === 'single') {
    return true
  }
  return column.column_type === 'list'
}

function sortColumnTree(nodes: ColumnTreeNode[]) {
  nodes.sort(compareColumnTreeNodes)
  for (const node of nodes) {
    sortColumnTree(node.children)
  }
}

function compareColumnTreeNodes(a: ColumnTreeNode, b: ColumnTreeNode) {
  const sortPriority = (a.sort_order || 0) - (b.sort_order || 0)
  if (sortPriority !== 0) {
    return sortPriority
  }
  return a.id - b.id
}

function getColumnDisplayKind(column: Column): ColumnDisplayKind {
  if (column.column_type === 'single') {
    return 'single'
  }
  if (column.column_type === 'link') {
    return 'link'
  }
  return 'node'
}

function toTreeItem(
  column: ColumnTreeNode,
  getBadgeVariant?: (column: Column) => 'default' | 'secondary' | 'destructive' | 'outline',
  getMetaText?: (column: Column) => ReactNode,
): TreeItemData<Column> {
  const displayKind = getColumnDisplayKind(column)
  const metaText = getMetaText?.(column) ?? `ID ${column.id}`

  return {
    id: column.id,
    label: (
      <div className="min-w-0 py-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{column.name}</span>
          {COLUMN_KIND_META[displayKind].showTreeBadge ? (
            <Badge
              variant={getBadgeVariant?.(column) || 'outline'}
              className="h-5 shrink-0 px-1.5 text-[10px]"
            >
              {COLUMN_KIND_META[displayKind].label}
            </Badge>
          ) : null}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {metaText}
        </div>
      </div>
    ),
    data: column,
    children: column.children.map((child) => toTreeItem(child, getBadgeVariant, getMetaText)),
  }
}
