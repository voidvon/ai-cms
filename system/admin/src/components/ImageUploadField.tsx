import { useRef, useState } from 'react'
import { ImagePlus, Trash2, Upload } from 'lucide-react'
import { mediaApi, type MediaPurpose } from '@/api/media'
import { AdminButton as Button } from '@/components/AdminButton'
import { Input } from '@/components/ui/input'
import { resolveAssetUrl } from '@/lib/assets'
import { toast } from 'sonner'

interface ImageUploadFieldProps {
  id?: string
  value: string
  onChange: (value: string) => void
  purpose: MediaPurpose
  placeholder?: string
}

const PLACEHOLDER_IMAGES = new Set([
  '/skin/dfpic.gif',
  '',
])

export default function ImageUploadField({
  id,
  value,
  onChange,
  purpose,
  placeholder = '请输入图片路径',
}: ImageUploadFieldProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const normalizedValue = String(value || '').trim()
  const previewSrc = normalizedValue && !PLACEHOLDER_IMAGES.has(normalizedValue) ? resolveAssetUrl(normalizedValue) : ''

  const handleSelectFile = () => {
    if (!isUploading) {
      fileInputRef.current?.click()
    }
  }

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) {
      return
    }

    setIsUploading(true)
    try {
      const response = await mediaApi.upload(file, purpose)
      onChange(response.data.relative_path)
      toast.success('图片上传成功')
    } catch (error: any) {
      toast.error(error.response?.data?.message || error.message || '图片上传失败')
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="overflow-hidden rounded-md border bg-muted/20">
        {previewSrc ? (
          <img src={previewSrc} alt="封面图片预览" className="h-44 w-full object-contain" />
        ) : (
          <div className="flex h-44 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <ImagePlus className="size-5" />
            <span>暂无封面图片</span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={handleSelectFile} disabled={isUploading}>
          <Upload className="size-4" />
          {isUploading ? '上传中...' : previewSrc ? '更换图片' : '上传图片'}
        </Button>
        {normalizedValue && (
          <Button type="button" variant="outline" onClick={() => onChange('')} disabled={isUploading}>
            <Trash2 className="size-4" />
            清空
          </Button>
        )}
      </div>

      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </div>
  )
}
