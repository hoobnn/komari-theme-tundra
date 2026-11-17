import { Icon } from '@iconify/react'
import dayjs from 'dayjs'
import { format } from 'echarts/core'
import { Fragment, useState } from 'react'
import { EChart } from '@/components/EChart'
import PingValue from '@/components/PingValue'
import PingTaskDetails from '@/components/charts/PingTaskDetails'
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
import { describePing, formatPingLoss, pingLossTone, pingStatusLabel, pingTaskAverage } from '@/utils/pingDisplay'
import { HISTORY_MAX_POINTS } from '@/utils/pingHistory'
import { groupPingTasksByStack, pingStackLabel } from '@/utils/pingStack'
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

// 长范围 fill_empty 可能产生大量空桶，限制每条线路同时绘制的标记数量。
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
  const taskGroups = groupPingTasksByStack(tasks, t => t.name)
  taskGroups.forEach((group, groupIndex) => {
    const paletteIndex = groupIndex % SERIES_PALETTE.length
    const v6Palette = isDark ? SERIES_PALETTE_V6_DARK : SERIES_PALETTE_V6_LIGHT
    for (const { stack, item } of group.items) {
      const color = stack === 'v6' ? v6Palette[paletteIndex] : SERIES_PALETTE[paletteIndex]
      taskMeta.set(item.id, { color, stack, base: group.base })
    }
  })

  const ipv6Ids = tasks.filter(task => taskMeta.get(task.id)?.stack === 'v6').map(task => task.id)
  const ipv4Ids = tasks.filter(task => taskMeta.get(task.id)?.stack !== 'v6').map(task => task.id)
  const hasDualStack = ipv6Ids.length > 0 && ipv4Ids.length > 0

  function getTaskColor(taskId: number): string {
    return taskMeta.get(taskId)?.color ?? SERIES_PALETTE[0]
  }

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
    setSelectedTaskIds(
      selectedTaskIds.includes(taskId) ? selectedTaskIds.filter(id => id !== taskId) : [...selectedTaskIds, taskId],
    )
  }

  function showAllTasks() {
    setSelectedTaskIds(tasks.map(t => t.id))
  }

  function hideAllTasks() {
    setSelectedTaskIds([])
  }

  const onlyIPv4 = ipv4Ids.length === selectedTaskIds.length && ipv4Ids.every(id => selectedTaskIds.includes(id))
  const onlyIPv6 = ipv6Ids.length === selectedTaskIds.length && ipv6Ids.every(id => selectedTaskIds.includes(id))

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
        markPoint:
          showLoss && showDelay && lossMarkerIndexes.length
            ? {
                silent: true,
                animation: false,
                symbol: isV6 ? 'diamond' : 'rect',
                symbolSize: isV6 ? [4, 5] : [2, 6],
                symbolOffset: [0, isV6 ? -11 : -4],
                label: { show: false },
                itemStyle: { color: CHART_COLORS.loss, opacity: 0.85 },
                data: lossMarkerIndexes.map(index => ({ coord: [index, 0] })),
              }
            : undefined,
        markLine:
          showLoss && !showDelay && lossMarkerIndexes.length
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
        confine: true,
        extraCssText: `${baseTooltipConfig.extraCssText};max-width:100%;box-sizing:border-box`,
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
            const task = taskList.find(t => t.name === item.seriesName)
            if (!task) continue
            const hadLoss = showLoss && packetLossMarkers.get(task.id)?.includes(item.dataIndex)
            const value = showDelay && typeof item.value === 'number' ? `${Math.round(item.value)} ms` : ''
            if (!value && !hadLoss) continue
            const color = colorMap.get(task.id) || SERIES_PALETTE[0]
            const colorDot =
              taskMeta.get(task.id)?.stack === 'v6'
                ? `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;border:2px solid ${color};box-sizing:border-box;margin-right:8px;flex-shrink:0"></span>`
                : `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:8px;flex-shrink:0"></span>`
            const loss = hadLoss ? `<span style="color:${CHART_COLORS.loss};margin-left:8px">丢包</span>` : ''
            html += `<div style="display:flex;align-items:center">${colorDot}<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${format.encodeHTML(item.seriesName)}</span><span style="margin-left:12px;font-weight:600;font-variant-numeric:tabular-nums">${value}</span>${loss}</div>`
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
        name: showDelay ? '延迟 (ms)' : '丢包事件',
        nameTextStyle: { color: chartThemeColors.textSecondary },
        axisLabel: { show: showDelay, fontSize: 11, color: chartThemeColors.textSecondary, formatter: '{value}' },
        axisLine: { show: false },
        axisTick: { show: false },
        axisPointer: {
          lineStyle: { opacity: 0 },
          crossStyle: { opacity: 0 },
          label: { show: false },
        },
        splitLine: {
          show: showDelay,
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
    <div className={cn('flex h-full min-h-0 flex-col gap-4', className)}>
      {/* 时间选择器；窄屏时筛选按钮换到第二行，避免把范围标签挤掉 */}
      <Tabs
        value={selectedView}
        onValueChange={setPickedView}
        className="w-full shrink-0 flex-row flex-wrap items-center gap-2"
      >
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
                  className={cn('h-6.5', TOGGLE_BASE_CLASS, segmentClass(onlyIPv4))}
                  aria-pressed={onlyIPv4}
                  onClick={() => setSelectedTaskIds(ipv4Ids)}
                >
                  IPv4
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  className={cn('h-6.5', TOGGLE_BASE_CLASS, segmentClass(onlyIPv6))}
                  aria-pressed={onlyIPv6}
                  onClick={() => setSelectedTaskIds(ipv6Ids)}
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

      {/* 内容区域；弹窗里这一层撑满剩余高度，图表卡片再吃掉多余空间 */}
      <Spinner
        show={loading}
        className="flex min-h-0 flex-[1_1_auto] flex-col gap-4"
        contentClass="flex flex-col gap-4"
      >
        {error ? (
          <div className="text-red-500 py-8 text-center">{error}</div>
        ) : tasks.length === 0 && !loading ? (
          <div className="py-6 text-center text-xs text-muted-foreground">
            这段时间没有延迟数据，节点可能未配置延迟监测
          </div>
        ) : (
          <>
            <div
              className={cn(
                'flex min-h-64 flex-[1_1_20rem] flex-col gap-2 p-3 sm:p-4',
                pickSurfaceClass(CARD_SURFACE_CLASS, 'rounded-xl border bg-card/60 backdrop-blur-xs'),
              )}
            >
              <div className="flex shrink-0 flex-wrap gap-2 items-center">
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
                  title="红色标记表示丢包，查看对应时刻可见受影响的线路"
                  onClick={() => setShowLoss(v => !v)}
                >
                  <span
                    aria-hidden="true"
                    className={cn('h-2 w-0.5 rounded-full', showLoss ? 'bg-red-500' : 'bg-muted-foreground')}
                  />
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
                      <Icon icon="lucide:info" width={14} height={14} />
                    </Button>
                  </DataTooltip>
                </div>
              </div>
              {tasks.length > 0 && (!selectedTaskIds.length || (!showDelay && !showLoss)) ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 text-xs text-muted-foreground">
                  <span>{!selectedTaskIds.length ? '尚未选择线路' : '延迟和丢包曲线均已隐藏'}</span>
                  {!selectedTaskIds.length ? (
                    <Button variant="outline" size="sm" onClick={showAllTasks}>
                      显示全部线路
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShowDelay(true)
                        setShowLoss(true)
                      }}
                    >
                      显示曲线
                    </Button>
                  )}
                </div>
              ) : (
                <EChart option={pingChartOption} className="min-h-0 flex-1" />
              )}
            </div>

            {/* 时段统计按线路分组，每个协议栈一行 */}
            {taskGroups.length > 0 && (
              <div
                className="grid shrink-0 gap-3"
                style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 16rem), 1fr))' }}
              >
                {taskGroups.map(group => (
                  <div
                    key={group.items[0].item.id}
                    className={cn(
                      'flex flex-col gap-1.5 p-3',
                      pickSurfaceClass(CARD_SURFACE_CLASS, 'rounded-xl border bg-card/60 backdrop-blur-xs'),
                    )}
                  >
                    {/* 线路名独占一行，下面才是对齐的数值表 */}
                    <div className="flex min-w-0 items-center gap-2">
                      <div
                        className="h-4 w-1 shrink-0 rounded"
                        style={{ backgroundColor: getTaskColor(group.items[0].item.id) }}
                      />
                      <span className="truncate text-compact font-semibold">{group.base}</span>
                    </div>
                    <div className="grid grid-cols-[3.25rem_minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,0.8fr)_1.75rem] items-center gap-x-1 gap-y-0.5">
                      <span />
                      <span className="text-end text-2xs text-muted-foreground">平均延迟</span>
                      <span className="text-end text-2xs text-muted-foreground">丢包率</span>
                      <span
                        className="text-right text-2xs text-muted-foreground"
                        title="P99 与 P50 的比值，越大越不稳定"
                      >
                        波动
                      </span>
                      <span />
                      {group.items.map(({ stack, item: task }) => {
                        const selected = selectedTaskIds.includes(task.id)
                        const average = pingTaskAverage(task)
                        const loss = task.total === 0 ? null : formatPingLoss(task.loss, 2)
                        return (
                          <Fragment key={task.id}>
                            <button
                              type="button"
                              aria-pressed={selected}
                              aria-label={`${task.name} 曲线`}
                              aria-description={`平均延迟 ${describePing(average)}，丢包率 ${loss ?? pingStatusLabel.missing}`}
                              className={cn(
                                'col-span-4 grid min-h-8 cursor-pointer grid-cols-subgrid items-center rounded-md text-xs hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring',
                                !selected && 'text-muted-foreground',
                              )}
                              onClick={() => toggleTask(task.id)}
                            >
                              <span className="flex items-center gap-1">
                                <Icon
                                  icon={selected ? 'lucide:square-check' : 'lucide:square'}
                                  className="size-3.5 shrink-0"
                                  aria-hidden="true"
                                />
                                <span
                                  className={cn('border-b-2 text-2xs', stack === 'v6' && 'border-dashed')}
                                  style={{ borderColor: getTaskColor(task.id) }}
                                >
                                  {pingStackLabel(stack) || 'Ping'}
                                </span>
                              </span>
                              <span className="text-end font-medium" title={`平均延迟 ${describePing(average)}`}>
                                <PingValue
                                  value={average}
                                  unit
                                  className={
                                    !selected && typeof average === 'number' ? 'text-muted-foreground' : undefined
                                  }
                                />
                              </span>
                              <span
                                className={cn('num text-end', selected && loss != null && pingLossTone(task.loss).text)}
                              >
                                {loss ?? <PingValue value="missing" />}
                              </span>
                              <span className="num text-end">
                                {typeof average === 'number' && task.p99_p50_ratio != null ? (
                                  task.p99_p50_ratio.toFixed(2)
                                ) : (
                                  <PingValue value="missing" />
                                )}
                              </span>
                            </button>
                            <PingTaskDetails task={task} />
                          </Fragment>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </Spinner>
    </div>
  )
}

export default PingChart
