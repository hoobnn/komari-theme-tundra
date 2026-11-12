import type { EChartsCoreOption, EChartsType } from 'echarts/core'
import { init } from 'echarts/core'
import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import '@/utils/echarts'

interface EChartProps {
  option: EChartsCoreOption
  className?: string
}

/**
 * ECharts 薄封装：挂载时 init，option 变化时 setOption，容器尺寸变化时 resize，卸载时 dispose。
 * 默认合并更新以保留过渡动画；series 整体替换，避免切换数据源后残留旧曲线。
 */
export function EChart({ option, className }: EChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<EChartsType | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const chart = init(el)
    chartRef.current = chart
    const observer = new ResizeObserver(() => chart.resize())
    observer.observe(el)
    return () => {
      observer.disconnect()
      chart.dispose()
      chartRef.current = null
    }
  }, [])

  useEffect(() => {
    chartRef.current?.setOption(option, { replaceMerge: ['series'] })
  }, [option])

  return <div ref={containerRef} className={cn('size-full', className)} />
}
