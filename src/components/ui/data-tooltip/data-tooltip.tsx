import type { CSSProperties, ComponentProps, ElementType, ReactNode, Ref } from 'react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

type DataTooltipPlacement = 'top' | 'bottom' | 'left' | 'right'

interface DataTooltipProps extends Omit<ComponentProps<'div'>, 'content'> {
  /** 提示内容（原 content 属性 + #content 插槽合一），为空时不渲染气泡 */
  content?: ReactNode
  /** 气泡相对触发元素的方位 */
  placement?: DataTooltipPlacement
  /** 气泡宽度，number 视为 px；默认由内容撑起 */
  width?: number | string
  /** 气泡高度，number 视为 px；默认由内容撑起 */
  height?: number | string
  /** 包裹元素标签，默认 div */
  as?: ElementType
  /** 气泡的附加类 */
  contentClass?: string
}

const placementClass: Record<DataTooltipPlacement, string> = {
  top: 'bottom-full left-1/2 mb-2 -translate-x-1/2',
  bottom: 'top-full left-1/2 mt-2 -translate-x-1/2',
  left: 'top-1/2 right-full mr-2 -translate-y-1/2',
  right: 'top-1/2 left-full ml-2 -translate-y-1/2',
}

function isTouchLikePointer(event: React.PointerEvent) {
  const hasCoarsePointer =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(hover: none), (pointer: coarse)').matches

  return event.pointerType !== 'mouse' || hasCoarsePointer
}

function toCss(v: number | string) {
  return typeof v === 'number' ? `${v}px` : v
}

/** 悬停 / 聚焦显示、触屏点按切换的轻量气泡。 */
function DataTooltip({
  content,
  placement = 'top',
  width,
  height,
  as: Comp = 'div',
  className,
  contentClass,
  children,
  ref,
  onPointerDownCapture,
  onPointerEnter,
  onPointerLeave,
  onFocus,
  onBlur,
  onClick,
  ...props
}: DataTooltipProps) {
  const rootRef = useRef<HTMLElement | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [isHoverOpen, setIsHoverOpen] = useState(false)
  const lastTouchOpenAt = useRef(0)
  const shouldStopNextClick = useRef(false)

  const hasTooltip = content != null && content !== false && content !== ''

  // 无内容时视为关闭
  const open = hasTooltip && isOpen
  const hoverOpen = hasTooltip && isHoverOpen

  useEffect(() => {
    if (!open) return

    function close() {
      setIsOpen(false)
      setIsHoverOpen(false)
    }
    function onDocPointerDown(event: PointerEvent) {
      const root = rootRef.current
      if (!root || !event.target || root.contains(event.target as Node)) return
      close()
    }
    function onDocKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape') close()
    }

    document.addEventListener('pointerdown', onDocPointerDown, true)
    document.addEventListener('keydown', onDocKeydown)
    return () => {
      document.removeEventListener('pointerdown', onDocPointerDown, true)
      document.removeEventListener('keydown', onDocKeydown)
    }
  }, [open])

  const sizeStyle: CSSProperties = {}
  if (width != null) sizeStyle.width = toCss(width)
  if (height != null) sizeStyle.height = toCss(height)

  function setRefs(node: HTMLElement | null) {
    rootRef.current = node
    if (typeof ref === 'function') (ref as (n: HTMLElement | null) => void)(node)
    else if (ref) (ref as { current: HTMLElement | null }).current = node
  }

  const C = Comp

  return (
    <C
      {...props}
      ref={setRefs as Ref<HTMLElement>}
      data-slot="data-tooltip"
      data-state={open ? 'open' : 'closed'}
      className={cn('group/data-tooltip relative inline-block', className)}
      onPointerDownCapture={(event: React.PointerEvent<HTMLDivElement>) => {
        onPointerDownCapture?.(event)
        if (!hasTooltip || !isTouchLikePointer(event)) return
        lastTouchOpenAt.current = Date.now()
        shouldStopNextClick.current = true
        setIsOpen(v => !v)
      }}
      onPointerEnter={(event: React.PointerEvent<HTMLDivElement>) => {
        onPointerEnter?.(event)
        if (hasTooltip) setIsHoverOpen(true)
      }}
      onPointerLeave={(event: React.PointerEvent<HTMLDivElement>) => {
        onPointerLeave?.(event)
        setIsHoverOpen(false)
      }}
      onFocus={(event: React.FocusEvent<HTMLDivElement>) => {
        onFocus?.(event)
        if (hasTooltip) setIsHoverOpen(true)
      }}
      onBlur={(event: React.FocusEvent<HTMLDivElement>) => {
        onBlur?.(event)
        setIsHoverOpen(false)
      }}
      onClick={(event: React.MouseEvent<HTMLDivElement>) => {
        if (shouldStopNextClick.current && Date.now() - lastTouchOpenAt.current < 800) event.stopPropagation()
        shouldStopNextClick.current = false
        onClick?.(event)
      }}
    >
      {children}
      {hasTooltip && (open || hoverOpen) && (
        <span
          role="tooltip"
          className={cn(
            'pointer-events-none absolute z-20 hidden rounded-md border bg-popover px-2 py-1 text-[11px] leading-snug text-popover-foreground shadow-md group-hover/data-tooltip:block group-focus-within/data-tooltip:block whitespace-normal break-words',
            open && 'block',
            placementClass[placement],
            contentClass,
          )}
          style={sizeStyle}
        >
          {content}
        </span>
      )}
    </C>
  )
}

export { DataTooltip }
export type { DataTooltipProps, DataTooltipPlacement }
