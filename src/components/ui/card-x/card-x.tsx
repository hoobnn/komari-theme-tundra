import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface CardXProps extends Omit<ComponentProps<'div'>, 'title'> {
  /** 默认头部文本（未提供 header 时使用） */
  title?: string
  size?: 'small' | 'medium' | 'large'
  hoverable?: boolean
  bordered?: boolean
  segmented?: boolean | { content?: boolean; footer?: 'soft' | true }
  contentClass?: string
  headerClass?: string
  /** 自定义头部，替代 title（原 #header 插槽） */
  header?: ReactNode
  /** 头部右侧附加内容（原 #header-extra 插槽） */
  headerExtra?: ReactNode
  /** 底部内容（原 #footer 插槽） */
  footer?: ReactNode
}

function has(node: ReactNode) {
  return node != null && node !== false && node !== ''
}

/** 卡片。children 为主体内容；header / headerExtra / footer 对应原具名插槽。 */
function CardX({
  title,
  size = 'medium',
  hoverable = false,
  bordered = true,
  segmented,
  contentClass,
  headerClass,
  header,
  headerExtra,
  footer,
  className,
  children,
  ...props
}: CardXProps) {
  const showHeader = has(header) || Boolean(title) || has(headerExtra)
  const pt = showHeader ? 'pt-0' : ''
  const paddingClass = size === 'small' ? `p-3 ${pt}` : size === 'large' ? `p-6 ${pt}` : `p-4 ${pt}`
  const headerPaddingClass = size === 'small' ? 'px-3 py-2' : size === 'large' ? 'px-6 py-4' : 'px-4 py-3'

  const segmentedContent = typeof segmented === 'boolean' ? segmented : !!segmented?.content
  const segmentedFooter = typeof segmented === 'boolean' ? segmented : !!segmented?.footer

  return (
    <div
      className={cn(
        'bg-card text-card-foreground flex flex-col rounded-xl',
        bordered && 'border',
        hoverable && 'transition-colors hover:border-foreground/30',
        className,
      )}
      {...props}
    >
      {showHeader && (
        <div className={cn('flex items-center gap-2', headerPaddingClass, segmentedContent && 'border-b', headerClass)}>
          <div className="flex-1 min-w-0">
            {has(header) ? header : <span className="text-sm font-semibold">{title}</span>}
          </div>
          {has(headerExtra) && <div className="shrink-0">{headerExtra}</div>}
        </div>
      )}
      <div className={cn(paddingClass, contentClass)}>{children}</div>
      {has(footer) && <div className={cn(headerPaddingClass, segmentedFooter && 'border-t bg-muted/40')}>{footer}</div>}
    </div>
  )
}

export { CardX }
export type { CardXProps }
