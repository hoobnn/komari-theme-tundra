import type { EChartsCoreOption, EChartsType } from 'echarts/core'
import { init } from 'echarts/core'
import { useEffect, useEffectEvent, useRef } from 'react'
import { cn } from '@/lib/utils'
import '@/utils/echarts'

interface EChartProps {
  option: EChartsCoreOption
  className?: string
  label?: string
  cursorTime?: number
  onTimePick?: (time: number) => void
}

export function EChart({ option, className, label, cursorTime, onTimePick }: EChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cursorRef = useRef<HTMLSpanElement>(null)
  const chartRef = useRef<EChartsType | null>(null)
  const drawCursor = useEffectEvent((time: number | undefined = cursorTime) => {
    const cursor = cursorRef.current
    const chart = chartRef.current
    if (!cursor || !chart) return
    const left = time == null ? NaN : chart.convertToPixel({ xAxisIndex: 0 }, time)
    cursor.hidden = typeof left !== 'number' || !Number.isFinite(left) || left < 0 || left > chart.getWidth()
    if (!cursor.hidden) cursor.style.left = `${left}px`
  })
  useEffect(() => {
    const el = containerRef.current
    if (!el) return undefined
    const chart = init(el)
    chartRef.current = chart
    const observer = new ResizeObserver(() => {
      chart.resize()
      drawCursor()
    })
    observer.observe(el)
    return () => {
      observer.disconnect()
      chart.dispose()
      chartRef.current = null
    }
  }, [])

  useEffect(() => {
    chartRef.current?.setOption(option, {
      replaceMerge: option.xAxis ? ['series', 'xAxis', 'yAxis', 'legend'] : ['series'],
    })
    drawCursor()
  }, [option])
  useEffect(() => {
    drawCursor(cursorTime)
  }, [cursorTime])
  const grid = option.grid as { top?: number; bottom?: number } | undefined
  return (
    <div className={cn('relative size-full', className)}>
      <div
        ref={containerRef}
        role={label ? 'img' : undefined}
        aria-label={label}
        className={cn(
          'size-full [&>div:has(>canvas)]:max-w-full [&_canvas]:max-w-full',
          onTimePick && 'cursor-crosshair',
        )}
        onClick={
          onTimePick
            ? event => {
                const chart = chartRef.current
                if (!chart) return
                const box = event.currentTarget.getBoundingClientRect()
                const point = [event.clientX - box.left, event.clientY - box.top]
                if (!chart.containPixel({ gridIndex: 0 }, point)) return
                const time = chart.convertFromPixel({ xAxisIndex: 0 }, point[0])
                if (typeof time === 'number' && Number.isFinite(time)) {
                  onTimePick(time)
                  chart.dispatchAction({ type: 'hideTip' })
                }
              }
            : undefined
        }
      />
      {onTimePick && (
        <span
          ref={cursorRef}
          hidden
          aria-hidden="true"
          className="pointer-events-none absolute border-s border-foreground/55"
          style={{ top: grid?.top ?? 10, bottom: grid?.bottom ?? 25 }}
        />
      )}
    </div>
  )
}
