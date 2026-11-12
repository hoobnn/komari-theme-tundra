import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { BackTop } from '@/components/ui/back-top'
import { useAppStore, useIsDark } from '@/stores/app'

/** 根据主题模式切换 <html> 的 .dark，并在启用自定义背景时让 body 透明 */
export default function Provider({ children }: { children: ReactNode }) {
  const isDark = useIsDark()
  const backgroundEnabled = useAppStore(state => state.settings.backgroundEnabled)

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', isDark)
    root.style.colorScheme = isDark ? 'dark' : 'light'
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
