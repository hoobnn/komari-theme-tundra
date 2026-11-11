<script setup lang="ts">
import type { RecordFormat } from '@/utils/recordHelper'
import type { StatusRecord } from '@/utils/rpc'
import { Icon } from '@iconify/vue'
import { useIntervalFn } from '@vueuse/core'
import dayjs from 'dayjs'
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import VChart from 'vue-echarts'
import { CardX } from '@/components/ui/card-x'
import { Empty } from '@/components/ui/empty'
import { ProgressThin } from '@/components/ui/progress-thin'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useBackgroundSurface } from '@/composables/useBackgroundSurface'
import { useAppStore } from '@/stores/app'
import { useNodesStore } from '@/stores/nodes'
import { getSharedApi } from '@/utils/api'
import { areaStops, buildBaseTooltip, buildLegend, CHART_COLORS, DASHED_LEGEND_ICON, formatAxisBytes, getChartThemeColors, niceByteAxis, TRAFFIC_COLORS } from '@/utils/chartTheme'
import { buildChartViews, LOAD_CHART_VIEWS } from '@/utils/chartViews'
import { formatBytes } from '@/utils/helper'
import { fillMissingTimePoints } from '@/utils/recordHelper'
import { getSharedRpc } from '@/utils/rpc'
import { CARD_SURFACE_CLASS, TAB_TRIGGER_CLASS } from '@/utils/uiClasses'
import '@/utils/echarts' // 共享 ECharts 配置

const props = defineProps<{
  uuid: string
}>()

const appStore = useAppStore()
const { pickSurfaceClass } = useBackgroundSurface()
const nodesStore = useNodesStore()

// 从 publicSettings 获取记录保留时间
const maxRecordPreserveTime = computed(() => appStore.publicSettings?.record_preserve_time || 720)

// 从 publicSettings.theme_settings 获取数据更新间隔（秒），默认 3 秒
const dataUpdateInterval = computed(() => {
  const settings = appStore.publicSettings?.theme_settings
  const interval = settings?.dataUpdateInterval
  // 确保值在合理范围内（1-60秒）
  if (typeof interval === 'number' && interval >= 1 && interval <= 60) {
    return interval * 1000 // 转换为毫秒
  }
  return 3000 // 默认 3 秒
})

// 使用 store 中的 isDark computed
const isDark = computed(() => appStore.isDark)

// 系列配色来自共享 chartTheme：主指标翡翠绿，其余取 Tailwind 500 档
const chartColors = {
  primary: CHART_COLORS.emerald,
  secondary: CHART_COLORS.amber,
  tertiary: CHART_COLORS.cyan,
  quaternary: CHART_COLORS.violet,
  quinary: CHART_COLORS.blue,
}

const chartThemeColors = computed(() => getChartThemeColors(isDark.value))

// 通用 Tooltip 配置
const baseTooltipConfig = computed(() => buildBaseTooltip(chartThemeColors.value, appStore.backgroundEnabled))

// 图表边距配置
const chartMargin = {
  top: 30,
  right: 24,
  bottom: 32,
  left: 56,
}
const chartMarginWithLegend = {
  top: 30,
  right: 24,
  bottom: 52,
  left: 56,
}

// 视图选项（与 PingChart 对齐，实时仅负载图有；60/90 天仅在实际保留时间足够时显示）
// 可用视图：实时 + 按记录保留时长裁剪的历史范围
const availableViews = computed<Array<{ label: string, hours?: number }>>(() => [
  { label: '实时' },
  ...buildChartViews(LOAD_CHART_VIEWS, maxRecordPreserveTime.value),
])

// 当前选中的视图
const selectedView = ref<string>('实时')
const selectedHours = computed(() => {
  const view = availableViews.value.find(v => v.label === selectedView.value)
  return view?.hours
})
const isRealtime = computed(() => selectedView.value === '实时')

// 数据状态
const remoteData = shallowRef<StatusRecord[]>([])
const loading = ref(false)
const isInitialLoad = ref(true) // 是否为首次加载（实时模式下只在首次显示加载动画）
const error = ref<string | null>(null)

// 节点信息
const nodeInfo = computed(() => nodesStore.nodesByUuid.get(props.uuid))

// RPC 客户端
const rpc = getSharedRpc()
const api = getSharedApi()

// 实时视图的各卡温度，按记录时间对齐（RPC 实时记录不带 GPU 详情，REST /recent 每个点都带，且两者时间戳一致）
const gpuTempsByTime = shallowRef(new Map<string, number[]>())

async function fetchRecentGpuTemps(): Promise<Map<string, number[]>> {
  if (!nodeInfo.value?.gpu_detailed_info?.length)
    return new Map()
  try {
    const records = await api.getNodeRecentStatus(props.uuid)
    const map = new Map<string, number[]>()
    for (const r of records ?? []) {
      const gpus = r.gpu?.detailed_info
      if (gpus?.length)
        map.set(r.updated_at, gpus.map(g => g.temperature))
    }
    return map
  }
  catch {
    return new Map()
  }
}

// ==================== 数据获取 ====================

function statusToRecordFormat(records: StatusRecord[]): RecordFormat[] {
  return records.map(r => ({
    client: r.client,
    time: r.time,
    cpu: r.cpu ?? null,
    gpu: r.gpu ?? null,
    gpu_usage: null,
    gpu_memory: null,
    ram: r.ram ?? null,
    ram_total: r.ram_total ?? null,
    swap: r.swap ?? null,
    swap_total: r.swap_total ?? null,
    load: r.load ?? null,
    temp: r.temp ?? null,
    disk: r.disk ?? null,
    disk_total: r.disk_total ?? null,
    net_in: r.net_in ?? null,
    net_out: r.net_out ?? null,
    net_total_up: r.net_total_up ?? null,
    net_total_down: r.net_total_down ?? null,
    process: r.process ?? null,
    connections: r.connections ?? null,
    connections_udp: r.connections_udp ?? null,
  }))
}

async function fetchRecentData() {
  if (!props.uuid)
    return

  // 只在首次加载时显示 loading
  if (isInitialLoad.value) {
    loading.value = true
  }
  error.value = null

  try {
    const [result, temps] = await Promise.all([
      rpc.getNodeRecentStatus(props.uuid),
      fetchRecentGpuTemps(),
    ])
    gpuTempsByTime.value = temps
    const records = result?.records || []
    records.sort((a, b) => dayjs(a.time).valueOf() - dayjs(b.time).valueOf())
    const maxLength = 150
    remoteData.value = records.slice(-maxLength)
  }
  catch (err) {
    error.value = err instanceof Error
      ? err.message
      : '获取数据失败'
    remoteData.value = []
  }
  finally {
    loading.value = false
    isInitialLoad.value = false
  }
}

async function fetchHistoryData() {
  if (!props.uuid)
    return

  const hours = selectedHours.value || 4

  loading.value = true
  error.value = null

  try {
    const records = (await api.getLoadRecords(props.uuid, hours))?.records ?? []

    // 按时间排序
    records.sort((a, b) => dayjs(a.time).valueOf() - dayjs(b.time).valueOf())

    remoteData.value = records
  }
  catch (err) {
    error.value = err instanceof Error
      ? err.message
      : '获取数据失败'
    remoteData.value = []
  }
  finally {
    loading.value = false
  }
}

async function fetchData() {
  if (isRealtime.value) {
    await fetchRecentData()
  }
  else {
    await fetchHistoryData()
  }
}

// ==================== 数据处理 ====================

const chartData = computed(() => {
  const data = statusToRecordFormat(remoteData.value)
  if (!data.length)
    return []

  if (isRealtime.value) {
    return data
  }

  const hours = selectedHours.value || 4
  const minute = 60
  const hour = minute * 60
  let intervalSec: number
  let maxGap: number

  if (hours <= 4) {
    intervalSec = minute
    maxGap = minute * 2
  }
  else if (hours > 120) {
    intervalSec = hour
    maxGap = hour * 2
  }
  else {
    intervalSec = minute * 15
    maxGap = minute * 30
  }

  return fillMissingTimePoints(data, intervalSec, hours * 3600, maxGap)
})

const latestStatus = computed(() => {
  const data = remoteData.value
  if (!data.length)
    return null
  return data.at(-1) ?? null
})

// ==================== 工具函数 ====================

function formatTime(time: string, showDate: boolean): string {
  const date = dayjs(time)
  if (showDate) {
    return date.format('M/D HH:mm')
  }
  return date.format(isRealtime.value ? 'HH:mm:ss' : 'HH:mm')
}

function formatTimeForTooltip(time: string, hours: number): string {
  const date = dayjs(time)
  if (hours < 24) {
    return date.format('HH:mm:ss')
  }
  return date.format('MM/DD HH:mm')
}

const showDateInAxis = computed(() => (selectedHours.value || 1) >= 24)

// 通用 X 轴配置
const baseXAxisConfig = computed(() => ({
  type: 'category' as const,
  data: chartData.value.map(r => formatTime(r.time, showDateInAxis.value)),
  axisLabel: {
    fontSize: 11,
    color: chartThemeColors.value.textSecondary,
    margin: 12,
    hideOverlap: true,
  },
  axisLine: {
    show: true,
    lineStyle: { color: chartThemeColors.value.borderColor, width: 1 },
  },
  axisTick: { show: false },
  boundaryGap: false,
}))

// 通用 Y 轴配置
const baseYAxisConfig = computed(() => ({
  type: 'value' as const,
  axisLabel: {
    fontSize: 11,
    color: chartThemeColors.value.textSecondary,
  },
  axisLine: { show: false },
  axisTick: { show: false },
  splitLine: {
    lineStyle: {
      color: chartThemeColors.value.splitLineColor,
      type: 'dashed' as const,
    },
  },
  axisPointer: {
    lineStyle: { opacity: 0 },
    crossStyle: { opacity: 0 },
    label: { show: false },
  },
}))

// ==================== 图表配置 ====================

// ==================== Tooltip ====================

interface TooltipParam {
  dataIndex: number
  seriesName: string
  value: number | null
  color: string
}

interface TooltipRow {
  color: string
  label: string
  value: string
}

function usagePercent(used: number, total: number): string {
  return total > 0
    ? ((used / total) * 100).toFixed(1)
    : '0'
}

function tooltipRowHtml({ color, label, value }: TooltipRow): string {
  const colorDot = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:8px;flex-shrink:0"></span>`
  return `<div style="display:flex;align-items:center">${colorDot}<span>${label}</span><span style="margin-left:auto;font-weight:600;margin-left:16px">${value}</span></div>`
}

/** 统一 tooltip 外框：时间标题 + 每个系列一行，行内容由各图表决定 */
function tooltipFormatter(buildRows: (params: TooltipParam[], record: RecordFormat) => TooltipRow[]) {
  return (params: unknown) => {
    const p = params as TooltipParam[]
    const firstParam = p[0]
    const record = firstParam ? chartData.value[firstParam.dataIndex] : undefined
    if (!record)
      return ''
    const timeStr = formatTimeForTooltip(record.time, selectedHours.value || 1)
    const header = `<div style="font-weight:600;margin-bottom:6px;color:${chartThemeColors.value.textSecondary}">${timeStr}</div>`
    return `${header}<div style="display:flex;flex-direction:column;gap:4px">${buildRows(p, record).map(tooltipRowHtml).join('')}</div>`
  }
}

// CPU 图表
const cpuChartOption = computed(() => ({
  animation: false,
  // 全局颜色配置（确保 Tooltip 圆点颜色与线条一致）
  color: [chartColors.primary, CHART_COLORS.neutral],
  tooltip: {
    ...baseTooltipConfig.value,
    formatter: tooltipFormatter(params => params.flatMap((item) => {
      if (item.seriesName === 'CPU') {
        return [
          { color: item.color, label: 'CPU', value: `${item.value?.toFixed(1) ?? '-'}%` },
        ]
      }
      if (item.seriesName === '负载') {
        return [
          { color: item.color, label: '系统负载', value: item.value?.toFixed(2) ?? '-' },
        ]
      }
      return []
    })),
  },
  legend: buildLegend(chartThemeColors.value, [
    'CPU',
    { name: '负载', icon: DASHED_LEGEND_ICON },
  ]),
  grid: chartMarginWithLegend,
  xAxis: baseXAxisConfig.value,
  yAxis: [
    {
      ...baseYAxisConfig.value,
      name: 'CPU %',
      nameTextStyle: {
        color: chartThemeColors.value.textSecondary,
        padding: [0, 40, 0, 0],
      },
      min: 0,
      max: 100,
      axisLabel: { ...baseYAxisConfig.value.axisLabel, formatter: '{value}%' },
    },
    {
      ...baseYAxisConfig.value,
      name: '负载',
      nameTextStyle: {
        color: chartThemeColors.value.textSecondary,
        padding: [0, 0, 0, 40],
      },
      min: 0,
      splitLine: { show: false },
    },
  ],
  series: [
    {
      name: 'CPU',
      type: 'line',
      data: chartData.value.map(r => r.cpu),

      showSymbol: false,
      yAxisIndex: 0,
      lineStyle: { width: 1.5, color: chartColors.primary, cap: 'round' as const },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: areaStops(chartColors.primary),
        },
      },
    },
    {
      name: '负载',
      type: 'line',
      data: chartData.value.map(r => r.load),

      showSymbol: false,
      yAxisIndex: 1,
      // 负载是辅助指标，用中性灰虚线，避免盖过 CPU 曲线
      lineStyle: {
        width: 1.25,
        color: CHART_COLORS.neutral,
        cap: 'round' as const,
        type: 'dashed' as const,
      },
    },
  ],
}))

// ==================== GPU ====================

// 各卡实时详情来自节点状态（getNodesLatestStatus.gpu_detailed_info）；面板只把聚合使用率写进历史记录
const gpuDevices = computed(() => nodeInfo.value?.gpu_detailed_info ?? [])
const hasGpu = computed(() => gpuDevices.value.length > 0 || remoteData.value.some(r => (r.gpu ?? 0) > 0))

function gpuMemoryPercent(used: number, total: number): number {
  return total > 0
    ? (used / total) * 100
    : 0
}

function gpuTempClass(temp: number): string {
  if (temp >= 85)
    return 'text-red-500'
  if (temp >= 75)
    return 'text-amber-500'
  return ''
}

// 温度序列：仅实时视图有数据（面板历史记录不存温度）；0 视为无读数
const gpuTempSeries = computed(() => {
  if (!isRealtime.value)
    return []
  const count = gpuDevices.value.length
  const series: { name: string, data: (number | null)[] }[] = []
  for (let i = 0; i < count; i++) {
    const data = chartData.value.map((r) => {
      const t = gpuTempsByTime.value.get(r.time)?.[i]
      return t != null && t > 0
        ? t
        : null
    })
    if (data.some(v => v != null)) {
      series.push({
        name: count > 1
          ? `GPU${i} 温度`
          : '温度',
        data,
      })
    }
  }
  return series
})

const gpuTempColors = [
  chartColors.secondary,
  chartColors.primary,
  chartColors.quaternary,
  chartColors.tertiary,
]

// GPU 图表（聚合使用率 + 实时温度）
const gpuChartOption = computed(() => ({
  animation: false,
  color: [chartColors.quinary, ...gpuTempColors],
  tooltip: {
    ...baseTooltipConfig.value,
    formatter: tooltipFormatter(params => params.map(item => ({
      color: item.color,
      label: item.seriesName === 'GPU'
        ? '使用率'
        : item.seriesName,
      value: item.value == null
        ? '-'
        : item.seriesName === 'GPU'
          ? `${item.value.toFixed(1)}%`
          : `${item.value}°C`,
    }))),
  },
  legend: buildLegend(chartThemeColors.value, [
    'GPU',
    ...gpuTempSeries.value.map(t => t.name),
  ]),
  grid: chartMarginWithLegend,
  xAxis: baseXAxisConfig.value,
  yAxis: [
    {
      ...baseYAxisConfig.value,
      name: 'GPU %',
      nameTextStyle: {
        color: chartThemeColors.value.textSecondary,
        padding: [0, 40, 0, 0],
      },
      min: 0,
      max: 100,
      axisLabel: { ...baseYAxisConfig.value.axisLabel, formatter: '{value}%' },
    },
    {
      ...baseYAxisConfig.value,
      show: gpuTempSeries.value.length > 0,
      name: '温度',
      nameTextStyle: {
        color: chartThemeColors.value.textSecondary,
        padding: [0, 0, 0, 40],
      },
      min: 0,
      max: (v: { max: number }) => Math.max(100, Math.ceil(v.max / 10) * 10),
      splitLine: { show: false },
      axisLabel: { ...baseYAxisConfig.value.axisLabel, formatter: '{value}°C' },
    },
  ],
  series: [
    {
      name: 'GPU',
      type: 'line',
      data: chartData.value.map(r => r.gpu),
      showSymbol: false,
      yAxisIndex: 0,
      lineStyle: { width: 1.5, color: chartColors.quinary, cap: 'round' as const },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: areaStops(chartColors.quinary),
        },
      },
    },
    ...gpuTempSeries.value.map((t, i) => ({
      name: t.name,
      type: 'line',
      data: t.data,
      showSymbol: false,
      connectNulls: true,
      yAxisIndex: 1,
      lineStyle: { width: 1.5, color: gpuTempColors[i % gpuTempColors.length], cap: 'round' as const },
    })),
  ],
}))

// 内存图表
const memoryChartOption = computed(() => ({
  animation: false,
  color: [chartColors.primary, chartColors.secondary],
  tooltip: {
    ...baseTooltipConfig.value,
    formatter: tooltipFormatter((params, record) => {
      const ramUsed = record.ram ?? 0
      const ramTotal = record.ram_total || nodeInfo.value?.mem_total || 0
      const swapUsed = record.swap ?? 0
      const swapTotal = record.swap_total || nodeInfo.value?.swap_total || 0
      return params.flatMap((item) => {
        if (item.seriesName === 'RAM') {
          return [
            { color: item.color, label: 'RAM', value: `${formatBytes(ramUsed)} (${usagePercent(ramUsed, ramTotal)}%)` },
          ]
        }
        if (item.seriesName === 'Swap') {
          return [
            { color: item.color, label: 'Swap', value: `${formatBytes(swapUsed)} (${usagePercent(swapUsed, swapTotal)}%)` },
          ]
        }
        return []
      })
    }),
  },
  legend: buildLegend(chartThemeColors.value, ['RAM', 'Swap']),
  grid: chartMarginWithLegend,
  xAxis: baseXAxisConfig.value,
  yAxis: {
    ...baseYAxisConfig.value,
    name: '内存',
    nameTextStyle: {
      color: chartThemeColors.value.textSecondary,
      padding: [0, 40, 0, 0],
    },
    ...niceByteAxis(Math.max(...chartData.value.map(r => Math.max(r.ram ?? 0, r.swap ?? 0)), 0)),
    axisLabel: {
      ...baseYAxisConfig.value.axisLabel,
      formatter: (val: number) => formatAxisBytes(val),
    },
  },
  series: [
    {
      name: 'RAM',
      type: 'line',
      data: chartData.value.map(r => r.ram ?? 0),

      showSymbol: false,
      lineStyle: { width: 1.5, color: chartColors.primary, cap: 'round' as const },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: areaStops(chartColors.primary),
        },
      },
    },
    {
      name: 'Swap',
      type: 'line',
      data: chartData.value.map(r => r.swap ?? 0),

      showSymbol: false,
      lineStyle: { width: 1.5, color: chartColors.secondary, cap: 'round' as const },
    },
  ],
}))

// 硬盘图表
const diskChartOption = computed(() => ({
  animation: false,
  color: [chartColors.tertiary],
  tooltip: {
    ...baseTooltipConfig.value,
    formatter: tooltipFormatter(([first], record) => {
      const diskUsed = record.disk ?? 0
      const diskTotal = record.disk_total || nodeInfo.value?.disk_total || 0
      return [
        { color: first!.color, label: '硬盘已用', value: `${formatBytes(diskUsed)} (${usagePercent(diskUsed, diskTotal)}%)` },
      ]
    }),
  },
  grid: chartMargin,
  xAxis: baseXAxisConfig.value,
  yAxis: {
    ...baseYAxisConfig.value,
    name: '硬盘',
    nameTextStyle: {
      color: chartThemeColors.value.textSecondary,
      padding: [0, 40, 0, 0],
    },
    ...niceByteAxis(Math.max(...chartData.value.map(r => r.disk ?? 0), 0)),
    axisLabel: {
      ...baseYAxisConfig.value.axisLabel,
      formatter: (val: number) => formatAxisBytes(val),
    },
  },
  series: [
    {
      name: '硬盘已用',
      type: 'line',
      data: chartData.value.map(r => r.disk ?? 0),
      showSymbol: false,
      lineStyle: { width: 1.5, color: chartColors.tertiary, cap: 'round' as const },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: areaStops(chartColors.tertiary),
        },
      },
    },
  ],
}))

// 网络图表
const networkChartOption = computed(() => ({
  animation: false,
  color: [TRAFFIC_COLORS.up, TRAFFIC_COLORS.down],
  tooltip: {
    ...baseTooltipConfig.value,
    formatter: tooltipFormatter(params => params.map(item => ({
      color: item.color,
      label: item.seriesName === '下行'
        ? '↓ 下行'
        : '↑ 上行',
      value: `${formatBytes(item.value ?? 0)}/s`,
    }))),
  },
  legend: buildLegend(chartThemeColors.value, ['上行', '下行']),
  grid: chartMarginWithLegend,
  xAxis: baseXAxisConfig.value,
  yAxis: {
    ...baseYAxisConfig.value,
    name: '速率',
    nameTextStyle: {
      color: chartThemeColors.value.textSecondary,
      padding: [0, 40, 0, 0],
    },
    ...niceByteAxis(Math.max(...chartData.value.map(r => Math.max(r.net_in ?? 0, r.net_out ?? 0)), 0)),
    axisLabel: {
      ...baseYAxisConfig.value.axisLabel,
      formatter: (val: number) => formatAxisBytes(val, '/s'),
    },
  },
  series: [
    {
      name: '上行',
      type: 'line',
      data: chartData.value.map(r => r.net_out ?? 0),

      showSymbol: false,
      lineStyle: { width: 1.5, color: TRAFFIC_COLORS.up, cap: 'round' as const },
    },
    {
      name: '下行',
      type: 'line',
      data: chartData.value.map(r => r.net_in ?? 0),

      showSymbol: false,
      lineStyle: { width: 1.5, color: TRAFFIC_COLORS.down, cap: 'round' as const },
    },
  ],
}))

// 连接数图表
const connectionsChartOption = computed(() => ({
  animation: false,
  color: [chartColors.primary, chartColors.tertiary],
  tooltip: {
    ...baseTooltipConfig.value,
    formatter: tooltipFormatter(params => params.map(item => ({
      color: item.color,
      label: item.seriesName,
      value: item.value != null
        ? String(Math.round(item.value))
        : '-',
    }))),
  },
  legend: buildLegend(chartThemeColors.value, ['TCP', 'UDP']),
  grid: chartMarginWithLegend,
  xAxis: baseXAxisConfig.value,
  yAxis: {
    ...baseYAxisConfig.value,
    name: '连接数',
    nameTextStyle: {
      color: chartThemeColors.value.textSecondary,
      padding: [0, 40, 0, 0],
    },
    min: 0,
    axisLabel: {
      ...baseYAxisConfig.value.axisLabel,
      formatter: (val: number) => Math.round(val).toString(),
    },
  },
  series: [
    {
      name: 'TCP',
      type: 'line',
      data: chartData.value.map(r => r.connections ?? 0),

      showSymbol: false,
      lineStyle: { width: 1.5, color: chartColors.primary, cap: 'round' as const },
    },
    {
      name: 'UDP',
      type: 'line',
      data: chartData.value.map(r => r.connections_udp ?? 0),

      showSymbol: false,
      lineStyle: { width: 1.5, color: chartColors.tertiary, cap: 'round' as const },
    },
  ],
}))

// 进程数图表
const processChartOption = computed(() => ({
  animation: false,
  color: [chartColors.quaternary],
  tooltip: {
    ...baseTooltipConfig.value,
    formatter: tooltipFormatter(([first]) => [
      {
        color: first!.color,
        label: '进程数',
        value: first!.value != null
          ? String(Math.round(first!.value))
          : '-',
      },
    ]),
  },
  grid: chartMargin,
  xAxis: baseXAxisConfig.value,
  yAxis: {
    ...baseYAxisConfig.value,
    name: '进程',
    nameTextStyle: {
      color: chartThemeColors.value.textSecondary,
      padding: [0, 40, 0, 0],
    },
    min: 0,
    axisLabel: {
      ...baseYAxisConfig.value.axisLabel,
      formatter: (val: number) => Math.round(val).toString(),
    },
  },
  series: [
    {
      name: '进程数',
      type: 'line',
      data: chartData.value.map(r => r.process ?? 0),

      showSymbol: false,
      lineStyle: { width: 1.5, color: chartColors.quaternary, cap: 'round' as const },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: areaStops(chartColors.quaternary),
        },
      },
    },
  ],
}))

// ==================== 实时更新 ====================

// 使用 VueUse 的 useIntervalFn 自动管理定时器
const { pause: pauseRealtimeUpdate, resume: resumeRealtimeUpdate } = useIntervalFn(
  () => fetchData(),
  dataUpdateInterval,
  { immediate: false },
)

// 根据是否为实时模式控制定时器
watch(isRealtime, (realtime) => {
  if (realtime) {
    resumeRealtimeUpdate()
  }
  else {
    pauseRealtimeUpdate()
  }
}, { immediate: true })

// 生命周期 ====================

watch(selectedView, () => {
  isInitialLoad.value = true // 切换视图时重置首次加载状态
  fetchData()
})

watch(() => props.uuid, () => {
  remoteData.value = []
  gpuTempsByTime.value = new Map()
  isInitialLoad.value = true // 切换节点时重置首次加载状态
  fetchData()
})

onMounted(() => {
  fetchData()
})
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- 时间选择器 -->
    <Tabs v-model="selectedView" class="w-full items-center">
      <TabsList :class="pickSurfaceClass('h-8 bg-background/60 pointer-events-auto rounded-md', 'h-8 bg-background/50 backdrop-blur-xl pointer-events-auto rounded-md')">
        <TabsTrigger
          v-for="view in availableViews" :key="view.label" :value="view.label"
          :class="TAB_TRIGGER_CLASS"
        >
          {{ view.label }}
        </TabsTrigger>
      </TabsList>
    </Tabs>

    <!-- 内容区域 -->
    <Spinner :show="loading">
      <div v-if="error" class="text-red-500 py-8 text-center">
        {{ error }}
      </div>
      <div v-else-if="remoteData.length === 0 && !loading" class="py-8">
        <Empty description="暂无负载数据" />
      </div>

      <!-- 图表网格 -->
      <div v-else class="gap-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
        <!-- CPU 卡片 -->
        <CardX
          size="small"
          :class="pickSurfaceClass(CARD_SURFACE_CLASS, 'rounded-xl border bg-card/60 backdrop-blur-xs')"
        >
          <template #header>
            <div class="flex items-center justify-between">
              <span class="text-sm font-semibold">CPU</span>
              <div v-if="latestStatus?.cpu != null" class="num text-xs flex gap-0.5 items-baseline">
                <span>{{ latestStatus.cpu.toFixed(1) }}</span>
                <span>%</span>
              </div>
              <span v-else>--</span>
            </div>
          </template>
          <div class="h-48">
            <VChart :option="cpuChartOption" autoresize />
          </div>
        </CardX>

        <!-- GPU 卡片（仅有 GPU 数据的节点显示） -->
        <CardX
          v-if="hasGpu"
          size="small"
          :class="pickSurfaceClass(CARD_SURFACE_CLASS, 'rounded-xl border bg-card/60 backdrop-blur-xs')"
        >
          <template #header>
            <div class="flex items-center justify-between">
              <span class="text-sm font-semibold">GPU</span>
              <div v-if="latestStatus?.gpu != null" class="num text-xs flex gap-0.5 items-baseline">
                <span>{{ latestStatus.gpu.toFixed(1) }}</span>
                <span>%</span>
              </div>
              <span v-else>--</span>
            </div>
          </template>
          <!-- 有设备详情时压缩图表高度，让单卡时与相邻卡片等高 -->
          <div :class="gpuDevices.length ? 'h-38' : 'h-48'">
            <VChart :option="gpuChartOption" autoresize />
          </div>
          <div v-if="gpuDevices.length" class="mt-2 flex flex-col gap-2">
            <div v-for="(gpu, index) in gpuDevices" :key="index" class="flex flex-col gap-1 text-xs">
              <div class="flex items-center justify-between gap-2">
                <span class="truncate text-muted-foreground" :title="gpu.name">{{ gpu.name }}</span>
                <div class="flex shrink-0 gap-2 items-baseline">
                  <span>{{ gpu.utilization }}%</span>
                  <span :class="gpuTempClass(gpu.temperature)">{{ gpu.temperature > 0 ? `${gpu.temperature}°C` : '-' }}</span>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <ProgressThin
                  :percentage="gpuMemoryPercent(gpu.memory_used, gpu.memory_total)"
                  :status="gpuMemoryPercent(gpu.memory_used, gpu.memory_total) >= 90 ? 'warning' : 'info'"
                  class="flex-1"
                />
                <span class="num shrink-0 text-muted-foreground">显存 <span class="text-foreground">{{ formatBytes(gpu.memory_used) }}</span> 共 {{ formatBytes(gpu.memory_total) }}</span>
              </div>
            </div>
          </div>
        </CardX>

        <!-- 内存卡片 -->
        <CardX
          size="small"
          :class="pickSurfaceClass(CARD_SURFACE_CLASS, 'rounded-xl border bg-card/60 backdrop-blur-xs')"
        >
          <template #header>
            <div class="flex items-center justify-between">
              <span class="text-sm font-semibold">内存</span>
              <div class="num flex items-baseline gap-1 text-xs">
                <span>{{ latestStatus?.ram != null ? formatBytes(latestStatus.ram) : '--' }}</span>
                <span v-if="nodeInfo?.mem_total" class="text-muted-foreground">共 {{ formatBytes(nodeInfo.mem_total) }}</span>
              </div>
            </div>
          </template>
          <div class="h-48">
            <VChart :option="memoryChartOption" autoresize />
          </div>
        </CardX>

        <!-- 硬盘卡片 -->
        <CardX
          size="small"
          :class="pickSurfaceClass(CARD_SURFACE_CLASS, 'rounded-xl border bg-card/60 backdrop-blur-xs')"
        >
          <template #header>
            <div class="flex items-center justify-between">
              <span class="text-sm font-semibold">硬盘</span>
              <div class="num flex items-baseline gap-1 text-xs">
                <span>{{ latestStatus?.disk != null ? formatBytes(latestStatus.disk) : '--' }}</span>
                <span v-if="nodeInfo?.disk_total" class="text-muted-foreground">共 {{ formatBytes(nodeInfo.disk_total) }}</span>
              </div>
            </div>
          </template>
          <div class="h-48">
            <VChart :option="diskChartOption" autoresize />
          </div>
        </CardX>

        <!-- 网络卡片 -->
        <CardX
          size="small"
          :class="pickSurfaceClass(CARD_SURFACE_CLASS, 'rounded-xl border bg-card/60 backdrop-blur-xs')"
        >
          <template #header>
            <div class="flex items-center justify-between">
              <span class="text-sm font-semibold">网络</span>
              <div class="num flex items-baseline gap-2 text-xs">
                <span class="flex items-center gap-0.5">
                  <Icon icon="tabler:arrow-up" width="12" height="12" class="text-emerald-700 dark:text-emerald-300" />
                  {{ latestStatus?.net_out != null ? `${formatBytes(latestStatus.net_out)}/s` : '--' }}
                </span>
                <span class="flex items-center gap-0.5">
                  <Icon icon="tabler:arrow-down" width="12" height="12" class="text-sky-700 dark:text-sky-300" />
                  {{ latestStatus?.net_in != null ? `${formatBytes(latestStatus.net_in)}/s` : '--' }}
                </span>
              </div>
            </div>
          </template>
          <div class="h-48">
            <VChart :option="networkChartOption" autoresize />
          </div>
        </CardX>

        <!-- 连接数卡片 -->
        <CardX
          size="small"
          :class="pickSurfaceClass(CARD_SURFACE_CLASS, 'rounded-xl border bg-card/60 backdrop-blur-xs')"
        >
          <template #header>
            <div class="flex items-center justify-between">
              <span class="text-sm font-semibold">连接</span>
              <div class="num flex items-baseline gap-2 text-xs">
                <span><span class="text-muted-foreground">TCP</span> {{ latestStatus?.connections ?? '--' }}</span>
                <span><span class="text-muted-foreground">UDP</span> {{ latestStatus?.connections_udp ?? '--' }}</span>
              </div>
            </div>
          </template>
          <div class="h-48">
            <VChart :option="connectionsChartOption" autoresize />
          </div>
        </CardX>

        <!-- 进程卡片：有 GPU 时共 7 张，最后一张横跨整行，避免末行孤零零一张 -->
        <CardX
          size="small"
          :class="[pickSurfaceClass(CARD_SURFACE_CLASS, 'rounded-xl border bg-card/60 backdrop-blur-xs'), hasGpu && 'md:col-span-2 xl:col-span-3']"
        >
          <template #header>
            <div class="flex items-center justify-between">
              <span class="text-sm font-semibold">进程</span>
              <span class="num text-xs">
                {{ latestStatus?.process ?? '--' }}
              </span>
            </div>
          </template>
          <div class="h-48">
            <VChart :option="processChartOption" autoresize />
          </div>
        </CardX>
      </div>
    </Spinner>
  </div>
</template>
