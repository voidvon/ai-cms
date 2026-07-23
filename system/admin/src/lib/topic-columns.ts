import type { Column } from '@/types'

export function resolveTopicColumns(columns: Column[]) {
  const byId = new Map(columns.map((column) => [column.id, column]))
  const root = columns.find((column) => (
    Number(column.parent_id || 0) <= 0
    && String(column.dir_name || '').trim() === 'topics'
    && String(column.route_path || '').trim() === '/topics/'
  ))
  if (!root) {
    return []
  }

  return columns.filter((column) => {
    let current: Column | undefined = column
    while (current) {
      if (current.id === root.id) {
        return true
      }
      const parentId = Number(current.parent_id || 0)
      current = parentId > 0 ? byId.get(parentId) : undefined
    }
    return false
  })
}

export function filterTopicColumns(columns: Column[]) {
  const topicColumnIds = new Set(resolveTopicColumns(columns).map((column) => column.id))
  if (!topicColumnIds.size) {
    return columns
  }
  return columns.filter((column) => !topicColumnIds.has(column.id))
}
