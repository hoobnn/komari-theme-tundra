import type { PingTaskInfo } from '@/utils/rpc'
import type { PingStack } from '@/utils/pingStack'
import type { PingFrame } from '@/utils/charts/pingTimeline'
import type { ChartThemeColors } from '@/utils/chartTheme'
import type { useChartCursor } from '@/hooks/useChartCursor'
import { format } from 'echarts/core'
import { Fragment, useLayoutEffect, useRef, useState } from 'react'
import { EChart } from '@/components/EChart'
import { cn } from '@/lib/utils'
import { buildBaseTooltip } from '@/utils/chartTheme'
import { chartTimeLabel, nearestTimeIndex, timeAxis, timeDomain } from '@/utils/charts/chartTime'
import { latencySeries, lossBins } from '@/utils/charts/pingTimeline'
import { formatPingLoss } from '@/utils/pingDisplay'

export interface PlotTask {
  task: PingTaskInfo
  base: string
  stack: PingStack | null
  color: string
}

const lossTones = {
  unknown: 'bg-muted-foreground/15',
  good: 'bg-emerald-600/55 dark:bg-emerald-400/50',
  partial: 'bg-amber-500',
  lost: 'bg-red-500/85 dark:bg-red-400/85',
}
const lossLegend = [
  [lossTones.good, '无丢包'],
  [lossTones.partial, '部分'],
  [lossTones.lost, '全丢'],
  [lossTones.unknown, '无采样'],
] as const
const plotRight = 18

export default function PingHistoryPlot({
  frames,
  times,
  tasks,
  cursor,
  hours,
  colors,
  delay,
  loss,
  smooth,
}: {
  frames: PingFrame[]
  times: number[]
  tasks: PlotTask[]
  cursor: ReturnType<typeof useChartCursor>
  hours: number
  colors: ChartThemeColors
  delay: boolean
  loss: boolean
  smooth: boolean
}) {
  // 画布的左轴与 CSS 排版的协议列共用同一道边界，弹窗和详情页按各自容器适配。
  const gutterRef = useRef<HTMLSpanElement>(null)
  const [plotLeft, setPlotLeft] = useState(96)
  useLayoutEffect(() => {
    const el = gutterRef.current
    if (!el) return undefined
    const measure = () => setPlotLeft(el.offsetWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  const domain = timeDomain(times, hours)
  const fraction = (cursor.time - domain[0]) / (domain[1] - domain[0])
  const maxBins = 60
  const series = tasks.map(({ task, stack, color }) => {
    const data = latencySeries(frames, task.id, task.interval || 60, hours, smooth)
    return {
      id: String(task.id),
      name: task.name,
      type: 'line' as const,
      showSymbol: data.filter(([, v]) => v !== null).length === 1,
      showAllSymbol: false,
      symbolSize: 5,
      connectNulls: false,
      animation: false,
      itemStyle: { color },
      lineStyle: {
        width: 2,
        type: stack === 'v6' ? ('dashed' as const) : ('solid' as const),
        color,
        cap: 'round' as const,
      },
      data,
    }
  })
  const hasLatency = series.some(line => line.data.some(([, value]) => value != null))
  const option = {
    animation: false,
    textStyle: { fontFamily: 'Geist Variable, system-ui, sans-serif' },
    tooltip: {
      ...buildBaseTooltip(colors, false),
      confine: true,
      triggerOn: 'mousemove',
      formatter: (params: unknown) => {
        const first = (params as { axisValue: number }[])[0]
        if (!first) return ''
        const frame = frames[nearestTimeIndex(times, first.axisValue)]
        if (!frame) return ''
        const rows = tasks.slice(0, 6).map(({ task, color, stack }) => {
          const sample = frame.samples.get(task.id)
          const value =
            sample?.latency != null && sample.loss !== 1
              ? `${Number(sample.latency.toFixed(1))} ms`
              : sample?.loss === 1
                ? '超时'
                : '—'
          return `<div class="plot-tip-row"><i style="border-color:${color};border-top-style:${stack === 'v6' ? 'dashed' : 'solid'}"></i><span>${format.encodeHTML(task.name)}</span><b>${value}</b></div>`
        })
        if (tasks.length > rows.length)
          rows.push(`<div class="plot-tip-time">其余 ${tasks.length - rows.length} 条见线路读数</div>`)
        return `<div class="plot-tip-time">${chartTimeLabel(frame.time, hours)}</div>${rows.join('')}`
      },
    },
    grid: { left: plotLeft, right: plotRight, top: 17, bottom: 27, outerBoundsMode: 'none' },
    xAxis: { ...timeAxis(domain, colors, hours), splitNumber: plotLeft < 64 ? 2 : 4 },
    yAxis: {
      type: 'value',
      min: ({ min, max }: { min: number; max: number }) => {
        const step = max <= 25 ? 5 : max <= 100 ? 10 : 25
        return Math.max(0, Math.floor((min - step / 2) / step) * step)
      },
      minInterval: 1,
      splitNumber: 4,
      axisLabel: { fontSize: 11, color: colors.textSecondary },
      axisLine: { show: false },
      axisTick: { show: false },
      axisPointer: { show: false },
      splitLine: { lineStyle: { color: colors.splitLineColor, type: 'solid' as const } },
    },
    series,
  }
  return (
    <div className="@container/plot relative min-w-0">
      <span
        aria-hidden="true"
        ref={gutterRef}
        className="pointer-events-none invisible absolute h-px w-10 @min-[28rem]/plot:w-24"
      />
      {delay && (
        <div className="relative">
          <span
            aria-hidden="true"
            style={{ left: plotLeft }}
            className="pointer-events-none absolute top-0 text-2xs text-muted-foreground"
          >
            ms
          </span>
          {hasLatency ? (
            <EChart
              option={option}
              onTimePick={cursor.pick}
              cursorTime={cursor.pinned ? cursor.time : undefined}
              label="所选线路的延迟曲线，采样读数见下表"
              className="h-36 @min-[30rem]:h-45 @min-[48rem]:h-52"
            />
          ) : (
            <p className="grid h-24 place-items-center text-xs text-muted-foreground">所选线路在这段时间没有有效延迟</p>
          )}
        </div>
      )}
      {loss && (
        <div className={cn('pt-2', delay && 'mt-1 border-t')}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <h4 className="text-xs font-medium">丢包时间线</h4>
            <div
              className="flex flex-wrap gap-x-2.5 gap-y-1 text-2xs text-muted-foreground"
              aria-label="每格取时段内最高丢包率"
            >
              {lossLegend.map(([tone, text]) => (
                <span key={text} className="inline-flex items-center gap-1">
                  <i className={cn('h-1.5 w-2.5 rounded-xs', tone)} />
                  {text}
                </span>
              ))}
            </div>
          </div>
          <div className="space-y-0.5" style={{ paddingRight: plotRight }}>
            {tasks.map(({ task, base, stack, color }, index) => {
              const bins = lossBins(frames, task.id, domain, maxBins)
              const label = stack ? `${base} ${stack}` : task.name
              return (
                <Fragment key={task.id}>
                  {(index === 0 || tasks[index - 1].base !== base) && (
                    <p className="mt-1 truncate text-2xs font-medium @min-[28rem]/plot:hidden" title={base}>
                      {base}
                    </p>
                  )}
                  <div className="flex min-w-0 items-center gap-0" title={label}>
                    <span className="flex w-10 min-w-0 shrink-0 items-center gap-1 pe-1 text-2xs text-muted-foreground @min-[28rem]/plot:w-24">
                      <i
                        aria-hidden="true"
                        className={cn('w-2 shrink-0 border-t-2', stack === 'v6' && 'border-dashed')}
                        style={{ borderColor: color }}
                      />
                      <span className="hidden min-w-0 truncate @min-[28rem]/plot:inline">{base}</span>
                      {!stack && <small className="text-3xs @min-[28rem]/plot:hidden">Ping</small>}
                      {stack && <small className="text-3xs">{stack}</small>}
                    </span>
                    <div
                      className="relative grid min-w-0 flex-1 overflow-hidden rounded-xs"
                      aria-hidden="true"
                      style={{ gridTemplateColumns: `repeat(${maxBins}, minmax(0,1fr))` }}
                    >
                      {bins.map((value, i) => (
                        <span
                          key={i}
                          onClick={value ? () => cursor.pick(value.time) : undefined}
                          className={cn(
                            'h-2',
                            i > 0 && i % 5 === 0 && 'border-s border-card/65',
                            value && 'cursor-crosshair',
                            value == null
                              ? lossTones.unknown
                              : value.loss === 0
                                ? lossTones.good
                                : value.loss === 1
                                  ? lossTones.lost
                                  : lossTones.partial,
                          )}
                          title={`${chartTimeLabel(domain[0] + (i / maxBins) * (domain[1] - domain[0]), hours)} · ${value == null ? '无采样' : `最高丢包 ${formatPingLoss(value.loss * 100)}`}`}
                        />
                      ))}
                      {cursor.pinned && (
                        <i
                          className="pointer-events-none absolute -top-0.5 -bottom-0.5 border-s-2 border-foreground"
                          style={{ left: `${fraction * 100}%` }}
                        />
                      )}
                    </div>
                  </div>
                </Fragment>
              )
            })}
          </div>
          {(!delay || !hasLatency) && (
            <div
              className="num mt-1 flex justify-between ps-10 text-2xs text-muted-foreground @min-[28rem]/plot:ps-24"
              style={{ paddingRight: plotRight }}
            >
              <span>{chartTimeLabel(domain[0], hours)}</span>
              <span>{chartTimeLabel(domain[1], hours)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
