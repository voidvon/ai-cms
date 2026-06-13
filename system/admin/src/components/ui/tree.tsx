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

export interface TreeMoveParams<T = unknown> {
  item: TreeItemData<T>
  parent: TreeItemData<T> | null
  fromIndex: number
  toIndex: number
  siblingItems: TreeItemData<T>[]
}

interface TreeProps<T = unknown> {
  items: TreeItemData<T>[]
  value?: string | number
  onValueChange?: (item: TreeItemData<T>) => void
  defaultExpandedIds?: Array<string | number>
  renderAction?: (item: TreeItemData<T>) => React.ReactNode
  canDrag?: (item: TreeItemData<T>, parent: TreeItemData<T> | null) => boolean
  onItemMove?: (params: TreeMoveParams<T>) => void
  className?: string
}

type DragState<T = unknown> = {
  item: TreeItemData<T>
  parent: TreeItemData<T> | null
  index: number
} | null

type DropIndicator = {
  targetId: string | number
  position: 'before' | 'after'
} | null

export function Tree<T = unknown>({
  items,
  value,
  onValueChange,
  defaultExpandedIds = [],
  renderAction,
  canDrag,
  onItemMove,
  className,
}: TreeProps<T>) {
  const [dragState, setDragState] = React.useState<DragState<T>>(null)
  const [dropIndicator, setDropIndicator] = React.useState<DropIndicator>(null)

  return (
    <div role="tree" className={cn('space-y-1', className)}>
      {items.map((item) => (
        <TreeItem
          key={String(item.id)}
          item={item}
          parentItem={null}
          siblingItems={items}
          index={items.findIndex((candidate) => candidate.id === item.id)}
          value={value}
          onValueChange={onValueChange}
          defaultExpandedIds={defaultExpandedIds}
          renderAction={renderAction}
          canDrag={canDrag}
          onItemMove={onItemMove}
          dragState={dragState}
          setDragState={setDragState}
          dropIndicator={dropIndicator}
          setDropIndicator={setDropIndicator}
          depth={0}
        />
      ))}
    </div>
  )
}

function TreeItem<T = unknown>({
  item,
  parentItem,
  siblingItems,
  index,
  value,
  onValueChange,
  defaultExpandedIds,
  renderAction,
  canDrag,
  onItemMove,
  dragState,
  setDragState,
  dropIndicator,
  setDropIndicator,
  depth,
}: {
  item: TreeItemData<T>
  parentItem: TreeItemData<T> | null
  siblingItems: TreeItemData<T>[]
  index: number
  value?: string | number
  onValueChange?: (item: TreeItemData<T>) => void
  defaultExpandedIds: Array<string | number>
  renderAction?: (item: TreeItemData<T>) => React.ReactNode
  canDrag?: (item: TreeItemData<T>, parent: TreeItemData<T> | null) => boolean
  onItemMove?: (params: TreeMoveParams<T>) => void
  dragState: DragState<T>
  setDragState: React.Dispatch<React.SetStateAction<DragState<T>>>
  dropIndicator: DropIndicator
  setDropIndicator: React.Dispatch<React.SetStateAction<DropIndicator>>
  depth: number
}) {
  const children = item.children || []
  const hasChildren = children.length > 0
  const selectable = item.selectable !== false
  const active = value === item.id
  const defaultOpen = defaultExpandedIds.includes(item.id) || hasSelectedDescendant(item, value)
  const draggable = Boolean(canDrag?.(item, parentItem))

  const handleDragStart = React.useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!draggable) {
      return
    }
    event.dataTransfer.effectAllowed = 'move'
    setDragState({ item, parent: parentItem, index })
  }, [draggable, index, item, parentItem, setDragState])

  const handleDragEnd = React.useCallback(() => {
    setDragState(null)
    setDropIndicator(null)
  }, [setDragState, setDropIndicator])

  const handleDragOver = React.useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!dragState || !onItemMove) {
      return
    }
    const sameParent = (dragState.parent?.id ?? null) === (parentItem?.id ?? null)
    if (!sameParent || dragState.item.id === item.id) {
      return
    }
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    const position = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
    setDropIndicator({ targetId: item.id, position })
  }, [dragState, item.id, onItemMove, parentItem, setDropIndicator])

  const handleDrop = React.useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!dragState || !onItemMove || !dropIndicator || dropIndicator.targetId !== item.id) {
      return
    }
    const sameParent = (dragState.parent?.id ?? null) === (parentItem?.id ?? null)
    if (!sameParent || dragState.item.id === item.id) {
      return
    }
    event.preventDefault()
    let toIndex = index + (dropIndicator.position === 'after' ? 1 : 0)
    if (dragState.index < toIndex) {
      toIndex -= 1
    }
    if (toIndex !== dragState.index) {
      onItemMove({
        item: dragState.item,
        parent: parentItem,
        fromIndex: dragState.index,
        toIndex,
        siblingItems,
      })
    }
    setDragState(null)
    setDropIndicator(null)
  }, [dragState, dropIndicator, index, item.id, onItemMove, parentItem, setDragState, setDropIndicator, siblingItems])

  const rowIndicatorClassName = dropIndicator?.targetId === item.id
    ? dropIndicator.position === 'before'
      ? 'border-t-2 border-primary'
      : 'border-b-2 border-primary'
    : ''

  if (!hasChildren) {
    return (
      <div role="treeitem" aria-selected={active}>
        <div
          className={cn('group/tree-item flex items-center', rowIndicatorClassName)}
          style={{ marginLeft: depth * 12 }}
          draggable={draggable}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <span className="h-8 w-7 shrink-0" aria-hidden="true" />
          <TreeItemButton
            item={item}
            active={active}
            depth={0}
            onValueChange={onValueChange}
            selectable={selectable}
            action={renderAction?.(item)}
          />
        </div>
      </div>
    )
  }

  return (
    <Collapsible defaultOpen={defaultOpen}>
      <div role="treeitem" aria-selected={active} aria-expanded={defaultOpen}>
        <div
          className={cn('group/tree-item flex items-center', rowIndicatorClassName)}
          draggable={draggable}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
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
          <TreeItemButton
            item={item}
            active={active}
            depth={0}
            onValueChange={onValueChange}
            selectable={selectable}
            action={renderAction?.(item)}
          />
        </div>
      </div>
      <CollapsibleContent role="group">
        {children.map((child) => (
          <TreeItem
            key={String(child.id)}
            item={child}
            parentItem={item}
            siblingItems={children}
            index={children.findIndex((candidate) => candidate.id === child.id)}
            value={value}
            onValueChange={onValueChange}
            defaultExpandedIds={defaultExpandedIds}
            renderAction={renderAction}
            canDrag={canDrag}
            onItemMove={onItemMove}
            dragState={dragState}
            setDragState={setDragState}
            dropIndicator={dropIndicator}
            setDropIndicator={setDropIndicator}
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
  action,
}: {
  item: TreeItemData<T>
  active: boolean
  depth: number
  onValueChange?: (item: TreeItemData<T>) => void
  selectable: boolean
  action?: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'min-h-8 min-w-0 flex flex-1 items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors',
        selectable ? 'hover:bg-muted' : 'cursor-default text-muted-foreground',
        active && 'bg-muted font-medium'
      )}
      style={{ marginLeft: depth * 12 }}
    >
      {selectable ? (
        <button
          type="button"
          onClick={() => onValueChange?.(item)}
          className="min-w-0 flex flex-1 items-center text-left"
        >
          <span className="block min-w-0 flex-1 truncate">{item.label}</span>
        </button>
      ) : (
        <span className="block min-w-0 flex-1 truncate">{item.label}</span>
      )}
      {action ? (
        <span
          className="shrink-0"
          onClick={(event) => event.stopPropagation()}
        >
          {action}
        </span>
      ) : null}
    </div>
  )
}

function hasSelectedDescendant<T = unknown>(item: TreeItemData<T>, value?: string | number): boolean {
  return Boolean(item.children?.some((child) => child.id === value || hasSelectedDescendant(child, value)))
}
