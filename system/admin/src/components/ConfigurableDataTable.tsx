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
}: {
  columns: ContentTableViewColumn[]
  rows: T[]
  rowKey: (row: T, index: number) => string | number
  renderCell: (row: T, column: ContentTableViewColumn) => ReactNode
  renderActions?: (row: T) => ReactNode
}) {
  return (
    <Table className="min-w-max" containerClassName="h-full">
      <TableHeader>
        <TableRow className="sticky top-0 z-10 bg-card hover:bg-card">
          {columns.map((column) => (
            <TableHead key={column.field_name} style={{ width: column.width, minWidth: column.width }} className={getAlignmentClass(column.align)}>
              {column.label}
            </TableHead>
          ))}
          {renderActions ? <TableHead className="w-14 text-right">操作</TableHead> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, index) => (
          <TableRow key={rowKey(row, index)} className="group/configurable-row">
            {columns.map((column) => (
              <TableCell key={column.field_name} className={`h-10 border-r p-0 align-middle ${getAlignmentClass(column.align)}`}>
                {renderCell(row, column)}
              </TableCell>
            ))}
            {renderActions ? <TableCell className="h-10 p-1 text-right">{renderActions(row)}</TableCell> : null}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
