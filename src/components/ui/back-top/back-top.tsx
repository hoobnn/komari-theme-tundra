import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

interface BackTopProps {
  /** 滚动超过该像素后显示按钮 */
  visibilityHeight?: number
  /** 滚动状态变化（含挂载时的首次检测）时回调 */
  onScrolledChange?: (scrolled: boolean) => void
}

/** 回到顶部按钮。元素始终挂载，用 opacity/translate 过渡显隐。 */
function BackTop({ visibilityHeight = 1, onScrolledChange }: BackTopProps) {
  const [show, setShow] = useState(false)
  const callbackRef = useRef(onScrolledChange)

  useEffect(() => {
    callbackRef.current = onScrolledChange
  })

  useEffect(() => {
    function handleScroll() {
      const scrolled = window.scrollY > visibilityHeight
      setShow(scrolled)
      callbackRef.current?.(scrolled)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()
    return () => window.removeEventListener('scroll', handleScroll)
  }, [visibilityHeight])

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <button
      type="button"
      className={cn(
        'fixed bottom-8 right-8 z-[9999] size-10 rounded-full bg-background border shadow-sm flex items-center justify-center text-foreground hover:bg-accent transition-all duration-200',
        show ? 'opacity-100 translate-y-0' : 'pointer-events-none opacity-0 translate-y-2',
      )}
      aria-label="返回顶部"
      aria-hidden={!show}
      tabIndex={show ? 0 : -1}
      onClick={scrollToTop}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 19V5M5 12l7-7 7 7" />
      </svg>
    </button>
  )
}

export { BackTop }
export type { BackTopProps }
