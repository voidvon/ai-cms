import type { ReactNode } from 'react'
import { DataTablePagination, type DataTablePaginationProps } from '@/components/DataTablePagination'
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

type AdminDataTablePagination = Omit<DataTablePaginationProps, 'className'>

type AdminDataTableProps = {
  toolbar?: ReactNode
  columns: ReactNode
  children: ReactNode
  columnCount: number
  isLoading?: boolean
  isEmpty?: boolean
  error?: ReactNode
  loadingMessage?: ReactNode
  emptyMessage?: ReactNode
  className?: string
  toolbarClassName?: string
  tableClassName?: string
  tableContainerClassName?: string
  headerClassName?: string
  stateCellClassName?: string
  pagination?: AdminDataTablePagination | null
  paginationClassName?: string
  fill?: boolean
}

export function AdminDataTable({
  toolbar,
  columns,
  children,
  columnCount,
  isLoading = false,
  isEmpty = false,
  error,
  loadingMessage = '加载中...',
  emptyMessage = '暂无数据',
  className,
  toolbarClassName,
  tableClassName,
  tableContainerClassName,
  headerClassName,
  stateCellClassName,
  pagination,
  paginationClassName,
  fill = false,
}: AdminDataTableProps) {
  const stateContent = error
    ? error
    : isLoading
      ? loadingMessage
      : isEmpty
        ? emptyMessage
        : null

  return (
    <div className={cn('flex min-h-0 flex-col gap-4', fill && 'flex-1 overflow-hidden', className)}>
      {toolbar ? (
        <div
          className={cn(
            'flex min-h-10 shrink-0 flex-nowrap items-center gap-2 overflow-x-auto overflow-y-hidden overscroll-x-contain [&>*]:shrink-0',
            toolbarClassName,
          )}
        >
          {toolbar}
        </div>
      ) : null}

      <Table
        className={tableClassName}
        containerClassName={cn(
          'rounded-md border',
          fill && 'min-h-0 flex-1',
          tableContainerClassName,
        )}
      >
        <TableHeader className={cn('sticky top-0 z-10 bg-background', headerClassName)}>
          <TableRow>{columns}</TableRow>
        </TableHeader>
        <TableBody>
          {stateContent !== null ? (
            <TableRow>
              <TableCell
                colSpan={columnCount}
                className={cn('h-32 py-10 text-center text-muted-foreground', stateCellClassName)}
              >
                {stateContent}
              </TableCell>
            </TableRow>
          ) : children}
        </TableBody>
      </Table>

      {pagination ? (
        <DataTablePagination
          {...pagination}
          className={cn('shrink-0', paginationClassName)}
        />
      ) : null}
    </div>
  )
}
