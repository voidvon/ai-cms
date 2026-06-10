import * as React from 'react'
import { ChevronRight } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

export interface TreeItemData<T = unknown> {
  id: string | number
  label: React.ReactNode
  children?: TreeItemData<T>[]
  data?: T
  selectable?: boolean
}

interface TreeProps<T = unknown> {
  items: TreeItemData<T>[]
  value?: string | number
  onValueChange?: (item: TreeItemData<T>) => void
  defaultExpandedIds?: Array<string | number>
  renderAction?: (item: TreeItemData<T>) => React.ReactNode
  className?: string
}

export function Tree<T = unknown>({
  items,
  value,
  onValueChange,
  defaultExpandedIds = [],
  renderAction,
  className,
}: TreeProps<T>) {
  return (
    <div role="tree" className={cn('space-y-1', className)}>
      {items.map((item) => (
        <TreeItem
          key={String(item.id)}
          item={item}
          value={value}
          onValueChange={onValueChange}
          defaultExpandedIds={defaultExpandedIds}
          renderAction={renderAction}
          depth={0}
        />
      ))}
    </div>
  )
}

function TreeItem<T = unknown>({
  item,
  value,
  onValueChange,
  defaultExpandedIds,
  renderAction,
  depth,
}: {
  item: TreeItemData<T>
  value?: string | number
  onValueChange?: (item: TreeItemData<T>) => void
  defaultExpandedIds: Array<string | number>
  renderAction?: (item: TreeItemData<T>) => React.ReactNode
  depth: number
}) {
  const children = item.children || []
  const hasChildren = children.length > 0
  const selectable = item.selectable !== false
  const active = value === item.id
  const defaultOpen = defaultExpandedIds.includes(item.id) || hasSelectedDescendant(item, value)

  if (!hasChildren) {
    return (
      <div role="treeitem" aria-selected={active}>
        <div className="group/tree-item flex items-center" style={{ marginLeft: depth * 12 }}>
          <span className="h-8 w-7 shrink-0" aria-hidden="true" />
          <TreeItemButton item={item} active={active} depth={0} onValueChange={onValueChange} selectable={selectable} />
          {renderAction?.(item)}
        </div>
      </div>
    )
  }

  return (
    <Collapsible defaultOpen={defaultOpen}>
      <div role="treeitem" aria-selected={active} aria-expanded={defaultOpen}>
        <div className="group/tree-item flex items-center">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="group/tree-toggle flex h-8 w-7 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              style={{ marginLeft: depth * 12 }}
              aria-label="展开或收起"
            >
              <ChevronRight className="size-4 transition-transform group-data-[state=open]/tree-toggle:rotate-90" />
            </button>
          </CollapsibleTrigger>
          <TreeItemButton item={item} active={active} depth={0} onValueChange={onValueChange} selectable={selectable} />
          {renderAction?.(item)}
        </div>
      </div>
      <CollapsibleContent role="group">
        {children.map((child) => (
          <TreeItem
            key={String(child.id)}
            item={child}
            value={value}
            onValueChange={onValueChange}
            defaultExpandedIds={defaultExpandedIds}
            renderAction={renderAction}
            depth={depth + 1}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  )
}

function TreeItemButton<T = unknown>({
  item,
  active,
  depth,
  onValueChange,
  selectable,
}: {
  item: TreeItemData<T>
  active: boolean
  depth: number
  onValueChange?: (item: TreeItemData<T>) => void
  selectable: boolean
}) {
  return (
    <button
      type="button"
      onClick={() => {
        if (selectable) {
          onValueChange?.(item)
        }
      }}
      disabled={!selectable}
      className={cn(
        'min-h-8 min-w-0 flex-1 rounded px-2 py-1.5 text-left text-sm transition-colors',
        selectable ? 'hover:bg-muted' : 'cursor-default text-muted-foreground',
        active && 'bg-muted font-medium'
      )}
      style={{ marginLeft: depth * 12 }}
    >
      <span className="block truncate">{item.label}</span>
    </button>
  )
}

function hasSelectedDescendant<T = unknown>(item: TreeItemData<T>, value?: string | number): boolean {
  return Boolean(item.children?.some((child) => child.id === value || hasSelectedDescendant(child, value)))
}
