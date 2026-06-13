import { useRef, useState } from 'react'
import { GripVertical, ImagePlus, Trash2, Upload } from 'lucide-react'
import { mediaApi, type MediaPurpose } from '@/api/media'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'

interface ImagesUploadFieldProps {
  id?: string
  value: string[]
  onChange: (value: string[]) => void
  purpose: MediaPurpose
  placeholder?: string
}

const PLACEHOLDER_IMAGES = new Set([
  '/skin/dfpic.gif',
  '/UploadFile/nopicture.gif',
  '/UploadFile/Newsuppic/nopicture.gif',
])

export default function ImagesUploadField({
  id,
  value,
  onChange,
  purpose,
  placeholder = '请输入图片路径',
}: ImagesUploadFieldProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const normalizedValue = Array.isArray(value) ? value.filter(Boolean) : []

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
      onChange([...normalizedValue, ...uploadedPaths])
      toast.success(`已上传 ${uploadedPaths.length} 张图片`)
    } catch (error: any) {
      toast.error(error.response?.data?.message || error.message || '图片上传失败')
    } finally {
      setIsUploading(false)
    }
  }

  const updateItem = (index: number, nextValue: string) => {
    onChange(normalizedValue.map((item, itemIndex) => (itemIndex === index ? nextValue : item)))
  }

  const removeItem = (index: number) => {
    onChange(normalizedValue.filter((_, itemIndex) => itemIndex !== index))
  }

  const moveItem = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= normalizedValue.length) {
      return
    }
    const nextItems = [...normalizedValue]
    const [current] = nextItems.splice(index, 1)
    nextItems.splice(nextIndex, 0, current)
    onChange(nextItems)
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

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {normalizedValue.length === 0 ? (
          <div className="col-span-full flex h-44 flex-col items-center justify-center gap-2 rounded-md border bg-muted/20 text-sm text-muted-foreground">
            <ImagePlus className="size-5" />
            <span>暂无产品图片</span>
          </div>
        ) : (
          normalizedValue.map((item, index) => {
            const previewSrc = item && !PLACEHOLDER_IMAGES.has(item) ? item : ''
            return (
              <div key={`${item}-${index}`} className="space-y-2 rounded-md border p-3">
                <div className="overflow-hidden rounded-md border bg-muted/20">
                  {previewSrc ? (
                    <img src={previewSrc} alt={`产品图片 ${index + 1}`} className="h-36 w-full object-contain" />
                  ) : (
                    <div className="flex h-36 items-center justify-center text-sm text-muted-foreground">
                      图片 {index + 1}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" size="icon" variant="outline" onClick={() => moveItem(index, -1)} disabled={index === 0}>
                    <GripVertical className="size-4 rotate-180" />
                  </Button>
                  <Button type="button" size="icon" variant="outline" onClick={() => moveItem(index, 1)} disabled={index === normalizedValue.length - 1}>
                    <GripVertical className="size-4" />
                  </Button>
                  <Button type="button" size="icon" variant="outline" onClick={() => removeItem(index)}>
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
          <Button type="button" variant="outline" onClick={() => onChange([])} disabled={isUploading}>
            <Trash2 className="size-4" />
            清空全部
          </Button>
        ) : null}
      </div>
    </div>
  )
}
