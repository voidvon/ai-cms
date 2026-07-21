import type { ReactNode } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { ContentTableViewColumn } from '@/types'

function getAlignmentClass(align: string) {
  if (align === 'right') return 'text-right'
  if (align === 'center') return 'text-center'
  return 'text-left'
}

export function ConfigurableDataTable<T>({
  columns,
  rows,
  rowKey,
  renderCell,
  renderActions,
  showRowNumbers = false,
}: {
  columns: ContentTableViewColumn[]
  rows: T[]
  rowKey: (row: T, index: number) => string | number
  renderCell: (row: T, column: ContentTableViewColumn) => ReactNode
  renderActions?: (row: T) => ReactNode
  showRowNumbers?: boolean
}) {
  return (
    <Table className="min-w-max" containerClassName="h-full">
      <TableHeader>
        <TableRow className="sticky top-0 z-10 bg-card hover:bg-card">
          {showRowNumbers ? (
            <TableHead className="sticky left-0 z-20 w-12 min-w-12 border-r bg-muted/80 px-2 text-center text-xs text-muted-foreground">
              #
            </TableHead>
          ) : null}
          {columns.map((column) => (
            <TableHead key={column.field_name} style={{ width: column.width, minWidth: column.width }} className={getAlignmentClass(column.align)}>
              {column.label}
            </TableHead>
          ))}
          {renderActions ? <TableHead className="sticky right-0 z-20 w-14 border-l bg-card text-right">操作</TableHead> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, index) => (
          <TableRow key={rowKey(row, index)} className="group/configurable-row">
            {showRowNumbers ? (
              <TableCell className="sticky left-0 z-10 h-10 w-12 border-r bg-muted/50 px-2 text-center text-xs text-muted-foreground group-hover/configurable-row:bg-muted">
                {index + 1}
              </TableCell>
            ) : null}
            {columns.map((column) => (
              <TableCell key={column.field_name} className={`h-10 border-r p-0 align-middle ${getAlignmentClass(column.align)}`}>
                {renderCell(row, column)}
              </TableCell>
            ))}
            {renderActions ? <TableCell className="sticky right-0 h-10 border-l bg-card p-1 text-right group-hover/configurable-row:bg-muted/50">{renderActions(row)}</TableCell> : null}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
