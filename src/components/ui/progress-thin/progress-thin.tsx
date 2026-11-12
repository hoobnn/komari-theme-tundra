import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

interface ProgressThinProps extends ComponentProps<'div'> {
  percentage?: number
  status?: 'default' | 'success' | 'warning' | 'error' | 'info'
  height?: number | string
}

const statusClasses = {
  default: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  error: 'bg-destructive',
  info: 'bg-info',
}

function ProgressThin({
  percentage = 0,
  status = 'default',
  height = 4,
  className,
  style,
  ...props
}: ProgressThinProps) {
  const clamped = Math.max(0, Math.min(100, Number(percentage) || 0))

  return (
    <div
      className={cn('relative w-full overflow-hidden rounded-full bg-muted', className)}
      style={{ height: typeof height === 'number' ? `${height}px` : height, ...style }}
      {...props}
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-300 ease-out', statusClasses[status])}
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}

export { ProgressThin }
export type { ProgressThinProps }
