import type { ReactNode } from 'react'
import { useEffect, useLayoutEffect } from 'react'
import { BackTop } from '@/components/ui/back-top'
import { useAppStore, useIsDark } from '@/stores/app'

/** 根据主题模式切换 <html> 的 .dark，并在启用自定义背景时让 body 透明 */
export default function Provider({ children }: { children: ReactNode }) {
  const isDark = useIsDark()
  const backgroundEnabled = useAppStore(state => state.settings.backgroundEnabled)

  useLayoutEffect(() => {
    const root = document.documentElement
    const changed = root.classList.contains('dark') !== isDark
    if (changed) root.dataset.switchingAppearance = ''
    root.classList.toggle('dark', isDark)
    root.style.colorScheme = isDark ? 'dark' : 'light'
    if (!changed) return undefined
    // 让底色、文字和表单控件在同一帧换色，再恢复交互过渡。
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => delete root.dataset.switchingAppearance)
    })
    return () => {
      cancelAnimationFrame(frame)
      delete root.dataset.switchingAppearance
    }
  }, [isDark])

  useEffect(() => {
    const body = document.body
    if (backgroundEnabled) body.style.setProperty('background-color', 'transparent', 'important')
    else body.style.removeProperty('background-color')
  }, [backgroundEnabled])

  return (
    <>
      {children}
      <BackTop visibilityHeight={1} onScrolledChange={scrolled => useAppStore.setState({ isScrolled: scrolled })} />
    </>
  )
}
