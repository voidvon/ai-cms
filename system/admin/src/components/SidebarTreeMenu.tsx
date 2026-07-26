import { useState, type DragEvent, type ReactNode } from 'react'
import { ChevronRight, type LucideIcon } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'

export interface SidebarTreeMenuItem {
  id: string | number
  label: string
  icon?: LucideIcon
  active?: boolean
  children?: SidebarTreeMenuItem[]
  onSelect?: () => void
  defaultOpen?: boolean
  closeOnMobileClick?: boolean
  tooltip?: string
  className?: string
  action?: ReactNode
  expandOnly?: boolean
}

export interface SidebarTreeMenuMoveParams {
  item: SidebarTreeMenuItem
  parent: SidebarTreeMenuItem | null
  fromIndex: number
  toIndex: number
  siblingItems: SidebarTreeMenuItem[]
}

type DragState = {
  item: SidebarTreeMenuItem
  parent: SidebarTreeMenuItem | null
  index: number
} | null

type DropIndicator = {
  targetId: string | number
  position: 'before' | 'after'
} | null

export function SidebarTreeMenu({
  items,
  canDrag,
  onItemMove,
}: {
  items: SidebarTreeMenuItem[]
  canDrag?: (item: SidebarTreeMenuItem, parent: SidebarTreeMenuItem | null) => boolean
  onItemMove?: (params: SidebarTreeMenuMoveParams) => void
}) {
  const [dragState, setDragState] = useState<DragState>(null)
  const [dropIndicator, setDropIndicator] = useState<DropIndicator>(null)

  return (
    <SidebarMenu>
      {items.map((item, index) => (
        <SidebarTreeMenuNode
          key={item.id}
          item={item}
          parent={null}
          siblingItems={items}
          index={index}
          depth={0}
          canDrag={canDrag}
          onItemMove={onItemMove}
          dragState={dragState}
          setDragState={setDragState}
          dropIndicator={dropIndicator}
          setDropIndicator={setDropIndicator}
        />
      ))}
    </SidebarMenu>
  )
}

function SidebarTreeMenuNode({
  item,
  parent,
  siblingItems,
  index,
  depth,
  canDrag,
  onItemMove,
  dragState,
  setDragState,
  dropIndicator,
  setDropIndicator,
}: {
  item: SidebarTreeMenuItem
  parent: SidebarTreeMenuItem | null
  siblingItems: SidebarTreeMenuItem[]
  index: number
  depth: number
  canDrag?: (item: SidebarTreeMenuItem, parent: SidebarTreeMenuItem | null) => boolean
  onItemMove?: (params: SidebarTreeMenuMoveParams) => void
  dragState: DragState
  setDragState: (state: DragState) => void
  dropIndicator: DropIndicator
  setDropIndicator: (indicator: DropIndicator) => void
}) {
  const [open, setOpen] = useState(item.defaultOpen ?? false)
  const children = item.children || []
  const hasChildren = children.length > 0
  const isActive = Boolean(item.active || children.some(hasActiveItem))
  const draggable = Boolean(canDrag?.(item, parent))
  const rowIndicatorClassName = dropIndicator?.targetId === item.id
    ? dropIndicator.position === 'before'
      ? 'border-t-2 border-primary'
      : 'border-b-2 border-primary'
    : ''
  const rowDragProps = {
    draggable,
    onDragStart: (event: DragEvent<HTMLDivElement>) => {
      if (!draggable) return
      event.dataTransfer.effectAllowed = 'move'
      setDragState({ item, parent, index })
    },
    onDragEnd: () => {
      setDragState(null)
      setDropIndicator(null)
    },
    onDragOver: (event: DragEvent<HTMLDivElement>) => {
      if (!dragState || !onItemMove) return
      const sameParent = (dragState.parent?.id ?? null) === (parent?.id ?? null)
      if (!sameParent || dragState.item.id === item.id) return
      event.preventDefault()
      const rect = event.currentTarget.getBoundingClientRect()
      setDropIndicator({
        targetId: item.id,
        position: event.clientY < rect.top + rect.height / 2 ? 'before' : 'after',
      })
    },
    onDrop: (event: DragEvent<HTMLDivElement>) => {
      if (!dragState || !onItemMove || dropIndicator?.targetId !== item.id) return
      const sameParent = (dragState.parent?.id ?? null) === (parent?.id ?? null)
      if (!sameParent || dragState.item.id === item.id) return
      event.preventDefault()
      let toIndex = index + (dropIndicator.position === 'after' ? 1 : 0)
      if (dragState.index < toIndex) toIndex -= 1
      if (toIndex !== dragState.index) {
        onItemMove({ item: dragState.item, parent, fromIndex: dragState.index, toIndex, siblingItems })
      }
      setDragState(null)
      setDropIndicator(null)
    },
  }

  const renderChildren = () => children.map((child, childIndex) => (
    <SidebarTreeMenuNode
      key={child.id}
      item={child}
      parent={item}
      siblingItems={children}
      index={childIndex}
      depth={depth + 1}
      canDrag={canDrag}
      onItemMove={onItemMove}
      dragState={dragState}
      setDragState={setDragState}
      dropIndicator={dropIndicator}
      setDropIndicator={setDropIndicator}
    />
  ))

  if (!hasChildren) {
    return depth === 0 ? (
      <SidebarMenuItem>
        <div {...rowDragProps} className={cn(
          'group/sidebar-tree-row flex w-full items-center rounded-md',
          isActive && 'bg-sidebar-accent text-sidebar-accent-foreground',
          rowIndicatorClassName,
        )}>
          <SidebarMenuButton
            type="button"
            isActive={isActive}
            onClick={item.onSelect}
            closeOnMobileClick={item.closeOnMobileClick}
            tooltip={item.tooltip}
            className={cn('w-auto min-w-0 flex-1', item.className)}
          >
            {item.icon ? <item.icon /> : null}
            <span>{item.label}</span>
          </SidebarMenuButton>
          {item.action}
        </div>
      </SidebarMenuItem>
    ) : (
      <SidebarMenuSubItem>
        <div {...rowDragProps} className={cn(
          'group/sidebar-tree-row flex w-full items-center rounded-md',
          isActive && 'bg-sidebar-accent text-sidebar-accent-foreground',
          rowIndicatorClassName,
        )}>
          <SidebarMenuSubButton
            render={<button type="button" />}
            isActive={isActive}
            onClick={item.onSelect}
            closeOnMobileClick={item.closeOnMobileClick}
            className={cn('w-auto min-w-0 flex-1', item.className)}
          >
            {item.icon ? <item.icon /> : null}
            <span>{item.label}</span>
          </SidebarMenuSubButton>
          {item.action}
        </div>
      </SidebarMenuSubItem>
    )
  }

  const itemContents = (
    <>
      {item.icon ? <item.icon /> : null}
      <span>{item.label}</span>
    </>
  )
  const expandIcon = (
    <span className="sidebar-tree-expand-icon flex size-4 shrink-0 items-center justify-center">
      <ChevronRight className="size-4" />
    </span>
  )
  const expandLabel = `${open ? '收起' : '展开'}${item.label}`
  const expandTrigger = (
    <CollapsibleTrigger
      aria-label={expandLabel}
      title={expandLabel}
      className="sidebar-tree-expand-trigger flex size-8 shrink-0 items-center justify-center rounded-md text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2"
    >
      {expandIcon}
    </CollapsibleTrigger>
  )

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      {depth === 0 ? (
        <SidebarMenuItem>
          {item.onSelect ? (
            <div {...rowDragProps} className={cn(
              'group/sidebar-tree-row flex w-full items-center rounded-md',
              isActive && 'bg-sidebar-accent text-sidebar-accent-foreground',
              rowIndicatorClassName,
            )}>
              <SidebarMenuButton
                type="button"
                isActive={isActive}
                onClick={item.onSelect}
                closeOnMobileClick={item.closeOnMobileClick}
                tooltip={item.tooltip}
                className={cn('w-auto min-w-0 flex-1', item.className)}
              >
                {itemContents}
              </SidebarMenuButton>
              {item.action}
              {expandTrigger}
            </div>
          ) : item.expandOnly ? (
            <div {...rowDragProps} className={cn(
              'group/sidebar-tree-row flex w-full items-center rounded-md',
              isActive && 'bg-sidebar-accent text-sidebar-accent-foreground',
              rowIndicatorClassName,
            )}>
              <div className={cn('flex h-8 min-w-0 flex-1 items-center px-2 text-sm', item.className)}>
                {itemContents}
              </div>
              {item.action}
              {expandTrigger}
            </div>
          ) : (
            <CollapsibleTrigger
              render={(
                <SidebarMenuButton
                  type="button"
                  isActive={isActive}
                  tooltip={item.tooltip}
                  className={cn('sidebar-tree-expand-trigger', item.className)}
                />
              )}
            >
              {itemContents}
              <span className="ml-auto">{expandIcon}</span>
            </CollapsibleTrigger>
          )}
          <CollapsibleContent>
            <SidebarMenuSub>
              {renderChildren()}
            </SidebarMenuSub>
          </CollapsibleContent>
        </SidebarMenuItem>
      ) : (
        <SidebarMenuSubItem>
          {item.onSelect ? (
            <div {...rowDragProps} className={cn(
              'group/sidebar-tree-row flex w-full items-center rounded-md',
              isActive && 'bg-sidebar-accent text-sidebar-accent-foreground',
              rowIndicatorClassName,
            )}>
              <SidebarMenuSubButton
                render={<button type="button" />}
                isActive={isActive}
                onClick={item.onSelect}
                closeOnMobileClick={item.closeOnMobileClick}
                className={cn('w-auto min-w-0 flex-1', item.className)}
              >
                {itemContents}
              </SidebarMenuSubButton>
              {item.action}
              {expandTrigger}
            </div>
          ) : item.expandOnly ? (
            <div {...rowDragProps} className={cn(
              'group/sidebar-tree-row flex w-full items-center rounded-md',
              isActive && 'bg-sidebar-accent text-sidebar-accent-foreground',
              rowIndicatorClassName,
            )}>
              <div className={cn('flex h-7 min-w-0 flex-1 items-center px-2 text-sm', item.className)}>
                {itemContents}
              </div>
              {item.action}
              {expandTrigger}
            </div>
          ) : (
            <CollapsibleTrigger
              render={(
                <SidebarMenuSubButton
                  render={<button type="button" />}
                  isActive={isActive}
                  className={cn('sidebar-tree-expand-trigger w-full', item.className)}
                />
              )}
            >
              {itemContents}
              <span className="ml-auto">{expandIcon}</span>
            </CollapsibleTrigger>
          )}
          <CollapsibleContent>
            <SidebarMenuSub className="mr-0">
              {renderChildren()}
            </SidebarMenuSub>
          </CollapsibleContent>
        </SidebarMenuSubItem>
      )}
    </Collapsible>
  )
}

function hasActiveItem(item: SidebarTreeMenuItem): boolean {
  return Boolean(item.active || item.children?.some(hasActiveItem))
}
