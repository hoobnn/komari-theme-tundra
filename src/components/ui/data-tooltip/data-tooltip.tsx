import type { ComponentProps, ElementType, ReactNode, Ref } from 'react'
import * as Popper from '@radix-ui/react-popper'
import { Portal } from 'radix-ui'
import { useEffect, useId, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

type DataTooltipPlacement = 'top' | 'bottom' | 'left' | 'right'

interface DataTooltipProps extends Omit<ComponentProps<'div'>, 'content'> {
  content?: ReactNode
  placement?: DataTooltipPlacement
  width?: number | string
  height?: number | string
  as?: ElementType
  contentClass?: string
}

/** 趋势条里有大量触点，只为正在查看的提示创建定位器和 Portal。 */
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
  const anchor = useRef<HTMLElement | null>(null)
  const tooltipId = useId()
  const [source, setSource] = useState<'hover' | 'focus' | 'touch' | null>(null)
  const touchPointer = useRef(false)
  const hasContent = content != null && content !== false && content !== ''
  const open = hasContent && source !== null

  useEffect(() => {
    if (!open) return undefined
    function dismissOutside(event: PointerEvent) {
      if (event.target instanceof Node && !anchor.current?.contains(event.target)) setSource(null)
    }
    function dismissOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setSource(null)
    }
    document.addEventListener('pointerdown', dismissOutside, true)
    document.addEventListener('keydown', dismissOnEscape)
    return () => {
      document.removeEventListener('pointerdown', dismissOutside, true)
      document.removeEventListener('keydown', dismissOnEscape)
    }
  }, [open])

  function setRefs(node: HTMLElement | null) {
    anchor.current = node
    if (typeof ref === 'function') (ref as (n: HTMLElement | null) => void)(node)
    else if (ref) (ref as { current: HTMLElement | null }).current = node
  }

  return (
    <Comp
      {...props}
      ref={setRefs as Ref<HTMLElement>}
      data-slot="data-tooltip"
      data-state={open ? 'open' : 'closed'}
      aria-describedby={open ? tooltipId : props['aria-describedby']}
      className={cn('relative inline-block', className)}
      onPointerDownCapture={(event: React.PointerEvent<HTMLDivElement>) => {
        onPointerDownCapture?.(event)
        touchPointer.current = event.pointerType !== 'mouse'
      }}
      onPointerEnter={(event: React.PointerEvent<HTMLDivElement>) => {
        onPointerEnter?.(event)
        if (hasContent && event.pointerType === 'mouse') setSource(current => current ?? 'hover')
      }}
      onPointerLeave={(event: React.PointerEvent<HTMLDivElement>) => {
        onPointerLeave?.(event)
        if (event.pointerType === 'mouse') setSource(current => (current === 'hover' ? null : current))
      }}
      onFocus={(event: React.FocusEvent<HTMLDivElement>) => {
        onFocus?.(event)
        if (hasContent && event.target.matches(':focus-visible')) setSource('focus')
      }}
      onBlur={(event: React.FocusEvent<HTMLDivElement>) => {
        onBlur?.(event)
        if (!event.currentTarget.contains(event.relatedTarget)) setSource(null)
      }}
      onClick={(event: React.MouseEvent<HTMLDivElement>) => {
        // 触屏滚动不会合成 click；原生链接保留首次点按直接导航。
        if (
          hasContent &&
          touchPointer.current &&
          event.detail > 0 &&
          !(event.target instanceof Element && event.target.closest('a[href]'))
        ) {
          event.stopPropagation()
          setSource(current => (current === 'touch' ? null : 'touch'))
        }
        touchPointer.current = false
        onClick?.(event)
      }}
    >
      {children}
      {open && (
        <Popper.Root>
          <Popper.Anchor virtualRef={anchor} />
          <Portal.Root>
            <Popper.Content
              id={tooltipId}
              role="tooltip"
              side={placement}
              sideOffset={6}
              collisionPadding={8}
              hideWhenDetached
              className={cn(
                'pointer-events-none z-50 w-max max-w-[calc(100vw-1rem)] rounded-md border bg-popover px-2 py-1.5 text-2xs leading-snug text-popover-foreground shadow-lg',
                contentClass,
              )}
              style={{ width, height }}
            >
              {content}
            </Popper.Content>
          </Portal.Root>
        </Popper.Root>
      )}
    </Comp>
  )
}

export { DataTooltip }
export type { DataTooltipProps, DataTooltipPlacement }
