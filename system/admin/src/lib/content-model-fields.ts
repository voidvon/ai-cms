import type { ContentModelField } from '@/types'

export function mapFieldsByName(fields: ContentModelField[] = []) {
  return new Map(fields.map((field) => [field.field_name, field]))
}

export function isFieldEditable(fieldMap: Map<string, ContentModelField>, fieldName: string, defaultEditable = true) {
  const field = fieldMap.get(fieldName)
  if (!field) {
    return defaultEditable
  }
  return Number(field.is_editable ?? 1) === 1
}

export function getFieldLabel(fieldMap: Map<string, ContentModelField>, fieldName: string, fallbackLabel: string) {
  return fieldMap.get(fieldName)?.field_label || fallbackLabel
}
