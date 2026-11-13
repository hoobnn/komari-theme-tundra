import type { ComponentProps } from 'react'
import { useLayoutEffect, useRef } from 'react'
import { TabsList } from './tabs'
import { cn } from '@/lib/utils'

interface ScrollableTabsListProps extends ComponentProps<typeof TabsList> {
  /** 当前值变化时只滚动标签容器，不改变页面滚动位置。 */
  selectedValue: string
  scrollClassName?: string
}

export function ScrollableTabsList({ selectedValue, scrollClassName, className, ...props }: ScrollableTabsListProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const scroller = scrollRef.current
    if (!scroller) return undefined
    function revealSelection() {
      if (!scroller) return
      const selected = scroller.querySelector<HTMLElement>(`[role="tab"][data-value="${CSS.escape(selectedValue)}"]`)
      if (!selected) return
      const tab = selected.getBoundingClientRect()
      const box = scroller.getBoundingClientRect()
      if (tab.left < box.left) scroller.scrollLeft += tab.left - box.left - 4
      else if (tab.right > box.right) scroller.scrollLeft += tab.right - box.right + 4
    }
    revealSelection()
    const observer = new ResizeObserver(revealSelection)
    observer.observe(scroller)
    return () => observer.disconnect()
  }, [selectedValue])

  return (
    <div ref={scrollRef} className={cn('min-w-0 overflow-x-auto py-1', scrollClassName)}>
      <TabsList className={cn('h-9 w-max justify-start', className)} {...props} />
    </div>
  )
}
