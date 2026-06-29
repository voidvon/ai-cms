const DATE_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const TIME_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const MONTH_DAY_TIME_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const YEAR_MONTH_DAY_TIME_FORMATTER = new Intl.DateTimeFormat('sv-SE', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

export function formatRelativeTime(value?: string | null) {
  if (!value) {
    return '-'
  }

  const date = parseBackendDate(value)
  if (Number.isNaN(date.getTime())) {
    return String(value)
  }

  const now = new Date()
  const startOfToday = getStartOfDay(now)
  const startOfTargetDay = getStartOfDay(date)
  const dayDiff = Math.round((startOfToday.getTime() - startOfTargetDay.getTime()) / 86400000)
  const timeLabel = TIME_FORMATTER.format(date)

  if (dayDiff === 0) {
    return timeLabel
  }

  if (dayDiff === 1) {
    return `昨天 ${timeLabel}`
  }

  if (dayDiff === 2) {
    return `前天 ${timeLabel}`
  }

  if (isSameWeek(date, now)) {
    return `${WEEKDAY_LABELS[date.getDay()] || ''} ${timeLabel}`.trim()
  }

  if (date.getFullYear() === now.getFullYear()) {
    return normalizeFormattedValue(MONTH_DAY_TIME_FORMATTER.format(date))
  }

  return normalizeFormattedValue(YEAR_MONTH_DAY_TIME_FORMATTER.format(date))
}

export function formatDate(value?: string | null) {
  if (!value) {
    return '-'
  }

  const date = parseBackendDate(value)
  if (Number.isNaN(date.getTime())) {
    return String(value)
  }

  return DATE_FORMATTER.format(date)
}

function getStartOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate())
}

function getStartOfWeek(value: Date) {
  const day = value.getDay()
  const diff = day === 0 ? -6 : 1 - day
  return new Date(value.getFullYear(), value.getMonth(), value.getDate() + diff)
}

function isSameWeek(left: Date, right: Date) {
  const leftWeek = getStartOfWeek(left)
  const rightWeek = getStartOfWeek(right)
  return leftWeek.getFullYear() === rightWeek.getFullYear()
    && leftWeek.getMonth() === rightWeek.getMonth()
    && leftWeek.getDate() === rightWeek.getDate()
}

function normalizeFormattedValue(value: string) {
  return value.replace(/\//g, '-').replace(',', '')
}

function parseBackendDate(value: string) {
  const normalized = String(value).trim()

  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(normalized)) {
    return new Date(normalized.replace(' ', 'T') + 'Z')
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(normalized)) {
    return new Date(`${normalized}Z`)
  }

  return new Date(normalized)
}
