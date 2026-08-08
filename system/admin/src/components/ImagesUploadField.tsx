import { useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, ImagePlus, Star, Trash2, Upload } from 'lucide-react'
import { mediaApi, type MediaPurpose } from '@/api/media'
import { AdminButton as Button } from '@/components/AdminButton'
import { Input } from '@/components/ui/input'
import { resolveAssetUrl } from '@/lib/assets'
import { toast } from 'sonner'

interface ImagesUploadFieldProps {
  id?: string
  value: string[]
  onChange: (value: string[]) => void
  primaryImage?: string
  onPrimaryImageChange?: (value: string) => void
  purpose: MediaPurpose
  placeholder?: string
}

const PLACEHOLDER_IMAGES = new Set([
  '/skin/dfpic.gif',
  '',
])

export default function ImagesUploadField({
  id,
  value,
  onChange,
  primaryImage,
  onPrimaryImageChange,
  purpose,
  placeholder = '请输入图片路径',
}: ImagesUploadFieldProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  // Keep empty slots so "添加路径" can render an input before the user fills it.
  const normalizedValue = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
  const normalizedPrimaryImage = String(primaryImage || '').trim()

  const updateImages = (nextImages: string[], preferredPrimaryImage = normalizedPrimaryImage) => {
    onChange(nextImages)
    if (onPrimaryImageChange && !nextImages.includes(preferredPrimaryImage)) {
      onPrimaryImageChange(nextImages[0] || '')
    }
  }

  const handleSelectFile = () => {
    if (!isUploading) {
      fileInputRef.current?.click()
    }
  }

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    event.target.value = ''

    if (files.length === 0) {
      return
    }

    setIsUploading(true)
    try {
      const uploadedPaths: string[] = []
      for (const file of files) {
        const response = await mediaApi.upload(file, purpose)
        uploadedPaths.push(response.data.relative_path)
      }
      updateImages([...normalizedValue, ...uploadedPaths])
      toast.success(`已上传 ${uploadedPaths.length} 张图片`)
    } catch (error: unknown) {
      const uploadError = error as { response?: { data?: { message?: string } }; message?: string }
      toast.error(uploadError.response?.data?.message || uploadError.message || '图片上传失败')
    } finally {
      setIsUploading(false)
    }
  }

  const updateItem = (index: number, nextValue: string) => {
    const currentItem = normalizedValue[index]
    const nextImages = normalizedValue.map((item, itemIndex) => (itemIndex === index ? nextValue : item))
    updateImages(nextImages, currentItem === normalizedPrimaryImage ? nextValue : normalizedPrimaryImage)
  }

  const removeItem = (index: number) => {
    updateImages(normalizedValue.filter((_, itemIndex) => itemIndex !== index))
  }

  const moveItem = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= normalizedValue.length) {
      return
    }
    const nextItems = [...normalizedValue]
    const [current] = nextItems.splice(index, 1)
    nextItems.splice(nextIndex, 0, current)
    updateImages(nextItems)
  }

  const appendEmpty = () => {
    onChange([...normalizedValue, ''])
  }

  return (
    <div className="space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="flex flex-wrap gap-3">
        {normalizedValue.length === 0 ? (
          <div className="flex h-44 w-full flex-col items-center justify-center gap-2 rounded-md border bg-muted/20 text-sm text-muted-foreground">
            <ImagePlus className="size-5" />
            <span>暂无产品图片</span>
          </div>
        ) : (
          normalizedValue.map((item, index) => {
            const previewSrc = item && !PLACEHOLDER_IMAGES.has(item) ? resolveAssetUrl(item) : ''
            const isPrimaryImage = item === normalizedPrimaryImage
            return (
              <div key={`${item}-${index}`} className="w-[200px] space-y-2">
                <div className={`relative aspect-[4/3] overflow-hidden rounded-md border bg-muted/20 ${isPrimaryImage ? 'ring-2 ring-primary ring-offset-2' : ''}`}>
                  {previewSrc ? (
                    <img src={previewSrc} alt={`产品图片 ${index + 1}`} className="h-full w-full object-contain" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                      图片 {index + 1}
                    </div>
                  )}
                  {isPrimaryImage ? (
                    <span className="absolute left-2 top-2 rounded bg-primary px-2 py-1 text-xs text-primary-foreground">
                      主图
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  {onPrimaryImageChange ? (
                    <Button
                      type="button"
                      size="icon"
                      variant={isPrimaryImage ? 'default' : 'outline'}
                      onClick={() => onPrimaryImageChange(item)}
                      disabled={isPrimaryImage}
                      aria-label={isPrimaryImage ? `产品图片 ${index + 1} 已是主图` : `将产品图片 ${index + 1} 设为主图`}
                      title={isPrimaryImage ? '已是主图' : '设为主图'}
                    >
                      <Star className="size-4" fill={isPrimaryImage ? 'currentColor' : 'none'} />
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    onClick={() => moveItem(index, -1)}
                    disabled={index === 0}
                    aria-label={`将产品图片 ${index + 1} 左移`}
                    title="左移"
                  >
                    <ArrowLeft className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    onClick={() => moveItem(index, 1)}
                    disabled={index === normalizedValue.length - 1}
                    aria-label={`将产品图片 ${index + 1} 右移`}
                    title="右移"
                  >
                    <ArrowRight className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    onClick={() => removeItem(index)}
                    aria-label={`删除产品图片 ${index + 1}`}
                    title="删除"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                <Input
                  id={index === 0 ? id : undefined}
                  value={item}
                  onChange={(event) => updateItem(index, event.target.value)}
                  placeholder={placeholder}
                />
              </div>
            )
          })
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={handleSelectFile} disabled={isUploading}>
          <Upload className="size-4" />
          {isUploading ? '上传中...' : '上传图片'}
        </Button>
        <Button type="button" variant="outline" onClick={appendEmpty} disabled={isUploading}>
          <ImagePlus className="size-4" />
          添加路径
        </Button>
        {normalizedValue.length > 0 ? (
          <Button type="button" variant="outline" onClick={() => updateImages([], '')} disabled={isUploading}>
            <Trash2 className="size-4" />
            清空全部
          </Button>
        ) : null}
      </div>
    </div>
  )
}
