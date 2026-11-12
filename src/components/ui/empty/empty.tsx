import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface EmptyProps extends ComponentProps<'div'> {
  /** 默认文案，children 为空时显示，缺省「暂无数据」 */
  description?: string
  /** 文案下方的附加内容（原 #extra 插槽） */
  extra?: ReactNode
}

/** 空状态。children 替代默认文案（原默认插槽）。 */
function Empty({ description, extra, className, children, ...props }: EmptyProps) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center gap-3 p-8 text-muted-foreground', className)}
      {...props}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="56"
        height="56"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="opacity-60"
      >
        <rect width="18" height="14" x="3" y="3" rx="2" />
        <path d="M3 14h18M8 18h.01M12 18h.01M16 18h.01" />
      </svg>
      {children ?? <span className="text-sm">{description ?? '暂无数据'}</span>}
      {extra}
    </div>
  )
}

export { Empty }
export type { EmptyProps }
