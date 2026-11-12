import { useSyncExternalStore } from 'react'

/** 订阅 CSS 媒体查询，例如 useMediaQuery('(min-width: 768px)') */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    onChange => {
      const media = window.matchMedia(query)
      media.addEventListener('change', onChange)
      return () => media.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
  )
}
