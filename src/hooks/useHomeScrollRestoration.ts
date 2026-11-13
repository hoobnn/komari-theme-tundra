import { useLayoutEffect } from 'react'
import { useAppStore } from '@/stores/app'

export function useHomeScrollRestoration() {
  // 首页被 Activity 隐藏时 effect 会被卸载，重新显示时再次运行：进入时恢复滚动，离开时保存
  useLayoutEffect(() => {
    const { homeScrollPosition } = useAppStore.getState()
    if (homeScrollPosition > 0) window.scrollTo({ top: homeScrollPosition, behavior: 'instant' })
    // 可见期间持续记录：Activity 隐藏时页面高度先塌缩，卸载时再读 scrollY 可能已被截断
    const save = () => useAppStore.setState({ homeScrollPosition: window.scrollY })
    window.addEventListener('scroll', save, { passive: true })
    return () => window.removeEventListener('scroll', save)
  }, [])
}
