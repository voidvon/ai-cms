import { useState } from 'react'
import { Pencil, RotateCcw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { AdminButton as Button } from '@/components/AdminButton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface SiteConfigTranslationFieldProps {
  id: string
  label: string
  value: string
  inheritedValue?: string | null
  fallbackLanguageName: string
  isFallbackLanguage: boolean
  onChange: (value: string) => void
  placeholder?: string
  required?: boolean
  type?: 'text' | 'email' | 'textarea'
  rows?: number
  alwaysShowInput?: boolean
  className?: string
}

export default function SiteConfigTranslationField({
  id,
  label,
  value,
  inheritedValue,
  fallbackLanguageName,
  isFallbackLanguage,
  onChange,
  placeholder,
  required = false,
  type = 'text',
  rows = 3,
  alwaysShowInput = false,
  className = '',
}: SiteConfigTranslationFieldProps) {
  const hasOwnValue = String(value || '').trim().length > 0
  const [editing, setEditing] = useState(isFallbackLanguage || hasOwnValue || alwaysShowInput)
  const inheritedPreview = formatInheritedPreview(inheritedValue)

  if (!isFallbackLanguage && !editing && !hasOwnValue && !alwaysShowInput) {
    return (
      <div className={`flex min-h-16 items-center gap-3 border-b py-3 ${className}`}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{label}</span>
            <Badge variant="outline">继承</Badge>
          </div>
          <p className="mt-1 truncate text-sm text-muted-foreground" title={inheritedPreview}>
            {inheritedPreview || `${fallbackLanguageName} 未配置`}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setEditing(true)}
          aria-label={`自定义${label}`}
          title={`自定义${label}`}
        >
          <Pencil />
        </Button>
      </div>
    )
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}{required ? ' *' : ''}</Label>
        {!isFallbackLanguage && (!alwaysShowInput || hasOwnValue) ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => {
              onChange('')
              setEditing(false)
            }}
            aria-label={`${label}恢复继承`}
            title="恢复继承"
          >
            <RotateCcw />
          </Button>
        ) : null}
      </div>
      {type === 'textarea' ? (
        <Textarea
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={inheritedPlaceholder(inheritedPreview, placeholder, isFallbackLanguage, hasOwnValue)}
          rows={rows}
          required={required}
        />
      ) : (
        <Input
          id={id}
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={inheritedPlaceholder(inheritedPreview, placeholder, isFallbackLanguage, hasOwnValue)}
          required={required}
        />
      )}
      {!isFallbackLanguage ? (
        <p className="text-xs text-muted-foreground">
          {hasOwnValue ? `清空后恢复继承 ${fallbackLanguageName}。` : `留空则继承 ${fallbackLanguageName}。`}
        </p>
      ) : null}
    </div>
  )
}

function formatInheritedPreview(value?: string | null) {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ')
  if (!normalized) {
    return ''
  }
  return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized
}

function inheritedPlaceholder(preview: string, placeholder: string | undefined, isFallbackLanguage: boolean, hasOwnValue: boolean) {
  if (!isFallbackLanguage && !hasOwnValue && preview) {
    return `继承：${preview}`
  }
  return placeholder
}
