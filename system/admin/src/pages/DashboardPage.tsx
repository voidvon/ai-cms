import { useEffect, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Check, ListFilter, Pencil, Plus, Trash2, X } from 'lucide-react'
import { adminApi, type AccessLogFilterParams } from '@/api/admin'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatRelativeTime } from '@/lib/datetime'
import { toast } from 'sonner'

const PAGE_SIZE = 20
const FILTER_INPUT_DEBOUNCE_MS = 300
const DASHBOARD_FILTER_STORAGE_KEY = 'ai-cms:dashboard:access-log-filters:v4'
const SAVED_FILTER_PRESETS_STORAGE_KEY = 'ai-cms:dashboard:saved-access-log-filters:v4'
const LEGACY_SAVED_FILTER_PRESETS_STORAGE_KEYS = [
  'ai-cms:dashboard:saved-access-log-filters:v3',
  'ai-cms:dashboard:saved-access-log-filters:v2',
  'ai-cms:dashboard:saved-access-log-filters:v1',
]
const LEGACY_DASHBOARD_FILTER_STORAGE_KEYS = [
  'ai-cms:dashboard:access-log-filters:v3',
  'ai-cms:dashboard:access-log-filters:v2',
  'ai-cms:dashboard:access-log-filters:v1',
]
const DEFAULT_USER_AGENT_KIND = 'non_bot'
const DEFAULT_REFERER_OPERATOR = 'not_empty'
const DEFAULT_EXCLUDED_REFERER_KEYWORD = 'spiraxsteam'

type UserAgentKindFilter = 'non_bot' | 'bot' | 'all'
type UserAgentKindValue = Exclude<UserAgentKindFilter, 'all'>
type StatusModeFilter = 'all' | '2xx' | '3xx' | '4xx' | '404' | '5xx'
type StatusModeValue = Exclude<StatusModeFilter, 'all'>
type AccessLogFilterField = 'referer' | 'user_agent_kind' | 'status_code'
type RefererFilterOperator = 'none_of' | 'contains' | 'not_contains' | 'empty' | 'not_empty'
type SelectionFilterOperator = 'is' | 'is_not'
type AccessLogFilterOperator = RefererFilterOperator | SelectionFilterOperator
type AccessLogFilterCondition = {
  id: string
  field: AccessLogFilterField
  operator: AccessLogFilterOperator
  value: string
}
type AppliedRefererFilterCondition = {
  operator: RefererFilterOperator
  value: string
}
type AppliedUserAgentFilterCondition = {
  operator: SelectionFilterOperator
  value: UserAgentKindValue
}
type AppliedStatusFilterCondition = {
  operator: SelectionFilterOperator
  value: StatusModeValue
}
type DashboardFilters = {
  path: string
  ip: string
  userAgentFilter: AppliedUserAgentFilterCondition | null
  refererFilters: AppliedRefererFilterCondition[]
  statusFilter: AppliedStatusFilterCondition | null
}
type NormalizedAccessLogFilters = Pick<
  DashboardFilters,
  'userAgentFilter' | 'refererFilters' | 'statusFilter'
>
type SavedAccessLogFilterPreset = NormalizedAccessLogFilters & {
  id: string
  name: string
  isDefault: boolean
}
type FilterNormalizationResult = {
  filters: NormalizedAccessLogFilters
  error?: string
}

let accessLogFilterIdSequence = 0
let savedFilterPresetIdSequence = 0

function createAccessLogFilterCondition(
  field: AccessLogFilterField = 'referer',
  operator?: AccessLogFilterOperator,
  value = ''
): AccessLogFilterCondition {
  accessLogFilterIdSequence += 1

  if (field === 'user_agent_kind') {
    return {
      id: `access-log-filter-${accessLogFilterIdSequence}`,
      field,
      operator: isSelectionFilterOperator(operator) ? operator : 'is',
      value: isUserAgentKindValue(value) ? value : DEFAULT_USER_AGENT_KIND,
    }
  }

  if (field === 'status_code') {
    return {
      id: `access-log-filter-${accessLogFilterIdSequence}`,
      field,
      operator: isSelectionFilterOperator(operator) ? operator : 'is',
      value: isStatusModeValue(value) ? value : '2xx',
    }
  }

  return {
    id: `access-log-filter-${accessLogFilterIdSequence}`,
    field,
    operator: isRefererFilterOperator(operator) ? operator : 'contains',
    value,
  }
}

function refererOperatorNeedsValue(operator: RefererFilterOperator) {
  return operator !== 'empty' && operator !== 'not_empty'
}

function filterShowsValueControl(filter: AccessLogFilterCondition) {
  return filter.field !== 'referer'
    || (isRefererFilterOperator(filter.operator) && refererOperatorNeedsValue(filter.operator))
}

function createFilterInputs(filters: DashboardFilters): AccessLogFilterCondition[] {
  const inputs = filters.refererFilters.map((filter) => (
    createAccessLogFilterCondition('referer', filter.operator, filter.value)
  ))

  if (filters.userAgentFilter) {
    inputs.push(createAccessLogFilterCondition(
      'user_agent_kind',
      filters.userAgentFilter.operator,
      filters.userAgentFilter.value
    ))
  }

  if (filters.statusFilter) {
    inputs.push(createAccessLogFilterCondition(
      'status_code',
      filters.statusFilter.operator,
      filters.statusFilter.value
    ))
  }

  return inputs.length > 0
    ? inputs
    : [createAccessLogFilterCondition('referer', DEFAULT_REFERER_OPERATOR)]
}

function normalizeAccessLogFilterInputs(
  inputs: AccessLogFilterCondition[],
  allowIncomplete = false
): FilterNormalizationResult {
  const refererFilters: AppliedRefererFilterCondition[] = []
  let userAgentFilter: AppliedUserAgentFilterCondition | null = null
  let statusFilter: AppliedStatusFilterCondition | null = null

  for (const [index, filter] of inputs.entries()) {
    if (filter.field === 'referer') {
      const operator = isRefererFilterOperator(filter.operator) ? filter.operator : 'contains'
      const value = filter.value.trim()
      if (refererOperatorNeedsValue(operator) && !value) {
        if (allowIncomplete) {
          continue
        }
        return {
          filters: { userAgentFilter, refererFilters, statusFilter },
          error: `请输入第 ${index + 1} 行的来源筛选值`,
        }
      }
      refererFilters.push({ operator, value })
      continue
    }

    if (filter.field === 'user_agent_kind') {
      if (userAgentFilter) {
        return {
          filters: { userAgentFilter, refererFilters, statusFilter },
          error: '“是否爬虫”筛选条件只能添加一条',
        }
      }

      userAgentFilter = {
        operator: isSelectionFilterOperator(filter.operator) ? filter.operator : 'is',
        value: isUserAgentKindValue(filter.value) ? filter.value : DEFAULT_USER_AGENT_KIND,
      }
      continue
    }

    if (statusFilter) {
      return {
        filters: { userAgentFilter, refererFilters, statusFilter },
        error: '“状态”筛选条件只能添加一条',
      }
    }

    statusFilter = {
      operator: isSelectionFilterOperator(filter.operator) ? filter.operator : 'is',
      value: isStatusModeValue(filter.value) ? filter.value : '2xx',
    }
  }

  return {
    filters: { userAgentFilter, refererFilters, statusFilter },
  }
}

function advancedFiltersEqual(filters: DashboardFilters, normalized: NormalizedAccessLogFilters) {
  return createAdvancedFilterSignature(filters) === createAdvancedFilterSignature(normalized)
}

function createAdvancedFilterSignature(filters: NormalizedAccessLogFilters) {
  const refererFilters = [...filters.refererFilters].sort((left, right) => {
    const leftValue = `${left.operator}\u0000${left.value}`
    const rightValue = `${right.operator}\u0000${right.value}`
    return leftValue.localeCompare(rightValue)
  })

  return JSON.stringify({
    userAgentFilter: filters.userAgentFilter,
    refererFilters,
    statusFilter: filters.statusFilter,
  })
}

function getUserAgentKindFilter(filter: AppliedUserAgentFilterCondition | null): UserAgentKindFilter {
  if (!filter) {
    return 'all'
  }

  if (filter.operator === 'is') {
    return filter.value
  }

  return filter.value === 'bot' ? 'non_bot' : 'bot'
}

function getStatusModeFilter(filter: AppliedStatusFilterCondition | null): StatusModeFilter {
  return filter?.value || 'all'
}

function createAccessLogFilterParams(filters: DashboardFilters): AccessLogFilterParams {
  return {
    path: filters.path || undefined,
    ip: filters.ip || undefined,
    userAgentKind: getUserAgentKindFilter(filters.userAgentFilter),
    refererFilters: filters.refererFilters.length > 0
      ? JSON.stringify(filters.refererFilters)
      : undefined,
    statusMode: getStatusModeFilter(filters.statusFilter),
    statusOperator: filters.statusFilter?.operator || 'is',
  }
}

function createDefaultDashboardFilters(): DashboardFilters {
  return {
    path: '',
    ip: '',
    userAgentFilter: {
      operator: 'is',
      value: DEFAULT_USER_AGENT_KIND,
    },
    refererFilters: [
      {
        operator: DEFAULT_REFERER_OPERATOR,
        value: '',
      },
      {
        operator: 'not_contains',
        value: DEFAULT_EXCLUDED_REFERER_KEYWORD,
      },
    ],
    statusFilter: null,
  }
}

function loadDashboardFilters(): DashboardFilters {
  const defaults = createDefaultDashboardFilters()
  if (typeof window === 'undefined') {
    return defaults
  }

  try {
    const currentStoredValue = window.localStorage.getItem(DASHBOARD_FILTER_STORAGE_KEY)
    const legacyStoredValue = LEGACY_DASHBOARD_FILTER_STORAGE_KEYS
      .map((key) => window.localStorage.getItem(key))
      .find(Boolean)
    const storedValue = currentStoredValue || legacyStoredValue
    if (!storedValue) {
      return defaults
    }

    const parsed: unknown = JSON.parse(storedValue)
    if (!isRecord(parsed)) {
      return defaults
    }

    const refererFilters = Array.isArray(parsed.refererFilters)
      ? parsed.refererFilters
          .slice(0, 10)
          .filter(isRecord)
          .map((filter) => ({
            operator: filter.operator,
            value: typeof filter.value === 'string' ? filter.value.trim() : '',
          }))
          .filter((filter): filter is AppliedRefererFilterCondition => (
            isRefererFilterOperator(filter.operator)
            && (!refererOperatorNeedsValue(filter.operator) || Boolean(filter.value))
          ))
      : defaults.refererFilters

    const userAgentFilter = normalizeStoredUserAgentFilter(parsed)
    const statusFilter = normalizeStoredStatusFilter(parsed)
    const migratedRefererFilters = !currentStoredValue && isLegacyDefaultFilterSet(
      refererFilters,
      userAgentFilter,
      statusFilter
    )
      ? [
          ...refererFilters,
          {
            operator: 'not_contains' as const,
            value: DEFAULT_EXCLUDED_REFERER_KEYWORD,
          },
        ]
      : refererFilters

    return {
      path: typeof parsed.path === 'string' ? parsed.path : defaults.path,
      ip: typeof parsed.ip === 'string' ? parsed.ip : defaults.ip,
      userAgentFilter,
      refererFilters: migratedRefererFilters,
      statusFilter,
    }
  } catch {
    return defaults
  }
}

function isLegacyDefaultFilterSet(
  refererFilters: AppliedRefererFilterCondition[],
  userAgentFilter: AppliedUserAgentFilterCondition | null,
  statusFilter: AppliedStatusFilterCondition | null
) {
  return refererFilters.length === 1
    && refererFilters[0].operator === DEFAULT_REFERER_OPERATOR
    && refererFilters[0].value === ''
    && userAgentFilter?.operator === 'is'
    && userAgentFilter.value === DEFAULT_USER_AGENT_KIND
    && statusFilter === null
}

function persistDashboardFilters(filters: DashboardFilters) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(DASHBOARD_FILTER_STORAGE_KEY, JSON.stringify(filters))
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

function createDefaultSavedFilterPresets(): SavedAccessLogFilterPreset[] {
  return [
    {
      id: 'default-error-records',
      name: '错误记录',
      isDefault: true,
      userAgentFilter: null,
      refererFilters: [],
      statusFilter: {
        operator: 'is_not',
        value: '2xx',
      },
    },
    {
      id: 'default-real-referer',
      name: '真实来源',
      isDefault: true,
      userAgentFilter: {
        operator: 'is',
        value: 'non_bot',
      },
      refererFilters: [
        {
          operator: 'not_empty',
          value: '',
        },
        {
          operator: 'not_contains',
          value: 'spiraxsteam',
        },
      ],
      statusFilter: null,
    },
  ]
}

function mergeDefaultSavedFilterPresets(presets: SavedAccessLogFilterPreset[]) {
  const defaults = createDefaultSavedFilterPresets()
  const defaultSignatures = new Set(defaults.map(createAdvancedFilterSignature))
  const customPresets = presets.filter((preset) => (
    !defaultSignatures.has(createAdvancedFilterSignature(preset))
  ))
  return [...defaults, ...customPresets].slice(0, 10)
}

function loadSavedFilterPresets(): SavedAccessLogFilterPreset[] {
  if (typeof window === 'undefined') {
    return createDefaultSavedFilterPresets()
  }

  try {
    const currentStoredValue = window.localStorage.getItem(SAVED_FILTER_PRESETS_STORAGE_KEY)
    const legacyStoredValue = LEGACY_SAVED_FILTER_PRESETS_STORAGE_KEYS
      .map((key) => window.localStorage.getItem(key))
      .find(Boolean)
    const storedValue = currentStoredValue || legacyStoredValue
    if (!storedValue) {
      return createDefaultSavedFilterPresets()
    }

    const parsed: unknown = JSON.parse(storedValue)
    if (!Array.isArray(parsed)) {
      return createDefaultSavedFilterPresets()
    }

    const presets = parsed
      .slice(0, 10)
      .filter(isRecord)
      .map((preset, index) => {
        if (
          typeof preset.id !== 'string'
          || !Array.isArray(preset.refererFilters)
          || !('userAgentFilter' in preset)
          || !('statusFilter' in preset)
        ) {
          return null
        }

        const refererFilters = preset.refererFilters
          .slice(0, 10)
          .filter(isRecord)
          .map((filter) => ({
            operator: filter.operator,
            value: typeof filter.value === 'string' ? filter.value.trim() : '',
          }))
          .filter((filter): filter is AppliedRefererFilterCondition => (
            isRefererFilterOperator(filter.operator)
            && (!refererOperatorNeedsValue(filter.operator) || Boolean(filter.value))
          ))
        const userAgentFilter = normalizeStoredUserAgentFilter(preset)
        const statusFilter = normalizeStoredStatusFilter(preset)
        if (refererFilters.length === 0 && !userAgentFilter && !statusFilter) {
          return null
        }

        return {
          id: preset.id,
          name: typeof preset.name === 'string' && preset.name.trim()
            ? preset.name.trim().slice(0, 40)
            : `筛选条件 ${index + 1}`,
          isDefault: preset.isDefault === true,
          refererFilters,
          userAgentFilter,
          statusFilter,
        }
      })
      .filter((preset): preset is SavedAccessLogFilterPreset => Boolean(preset))

    return mergeDefaultSavedFilterPresets(presets)
  } catch {
    return createDefaultSavedFilterPresets()
  }
}

function persistSavedFilterPresets(presets: SavedAccessLogFilterPreset[]) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(SAVED_FILTER_PRESETS_STORAGE_KEY, JSON.stringify(presets))
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

function createSavedFilterPresetId() {
  savedFilterPresetIdSequence += 1
  return `saved-filter-${Date.now()}-${savedFilterPresetIdSequence}`
}

function createSavedFilterPresetName(presets: SavedAccessLogFilterPreset[]) {
  const existingNames = new Set(presets.map((preset) => preset.name))
  let index = 1
  while (existingNames.has(`筛选条件 ${index}`)) {
    index += 1
  }
  return `筛选条件 ${index}`
}

function getSavedFilterPresetDescription(preset: SavedAccessLogFilterPreset) {
  const labels = preset.refererFilters.map((filter) => {
    if (filter.operator === 'empty') return '来源为空'
    if (filter.operator === 'not_empty') return '来源不为空'
    if (filter.operator === 'contains') return `来源包含 ${filter.value}`
    if (filter.operator === 'not_contains') return `来源不包含 ${filter.value}`
    return `来源均不属于 ${filter.value}`
  })

  if (preset.userAgentFilter) {
    const operator = preset.userAgentFilter.operator === 'is' ? '等于' : '不等于'
    const value = preset.userAgentFilter.value === 'bot' ? '是（爬虫）' : '否（非爬虫）'
    labels.push(`是否爬虫${operator}${value}`)
  }

  if (preset.statusFilter) {
    const operator = preset.statusFilter.operator === 'is' ? '等于' : '不等于'
    labels.push(`状态${operator}${preset.statusFilter.value}`)
  }

  return labels.join(' · ')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isUserAgentKindValue(value: unknown): value is UserAgentKindValue {
  return value === 'non_bot' || value === 'bot'
}

function isSelectionFilterOperator(value: unknown): value is SelectionFilterOperator {
  return value === 'is' || value === 'is_not'
}

function normalizeStoredUserAgentFilter(parsed: Record<string, unknown>): AppliedUserAgentFilterCondition | null {
  if ('userAgentFilter' in parsed) {
    if (!isRecord(parsed.userAgentFilter)) {
      return null
    }

    const operator = parsed.userAgentFilter.operator
    const value = parsed.userAgentFilter.value
    if (isSelectionFilterOperator(operator) && isUserAgentKindValue(value)) {
      return { operator, value }
    }

    return null
  }

  if (isUserAgentKindValue(parsed.userAgentKind)) {
    return {
      operator: 'is',
      value: parsed.userAgentKind,
    }
  }

  if (parsed.userAgentKind === 'all') {
    return null
  }

  return {
    operator: 'is',
    value: DEFAULT_USER_AGENT_KIND,
  }
}

function normalizeStoredStatusFilter(parsed: Record<string, unknown>): AppliedStatusFilterCondition | null {
  if ('statusFilter' in parsed) {
    if (!isRecord(parsed.statusFilter)) {
      return null
    }

    const operator = parsed.statusFilter.operator
    const value = parsed.statusFilter.value
    if (isSelectionFilterOperator(operator) && isStatusModeValue(value)) {
      return { operator, value }
    }

    return null
  }

  if (isStatusModeValue(parsed.statusMode)) {
    return {
      operator: 'is',
      value: parsed.statusMode,
    }
  }

  return null
}

function isStatusModeValue(value: unknown): value is StatusModeValue {
  return value === '2xx'
    || value === '3xx'
    || value === '4xx'
    || value === '404'
    || value === '5xx'
}

function isRefererFilterOperator(value: unknown): value is RefererFilterOperator {
  return value === 'none_of'
    || value === 'contains'
    || value === 'not_contains'
    || value === 'empty'
    || value === 'not_empty'
}

export default function DashboardPage() {
  const [topPagesOpen, setTopPagesOpen] = useState(false)
  const [clearDialogOpen, setClearDialogOpen] = useState(false)
  const [filterPanelOpen, setFilterPanelOpen] = useState(false)
  const [filters, setFilters] = useState<DashboardFilters>(loadDashboardFilters)
  const [page, setPage] = useState(1)
  const [pathInput, setPathInput] = useState(filters.path)
  const [ipInput, setIpInput] = useState(filters.ip)
  const [filterInputs, setFilterInputs] = useState<AccessLogFilterCondition[]>(() => createFilterInputs(filters))
  const [savedFilterPresets, setSavedFilterPresets] = useState<SavedAccessLogFilterPreset[]>(loadSavedFilterPresets)
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null)
  const [editingPresetName, setEditingPresetName] = useState('')

  useEffect(() => {
    persistDashboardFilters(filters)
  }, [filters])

  useEffect(() => {
    persistSavedFilterPresets(savedFilterPresets)
  }, [savedFilterPresets])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const normalized = normalizeAccessLogFilterInputs(filterInputs, true)
      if (normalized.error || advancedFiltersEqual(filters, normalized.filters)) {
        return
      }

      setPage(1)
      setFilters((current) => ({
        ...current,
        ...normalized.filters,
      }))
    }, FILTER_INPUT_DEBOUNCE_MS)

    return () => window.clearTimeout(timeoutId)
  }, [filterInputs, filters])

  const accessLogFilterParams = createAccessLogFilterParams(filters)

  const summaryQuery = useQuery({
    queryKey: ['dashboard-access-log-summary'],
    queryFn: () => adminApi.getAccessLogSummary(),
  })

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['dashboard-access-logs', page, filters.path, filters.ip, filters.userAgentFilter, filters.refererFilters, filters.statusFilter],
    queryFn: () => adminApi.listAccessLogs({
      ...accessLogFilterParams,
      page,
      limit: PAGE_SIZE,
    }),
  })

  const items = data?.data?.items || []
  const pagination = data?.data?.pagination
  const summary = summaryQuery.data?.data
  const metrics = summary?.metrics
  const topPages = summary?.top_pages || []
  const total = pagination?.total || 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const activeFilterSignature = createAdvancedFilterSignature(filters)
  const normalizedFilterInputs = normalizeAccessLogFilterInputs(filterInputs)
  const canSaveFilterPreset = !normalizedFilterInputs.error && (
    normalizedFilterInputs.filters.refererFilters.length
    + (normalizedFilterInputs.filters.userAgentFilter ? 1 : 0)
    + (normalizedFilterInputs.filters.statusFilter ? 1 : 0)
  ) > 0

  const clearLogsMutation = useMutation({
    mutationFn: (params: AccessLogFilterParams) => adminApi.clearAccessLogs(params),
    onSuccess: (result) => {
      const deletedCount = result.data?.deleted_count ?? 0
      toast.success(`已清空当前筛选条件下的 ${deletedCount} 条访问记录`)
      setClearDialogOpen(false)
      setPage(1)
      void refetch()
      void summaryQuery.refetch()
    },
    onError: (error: Error) => {
      toast.error(error.message || '清空访问记录失败')
    },
  })

  const applyFilters = () => {
    setPage(1)
    setFilters({
      path: pathInput.trim(),
      ip: ipInput.trim(),
      userAgentFilter: filters.userAgentFilter,
      refererFilters: filters.refererFilters,
      statusFilter: filters.statusFilter,
    })
  }

  const saveAccessLogFilters = () => {
    const normalized = normalizeAccessLogFilterInputs(filterInputs)
    if (normalized.error) {
      toast.error(normalized.error)
      return
    }

    const conditionCount = normalized.filters.refererFilters.length
      + (normalized.filters.userAgentFilter ? 1 : 0)
      + (normalized.filters.statusFilter ? 1 : 0)
    if (conditionCount === 0) {
      toast.error('请至少添加一条完整的筛选条件')
      return
    }

    const signature = createAdvancedFilterSignature(normalized.filters)
    if (savedFilterPresets.some((preset) => createAdvancedFilterSignature(preset) === signature)) {
      toast.info('该筛选条件已保存')
      return
    }

    setSavedFilterPresets((current) => [
      {
        id: createSavedFilterPresetId(),
        name: createSavedFilterPresetName(current),
        isDefault: false,
        ...normalized.filters,
      },
      ...current,
    ].slice(0, 10))
    toast.success('筛选条件已保存到本地')
  }

  const restoreSavedFilterPreset = (preset: SavedAccessLogFilterPreset) => {
    const normalized: NormalizedAccessLogFilters = {
      userAgentFilter: preset.userAgentFilter,
      refererFilters: preset.refererFilters,
      statusFilter: preset.statusFilter,
    }
    setPage(1)
    setFilterInputs(createFilterInputs({ ...filters, ...normalized }))
    setFilters((current) => ({
      ...current,
      ...normalized,
    }))
  }

  const deleteSavedFilterPreset = (id: string) => {
    if (savedFilterPresets.some((preset) => preset.id === id && preset.isDefault)) {
      return
    }
    setSavedFilterPresets((current) => current.filter((preset) => preset.id !== id))
    if (editingPresetId === id) {
      setEditingPresetId(null)
      setEditingPresetName('')
    }
  }

  const startEditingSavedFilterPreset = (preset: SavedAccessLogFilterPreset) => {
    if (preset.isDefault) {
      return
    }
    setEditingPresetId(preset.id)
    setEditingPresetName(preset.name)
  }

  const cancelEditingSavedFilterPreset = () => {
    setEditingPresetId(null)
    setEditingPresetName('')
  }

  const saveSavedFilterPresetName = () => {
    const name = editingPresetName.trim().slice(0, 40)
    if (!editingPresetId || !name) {
      toast.error('请输入筛选名称')
      return
    }

    setSavedFilterPresets((current) => current.map((preset) => (
      preset.id === editingPresetId && !preset.isDefault ? { ...preset, name } : preset
    )))
    setEditingPresetId(null)
    setEditingPresetName('')
    toast.success('筛选名称已更新')
  }

  const handleFilterPanelOpenChange = (open: boolean) => {
    if (open) {
      setFilterInputs(createFilterInputs(filters))
    }
    setFilterPanelOpen(open)
  }

  const addAccessLogFilter = () => {
    setFilterInputs((current) => [
      ...current,
      createAccessLogFilterCondition(),
    ])
  }

  const updateAccessLogFilter = (
    id: string,
    patch: Partial<Pick<AccessLogFilterCondition, 'operator' | 'value'>>
  ) => {
    setFilterInputs((current) => current.map((filter) => (
      filter.id === id ? { ...filter, ...patch } : filter
    )))
  }

  const changeAccessLogFilterField = (id: string, field: AccessLogFilterField) => {
    setFilterInputs((current) => current.map((filter) => (
      filter.id === id
        ? createAccessLogFilterCondition(field)
        : filter
    )))
  }

  const removeAccessLogFilter = (id: string) => {
    setFilterInputs((current) => current.filter((filter) => filter.id !== id))
  }

  const clearAccessLogFilters = () => {
    setPage(1)
    setFilterInputs([createAccessLogFilterCondition('referer', 'contains')])
    setFilters((current) => ({
      ...current,
      userAgentFilter: null,
      refererFilters: [],
      statusFilter: null,
    }))
    setFilterPanelOpen(false)
  }

  const refreshLogs = () => {
    void refetch()
  }

  const confirmClearLogs = () => {
    clearLogsMutation.mutate(accessLogFilterParams)
  }

  return (
    <div className="flex min-h-full flex-col gap-4 md:h-full md:min-h-0 md:overflow-hidden">
      <div className="flex shrink-0 gap-2 overflow-x-auto pb-0.5">
        <Card className="h-[88px] w-[110px] shrink-0">
          <CardHeader className="h-full items-center justify-center gap-1 p-2 text-center">
            <CardTitle className="text-[20px] leading-none">{metrics?.today_visits ?? 0}</CardTitle>
            <CardDescription className="text-[14px] leading-tight">今日访问</CardDescription>
          </CardHeader>
        </Card>
        <Card className="h-[88px] w-[110px] shrink-0">
          <CardHeader className="h-full items-center justify-center gap-1 p-2 text-center">
            <CardTitle className="text-[20px] leading-none">{metrics?.recent_visits ?? 0}</CardTitle>
            <CardDescription className="text-[14px] leading-tight">24h访问</CardDescription>
          </CardHeader>
        </Card>
        <Card className="h-[88px] w-[110px] shrink-0">
          <CardHeader className="h-full items-center justify-center gap-1 p-2 text-center">
            <CardTitle className="text-[20px] leading-none">{metrics?.recent_real_users ?? 0}</CardTitle>
            <CardDescription className="text-[14px] leading-tight">24h用户</CardDescription>
          </CardHeader>
        </Card>
        <Card className="h-[88px] w-[110px] shrink-0">
          <CardHeader className="h-full items-center justify-center gap-1 p-2 text-center">
            <CardTitle className="text-[20px] leading-none">{metrics?.recent_pc_users ?? 0}</CardTitle>
            <CardDescription className="text-[14px] leading-tight">24h PC用户</CardDescription>
          </CardHeader>
        </Card>
        <Card className="h-[88px] w-[110px] shrink-0">
          <CardHeader className="h-full items-center justify-center gap-1 p-2 text-center">
            <CardTitle className="text-[20px] leading-none">{metrics?.recent_mobile_users ?? 0}</CardTitle>
            <CardDescription className="text-[14px] leading-tight">24h移动用户</CardDescription>
          </CardHeader>
        </Card>
        <Card className="h-[88px] w-[110px] shrink-0">
          <CardHeader className="h-full items-center justify-center gap-1 p-2 text-center">
            <CardTitle className="text-[20px] leading-none">{metrics?.total_404_errors ?? 0}</CardTitle>
            <CardDescription className="text-[14px] leading-tight">404错误</CardDescription>
          </CardHeader>
        </Card>
        <Card className="h-[88px] w-[110px] shrink-0">
          <CardHeader className="h-full items-center justify-center gap-1 p-2 text-center">
            <Button
              variant="ghost"
              className="h-auto w-fit p-0 text-center text-[20px] font-semibold leading-none tracking-tight hover:bg-transparent"
              onClick={() => setTopPagesOpen(true)}
            >
              {metrics?.total_pages ?? 0}
            </Button>
            <CardDescription className="text-[14px] leading-tight">累计页面</CardDescription>
          </CardHeader>
        </Card>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex shrink-0 flex-nowrap items-center gap-3 overflow-x-auto overscroll-x-contain pb-1 md:flex-wrap md:overflow-visible md:pb-0">
          <Popover open={filterPanelOpen} onOpenChange={handleFilterPanelOpenChange}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="shrink-0 gap-2">
                <ListFilter className="size-4" aria-hidden="true" />
                筛选
                {filters.refererFilters.length + (filters.userAgentFilter ? 1 : 0) + (filters.statusFilter ? 1 : 0) > 0 ? (
                  <Badge variant="secondary" className="ml-1 h-5 min-w-5 justify-center px-1.5">
                    {filters.refererFilters.length + (filters.userAgentFilter ? 1 : 0) + (filters.statusFilter ? 1 : 0)}
                  </Badge>
                ) : null}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              side="bottom"
              className="w-[min(820px,calc(100vw-2rem))] p-4"
            >
              <div className="space-y-2">
                <div className="font-medium">筛选访问记录</div>
                {savedFilterPresets.length > 0 ? (
                  <div className="flex flex-wrap gap-2" aria-label="已保存的筛选条件">
                    {savedFilterPresets.map((preset) => {
                      const description = getSavedFilterPresetDescription(preset)
                      const isActive = createAdvancedFilterSignature(preset) === activeFilterSignature
                      const tagButton = (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => restoreSavedFilterPreset(preset)}
                          className={`inline-flex max-w-[620px] items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${isActive
                            ? 'border-primary bg-primary text-primary-foreground hover:bg-primary/90'
                            : 'hover:bg-accent'}`}
                          aria-label={`恢复已保存筛选：${preset.name}；${description}`}
                          aria-pressed={isActive}
                        >
                          <span className="truncate">{preset.name}</span>
                        </button>
                      )

                      if (preset.isDefault) {
                        return tagButton
                      }

                      return (
                        <HoverCard key={preset.id} openDelay={150} closeDelay={250}>
                          <HoverCardTrigger asChild>
                            {tagButton}
                          </HoverCardTrigger>
                          <HoverCardContent side="top" align="center" className="w-auto p-1.5">
                            {editingPresetId === preset.id ? (
                              <div className="flex items-center gap-1">
                                <Input
                                  autoFocus
                                  value={editingPresetName}
                                  onChange={(event) => setEditingPresetName(event.target.value)}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                      event.preventDefault()
                                      saveSavedFilterPresetName()
                                    } else if (event.key === 'Escape') {
                                      event.preventDefault()
                                      cancelEditingSavedFilterPreset()
                                    }
                                  }}
                                  maxLength={40}
                                  aria-label="筛选名称"
                                  className="h-8 w-44"
                                />
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={saveSavedFilterPresetName}
                                  aria-label="保存筛选名称"
                                >
                                  <Check aria-hidden="true" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={cancelEditingSavedFilterPreset}
                                  aria-label="取消修改筛选名称"
                                >
                                  <X aria-hidden="true" />
                                </Button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => startEditingSavedFilterPreset(preset)}
                                  aria-label={`编辑筛选名称：${preset.name}`}
                                  title="编辑名称"
                                >
                                  <Pencil aria-hidden="true" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="destructive"
                                  size="icon-sm"
                                  onClick={() => deleteSavedFilterPreset(preset.id)}
                                  aria-label={`删除已保存筛选：${preset.name}`}
                                  title="删除"
                                >
                                  <Trash2 aria-hidden="true" />
                                </Button>
                              </div>
                            )}
                          </HoverCardContent>
                        </HoverCard>
                      )
                    })}
                  </div>
                ) : null}
              </div>
              <div className="-ml-1.5 max-h-[min(60vh,520px)] space-y-2 overflow-y-auto p-1.5">
                {filterInputs.map((filter, index) => (
                  <div key={filter.id}>
                    <div className="flex items-center gap-2">
                      <div
                        className={`grid min-w-0 flex-1 gap-2 ${filterShowsValueControl(filter)
                          ? 'md:grid-cols-[180px_220px_minmax(220px,1fr)]'
                          : 'md:grid-cols-[180px_220px]'}`}
                      >
                        <div>
                          <Select
                            value={filter.field}
                            onValueChange={(value: AccessLogFilterField) => changeAccessLogFilterField(filter.id, value)}
                          >
                            <SelectTrigger
                              className="w-full"
                              aria-label={`第 ${index + 1} 行筛选字段`}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="referer">来源</SelectItem>
                              <SelectItem
                                value="user_agent_kind"
                                disabled={filterInputs.some((item) => (
                                  item.id !== filter.id && item.field === 'user_agent_kind'
                                ))}
                              >
                                是否爬虫
                              </SelectItem>
                              <SelectItem
                                value="status_code"
                                disabled={filterInputs.some((item) => (
                                  item.id !== filter.id && item.field === 'status_code'
                                ))}
                              >
                                状态
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Select
                            value={filter.operator}
                            onValueChange={(value: AccessLogFilterOperator) => updateAccessLogFilter(filter.id, { operator: value })}
                          >
                            <SelectTrigger
                              className="w-full"
                              aria-label={`第 ${index + 1} 行筛选条件`}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {filter.field === 'referer' ? (
                                <>
                                  <SelectItem value="none_of">全部选项均不属于</SelectItem>
                                  <SelectItem value="contains">包含</SelectItem>
                                  <SelectItem value="not_contains">不包含</SelectItem>
                                  <SelectItem value="empty">为空</SelectItem>
                                  <SelectItem value="not_empty">不为空</SelectItem>
                                </>
                              ) : (
                                <>
                                  <SelectItem value="is">等于</SelectItem>
                                  <SelectItem value="is_not">不等于</SelectItem>
                                </>
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                        {filter.field === 'user_agent_kind' ? (
                          <div>
                            <Select
                              value={filter.value}
                              onValueChange={(value: UserAgentKindValue) => updateAccessLogFilter(filter.id, { value })}
                            >
                              <SelectTrigger
                                className="w-full"
                                aria-label={`第 ${index + 1} 行是否爬虫筛选值`}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="bot">是（爬虫）</SelectItem>
                                <SelectItem value="non_bot">否（非爬虫）</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        ) : filter.field === 'status_code' ? (
                          <div>
                            <Select
                              value={filter.value}
                              onValueChange={(value: StatusModeValue) => updateAccessLogFilter(filter.id, { value })}
                            >
                              <SelectTrigger
                                className="w-full"
                                aria-label={`第 ${index + 1} 行状态筛选值`}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="2xx">2xx</SelectItem>
                                <SelectItem value="3xx">3xx</SelectItem>
                                <SelectItem value="4xx">4xx</SelectItem>
                                <SelectItem value="404">404</SelectItem>
                                <SelectItem value="5xx">5xx</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        ) : isRefererFilterOperator(filter.operator) && refererOperatorNeedsValue(filter.operator) ? (
                          <div>
                            <Input
                              id={`referer-filter-value-${filter.id}`}
                              aria-label={`第 ${index + 1} 行来源筛选值`}
                              value={filter.value}
                              onChange={(event) => updateAccessLogFilter(filter.id, { value: event.target.value })}
                              placeholder={filter.operator === 'none_of' ? '输入来源，多个值用逗号分隔' : '输入来源内容'}
                            />
                          </div>
                        ) : null}
                      </div>
                      {filterInputs.length > 1 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeAccessLogFilter(filter.id)}
                          aria-label={`删除第 ${index + 1} 行筛选条件`}
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                        >
                          <X aria-hidden="true" />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between gap-2 border-t pt-3">
                <Button
                  type="button"
                  variant="ghost"
                  className="w-fit"
                  onClick={addAccessLogFilter}
                  disabled={filterInputs.length >= 10}
                >
                  <Plus aria-hidden="true" />
                  添加筛选条件
                </Button>
                <div className="flex items-center gap-2">
                  {canSaveFilterPreset ? (
                    <Button type="button" variant="ghost" onClick={saveAccessLogFilters}>
                      保存
                    </Button>
                  ) : null}
                  <Button type="button" variant="ghost" onClick={clearAccessLogFilters}>
                    清除筛选
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
          <Input
            className="w-[260px] shrink-0"
            value={pathInput}
            onChange={(event) => setPathInput(event.target.value)}
            placeholder="按路径或完整 URL 筛选"
          />
          <Input
            className="w-[220px] shrink-0"
            value={ipInput}
            onChange={(event) => setIpInput(event.target.value)}
            placeholder="按 IP 筛选，例如 203.0.113.9"
          />
          <Button className="shrink-0" onClick={applyFilters}>查询</Button>
          <Button className="shrink-0" variant="outline" onClick={refreshLogs}>刷新</Button>
          <Button className="shrink-0" variant="destructive" onClick={() => setClearDialogOpen(true)}>
            清空
          </Button>
        </div>

        {isLoading ? <div>加载中...</div> : null}
        {error ? <div>加载失败: {(error as Error).message}</div> : null}

        {!isLoading && !error ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <Table containerClassName="min-h-0 flex-1 rounded-md border">
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead>页面 URL</TableHead>
                  <TableHead className="w-[160px] min-w-[160px]">IP</TableHead>
                  <TableHead className="w-[88px] min-w-[88px]">访问次数</TableHead>
                  <TableHead className="w-[220px] min-w-[220px] max-w-[220px]">客户端</TableHead>
                  <TableHead className="w-[88px] min-w-[88px]">状态</TableHead>
                  <TableHead className="w-[180px] min-w-[180px]">时间</TableHead>
                  <TableHead>来源</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center">
                      暂无访问记录
                    </TableCell>
                  </TableRow>
                ) : items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="max-w-[360px] truncate font-medium">
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="block w-full truncate text-left hover:underline"
                            title={item.page_url || item.page_path}
                          >
                            {item.page_url || item.page_path}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="start"
                          className="w-[520px] max-w-[min(520px,var(--radix-popover-content-available-width))] break-all p-3 text-sm"
                        >
                          {item.page_url || item.page_path}
                        </PopoverContent>
                      </Popover>
                    </TableCell>
                    <TableCell className="w-[160px] min-w-[160px] whitespace-nowrap">{item.client_ip}</TableCell>
                    <TableCell className="w-[88px] min-w-[88px]">{item.client_ip_visit_count}</TableCell>
                    <TableCell
                      className="w-[220px] min-w-[220px] max-w-[220px] truncate"
                    >
                      {item.user_agent ? (
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className="block w-full truncate text-left hover:underline"
                              title={item.user_agent}
                            >
                              <span className="inline-flex max-w-full items-center gap-2">
                                <Badge variant={getUserAgentBadgeVariant(item.user_agent_kind)}>
                                  {getUserAgentKindLabel(item.user_agent_kind)}
                                </Badge>
                                <span className="truncate">
                                  {item.user_agent_label || item.user_agent}
                                </span>
                              </span>
                            </button>
                          </PopoverTrigger>
                          <PopoverContent
                            align="start"
                            className="w-[420px] max-w-[min(420px,var(--radix-popover-content-available-width))] break-all p-3 text-sm"
                          >
                            {item.user_agent}
                          </PopoverContent>
                        </Popover>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell className="w-[88px] min-w-[88px]">
                      <Badge variant={item.status_code >= 400 ? 'destructive' : 'outline'}>
                        {item.status_code}
                      </Badge>
                    </TableCell>
                    <TableCell className="w-[180px] min-w-[180px] whitespace-nowrap">
                      {formatRelativeTime(item.visited_at)}
                    </TableCell>
                    <TableCell className="max-w-[280px] truncate">
                      {item.referer || '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="flex shrink-0 items-center justify-between gap-3 text-sm text-muted-foreground">
              <div>
                第 {page} / {totalPages} 页，共 {total} 条
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page <= 1}
                >
                  上一页
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  disabled={page >= totalPages}
                >
                  下一页
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <Dialog open={topPagesOpen} onOpenChange={setTopPagesOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>热门页面</DialogTitle>
            <DialogDescription>按累计访问次数排序，展示当前最常访问的前台页面。</DialogDescription>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-y-auto rounded border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>页面</TableHead>
                  <TableHead>访问量</TableHead>
                  <TableHead>独立 IP</TableHead>
                  <TableHead>最后访问</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summaryQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center">加载中...</TableCell>
                  </TableRow>
                ) : topPages.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center">暂无统计数据</TableCell>
                  </TableRow>
                ) : topPages.map((item) => (
                    <TableRow key={item.page_url || item.page_path}>
                      <TableCell className="max-w-[420px] truncate font-medium" title={item.page_url || item.page_path}>
                        {item.page_url || item.page_path}
                      </TableCell>
                      <TableCell>{item.visits}</TableCell>
                      <TableCell>{item.unique_ips}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatRelativeTime(item.last_visited_at)}
                      </TableCell>
                    </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认清空访问记录</AlertDialogTitle>
            <AlertDialogDescription>
              该操作会删除当前筛选条件匹配的 {total} 条访问记录，其他记录不受影响，且删除后无法恢复。是否继续？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmClearLogs}
              disabled={clearLogsMutation.isPending}
            >
              {clearLogsMutation.isPending ? '清空中...' : '确认清空'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function getUserAgentKindLabel(kind?: 'browser' | 'bot' | 'other') {
  if (kind === 'bot') {
    return '爬虫'
  }

  if (kind === 'browser') {
    return '浏览器'
  }

  return '其他'
}

function getUserAgentBadgeVariant(kind?: 'browser' | 'bot' | 'other') {
  if (kind === 'bot') {
    return 'secondary' as const
  }

  return 'outline' as const
}
