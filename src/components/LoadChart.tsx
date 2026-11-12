import type { RecordFormat } from '@/utils/recordHelper'
import type { StatusRecord } from '@/utils/rpc'
import { Icon } from '@iconify/react'
import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import { EChart } from '@/components/EChart'
import { CardX } from '@/components/ui/card-x'
import { Empty } from '@/components/ui/empty'
import { ProgressThin } from '@/components/ui/progress-thin'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useBackgroundSurface } from '@/hooks/useBackgroundSurface'
import { cn } from '@/lib/utils'
import { useAppStore, useIsDark } from '@/stores/app'
import { useNode } from '@/stores/nodes'
import { getSharedApi } from '@/utils/api'
import {
  areaStops,
  buildBaseTooltip,
  buildLegend,
  CHART_COLORS,
  DASHED_LEGEND_ICON,
  formatAxisBytes,
  getChartThemeColors,
  niceByteAxis,
  TRAFFIC_COLORS,
} from '@/utils/chartTheme'
import { buildChartViews, LOAD_CHART_VIEWS } from '@/utils/chartViews'
import { formatBytes } from '@/utils/helper'
import { fillMissingTimePoints } from '@/utils/recordHelper'
import { getSharedRpc } from '@/utils/rpc'
import { CARD_SURFACE_CLASS, TAB_TRIGGER_CLASS } from '@/utils/uiClasses'

interface LoadChartProps {
  uuid: string
  className?: string
}

// 系列配色来自共享 chartTheme：主指标翡翠绿，其余取 Tailwind 500 档
const chartColors = {
  primary: CHART_COLORS.emerald,
  secondary: CHART_COLORS.amber,
  tertiary: CHART_COLORS.cyan,
  quaternary: CHART_COLORS.violet,
  quinary: CHART_COLORS.blue,
}

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

const gpuTempColors = [chartColors.secondary, chartColors.primary, chartColors.quaternary, chartColors.tertiary]

const EMPTY_RECORDS: StatusRecord[] = []
const EMPTY_TEMPS = new Map<string, number[]>()

const CARD_CLASS_ARGS = ['rounded-xl border bg-card/60 backdrop-blur-xs'] as const

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

function formatTimeForTooltip(time: string, hours: number): string {
  const date = dayjs(time)
  if (hours < 24) {
    return date.format('HH:mm:ss')
  }
  return date.format('MM/DD HH:mm')
}

function usagePercent(used: number, total: number): string {
  return total > 0 ? ((used / total) * 100).toFixed(1) : '0'
}

function tooltipRowHtml({ color, label, value }: TooltipRow): string {
  const colorDot = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:8px;flex-shrink:0"></span>`
  return `<div style="display:flex;align-items:center">${colorDot}<span>${label}</span><span style="margin-left:auto;font-weight:600;margin-left:16px">${value}</span></div>`
}

function gpuMemoryPercent(used: number, total: number): number {
  return total > 0 ? (used / total) * 100 : 0
}

function gpuTempClass(temp: number): string {
  if (temp >= 85) return 'text-red-500'
  if (temp >= 75) return 'text-amber-500'
  return ''
}

function areaStyle(color: string) {
  return {
    color: {
      type: 'linear' as const,
      x: 0,
      y: 0,
      x2: 0,
      y2: 1,
      colorStops: areaStops(color),
    },
  }
}

export default function LoadChart({ uuid, className }: LoadChartProps) {
  const { pickSurfaceClass } = useBackgroundSurface()
  const isDark = useIsDark()
  const backgroundEnabled = useAppStore(s => s.settings.backgroundEnabled)
  const recordPreserveTime = useAppStore(s => s.publicSettings?.record_preserve_time)
  const rawInterval = useAppStore(s => s.publicSettings?.theme_settings?.dataUpdateInterval)
  const nodeInfo = useNode(uuid)

  // 从 publicSettings 获取记录保留时间
  const maxRecordPreserveTime = recordPreserveTime || 720

  // 数据更新间隔（秒），默认 3 秒；确保值在合理范围内（1-60秒）
  const dataUpdateInterval =
    typeof rawInterval === 'number' && rawInterval >= 1 && rawInterval <= 60 ? rawInterval * 1000 : 3000

  const chartThemeColors = getChartThemeColors(isDark)
  const baseTooltipConfig = buildBaseTooltip(chartThemeColors, backgroundEnabled)

  // 视图选项（与 PingChart 对齐，实时仅负载图有；60/90 天仅在实际保留时间足够时显示）
  // 可用视图：实时 + 按记录保留时长裁剪的历史范围
  const availableViews: Array<{ label: string; hours?: number }> = [
    { label: '实时' },
    ...buildChartViews(LOAD_CHART_VIEWS, maxRecordPreserveTime),
  ]

  // 当前选中的视图
  const [selectedView, setSelectedView] = useState('实时')
  const selectedHours = availableViews.find(v => v.label === selectedView)?.hours
  const isRealtime = selectedView === '实时'

  // 数据状态（按 uuid + 视图归属，避免切换后短暂显示旧数据）
  const [fetched, setFetched] = useState<{ uuid: string; records: StatusRecord[]; temps: Map<string, number[]> }>(
    () => ({ uuid, records: [], temps: new Map() }),
  )
  // 切换节点时丢弃旧节点数据（切换视图则保留旧数据直到新数据到达）
  const remoteData = fetched.uuid === uuid ? fetched.records : EMPTY_RECORDS
  const gpuTempsByTime = fetched.uuid === uuid ? fetched.temps : EMPTY_TEMPS
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // gpuTempsByTime：实时视图的各卡温度，按记录时间对齐（RPC 实时记录不带 GPU 详情，REST /recent 每个点都带，且两者时间戳一致）

  const hasGpuInfo = Boolean(nodeInfo?.gpu_detailed_info?.length)

  // 拉取数据 + 实时轮询：依赖变化（节点 / 视图 / 间隔）时重建；cancelled 标记使 StrictMode 双跑和切换时的过期响应被丢弃
  useEffect(() => {
    if (!uuid) return undefined
    let cancelled = false
    let initial = true // 是否为首次加载（实时模式下只在首次显示加载动画）
    const rpc = getSharedRpc()
    const api = getSharedApi()
    const realtime = selectedView === '实时'
    const hours = selectedHours || 4

    async function fetchRecentGpuTemps(): Promise<Map<string, number[]>> {
      if (!hasGpuInfo) return new Map()
      try {
        const records = await api.getNodeRecentStatus(uuid)
        const map = new Map<string, number[]>()
        for (const r of records ?? []) {
          const gpus = r.gpu?.detailed_info
          if (gpus?.length)
            map.set(
              r.updated_at,
              gpus.map(g => g.temperature),
            )
        }
        return map
      } catch {
        return new Map()
      }
    }

    async function fetchRecentData() {
      // 只在首次加载时显示 loading
      if (initial) setLoading(true)
      setError(null)
      try {
        const [result, temps] = await Promise.all([rpc.getNodeRecentStatus(uuid), fetchRecentGpuTemps()])
        if (cancelled) return
        const records = result?.records || []
        records.sort((a, b) => dayjs(a.time).valueOf() - dayjs(b.time).valueOf())
        const maxLength = 150
        setFetched({ uuid, records: records.slice(-maxLength), temps })
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : '获取数据失败')
        setFetched({ uuid, records: [], temps: new Map() })
      } finally {
        if (!cancelled) {
          setLoading(false)
          initial = false
        }
      }
    }

    async function fetchHistoryData() {
      setLoading(true)
      setError(null)
      try {
        const records = (await api.getLoadRecords(uuid, hours))?.records ?? []
        if (cancelled) return
        // 按时间排序
        records.sort((a, b) => dayjs(a.time).valueOf() - dayjs(b.time).valueOf())
        setFetched({ uuid, records, temps: new Map() })
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : '获取数据失败')
        setFetched({ uuid, records: [], temps: new Map() })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    const fetchData = () => (realtime ? fetchRecentData() : fetchHistoryData())

    void fetchData()
    const timer = realtime ? setInterval(() => void fetchData(), dataUpdateInterval) : undefined
    return () => {
      cancelled = true
      clearInterval(timer)
    }
    // hasGpuInfo 仅在首次拿到节点信息时从 false 变 true，此时重新拉取以补上 GPU 温度
  }, [uuid, selectedView, selectedHours, dataUpdateInterval, hasGpuInfo])

  // ==================== 数据处理 ====================

  const chartData = (() => {
    const data = statusToRecordFormat(remoteData)
    if (!data.length) return []

    if (isRealtime) return data

    const hours = selectedHours || 4
    const minute = 60
    const hour = minute * 60
    let intervalSec: number
    let maxGap: number

    if (hours <= 4) {
      intervalSec = minute
      maxGap = minute * 2
    } else if (hours > 120) {
      intervalSec = hour
      maxGap = hour * 2
    } else {
      intervalSec = minute * 15
      maxGap = minute * 30
    }

    return fillMissingTimePoints(data, intervalSec, hours * 3600, maxGap)
  })()

  const latestStatus = remoteData.length ? (remoteData.at(-1) ?? null) : null

  // ==================== 工具函数 ====================

  const showDateInAxis = (selectedHours || 1) >= 24

  function formatTime(time: string): string {
    const date = dayjs(time)
    if (showDateInAxis) return date.format('M/D HH:mm')
    return date.format(isRealtime ? 'HH:mm:ss' : 'HH:mm')
  }

  // 通用 X 轴配置
  const baseXAxisConfig = {
    type: 'category' as const,
    data: chartData.map(r => formatTime(r.time)),
    axisLabel: {
      fontSize: 11,
      color: chartThemeColors.textSecondary,
      margin: 12,
      hideOverlap: true,
    },
    axisLine: {
      show: true,
      lineStyle: { color: chartThemeColors.borderColor, width: 1 },
    },
    axisTick: { show: false },
    boundaryGap: false,
  }

  // 通用 Y 轴配置
  const baseYAxisConfig = {
    type: 'value' as const,
    axisLabel: {
      fontSize: 11,
      color: chartThemeColors.textSecondary,
    },
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: {
      lineStyle: {
        color: chartThemeColors.splitLineColor,
        type: 'dashed' as const,
      },
    },
    axisPointer: {
      lineStyle: { opacity: 0 },
      crossStyle: { opacity: 0 },
      label: { show: false },
    },
  }

  const axisNameStyle = (padding: number[]) => ({
    color: chartThemeColors.textSecondary,
    padding,
  })

  /** 统一 tooltip 外框：时间标题 + 每个系列一行，行内容由各图表决定 */
  function tooltipFormatter(buildRows: (params: TooltipParam[], record: RecordFormat) => TooltipRow[]) {
    return (params: unknown) => {
      const p = params as TooltipParam[]
      const firstParam = p[0]
      const record = firstParam ? chartData[firstParam.dataIndex] : undefined
      if (!record) return ''
      const timeStr = formatTimeForTooltip(record.time, selectedHours || 1)
      const header = `<div style="font-weight:600;margin-bottom:6px;color:${chartThemeColors.textSecondary}">${timeStr}</div>`
      return `${header}<div style="display:flex;flex-direction:column;gap:4px">${buildRows(p, record).map(tooltipRowHtml).join('')}</div>`
    }
  }

  // ==================== 图表配置 ====================

  // CPU 图表
  const cpuChartOption = {
    animation: false,
    // 全局颜色配置（确保 Tooltip 圆点颜色与线条一致）
    color: [chartColors.primary, CHART_COLORS.neutral],
    tooltip: {
      ...baseTooltipConfig,
      formatter: tooltipFormatter(params =>
        params.flatMap(item => {
          if (item.seriesName === 'CPU') {
            return [{ color: item.color, label: 'CPU', value: `${item.value?.toFixed(1) ?? '-'}%` }]
          }
          if (item.seriesName === '负载') {
            return [{ color: item.color, label: '系统负载', value: item.value?.toFixed(2) ?? '-' }]
          }
          return []
        }),
      ),
    },
    legend: buildLegend(chartThemeColors, ['CPU', { name: '负载', icon: DASHED_LEGEND_ICON }]),
    grid: chartMarginWithLegend,
    xAxis: baseXAxisConfig,
    yAxis: [
      {
        ...baseYAxisConfig,
        name: 'CPU %',
        nameTextStyle: axisNameStyle([0, 40, 0, 0]),
        min: 0,
        max: 100,
        axisLabel: { ...baseYAxisConfig.axisLabel, formatter: '{value}%' },
      },
      {
        ...baseYAxisConfig,
        name: '负载',
        nameTextStyle: axisNameStyle([0, 0, 0, 40]),
        min: 0,
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: 'CPU',
        type: 'line',
        data: chartData.map(r => r.cpu),
        showSymbol: false,
        yAxisIndex: 0,
        lineStyle: { width: 1.5, color: chartColors.primary, cap: 'round' as const },
        areaStyle: areaStyle(chartColors.primary),
      },
      {
        name: '负载',
        type: 'line',
        data: chartData.map(r => r.load),
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
  }

  // ==================== GPU ====================

  // 各卡实时详情来自节点状态（getNodesLatestStatus.gpu_detailed_info）；面板只把聚合使用率写进历史记录
  const gpuDevices = nodeInfo?.gpu_detailed_info ?? []
  const hasGpu = gpuDevices.length > 0 || remoteData.some(r => (r.gpu ?? 0) > 0)

  // 温度序列：仅实时视图有数据（面板历史记录不存温度）；0 视为无读数
  const gpuTempSeries: { name: string; data: (number | null)[] }[] = []
  if (isRealtime) {
    const count = gpuDevices.length
    for (let i = 0; i < count; i++) {
      const data = chartData.map(r => {
        const t = gpuTempsByTime.get(r.time)?.[i]
        return t != null && t > 0 ? t : null
      })
      if (data.some(v => v != null)) {
        gpuTempSeries.push({
          name: count > 1 ? `GPU${i} 温度` : '温度',
          data,
        })
      }
    }
  }

  // GPU 图表（聚合使用率 + 实时温度）
  const gpuChartOption = {
    animation: false,
    color: [chartColors.quinary, ...gpuTempColors],
    tooltip: {
      ...baseTooltipConfig,
      formatter: tooltipFormatter(params =>
        params.map(item => ({
          color: item.color,
          label: item.seriesName === 'GPU' ? '使用率' : item.seriesName,
          value: item.value == null ? '-' : item.seriesName === 'GPU' ? `${item.value.toFixed(1)}%` : `${item.value}°C`,
        })),
      ),
    },
    legend: buildLegend(chartThemeColors, ['GPU', ...gpuTempSeries.map(t => t.name)]),
    grid: chartMarginWithLegend,
    xAxis: baseXAxisConfig,
    yAxis: [
      {
        ...baseYAxisConfig,
        name: 'GPU %',
        nameTextStyle: axisNameStyle([0, 40, 0, 0]),
        min: 0,
        max: 100,
        axisLabel: { ...baseYAxisConfig.axisLabel, formatter: '{value}%' },
      },
      {
        ...baseYAxisConfig,
        show: gpuTempSeries.length > 0,
        name: '温度',
        nameTextStyle: axisNameStyle([0, 0, 0, 40]),
        min: 0,
        max: (v: { max: number }) => Math.max(100, Math.ceil(v.max / 10) * 10),
        splitLine: { show: false },
        axisLabel: { ...baseYAxisConfig.axisLabel, formatter: '{value}°C' },
      },
    ],
    series: [
      {
        name: 'GPU',
        type: 'line',
        data: chartData.map(r => r.gpu),
        showSymbol: false,
        yAxisIndex: 0,
        lineStyle: { width: 1.5, color: chartColors.quinary, cap: 'round' as const },
        areaStyle: areaStyle(chartColors.quinary),
      },
      ...gpuTempSeries.map((t, i) => ({
        name: t.name,
        type: 'line',
        data: t.data,
        showSymbol: false,
        connectNulls: true,
        yAxisIndex: 1,
        lineStyle: { width: 1.5, color: gpuTempColors[i % gpuTempColors.length], cap: 'round' as const },
      })),
    ],
  }

  // 内存图表
  const memoryChartOption = {
    animation: false,
    color: [chartColors.primary, chartColors.secondary],
    tooltip: {
      ...baseTooltipConfig,
      formatter: tooltipFormatter((params, record) => {
        const ramUsed = record.ram ?? 0
        const ramTotal = record.ram_total || nodeInfo?.mem_total || 0
        const swapUsed = record.swap ?? 0
        const swapTotal = record.swap_total || nodeInfo?.swap_total || 0
        return params.flatMap(item => {
          if (item.seriesName === 'RAM') {
            return [
              {
                color: item.color,
                label: 'RAM',
                value: `${formatBytes(ramUsed)} (${usagePercent(ramUsed, ramTotal)}%)`,
              },
            ]
          }
          if (item.seriesName === 'Swap') {
            return [
              {
                color: item.color,
                label: 'Swap',
                value: `${formatBytes(swapUsed)} (${usagePercent(swapUsed, swapTotal)}%)`,
              },
            ]
          }
          return []
        })
      }),
    },
    legend: buildLegend(chartThemeColors, ['RAM', 'Swap']),
    grid: chartMarginWithLegend,
    xAxis: baseXAxisConfig,
    yAxis: {
      ...baseYAxisConfig,
      name: '内存',
      nameTextStyle: axisNameStyle([0, 40, 0, 0]),
      ...niceByteAxis(Math.max(...chartData.map(r => Math.max(r.ram ?? 0, r.swap ?? 0)), 0)),
      axisLabel: {
        ...baseYAxisConfig.axisLabel,
        formatter: (val: number) => formatAxisBytes(val),
      },
    },
    series: [
      {
        name: 'RAM',
        type: 'line',
        data: chartData.map(r => r.ram ?? 0),
        showSymbol: false,
        lineStyle: { width: 1.5, color: chartColors.primary, cap: 'round' as const },
        areaStyle: areaStyle(chartColors.primary),
      },
      {
        name: 'Swap',
        type: 'line',
        data: chartData.map(r => r.swap ?? 0),
        showSymbol: false,
        lineStyle: { width: 1.5, color: chartColors.secondary, cap: 'round' as const },
      },
    ],
  }

  // 硬盘图表
  const diskChartOption = {
    animation: false,
    color: [chartColors.tertiary],
    tooltip: {
      ...baseTooltipConfig,
      formatter: tooltipFormatter(([first], record) => {
        const diskUsed = record.disk ?? 0
        const diskTotal = record.disk_total || nodeInfo?.disk_total || 0
        return [
          {
            color: first.color,
            label: '硬盘已用',
            value: `${formatBytes(diskUsed)} (${usagePercent(diskUsed, diskTotal)}%)`,
          },
        ]
      }),
    },
    grid: chartMargin,
    xAxis: baseXAxisConfig,
    yAxis: {
      ...baseYAxisConfig,
      name: '硬盘',
      nameTextStyle: axisNameStyle([0, 40, 0, 0]),
      ...niceByteAxis(Math.max(...chartData.map(r => r.disk ?? 0), 0)),
      axisLabel: {
        ...baseYAxisConfig.axisLabel,
        formatter: (val: number) => formatAxisBytes(val),
      },
    },
    series: [
      {
        name: '硬盘已用',
        type: 'line',
        data: chartData.map(r => r.disk ?? 0),
        showSymbol: false,
        lineStyle: { width: 1.5, color: chartColors.tertiary, cap: 'round' as const },
        areaStyle: areaStyle(chartColors.tertiary),
      },
    ],
  }

  // 网络图表
  const networkChartOption = {
    animation: false,
    color: [TRAFFIC_COLORS.up, TRAFFIC_COLORS.down],
    tooltip: {
      ...baseTooltipConfig,
      formatter: tooltipFormatter(params =>
        params.map(item => ({
          color: item.color,
          label: item.seriesName === '下行' ? '↓ 下行' : '↑ 上行',
          value: `${formatBytes(item.value ?? 0)}/s`,
        })),
      ),
    },
    legend: buildLegend(chartThemeColors, ['上行', '下行']),
    grid: chartMarginWithLegend,
    xAxis: baseXAxisConfig,
    yAxis: {
      ...baseYAxisConfig,
      name: '速率',
      nameTextStyle: axisNameStyle([0, 40, 0, 0]),
      ...niceByteAxis(Math.max(...chartData.map(r => Math.max(r.net_in ?? 0, r.net_out ?? 0)), 0)),
      axisLabel: {
        ...baseYAxisConfig.axisLabel,
        formatter: (val: number) => formatAxisBytes(val, '/s'),
      },
    },
    series: [
      {
        name: '上行',
        type: 'line',
        data: chartData.map(r => r.net_out ?? 0),
        showSymbol: false,
        lineStyle: { width: 1.5, color: TRAFFIC_COLORS.up, cap: 'round' as const },
      },
      {
        name: '下行',
        type: 'line',
        data: chartData.map(r => r.net_in ?? 0),
        showSymbol: false,
        lineStyle: { width: 1.5, color: TRAFFIC_COLORS.down, cap: 'round' as const },
      },
    ],
  }

  // 连接数图表
  const connectionsChartOption = {
    animation: false,
    color: [chartColors.primary, chartColors.tertiary],
    tooltip: {
      ...baseTooltipConfig,
      formatter: tooltipFormatter(params =>
        params.map(item => ({
          color: item.color,
          label: item.seriesName,
          value: item.value != null ? String(Math.round(item.value)) : '-',
        })),
      ),
    },
    legend: buildLegend(chartThemeColors, ['TCP', 'UDP']),
    grid: chartMarginWithLegend,
    xAxis: baseXAxisConfig,
    yAxis: {
      ...baseYAxisConfig,
      name: '连接数',
      nameTextStyle: axisNameStyle([0, 40, 0, 0]),
      min: 0,
      axisLabel: {
        ...baseYAxisConfig.axisLabel,
        formatter: (val: number) => Math.round(val).toString(),
      },
    },
    series: [
      {
        name: 'TCP',
        type: 'line',
        data: chartData.map(r => r.connections ?? 0),
        showSymbol: false,
        lineStyle: { width: 1.5, color: chartColors.primary, cap: 'round' as const },
      },
      {
        name: 'UDP',
        type: 'line',
        data: chartData.map(r => r.connections_udp ?? 0),
        showSymbol: false,
        lineStyle: { width: 1.5, color: chartColors.tertiary, cap: 'round' as const },
      },
    ],
  }

  // 进程数图表
  const processChartOption = {
    animation: false,
    color: [chartColors.quaternary],
    tooltip: {
      ...baseTooltipConfig,
      formatter: tooltipFormatter(([first]) => [
        {
          color: first.color,
          label: '进程数',
          value: first.value != null ? String(Math.round(first.value)) : '-',
        },
      ]),
    },
    grid: chartMargin,
    xAxis: baseXAxisConfig,
    yAxis: {
      ...baseYAxisConfig,
      name: '进程',
      nameTextStyle: axisNameStyle([0, 40, 0, 0]),
      min: 0,
      axisLabel: {
        ...baseYAxisConfig.axisLabel,
        formatter: (val: number) => Math.round(val).toString(),
      },
    },
    series: [
      {
        name: '进程数',
        type: 'line',
        data: chartData.map(r => r.process ?? 0),
        showSymbol: false,
        lineStyle: { width: 1.5, color: chartColors.quaternary, cap: 'round' as const },
        areaStyle: areaStyle(chartColors.quaternary),
      },
    ],
  }

  const cardClass = pickSurfaceClass(CARD_SURFACE_CLASS, CARD_CLASS_ARGS[0])

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* 时间选择器 */}
      <Tabs value={selectedView} onValueChange={setSelectedView} className="w-full items-center">
        <TabsList
          className={pickSurfaceClass(
            'h-8 bg-background/60 pointer-events-auto rounded-md',
            'h-8 bg-background/50 backdrop-blur-xl pointer-events-auto rounded-md',
          )}
        >
          {availableViews.map(view => (
            <TabsTrigger key={view.label} value={view.label} className={TAB_TRIGGER_CLASS}>
              {view.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* 内容区域 */}
      <Spinner show={loading}>
        {error ? (
          <div className="text-red-500 py-8 text-center">{error}</div>
        ) : remoteData.length === 0 && !loading ? (
          <div className="py-8">
            <Empty description="暂无负载数据" />
          </div>
        ) : (
          /* 图表网格 */
          <div className="gap-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
            {/* CPU 卡片 */}
            <CardX
              size="small"
              className={cardClass}
              header={
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">CPU</span>
                  {latestStatus?.cpu != null ? (
                    <div className="num text-xs flex gap-0.5 items-baseline">
                      <span>{latestStatus.cpu.toFixed(1)}</span>
                      <span>%</span>
                    </div>
                  ) : (
                    <span>--</span>
                  )}
                </div>
              }
            >
              <div className="h-48">
                <EChart option={cpuChartOption} />
              </div>
            </CardX>

            {/* GPU 卡片（仅有 GPU 数据的节点显示） */}
            {hasGpu && (
              <CardX
                size="small"
                className={cardClass}
                header={
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">GPU</span>
                    {latestStatus?.gpu != null ? (
                      <div className="num text-xs flex gap-0.5 items-baseline">
                        <span>{latestStatus.gpu.toFixed(1)}</span>
                        <span>%</span>
                      </div>
                    ) : (
                      <span>--</span>
                    )}
                  </div>
                }
              >
                {/* 有设备详情时压缩图表高度，让单卡时与相邻卡片等高 */}
                <div className={gpuDevices.length ? 'h-38' : 'h-48'}>
                  <EChart option={gpuChartOption} />
                </div>
                {gpuDevices.length > 0 && (
                  <div className="mt-2 flex flex-col gap-2">
                    {gpuDevices.map((gpu, index) => (
                      <div key={index} className="flex flex-col gap-1 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-muted-foreground" title={gpu.name}>
                            {gpu.name}
                          </span>
                          <div className="flex shrink-0 gap-2 items-baseline">
                            <span>{gpu.utilization}%</span>
                            <span className={gpuTempClass(gpu.temperature)}>
                              {gpu.temperature > 0 ? `${gpu.temperature}°C` : '-'}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <ProgressThin
                            percentage={gpuMemoryPercent(gpu.memory_used, gpu.memory_total)}
                            status={gpuMemoryPercent(gpu.memory_used, gpu.memory_total) >= 90 ? 'warning' : 'info'}
                            className="flex-1"
                          />
                          <span className="num shrink-0 text-muted-foreground">
                            显存 <span className="text-foreground">{formatBytes(gpu.memory_used)}</span> 共{' '}
                            {formatBytes(gpu.memory_total)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardX>
            )}

            {/* 内存卡片 */}
            <CardX
              size="small"
              className={cardClass}
              header={
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">内存</span>
                  <div className="num flex items-baseline gap-1 text-xs">
                    <span>{latestStatus?.ram != null ? formatBytes(latestStatus.ram) : '--'}</span>
                    {nodeInfo?.mem_total ? (
                      <span className="text-muted-foreground">共 {formatBytes(nodeInfo.mem_total)}</span>
                    ) : null}
                  </div>
                </div>
              }
            >
              <div className="h-48">
                <EChart option={memoryChartOption} />
              </div>
            </CardX>

            {/* 硬盘卡片 */}
            <CardX
              size="small"
              className={cardClass}
              header={
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">硬盘</span>
                  <div className="num flex items-baseline gap-1 text-xs">
                    <span>{latestStatus?.disk != null ? formatBytes(latestStatus.disk) : '--'}</span>
                    {nodeInfo?.disk_total ? (
                      <span className="text-muted-foreground">共 {formatBytes(nodeInfo.disk_total)}</span>
                    ) : null}
                  </div>
                </div>
              }
            >
              <div className="h-48">
                <EChart option={diskChartOption} />
              </div>
            </CardX>

            {/* 网络卡片 */}
            <CardX
              size="small"
              className={cardClass}
              header={
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">网络</span>
                  <div className="num flex items-baseline gap-2 text-xs">
                    <span className="flex items-center gap-0.5">
                      <Icon
                        icon="tabler:arrow-up"
                        width="12"
                        height="12"
                        className="text-emerald-700 dark:text-emerald-300"
                      />
                      {latestStatus?.net_out != null ? `${formatBytes(latestStatus.net_out)}/s` : '--'}
                    </span>
                    <span className="flex items-center gap-0.5">
                      <Icon
                        icon="tabler:arrow-down"
                        width="12"
                        height="12"
                        className="text-sky-700 dark:text-sky-300"
                      />
                      {latestStatus?.net_in != null ? `${formatBytes(latestStatus.net_in)}/s` : '--'}
                    </span>
                  </div>
                </div>
              }
            >
              <div className="h-48">
                <EChart option={networkChartOption} />
              </div>
            </CardX>

            {/* 连接数卡片 */}
            <CardX
              size="small"
              className={cardClass}
              header={
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">连接</span>
                  <div className="num flex items-baseline gap-2 text-xs">
                    <span>
                      <span className="text-muted-foreground">TCP</span> {latestStatus?.connections ?? '--'}
                    </span>
                    <span>
                      <span className="text-muted-foreground">UDP</span> {latestStatus?.connections_udp ?? '--'}
                    </span>
                  </div>
                </div>
              }
            >
              <div className="h-48">
                <EChart option={connectionsChartOption} />
              </div>
            </CardX>

            {/* 进程卡片：有 GPU 时共 7 张，最后一张横跨整行，避免末行孤零零一张 */}
            <CardX
              size="small"
              className={cn(cardClass, hasGpu && 'md:col-span-2 xl:col-span-3')}
              header={
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">进程</span>
                  <span className="num text-xs">{latestStatus?.process ?? '--'}</span>
                </div>
              }
            >
              <div className="h-48">
                <EChart option={processChartOption} />
              </div>
            </CardX>
          </div>
        )}
      </Spinner>
    </div>
  )
}
