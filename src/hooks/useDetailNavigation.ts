import { useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router'

const sections = ['load', 'latency', 'specifications'] as const
export type DetailSection = (typeof sections)[number]

/** 章节保存在地址栏。切换章节仍算一次节点访问，浏览器后退可以直接回到节点列表。 */
export function useDetailNavigation(uuid: string | undefined) {
  const detailRef = useRef<HTMLDivElement>(null)
  const { hash, pathname, search } = useLocation()
  const navigate = useNavigate()
  const section = sections.find(value => hash === `#${value}`) ?? 'load'

  useLayoutEffect(() => {
    if (!uuid) return
    window.scrollTo({ top: 0, behavior: 'instant' })
    detailRef.current?.querySelector('h1')?.focus({ preventScroll: true })
  }, [uuid])

  function selectSection(value: string) {
    if (value !== section)
      void navigate({ pathname, search, hash: `#${value}` }, { replace: true, preventScrollReset: true })
  }
  return { detailRef, section, selectSection }
}
