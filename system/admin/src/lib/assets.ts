import type { MediaAsset } from '@/types'

let runtimeAssetsBaseUrl = ''

export function setRuntimeAssetsBaseUrl(value?: string | null) {
  runtimeAssetsBaseUrl = normalizeBaseUrl(value)
}

export function resolveAssetUrl(value?: string | null, options: { publicUrl?: string | null } = {}) {
  const publicUrl = String(options.publicUrl || '').trim()
  if (publicUrl) {
    return publicUrl
  }

  const normalized = String(value || '').trim()
  if (!normalized) {
    return ''
  }
  if (/^(?:https?:)?\/\//i.test(normalized) || /^(?:data|blob):/i.test(normalized)) {
    return normalized
  }
  if (normalized.startsWith('/')) {
    const baseUrl = shouldUseRuntimeAssetsBaseUrl(normalized) ? runtimeAssetsBaseUrl : ''
    return new URL(normalized, baseUrl || window.location.origin).toString()
  }
  return normalized
}

export function resolveMediaAssetUrl(asset?: Pick<MediaAsset, 'relative_path' | 'public_url'> | null) {
  return resolveAssetUrl(asset?.relative_path, { publicUrl: asset?.public_url })
}

function shouldUseRuntimeAssetsBaseUrl(value: string) {
  return /^\/uploads\/(?:images|skin|pdfs|files)\//i.test(value)
}

function normalizeBaseUrl(value?: string | null) {
  return String(value || '').trim().replace(/\/+$/g, '')
}
