import { Icon } from '@iconify/react'
import dayjs from 'dayjs'
import { useState } from 'react'
import { EChart } from '@/components/EChart'
import { Button } from '@/components/ui/button'
import { DataTooltip } from '@/components/ui/data-tooltip'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, ScrollableTabsList, TabsTrigger } from '@/components/ui/tabs'
import { usePingChartData } from '@/hooks/usePingChartData'
import { useBackgroundSurface } from '@/hooks/useBackgroundSurface'
import { cn } from '@/lib/utils'
import { useAppStore, useIsDark } from '@/stores/app'
import {
  buildBaseTooltip,
  CHART_COLORS,
  DASHED_LEGEND_ICON,
  getChartThemeColors,
  SERIES_PALETTE,
  SERIES_PALETTE_V6_DARK,
  SERIES_PALETTE_V6_LIGHT,
} from '@/utils/chartTheme'
import { buildChartViews, PING_CHART_VIEWS } from '@/utils/chartViews'
import { HISTORY_MAX_POINTS } from '@/utils/pingHistory'
import { groupPingTasksByStack, parsePingTaskName, pingStackLabel } from '@/utils/pingStack'
import { cutPeakValues, interpolateNullsLinear } from '@/utils/recordHelper'
import { CARD_SURFACE_CLASS, segmentClass, TAB_TRIGGER_CLASS, TOGGLE_BASE_CLASS, toggleClass } from '@/utils/uiClasses'

interface PingChartProps {
  uuid: string
  className?: string
}

const chartMargin = {
  top: 30,
  right: 24,
  bottom: 52,
  left: 56,
}

// 长范围 fill_empty 可能产生大量空桶，限制标记数量避免 markLine 过密拖垮渲染
const MAX_LOSS_MARKERS_PER_TASK = 200

function formatTime(time: string, showDate: boolean): string {
  const date = dayjs(time)
  if (showDate) {
    return date.format('M/D HH:mm')
  }
  return date.format('HH:mm')
}

function formatTimeForTooltip(time: string, hours: number): string {
  const date = dayjs(time)
  if (hours < 24) {
    return date.format('HH:mm:ss')
  }
  return date.format('MM/DD HH:mm')
}

function PingChart({ uuid, className }: PingChartProps) {
  const { pickSurfaceClass } = useBackgroundSurface()
  const isDark = useIsDark()

  // 图表主题相关颜色
  const chartThemeColors = getChartThemeColors(isDark)

  // 从 publicSettings 获取记录保留时间
  const maxPingRecordPreserveTime = useAppStore(state => state.publicSettings?.ping_record_preserve_time) || 168

  // 可用视图：12 小时仅延迟图有；60/90 天仅在实际保留时间足够时显示
  const availableViews = buildChartViews(PING_CHART_VIEWS, maxPingRecordPreserveTime)

  // 当前选中的视图；未选择时落到第一个可用视图
  const [pickedView, setPickedView] = useState('')
  const selectedView = pickedView || availableViews[0]?.label || ''
  const selectedHours = availableViews.find(v => v.label === selectedView)?.hours || 1

  const { remoteData, lossRecordsData, tasks, loading, error, selectedTaskIds, setSelectedTaskIds } = usePingChartData(
    uuid,
    selectedHours,
  )
  const [cutPeak, setCutPeak] = useState(false)
  const [showDelay, setShowDelay] = useState(true)
  const [showLoss, setShowLoss] = useState(true)

  const taskIntervals = tasks.map(t => t.interval).filter((v): v is number => typeof v === 'number' && v > 0)
  const fallbackIntervalSec = taskIntervals.length ? Math.min(...taskIntervals) : 60
  const mergeToleranceMs = Math.min(6000, Math.max(800, Math.floor(fallbackIntervalSec * 1000 * 0.25)))

  // ==================== 数据处理 ====================

  const mergedData = (() => {
    const data = remoteData
    if (!data.length) return []

    const toleranceMs = mergeToleranceMs

    const grouped: Map<number, Record<string, unknown>> = new Map()
    const anchors: number[] = []

    for (const rec of data) {
      const ts = dayjs(rec.time).valueOf()
      let anchor: number | null = null

      for (const a of anchors) {
        if (Math.abs(a - ts) <= toleranceMs) {
          anchor = a
          break
        }
      }

      const useTs = anchor ?? ts
      if (!grouped.has(useTs)) {
        grouped.set(useTs, {
          time: dayjs(useTs).toISOString(),
        })
        if (anchor === null) {
          anchors.push(useTs)
        }
      }

      const group = grouped.get(useTs)!
      group[rec.task_id] = rec.value < 0 ? null : rec.value
    }

    const merged = Array.from(grouped.values()).sort(
      (a, b) => dayjs(a.time as string).valueOf() - dayjs(b.time as string).valueOf(),
    )

    const lastItem = merged.at(-1)
    const lastTs = lastItem ? dayjs(lastItem.time as string).valueOf() : dayjs().valueOf()
    const fromTs = lastTs - selectedHours * 3600_000

    let startIdx = 0
    for (let i = 0; i < merged.length; i++) {
      const item = merged[i]
      if (!item) continue
      const ts = dayjs(item.time as string).valueOf()
      if (ts >= fromTs) {
        startIdx = Math.max(0, i - 1)
        break
      }
    }

    return merged.slice(startIdx)
  })()

  const chartData = (() => {
    let data = mergedData
    const selectedKeys = selectedTaskIds.map(String)

    if (selectedKeys.length === 0) return []

    if (cutPeak) {
      data = cutPeakValues(data, selectedKeys)
    }

    if (selectedKeys.length > 0 && data.length > 0) {
      // 长范围降采样后桶间隔会变大，按查询跨度放宽插值上限，避免 7 天+ 曲线被硬截断
      const bucketMs = Math.ceil((selectedHours * 3600_000) / HISTORY_MAX_POINTS)
      data = interpolateNullsLinear(data, selectedKeys, {
        maxGapMultiplier: 6,
        minCapMs: 2 * 60_000,
        maxCapMs: Math.max(30 * 60_000, bucketMs * 6),
      })
    }

    return data
  })()

  const showDateInAxis = selectedHours >= 24

  // ==================== 任务选择 ====================

  // 双栈：同一线路（如「四川电信 v4 / v6」）用同色系，v6 换深浅一档并用虚线
  const taskMeta = new Map<number, { color: string; stack: 'v4' | 'v6' | null; base: string }>()
  groupPingTasksByStack(tasks, t => t.name).forEach((group, groupIndex) => {
    const paletteIndex = groupIndex % SERIES_PALETTE.length
    const v6Palette = isDark ? SERIES_PALETTE_V6_DARK : SERIES_PALETTE_V6_LIGHT
    for (const { stack, item } of group.items) {
      const color = stack === 'v6' ? v6Palette[paletteIndex] : SERIES_PALETTE[paletteIndex]
      taskMeta.set(item.id, { color, stack, base: group.base })
    }
  })

  const hasDualStack = [...taskMeta.values()].some(m => m.stack === 'v6')

  function getTaskColor(taskId: number): string {
    return taskMeta.get(taskId)?.color ?? SERIES_PALETTE[0]
  }

  // 最新值统计（从服务端 tasks 获取，保持颜色顺序）
  const latestValues = (() => {
    if (!tasks.length) return []

    const latestMap = new Map<number, number | null>()
    for (const task of tasks) {
      for (let i = remoteData.length - 1; i >= 0; i--) {
        const rec = remoteData[i]
        if (rec && rec.task_id === task.id && rec.value >= 0) {
          latestMap.set(task.id, rec.value)
          break
        }
      }
    }

    return tasks.map(task => {
      const meta = taskMeta.get(task.id)
      return {
        ...task,
        latestValue: latestMap.get(task.id) ?? null,
        color: meta?.color ?? SERIES_PALETTE[0],
        stack: meta?.stack ?? null,
      }
    })
  })()

  // 统计卡片按线路分组，组内 v4 / v6 各占一行
  const latestValueGroups = groupPingTasksByStack(latestValues, t => t.name)

  const selectedTasks = tasks.filter(t => selectedTaskIds.includes(t.id))

  const packetLossMarkers = (() => {
    const data = mergedData
    const markers = new Map<number, number[]>()

    if (!data.length || !selectedTasks.length) return markers

    const chartTimes = data.map(item => dayjs(item.time as string).valueOf())
    const toleranceMs = mergeToleranceMs

    const matchIndex = (lossTs: number) => {
      for (let i = 0; i < chartTimes.length; i++) {
        const chartTs = chartTimes[i]
        if (chartTs === undefined) continue

        if (Math.abs(chartTs - lossTs) <= toleranceMs) {
          return i
        }
      }
      return -1
    }

    for (const task of selectedTasks) {
      const points = new Set<number>()
      // 来源 1：短周期原始探测点中延迟为 null / < 0
      const taskLatencyLossRecords = remoteData.filter(rec => rec.task_id === task.id && rec.value < 0)
      for (const record of taskLatencyLossRecords) {
        if (points.size >= MAX_LOSS_MARKERS_PER_TASK) break

        const matchedIndex = matchIndex(dayjs(record.time).valueOf())
        if (matchedIndex >= 0) {
          points.add(matchedIndex)
        }
      }

      // 来源 2：长周期聚合分桶的 ping.loss 时序数据
      const taskLossRecords = lossRecordsData.filter(rec => rec.task_id === task.id && rec.loss > 0)
      for (const record of taskLossRecords) {
        if (points.size >= MAX_LOSS_MARKERS_PER_TASK) break

        const matchedIndex = matchIndex(dayjs(record.time).valueOf())
        if (matchedIndex >= 0) {
          points.add(matchedIndex)
        }
      }

      markers.set(
        task.id,
        Array.from(points).sort((a, b) => a - b),
      )
    }

    return markers
  })()

  // 切换任务选中状态
  function toggleTask(taskId: number) {
    setSelectedTaskIds(prev => (prev.includes(taskId) ? prev.filter(id => id !== taskId) : [...prev, taskId]))
  }

  function showAllTasks() {
    setSelectedTaskIds(tasks.map(t => t.id))
  }

  function hideAllTasks() {
    setSelectedTaskIds([])
  }

  // 只看某个协议栈：v4 同时包含未标注协议栈的任务
  function showStackTasks(stack: 'v4' | 'v6') {
    setSelectedTaskIds(
      tasks
        .filter(t => {
          const taskStack = parsePingTaskName(t.name).stack
          return stack === 'v6' ? taskStack === 'v6' : taskStack !== 'v6'
        })
        .map(t => t.id),
    )
  }

  function isStackSelected(stack: 'v4' | 'v6'): boolean {
    if (!selectedTaskIds.length) return false
    return selectedTaskIds.every(id => {
      const taskStack = taskMeta.get(id)?.stack ?? null
      return stack === 'v6' ? taskStack === 'v6' : taskStack !== 'v6'
    })
  }

  // ==================== 图表配置 ====================

  // 通用 Tooltip 配置
  const baseTooltipConfig = buildBaseTooltip(chartThemeColors, true)

  const pingChartOption = (() => {
    const taskList = selectedTasks
    const data = chartData
    const hours = selectedHours

    // 构建 series，确保颜色与卡片一致
    const series = taskList.map(task => {
      const color = getTaskColor(task.id)
      const isV6 = taskMeta.get(task.id)?.stack === 'v6'
      const lossMarkerIndexes = packetLossMarkers.get(task.id) || []
      return {
        name: task.name,
        type: 'line' as const,
        data: data.map(d => (d[task.id] as number | null) ?? null),
        smooth: showDelay ? (cutPeak ? 0.6 : 0.1) : 0,
        showSymbol: false,
        connectNulls: false,
        lineStyle: {
          width: showDelay ? 1.5 : 0,
          color,
          cap: 'round' as const,
          type: isV6 ? ('dashed' as const) : ('solid' as const),
        },
        itemStyle: {
          color,
          opacity: showDelay ? 1 : 0,
        },
        markLine:
          showLoss && lossMarkerIndexes.length
            ? {
                silent: true,
                symbol: ['none', 'none'],
                animation: false,
                label: { show: false },
                // 丢包统一用红色：红色只表示「差」，不跟随线路色
                lineStyle: {
                  color: CHART_COLORS.loss,
                  width: 1,
                  type: isV6 ? ('dashed' as const) : ('solid' as const),
                  opacity: hours >= 168 ? 0.2 : 0.35,
                },
                data: lossMarkerIndexes.map(index => ({
                  xAxis: index,
                })),
              }
            : undefined,
      }
    })

    // 颜色映射表（用于 Tooltip）
    const colorMap = new Map<number, string>()
    tasks.forEach(task => colorMap.set(task.id, getTaskColor(task.id)))

    return {
      animation: false,
      // 全局颜色设置（用于图例等）
      color: tasks.map(task => getTaskColor(task.id)),
      tooltip: {
        ...baseTooltipConfig,
        formatter: (params: unknown) => {
          const p = params as Array<{ seriesName: string; value: number | null; dataIndex: number }>
          if (!p.length) return ''
          const firstParam = p[0]
          if (!firstParam) return ''
          const rowData = data[firstParam.dataIndex]
          if (!rowData) return ''

          const time = rowData.time as string
          const timeStr = formatTimeForTooltip(time, hours)
          let html = `<div style="font-weight:600;margin-bottom:6px;color:${chartThemeColors.textSecondary}">${timeStr}</div>`
          html += '<div style="display:flex;flex-direction:column;gap:4px">'

          // 按延迟值排序显示
          const sortedParams = [...p].sort((a, b) => (a.value ?? 0) - (b.value ?? 0))

          for (const item of sortedParams) {
            if (item.value !== null && item.value !== undefined) {
              // 通过任务名找到对应的任务ID，再获取颜色
              const task = tasks.find(t => t.name === item.seriesName)
              const color = task ? colorMap.get(task.id) || SERIES_PALETTE[0] : SERIES_PALETTE[0]
              const isV6 = task ? taskMeta.get(task.id)?.stack === 'v6' : false
              const colorDot = isV6
                ? `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;border:2px solid ${color};box-sizing:border-box;margin-right:8px;flex-shrink:0"></span>`
                : `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:8px;flex-shrink:0"></span>`
              html += `<div style="display:flex;align-items:center">${colorDot}<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${item.seriesName}</span><span style="margin-left:auto;font-weight:600;margin-left:16px;font-variant-numeric:tabular-nums">${Math.round(item.value)} ms</span></div>`
            }
          }
          html += '</div>'
          return html
        },
      },
      legend: {
        type: 'scroll',
        bottom: 0,
        itemWidth: 12,
        itemHeight: 12,
        itemGap: 16,
        icon: 'roundRect',
        textStyle: { fontSize: 11, color: chartThemeColors.textSecondary },
        // v6 用虚线图标，与图上的虚线对应
        data: taskList.map(t =>
          taskMeta.get(t.id)?.stack === 'v6' ? { name: t.name, icon: DASHED_LEGEND_ICON } : t.name,
        ),
      },
      grid: chartMargin,
      xAxis: {
        type: 'category',
        data: data.map(d => formatTime(d.time as string, showDateInAxis)),
        axisLabel: {
          fontSize: 11,
          color: chartThemeColors.textSecondary,
          margin: 12,
        },
        axisLine: {
          show: true,
          lineStyle: { color: chartThemeColors.borderColor, width: 1 },
        },
        axisTick: { show: false },
        boundaryGap: false,
      },
      yAxis: {
        type: 'value',
        name: '延迟 (ms)',
        nameTextStyle: { color: chartThemeColors.textSecondary },
        axisLabel: { fontSize: 11, color: chartThemeColors.textSecondary, formatter: '{value}' },
        axisLine: { show: false },
        axisTick: { show: false },
        axisPointer: {
          lineStyle: { opacity: 0 },
          crossStyle: { opacity: 0 },
          label: { show: false },
        },
        splitLine: {
          lineStyle: {
            color: chartThemeColors.splitLineColor,
            type: 'dashed' as const,
          },
        },
      },
      series,
    }
  })()

  const allSelected = selectedTaskIds.length === tasks.length

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* 时间选择器；窄屏时筛选按钮换到第二行，避免把范围标签挤掉 */}
      <Tabs value={selectedView} onValueChange={setPickedView} className="w-full flex-row flex-wrap items-center gap-2">
        <ScrollableTabsList
          selectedValue={selectedView}
          aria-label="延迟时间范围"
          scrollClassName="max-md:basis-full md:flex-1"
          className={pickSurfaceClass(
            'w-max h-8 bg-background/60 rounded-md',
            'w-max h-8 bg-background/50 backdrop-blur-xl rounded-md',
          )}
        >
          {availableViews.map(view => (
            <TabsTrigger key={view.label} value={view.label} className={TAB_TRIGGER_CLASS}>
              {view.label}
            </TabsTrigger>
          ))}
        </ScrollableTabsList>
        {tasks.length > 0 && (
          <div className="flex items-center gap-2">
            {hasDualStack && (
              <div className="inline-flex rounded-md bg-muted/70 p-0.5" role="group" aria-label="协议栈">
                <Button
                  variant="ghost"
                  size="xs"
                  className={cn('h-6.5', TOGGLE_BASE_CLASS, segmentClass(allSelected))}
                  aria-pressed={allSelected}
                  onClick={showAllTasks}
                >
                  全部
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  className={cn('h-6.5', TOGGLE_BASE_CLASS, segmentClass(isStackSelected('v4')))}
                  aria-pressed={isStackSelected('v4')}
                  onClick={() => showStackTasks('v4')}
                >
                  IPv4
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  className={cn('h-6.5', TOGGLE_BASE_CLASS, segmentClass(isStackSelected('v6')))}
                  aria-pressed={isStackSelected('v6')}
                  onClick={() => showStackTasks('v6')}
                >
                  IPv6
                </Button>
              </div>
            )}
            {/* 全选 / 全不选是动作，不画成选中态 */}
            <Button
              variant="ghost"
              size="xs"
              className={cn(TOGGLE_BASE_CLASS, toggleClass(false))}
              onClick={() => (allSelected ? hideAllTasks() : showAllTasks())}
            >
              {allSelected ? '全不选' : '全选'}
            </Button>
          </div>
        )}
      </Tabs>

      {/* 内容区域 */}
      <Spinner show={loading} contentClass="flex flex-col gap-4">
        {error ? (
          <div className="text-red-500 py-8 text-center">{error}</div>
        ) : tasks.length === 0 && !loading ? (
          <div className="py-6 text-center text-xs text-muted-foreground">
            这段时间没有延迟数据，节点可能未配置延迟监测
          </div>
        ) : (
          <>
            {/* 最新值统计卡片：按线路分组，组内每个协议栈一行（点击行切换选中） */}
            {latestValueGroups.length > 0 && (
              <div className="gap-3 grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                {latestValueGroups.map(group => (
                  <div
                    key={group.base}
                    className={cn(
                      'flex flex-col gap-1 p-3',
                      pickSurfaceClass(CARD_SURFACE_CLASS, 'rounded-xl border bg-card/60 backdrop-blur-xs'),
                    )}
                  >
                    <div className="grid grid-cols-[2rem_repeat(3,minmax(0,1fr))_1.5rem] items-center gap-x-2">
                      <div className="col-span-2 flex min-w-0 items-center gap-2">
                        <div
                          className="h-4 w-1 shrink-0 rounded"
                          style={{ backgroundColor: group.items[0]?.item.color }}
                        />
                        <span className="truncate text-sm font-semibold">{group.base}</span>
                      </div>
                      <span className="text-right text-[11px] text-muted-foreground">丢包</span>
                      <span
                        className="text-right text-[11px] text-muted-foreground"
                        title="P99 与 P50 的比值，越大越不稳定"
                      >
                        波动
                      </span>
                      <span />
                    </div>
                    {group.items.map(({ stack, item: task }) => (
                      <div
                        key={task.id}
                        className={cn(
                          'grid cursor-pointer select-none grid-cols-[2rem_repeat(3,minmax(0,1fr))_1.5rem] items-center gap-x-2 rounded-sm text-xs text-muted-foreground transition-opacity',
                          !selectedTaskIds.includes(task.id) && 'opacity-30',
                        )}
                        onClick={() => toggleTask(task.id)}
                      >
                        {stack ? (
                          <span
                            className={cn(
                              'w-8 shrink-0 rounded-sm border px-1 text-center text-[10px] leading-4',
                              stack === 'v6' && 'border-dashed',
                            )}
                            style={{ borderColor: task.color, color: task.color }}
                          >
                            {stack === 'v6' ? 'v6' : 'v4'}
                          </span>
                        ) : (
                          <span />
                        )}
                        <span className="num font-medium text-foreground" title="平均延迟">
                          {task.avg !== undefined ? `${Math.round(task.avg)} ms` : '--'}
                        </span>
                        <span className="num text-right">{task.loss.toFixed(2)}%</span>
                        <span className="num text-right">
                          {task.p99_p50_ratio !== undefined ? task.p99_p50_ratio.toFixed(2) : '--'}
                        </span>
                        <DataTooltip
                          placement="left"
                          contentClass="w-60 p-3"
                          content={
                            <>
                              <div className="mb-2 text-xs font-semibold">
                                {task.name}
                                {stack && `（${pingStackLabel(stack)}）`}
                              </div>
                              <div className="text-xs gap-x-4 gap-y-1.5 grid grid-cols-4">
                                {task.min !== undefined && (
                                  <>
                                    <span className="text-muted-foreground">最小</span>
                                    <span className="font-medium">{`${Math.round(task.min)} ms`}</span>
                                  </>
                                )}
                                {task.max !== undefined && (
                                  <>
                                    <span className="text-muted-foreground">最大</span>
                                    <span className="font-medium">{`${Math.round(task.max)} ms`}</span>
                                  </>
                                )}
                                {task.avg !== undefined && (
                                  <>
                                    <span className="text-muted-foreground">平均</span>
                                    <span className="font-medium">{`${Math.round(task.avg)} ms`}</span>
                                  </>
                                )}
                                {task.latest !== undefined && (
                                  <>
                                    <span className="text-muted-foreground">最新</span>
                                    <span className="font-medium">{`${Math.round(task.latest)} ms`}</span>
                                  </>
                                )}
                                {task.p50 !== undefined && (
                                  <>
                                    <span className="text-muted-foreground">P50</span>
                                    <span className="font-medium">{`${Math.round(task.p50)} ms`}</span>
                                  </>
                                )}
                                {task.p99 !== undefined && (
                                  <>
                                    <span className="text-muted-foreground">P99</span>
                                    <span className="font-medium">{`${Math.round(task.p99)} ms`}</span>
                                  </>
                                )}
                                {task.p99_p50_ratio !== undefined && (
                                  <>
                                    <span className="text-muted-foreground">波动率</span>
                                    <span className="font-medium">{task.p99_p50_ratio.toFixed(2)}</span>
                                  </>
                                )}
                                {task.interval !== undefined && (
                                  <>
                                    <span className="text-muted-foreground">间隔</span>
                                    <span className="font-medium">{`${task.interval}s`}</span>
                                  </>
                                )}
                                {task.type && (
                                  <>
                                    <span className="text-muted-foreground">类型</span>
                                    <span className="font-medium">{task.type.toUpperCase()}</span>
                                  </>
                                )}
                                {task.total !== undefined && (
                                  <>
                                    <span className="text-muted-foreground">总数</span>
                                    <span className="font-medium">{task.total}</span>
                                  </>
                                )}
                              </div>
                            </>
                          }
                        >
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            className="text-muted-foreground"
                            aria-label="线路详情"
                            onClick={e => e.stopPropagation()}
                          >
                            <Icon icon="carbon:information" width={14} height={14} />
                          </Button>
                        </DataTooltip>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-2 items-center">
              {/* 延迟可视化开关 */}
              <Button
                variant="ghost"
                size="xs"
                className={cn(TOGGLE_BASE_CLASS, toggleClass(showDelay))}
                aria-pressed={showDelay}
                onClick={() => setShowDelay(v => !v)}
              >
                延迟
              </Button>
              {/* 丢包可视化开关 */}
              <Button
                variant="ghost"
                size="xs"
                className={cn(TOGGLE_BASE_CLASS, toggleClass(showLoss))}
                aria-pressed={showLoss}
                onClick={() => setShowLoss(v => !v)}
              >
                丢包
              </Button>
              {/* 平滑峰值开关 */}
              <div className="flex gap-2 items-center">
                <Button
                  variant="ghost"
                  size="xs"
                  className={cn(TOGGLE_BASE_CLASS, toggleClass(cutPeak))}
                  aria-pressed={cutPeak}
                  onClick={() => setCutPeak(v => !v)}
                >
                  平滑峰值
                </Button>
                <DataTooltip
                  content="使用 EWMA 算法平滑数据并过滤突变值"
                  placement="top"
                  contentClass="whitespace-nowrap"
                >
                  <Button variant="ghost" size="icon-xs" className="text-muted-foreground" aria-label="平滑峰值说明">
                    <Icon icon="carbon:information" width={14} height={14} />
                  </Button>
                </DataTooltip>
              </div>
            </div>

            {/* 图表 */}
            <div
              className={cn(
                'h-80 p-4',
                pickSurfaceClass(CARD_SURFACE_CLASS, 'rounded-xl border bg-card/60 backdrop-blur-xs'),
              )}
            >
              <EChart option={pingChartOption} />
            </div>
          </>
        )}
      </Spinner>
    </div>
  )
}

export default PingChart
