import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface SpinnerProps extends ComponentProps<'div'> {
  size?: number | string
  stroke?: number | string
  show?: boolean
  /** 转圈下方的说明（原 description 属性 + #description 插槽合一） */
  description?: ReactNode
  contentClass?: string
}

function toSize(v: number | string) {
  return typeof v === 'number' ? `${v}px` : v
}

/** 包裹 children 的加载遮罩；show 为 false 时只渲染 children。 */
function Spinner({
  size = 24,
  stroke = 2,
  show = true,
  description,
  contentClass,
  className,
  children,
  ...props
}: SpinnerProps) {
  return (
    <div className={cn('relative', className)} {...props}>
      {children}
      {show && (
        <div
          className={cn(
            'absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-card/60 backdrop-blur-sm',
            contentClass,
          )}
        >
          <span
            className="inline-block animate-spin rounded-full border-solid"
            style={{
              width: toSize(size),
              height: toSize(size),
              borderWidth: toSize(stroke),
              borderColor: 'color-mix(in srgb, currentColor 18%, transparent)',
              borderTopColor: 'currentColor',
            }}
          />
          {description != null && description !== false && description !== '' && (
            <span className="text-sm text-muted-foreground">{description}</span>
          )}
        </div>
      )}
    </div>
  )
}

export { Spinner }
export type { SpinnerProps }
