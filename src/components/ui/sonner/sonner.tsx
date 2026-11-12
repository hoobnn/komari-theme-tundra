import type { CSSProperties } from 'react'
import type { ToasterProps } from 'sonner'
import { Icon } from '@iconify/react'
import { Toaster as Sonner } from 'sonner'
import { cn } from '@/lib/utils'

function Toaster({ className, style, ...props }: ToasterProps) {
  return (
    <Sonner
      className={cn('toaster group', className)}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius)',
          ...style,
        } as CSSProperties
      }
      icons={{
        success: <Icon icon="lucide:circle-check" className="size-4" />,
        info: <Icon icon="lucide:info" className="size-4" />,
        warning: <Icon icon="lucide:triangle-alert" className="size-4" />,
        error: <Icon icon="lucide:octagon-x" className="size-4" />,
        loading: <Icon icon="lucide:loader-2" className="size-4 animate-spin" />,
        close: <Icon icon="lucide:x" className="size-4" />,
      }}
      {...props}
    />
  )
}

export { Toaster }
