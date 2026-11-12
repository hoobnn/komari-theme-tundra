import { useAppStore } from '@/stores/app'

/** 启用自定义背景时，表面改用半透明样式 */
export function useBackgroundSurface() {
  const hasCustomBackground = useAppStore(state => state.settings.backgroundEnabled)

  function pickSurfaceClass(defaultClass: string, customBackgroundClass: string): string {
    return hasCustomBackground ? customBackgroundClass : defaultClass
  }

  return { hasCustomBackground, pickSurfaceClass }
}
