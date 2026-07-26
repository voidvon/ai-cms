import { cn } from '@/lib/utils'
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
} from '@/components/ui/pagination'

export type DataTablePaginationProps = {
  page: number
  totalPages: number
  total: number
  pageSize?: number
  onPageChange: (page: number) => void
  className?: string
}

export function DataTablePagination({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
  className,
}: DataTablePaginationProps) {
  if (totalPages <= 1 && total === 0) {
    return (
      <div className={cn('text-sm text-muted-foreground', className)}>
        共 0 条
      </div>
    )
  }

  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3', className)}>
      <div className="text-sm text-muted-foreground">
        共 {total} 条{pageSize ? ` · 每页 ${pageSize} 条` : ''} · 第 {page} / {totalPages} 页
      </div>
      {totalPages > 1 ? (
        <Pagination className="mx-0 w-auto justify-end">
          <PaginationContent>
            <PaginationItem>
              <PaginationLink
                href="#"
                size="default"
                aria-label="上一页"
                className={page === 1 ? 'pointer-events-none opacity-50' : ''}
                onClick={(event) => {
                  event.preventDefault()
                  if (page > 1) {
                    onPageChange(page - 1)
                  }
                }}
              >
                上一页
              </PaginationLink>
            </PaginationItem>
            {buildPaginationItems(page, totalPages).map((item, index) => (
              item === 'ellipsis' ? (
                <PaginationItem key={`ellipsis-${index}`}>
                  <PaginationEllipsis />
                </PaginationItem>
              ) : (
                <PaginationItem key={item}>
                  <PaginationLink
                    href="#"
                    isActive={item === page}
                    aria-label={`第 ${item} 页`}
                    onClick={(event) => {
                      event.preventDefault()
                      onPageChange(item)
                    }}
                  >
                    {item}
                  </PaginationLink>
                </PaginationItem>
              )
            ))}
            <PaginationItem>
              <PaginationLink
                href="#"
                size="default"
                aria-label="下一页"
                className={page === totalPages ? 'pointer-events-none opacity-50' : ''}
                onClick={(event) => {
                  event.preventDefault()
                  if (page < totalPages) {
                    onPageChange(page + 1)
                  }
                }}
              >
                下一页
              </PaginationLink>
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      ) : null}
    </div>
  )
}

function buildPaginationItems(currentPage: number, totalPages: number): Array<number | 'ellipsis'> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }

  const items: Array<number | 'ellipsis'> = [1]
  const start = Math.max(2, currentPage - 1)
  const end = Math.min(totalPages - 1, currentPage + 1)
  if (start > 2) {
    items.push('ellipsis')
  }
  for (let page = start; page <= end; page += 1) {
    items.push(page)
  }
  if (end < totalPages - 1) {
    items.push('ellipsis')
  }
  items.push(totalPages)
  return items
}
