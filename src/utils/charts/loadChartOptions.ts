import type { RecordFormat } from '@/utils/recordHelper'
import type { StatusRecord } from '@/utils/rpc'
import type { NodeData } from '@/stores/nodes'
import dayjs from 'dayjs'
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
import { formatBytes } from '@/utils/helper'
import { fillMissingTimePoints } from '@/utils/recordHelper'

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

interface LoadChartOptionsInput {
  remoteData: StatusRecord[]
  gpuTempsByTime: Map<string, number[]>
  nodeInfo: NodeData | undefined
  isRealtime: boolean
  selectedHours: number | undefined
  isDark: boolean
  backgroundEnabled: boolean
}

/** 纯配置工厂：只把记录和主题转换为 ECharts option，不订阅 store、不请求网络。 */
export function buildLoadChartOptions({
  remoteData,
  gpuTempsByTime,
  nodeInfo,
  isRealtime,
  selectedHours,
  isDark,
  backgroundEnabled,
}: LoadChartOptionsInput) {
  const chartThemeColors = getChartThemeColors(isDark)
  const baseTooltipConfig = buildBaseTooltip(chartThemeColors, backgroundEnabled)
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

  return {
    cpuChartOption,
    gpuChartOption,
    memoryChartOption,
    diskChartOption,
    networkChartOption,
    connectionsChartOption,
    processChartOption,
    gpuDevices,
    hasGpu,
  }
}
