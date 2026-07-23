const NON_CONTENT_MANAGEMENT_MODEL_CODES = new Set([
  'multidimensional_table',
])

export function isContentManagementModel(model: { code: string }) {
  return !NON_CONTENT_MANAGEMENT_MODEL_CODES.has(model.code)
}
