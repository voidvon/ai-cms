import type { ComponentProps, ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

type TableActionButtonProps = ComponentProps<typeof Button> & {
  tooltip: ReactNode
  'aria-label': string
}

export function TableActionButton({
  tooltip,
  variant = 'ghost',
  size = 'icon-sm',
  type,
  asChild = false,
  ...props
}: TableActionButtonProps) {
  return (
    <TooltipProvider delay={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type={asChild ? type : (type || 'button')}
            variant={variant}
            size={size}
            asChild={asChild}
            {...props}
          />
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
