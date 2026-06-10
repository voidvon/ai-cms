import type { ReactNode } from 'react'
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog'

interface ImagePreviewProps {
  src: string
  alt?: string
  title?: string
  children: ReactNode
}

export default function ImagePreview({
  src,
  alt = '图片预览',
  title,
  children,
}: ImagePreviewProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="max-w-5xl border-0 bg-transparent p-0 shadow-none">
        <DialogTitle className="sr-only">
          {title || alt}
        </DialogTitle>
        <div className="overflow-hidden rounded-lg border bg-background">
          <div className="border-b px-4 py-3 text-sm text-muted-foreground">
            {title || alt}
          </div>
          <div className="flex max-h-[78vh] items-center justify-center bg-muted/10 p-4">
            <img
              src={src}
              alt={alt}
              className="max-h-[72vh] max-w-full object-contain"
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
