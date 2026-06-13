import * as React from 'react'
import { cn } from '@/lib/utils'

interface TabsContextValue {
  value: string
  setValue: (value: string) => void
}

const TabsContext = React.createContext<TabsContextValue | null>(null)

function useTabsContext() {
  const context = React.useContext(TabsContext)
  if (!context) {
    throw new Error('Tabs components must be used within Tabs')
  }
  return context
}

interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string
  onValueChange: (value: string) => void
}

function Tabs({ value, onValueChange, className, ...props }: TabsProps) {
  return (
    <TabsContext.Provider value={{ value, setValue: onValueChange }}>
      <div className={cn('space-y-4', className)} {...props} />
    </TabsContext.Provider>
  )
}

const TabsList = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      role="tablist"
      className={cn(
        'inline-flex h-auto min-h-10 flex-wrap items-center gap-2 rounded-lg bg-muted p-1 text-muted-foreground',
        className
      )}
      {...props}
    />
  )
)
TabsList.displayName = 'TabsList'

interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string
}

const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsTriggerProps>(
  ({ className, value, type = 'button', ...props }, ref) => {
    const context = useTabsContext()
    const active = context.value === value

    return (
      <button
        ref={ref}
        type={type}
        role="tab"
        aria-selected={active}
        data-state={active ? 'active' : 'inactive'}
        className={cn(
          'inline-flex min-h-8 items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium transition-all',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          active ? 'bg-background text-foreground shadow-sm' : 'hover:bg-background/60 hover:text-foreground',
          className
        )}
        onClick={() => context.setValue(value)}
        {...props}
      />
    )
  }
)
TabsTrigger.displayName = 'TabsTrigger'

interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string
}

const TabsContent = React.forwardRef<HTMLDivElement, TabsContentProps>(
  ({ className, value, ...props }, ref) => {
    const context = useTabsContext()
    if (context.value !== value) {
      return null
    }

    return (
      <div
        ref={ref}
        role="tabpanel"
        data-state="active"
        className={cn('space-y-4 outline-none', className)}
        {...props}
      />
    )
  }
)
TabsContent.displayName = 'TabsContent'

export { Tabs, TabsList, TabsTrigger, TabsContent }
