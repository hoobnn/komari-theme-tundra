import { useLayoutEffect, useRef } from 'react'

/** 首次打开或跳到章节时，懒加载图表仍可能改变上方高度。用户接手滚动后即停止校正。 */
export function useDetailNavigation(uuid: string | undefined) {
  const detailRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const root = detailRef.current
    if (!root || !uuid) return undefined
    let target: HTMLElement | null = null
    const align = () => {
      if (target && document.activeElement === target) target.scrollIntoView({ block: 'start', behavior: 'instant' })
    }
    const observer = new ResizeObserver(align)
    const stop = () => observer.disconnect()
    const followFragment = () => {
      stop()
      target = document.getElementById(window.location.hash.slice(1))
      if (!target || !root.contains(target)) return false
      target.focus({ preventScroll: true })
      align()
      for (const section of root.children) observer.observe(section)
      return true
    }
    if (!followFragment()) {
      window.scrollTo({ top: 0, behavior: 'instant' })
      root.querySelector('h1')?.focus({ preventScroll: true })
    }
    const events = new AbortController()
    const options = { passive: true, signal: events.signal }
    window.addEventListener('hashchange', followFragment, options)
    for (const event of ['wheel', 'pointerdown', 'touchstart', 'keydown']) window.addEventListener(event, stop, options)
    return () => {
      stop()
      events.abort()
    }
  }, [uuid])

  return detailRef
}
