import * as React from 'react'
import { Button as UiButton } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type AdminButtonProps = React.ComponentProps<typeof UiButton>

/** Application-level button styling; keep the shadcn primitive unchanged. */
function AdminButton({ className, ...props }: AdminButtonProps) {
  return <UiButton {...props} className={cn('rounded-lg', className)} />
}

export { AdminButton }
