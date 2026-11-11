<script setup lang="ts">
import type { PingLossRecord } from '@/utils/pingHistory'
import type { PingRecord, PingTaskInfo } from '@/utils/rpc'
import { Icon } from '@iconify/vue'
import dayjs from 'dayjs'
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import VChart from 'vue-echarts'
import { Button } from '@/components/ui/button'
import { DataTooltip } from '@/components/ui/data-tooltip'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useBackgroundSurface } from '@/composables/useBackgroundSurface'
import { useAppStore } from '@/stores/app'
import { buildBaseTooltip, CHART_COLORS, DASHED_LEGEND_ICON, getChartThemeColors, SERIES_PALETTE, SERIES_PALETTE_V6_DARK, SERIES_PALETTE_V6_LIGHT } from '@/utils/chartTheme'
import { buildChartViews, PING_CHART_VIEWS } from '@/utils/chartViews'
import { fetchPingHistory, HISTORY_MAX_POINTS } from '@/utils/pingHistory'
import { groupPingTasksByStack, parsePingTaskName, pingStackLabel } from '@/utils/pingStack'
import { cutPeakValues, interpolateNullsLinear } from '@/utils/recordHelper'
import { CARD_SURFACE_CLASS, segmentClass, TAB_TRIGGER_CLASS, TOGGLE_BASE_CLASS, toggleClass } from '@/utils/uiClasses'
import '@/utils/echarts' // 共享 ECharts 配置

const props = defineProps<{
  uuid: string
}>()

const appStore = useAppStore()
const { pickSurfaceClass } = useBackgroundSurface()
const isDark = computed(() => appStore.isDark)

// 图表主题相关颜色
const chartThemeColors = computed(() => getChartThemeColors(isDark.value))

// 从 publicSettings 获取记录保留时间
const maxPingRecordPreserveTime = computed(() => appStore.publicSettings?.ping_record_preserve_time || 168)

// 可用视图：12 小时仅延迟图有；60/90 天仅在实际保留时间足够时显示
const availableViews = computed(() => buildChartViews(PING_CHART_VIEWS, maxPingRecordPreserveTime.value))

// 当前选中的视图
const selectedView = ref<string>('')
const selectedHours = computed(() => {
  const view = availableViews.value.find(v => v.label === selectedView.value)
  return view?.hours || 1
})

// 初始化默认视图
watch(availableViews, (views) => {
  const firstView = views[0]
  if (firstView && !selectedView.value) {
    selectedView.value = firstView.label
  }
}, { immediate: true })

// 数据状态
const remoteData = shallowRef<PingRecord[]>([])
const lossRecordsData = shallowRef<PingLossRecord[]>([])
const tasks = shallowRef<PingTaskInfo[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
let fetchRequestId = 0

// 任务选择
const selectedTaskIds = ref<number[]>([])
const cutPeak = ref(false)
const showDelay = ref(true)
const showLoss = ref(true)
const chartMargin = {
  top: 30,
  right: 24,
  bottom: 52,
  left: 56,
}

const mergeToleranceMs = computed(() => {
  const taskIntervals = tasks.value
    .map(t => t.interval)
    .filter((v): v is number => typeof v === 'number' && v > 0)

  const fallbackIntervalSec = taskIntervals.length
    ? Math.min(...taskIntervals)
    : 60
  return Math.min(
    6000,
    Math.max(800, Math.floor(fallbackIntervalSec * 1000 * 0.25)),
  )
})

// ==================== 数据获取 ====================

async function fetchRecords() {
  if (!props.uuid)
    return

  const requestId = ++fetchRequestId
  const uuid = props.uuid
  const hours = selectedHours.value

  loading.value = true
  error.value = null

  try {
    const result = await fetchPingHistory(uuid, hours)
    if (requestId !== fetchRequestId)
      return

    remoteData.value = result.records
    lossRecordsData.value = result.lossRecords
    tasks.value = result.tasks

    if (tasks.value.length > 0 && selectedTaskIds.value.length === 0) {
      selectedTaskIds.value = tasks.value.map(t => t.id)
    }
  }
  catch (err) {
    if (requestId !== fetchRequestId)
      return

    error.value = err instanceof Error
      ? err.message
      : '获取数据失败'
    remoteData.value = []
    lossRecordsData.value = []
    tasks.value = []
  }
  finally {
    if (requestId === fetchRequestId) {
      loading.value = false
    }
  }
}

// ==================== 数据处理 ====================

const mergedData = computed(() => {
  const data = remoteData.value
  if (!data.length)
    return []

  const toleranceMs = mergeToleranceMs.value

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
    group[rec.task_id] = rec.value < 0
      ? null
      : rec.value
  }

  const merged = Array.from(grouped.values()).sort(
    (a, b) => dayjs(a.time as string).valueOf() - dayjs(b.time as string).valueOf(),
  )

  const hours = selectedHours.value
  const lastItem = merged.at(-1)
  const lastTs = lastItem
    ? dayjs(lastItem.time as string).valueOf()
    : dayjs().valueOf()
  const fromTs = lastTs - hours * 3600_000

  let startIdx = 0
  for (let i = 0; i < merged.length; i++) {
    const item = merged[i]
    if (!item)
      continue
    const ts = dayjs(item.time as string).valueOf()
    if (ts >= fromTs) {
      startIdx = Math.max(0, i - 1)
      break
    }
  }

  return merged.slice(startIdx)
})

const chartData = computed(() => {
  let data = mergedData.value
  const selectedKeys = selectedTaskIds.value.map(String)

  if (selectedKeys.length === 0)
    return []

  if (cutPeak.value) {
    data = cutPeakValues(data, selectedKeys)
  }

  if (selectedKeys.length > 0 && data.length > 0) {
    // 长范围降采样后桶间隔会变大，按查询跨度放宽插值上限，避免 7 天+ 曲线被硬截断
    const bucketMs = Math.ceil((selectedHours.value * 3600_000) / HISTORY_MAX_POINTS)
    data = interpolateNullsLinear(data, selectedKeys, {
      maxGapMultiplier: 6,
      minCapMs: 2 * 60_000,
      maxCapMs: Math.max(30 * 60_000, bucketMs * 6),
    })
  }

  return data
})

// ==================== 工具函数 ====================

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

const showDateInAxis = computed(() => selectedHours.value >= 24)

// ==================== 任务选择 ====================

// 双栈：同一线路（如「四川电信 v4 / v6」）用同色系，v6 换深浅一档并用虚线
const taskMeta = computed(() => {
  const meta = new Map<number, { color: string, stack: 'v4' | 'v6' | null, base: string }>()
  groupPingTasksByStack(tasks.value, t => t.name).forEach((group, groupIndex) => {
    const paletteIndex = groupIndex % SERIES_PALETTE.length
    const v6Palette = isDark.value ? SERIES_PALETTE_V6_DARK : SERIES_PALETTE_V6_LIGHT
    for (const { stack, item } of group.items) {
      const color = stack === 'v6'
        ? v6Palette[paletteIndex]!
        : SERIES_PALETTE[paletteIndex]!
      meta.set(item.id, { color, stack, base: group.base })
    }
  })
  return meta
})

const hasDualStack = computed(() => [
  ...taskMeta.value.values(),
].some(m => m.stack === 'v6'))

function getTaskColor(taskId: number): string {
  return taskMeta.value.get(taskId)?.color ?? SERIES_PALETTE[0]
}

// 最新值统计（从服务端 tasks 获取，保持颜色顺序）
const latestValues = computed(() => {
  if (!tasks.value.length)
    return []

  const latestMap = new Map<number, number | null>()
  for (const task of tasks.value) {
    for (let i = remoteData.value.length - 1; i >= 0; i--) {
      const rec = remoteData.value[i]
      if (rec && rec.task_id === task.id && rec.value >= 0) {
        latestMap.set(task.id, rec.value)
        break
      }
    }
  }

  return tasks.value.map((task) => {
    const meta = taskMeta.value.get(task.id)
    return {
      ...task,
      latestValue: latestMap.get(task.id) ?? null,
      color: meta?.color ?? SERIES_PALETTE[0],
      stack: meta?.stack ?? null,
    }
  })
})

// 统计卡片按线路分组，组内 v4 / v6 各占一行
const latestValueGroups = computed(() => groupPingTasksByStack(latestValues.value, t => t.name))

const selectedTasks = computed(() => {
  return tasks.value.filter(t => selectedTaskIds.value.includes(t.id))
})

const packetLossMarkers = computed(() => {
  const data = mergedData.value
  const markers = new Map<number, number[]>()

  if (!data.length || !selectedTasks.value.length)
    return markers

  // 长范围 fill_empty 可能产生大量空桶，限制标记数量避免 markLine 过密拖垮渲染
  const MAX_LOSS_MARKERS_PER_TASK = 200
  const chartTimes = data.map(item => dayjs(item.time as string).valueOf())
  const toleranceMs = mergeToleranceMs.value

  for (const task of selectedTasks.value) {
    const points = new Set<number>()
    // 来源 1：短周期原始探测点中延迟为 null / < 0
    const taskLatencyLossRecords = remoteData.value.filter(rec => rec.task_id === task.id && rec.value < 0)
    for (const record of taskLatencyLossRecords) {
      if (points.size >= MAX_LOSS_MARKERS_PER_TASK)
        break

      const lossTs = dayjs(record.time).valueOf()
      let matchedIndex = -1

      for (let i = 0; i < chartTimes.length; i++) {
        const chartTs = chartTimes[i]
        if (chartTs === undefined)
          continue

        if (Math.abs(chartTs - lossTs) <= toleranceMs) {
          matchedIndex = i
          break
        }
      }

      if (matchedIndex >= 0) {
        points.add(matchedIndex)
      }
    }

    // 来源 2：长周期聚合分桶的 ping.loss 时序数据
    const taskLossRecords = lossRecordsData.value.filter(rec => rec.task_id === task.id && rec.loss > 0)
    for (const record of taskLossRecords) {
      if (points.size >= MAX_LOSS_MARKERS_PER_TASK)
        break

      const lossTs = dayjs(record.time).valueOf()
      let matchedIndex = -1

      for (let i = 0; i < chartTimes.length; i++) {
        const chartTs = chartTimes[i]
        if (chartTs === undefined)
          continue

        if (Math.abs(chartTs - lossTs) <= toleranceMs) {
          matchedIndex = i
          break
        }
      }

      if (matchedIndex >= 0) {
        points.add(matchedIndex)
      }
    }

    markers.set(task.id, Array.from(points).sort((a, b) => a - b))
  }

  return markers
})

// 切换任务选中状态
function toggleTask(taskId: number) {
  if (selectedTaskIds.value.includes(taskId)) {
    selectedTaskIds.value = selectedTaskIds.value.filter(id => id !== taskId)
  }
  else {
    selectedTaskIds.value = [...selectedTaskIds.value, taskId]
  }
}

function showAllTasks() {
  selectedTaskIds.value = tasks.value.map(t => t.id)
}

function hideAllTasks() {
  selectedTaskIds.value = []
}

// 只看某个协议栈：v4 同时包含未标注协议栈的任务
function showStackTasks(stack: 'v4' | 'v6') {
  selectedTaskIds.value = tasks.value
    .filter((t) => {
      const taskStack = parsePingTaskName(t.name).stack
      return stack === 'v6'
        ? taskStack === 'v6'
        : taskStack !== 'v6'
    })
    .map(t => t.id)
}

function isStackSelected(stack: 'v4' | 'v6'): boolean {
  if (!selectedTaskIds.value.length)
    return false
  return selectedTaskIds.value.every((id) => {
    const taskStack = taskMeta.value.get(id)?.stack ?? null
    return stack === 'v6'
      ? taskStack === 'v6'
      : taskStack !== 'v6'
  })
}

// ==================== 图表配置 ====================

// 通用 Tooltip 配置
const baseTooltipConfig = computed(() => buildBaseTooltip(chartThemeColors.value, true))

const pingChartOption = computed(() => {
  const taskList = selectedTasks.value
  const data = chartData.value
  const hours = selectedHours.value

  // 构建 series，确保颜色与卡片一致
  const series = taskList.map((task) => {
    const color = getTaskColor(task.id)
    const isV6 = taskMeta.value.get(task.id)?.stack === 'v6'
    const lossMarkerIndexes = packetLossMarkers.value.get(task.id) || []
    return {
      name: task.name,
      type: 'line' as const,
      data: data.map(d => d[task.id] as number | null ?? null),
      smooth: showDelay.value
        ? (cutPeak.value ? 0.6 : 0.1)
        : 0,
      showSymbol: false,
      connectNulls: false,
      lineStyle: {
        width: showDelay.value ? 1.5 : 0,
        color,
        cap: 'round' as const,
        type: isV6 ? 'dashed' as const : 'solid' as const,
      },
      itemStyle: {
        color,
        opacity: showDelay.value ? 1 : 0,
      },
      markLine: showLoss.value && lossMarkerIndexes.length
        ? {
            silent: true,
            symbol: ['none', 'none'],
            animation: false,
            label: { show: false },
            // 丢包统一用红色：红色只表示「差」，不跟随线路色
            lineStyle: {
              color: CHART_COLORS.loss,
              width: 1,
              type: isV6 ? 'dashed' as const : 'solid' as const,
              opacity: hours >= 168
                ? 0.2
                : 0.35,
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
  tasks.value.forEach(task => colorMap.set(task.id, getTaskColor(task.id)))

  return {
    animation: false,
    // 全局颜色设置（用于图例等）
    color: tasks.value.map(task => getTaskColor(task.id)),
    tooltip: {
      ...baseTooltipConfig.value,
      formatter: (params: unknown) => {
        const p = params as Array<{ seriesName: string, value: number | null, dataIndex: number }>
        if (!p.length)
          return ''
        const firstParam = p[0]
        if (!firstParam)
          return ''
        const rowData = data[firstParam.dataIndex]
        if (!rowData)
          return ''

        const time = rowData.time as string
        const timeStr = formatTimeForTooltip(time, hours)
        let html = `<div style="font-weight:600;margin-bottom:6px;color:${chartThemeColors.value.textSecondary}">${timeStr}</div>`
        html += '<div style="display:flex;flex-direction:column;gap:4px">'

        // 按延迟值排序显示
        const sortedParams = [...p].sort((a, b) => (a.value ?? 0) - (b.value ?? 0))

        for (const item of sortedParams) {
          if (item.value !== null && item.value !== undefined) {
            // 通过任务名找到对应的任务ID，再获取颜色
            const task = tasks.value.find(t => t.name === item.seriesName)
            const color = task
              ? colorMap.get(task.id) || SERIES_PALETTE[0]
              : SERIES_PALETTE[0]
            const isV6 = task
              ? taskMeta.value.get(task.id)?.stack === 'v6'
              : false
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
      textStyle: { fontSize: 11, color: chartThemeColors.value.textSecondary },
      // v6 用虚线图标，与图上的虚线对应
      data: taskList.map(t => taskMeta.value.get(t.id)?.stack === 'v6'
        ? { name: t.name, icon: DASHED_LEGEND_ICON }
        : t.name),
    },
    grid: chartMargin,
    xAxis: {
      type: 'category',
      data: data.map(d => formatTime(d.time as string, showDateInAxis.value)),
      axisLabel: {
        fontSize: 11,
        color: chartThemeColors.value.textSecondary,
        margin: 12,
      },
      axisLine: {
        show: true,
        lineStyle: { color: chartThemeColors.value.borderColor, width: 1 },
      },
      axisTick: { show: false },
      boundaryGap: false,
    },
    yAxis: {
      type: 'value',
      name: '延迟 (ms)',
      nameTextStyle: { color: chartThemeColors.value.textSecondary },
      axisLabel: { fontSize: 11, color: chartThemeColors.value.textSecondary, formatter: '{value}' },
      axisLine: { show: false },
      axisTick: { show: false },
      axisPointer: {
        lineStyle: { opacity: 0 },
        crossStyle: { opacity: 0 },
        label: { show: false },
      },
      splitLine: {
        lineStyle: {
          color: chartThemeColors.value.splitLineColor,
          type: 'dashed' as const,
        },
      },
    },
    series,
  }
})

// ==================== 生命周期 ====================

watch(selectedView, () => {
  selectedTaskIds.value = []
  fetchRecords()
})

watch(() => props.uuid, () => {
  remoteData.value = []
  lossRecordsData.value = []
  tasks.value = []
  selectedTaskIds.value = []
  fetchRecords()
})

onMounted(() => {
  const firstView = availableViews.value[0]
  if (firstView && !selectedView.value) {
    selectedView.value = firstView.label
  }
  fetchRecords()
})
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- 时间选择器；窄屏时筛选按钮换到第二行，避免把范围标签挤掉 -->
    <Tabs v-model="selectedView" class="w-full flex-row flex-wrap items-center gap-2">
      <div class="min-w-0 overflow-x-auto pointer-events-auto max-md:basis-full md:flex-1">
        <TabsList :class="pickSurfaceClass('w-max h-8 bg-background/60 rounded-md', 'w-max h-8 bg-background/50 backdrop-blur-xl rounded-md')">
          <TabsTrigger
            v-for="view in availableViews" :key="view.label" :value="view.label"
            :class="TAB_TRIGGER_CLASS"
          >
            {{ view.label }}
          </TabsTrigger>
        </TabsList>
      </div>
      <div v-if="tasks.length > 0" class="flex items-center gap-2">
        <div v-if="hasDualStack" class="inline-flex rounded-md bg-muted/70 p-0.5" role="group" aria-label="协议栈">
          <Button
            variant="ghost" size="xs" class="h-6.5" :class="[TOGGLE_BASE_CLASS, segmentClass(selectedTaskIds.length === tasks.length)]"
            :aria-pressed="selectedTaskIds.length === tasks.length"
            @click="showAllTasks()"
          >
            全部
          </Button>
          <Button
            variant="ghost" size="xs" class="h-6.5" :class="[TOGGLE_BASE_CLASS, segmentClass(isStackSelected('v4'))]"
            :aria-pressed="isStackSelected('v4')"
            @click="showStackTasks('v4')"
          >
            IPv4
          </Button>
          <Button
            variant="ghost" size="xs" class="h-6.5" :class="[TOGGLE_BASE_CLASS, segmentClass(isStackSelected('v6'))]"
            :aria-pressed="isStackSelected('v6')"
            @click="showStackTasks('v6')"
          >
            IPv6
          </Button>
        </div>
        <!-- 全选 / 全不选是动作，不画成选中态 -->
        <Button
          variant="ghost" size="xs" :class="[TOGGLE_BASE_CLASS, toggleClass(false)]"
          @click="selectedTaskIds.length === tasks.length ? hideAllTasks() : showAllTasks()"
        >
          {{ selectedTaskIds.length === tasks.length ? '全不选' : '全选' }}
        </Button>
      </div>
    </Tabs>

    <!-- 内容区域 -->
    <Spinner :show="loading" content-class="flex flex-col gap-4">
      <div v-if="error" class="text-red-500 py-8 text-center">
        {{ error }}
      </div>
      <div v-else-if="tasks.length === 0 && !loading" class="py-6 text-center text-xs text-muted-foreground">
        这段时间没有延迟数据，节点可能未配置延迟监测
      </div>

      <template v-else>
        <!-- 最新值统计卡片：按线路分组，组内每个协议栈一行（点击行切换选中） -->
        <div
          v-if="latestValueGroups.length > 0" class="gap-3 grid"
          style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr))"
        >
          <div
            v-for="group in latestValueGroups" :key="group.base"
            class="flex flex-col gap-1 p-3"
            :class="pickSurfaceClass(CARD_SURFACE_CLASS, 'rounded-xl border bg-card/60 backdrop-blur-xs')"
          >
            <div class="grid grid-cols-[2rem_repeat(3,minmax(0,1fr))_1.5rem] items-center gap-x-2">
              <div class="col-span-2 flex min-w-0 items-center gap-2">
                <div class="h-4 w-1 shrink-0 rounded" :style="{ backgroundColor: group.items[0]?.item.color }" />
                <span class="truncate text-sm font-semibold">{{ group.base }}</span>
              </div>
              <span class="text-right text-[11px] text-muted-foreground">丢包</span>
              <span class="text-right text-[11px] text-muted-foreground" title="P99 与 P50 的比值，越大越不稳定">波动</span>
              <span />
            </div>
            <div
              v-for="{ stack, item: task } in group.items" :key="task.id"
              class="grid cursor-pointer select-none grid-cols-[2rem_repeat(3,minmax(0,1fr))_1.5rem] items-center gap-x-2 rounded-sm text-xs text-muted-foreground transition-opacity"
              :class="[!selectedTaskIds.includes(task.id) && 'opacity-30']"
              @click="toggleTask(task.id)"
            >
              <span
                v-if="stack"
                class="w-8 shrink-0 rounded-sm border px-1 text-center text-[10px] leading-4"
                :class="stack === 'v6' ? 'border-dashed' : ''"
                :style="{ borderColor: task.color, color: task.color }"
              >{{ stack === 'v6' ? 'v6' : 'v4' }}</span>
              <span v-else />
              <span class="num font-medium text-foreground" title="平均延迟">
                {{ task.avg !== undefined ? `${Math.round(task.avg)} ms` : '--' }}
              </span>
              <span class="num text-right">{{ task.loss.toFixed(2) }}%</span>
              <span class="num text-right">{{ task.p99_p50_ratio !== undefined ? task.p99_p50_ratio.toFixed(2) : '--' }}</span>
              <DataTooltip placement="left" content-class="w-60 p-3">
                <Button variant="ghost" size="icon-xs" class="text-muted-foreground" aria-label="线路详情" @click.stop>
                  <Icon icon="carbon:information" :width="14" :height="14" />
                </Button>
                <template #content>
                  <div class="mb-2 text-xs font-semibold">
                    {{ task.name }}<template v-if="stack">
                      （{{ pingStackLabel(stack) }}）
                    </template>
                  </div>
                  <div class="text-xs gap-x-4 gap-y-1.5 grid grid-cols-4">
                    <template v-if="task.min !== undefined">
                      <span class="text-muted-foreground">最小</span>
                      <span class="font-medium">{{ Math.round(task.min) }} ms</span>
                    </template>
                    <template v-if="task.max !== undefined">
                      <span class="text-muted-foreground">最大</span>
                      <span class="font-medium">{{ Math.round(task.max) }} ms</span>
                    </template>
                    <template v-if="task.avg !== undefined">
                      <span class="text-muted-foreground">平均</span>
                      <span class="font-medium">{{ Math.round(task.avg) }} ms</span>
                    </template>
                    <template v-if="task.latest !== undefined">
                      <span class="text-muted-foreground">最新</span>
                      <span class="font-medium">{{ Math.round(task.latest) }} ms</span>
                    </template>
                    <template v-if="task.p50 !== undefined">
                      <span class="text-muted-foreground">P50</span>
                      <span class="font-medium">{{ Math.round(task.p50) }} ms</span>
                    </template>
                    <template v-if="task.p99 !== undefined">
                      <span class="text-muted-foreground">P99</span>
                      <span class="font-medium">{{ Math.round(task.p99) }} ms</span>
                    </template>
                    <template v-if="task.p99_p50_ratio !== undefined">
                      <span class="text-muted-foreground">波动率</span>
                      <span class="font-medium">{{ task.p99_p50_ratio.toFixed(2) }}</span>
                    </template>
                    <template v-if="task.interval !== undefined">
                      <span class="text-muted-foreground">间隔</span>
                      <span class="font-medium">{{ task.interval }}s</span>
                    </template>
                    <template v-if="task.type">
                      <span class="text-muted-foreground">类型</span>
                      <span class="font-medium">{{ task.type.toUpperCase() }}</span>
                    </template>
                    <template v-if="task.total !== undefined">
                      <span class="text-muted-foreground">总数</span>
                      <span class="font-medium">{{ task.total }}</span>
                    </template>
                  </div>
                </template>
              </DataTooltip>
            </div>
          </div>
        </div>

        <div class="flex flex-wrap gap-2 items-center">
          <!-- 延迟可视化开关 -->
          <Button
            variant="ghost" size="xs" :class="[TOGGLE_BASE_CLASS, toggleClass(showDelay)]"
            :aria-pressed="showDelay" @click="showDelay = !showDelay"
          >
            延迟
          </Button>
          <!-- 丢包可视化开关 -->
          <Button
            variant="ghost" size="xs" :class="[TOGGLE_BASE_CLASS, toggleClass(showLoss)]"
            :aria-pressed="showLoss" @click="showLoss = !showLoss"
          >
            丢包
          </Button>
          <!-- 平滑峰值开关 -->
          <div class="flex gap-2 items-center">
            <Button
              variant="ghost" size="xs" :class="[TOGGLE_BASE_CLASS, toggleClass(cutPeak)]"
              :aria-pressed="cutPeak" @click="cutPeak = !cutPeak"
            >
              平滑峰值
            </Button>
            <DataTooltip
              content="使用 EWMA 算法平滑数据并过滤突变值"
              placement="top"
              content-class="whitespace-nowrap"
            >
              <Button variant="ghost" size="icon-xs" class="text-muted-foreground" aria-label="平滑峰值说明">
                <Icon icon="carbon:information" :width="14" :height="14" />
              </Button>
            </DataTooltip>
          </div>
        </div>

        <!-- 图表 -->
        <div
          class="h-80 p-4"
          :class="pickSurfaceClass(CARD_SURFACE_CLASS, 'rounded-xl border bg-card/60 backdrop-blur-xs')"
        >
          <VChart :option="pingChartOption" autoresize />
        </div>
      </template>
    </Spinner>
  </div>
</template>
