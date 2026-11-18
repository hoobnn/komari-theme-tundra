import type { StatusRecord } from '@/utils/rpc'
import type { NodeData } from '@/stores/nodes'
import { format } from 'echarts/core'
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
import { chartTimeLabel, timeAxis, timeDomain, typicalInterval } from '@/utils/charts/chartTime'
import { formatBytes } from '@/utils/helper'

type Field = Exclude<keyof StatusRecord, 'client' | 'time'>
type Sample = { time: number; record: StatusRecord | null }
interface Trace {
  name: string
  color: string
  value: (record: StatusRecord) => number | null | undefined
  formatValue: (value: number, record: StatusRecord) => string
  side?: 'right'
  dashed?: boolean
  fill?: boolean
}
interface Input {
  remoteData: StatusRecord[]
  gpuTempsByTime: Map<string, number[]>
  nodeInfo: NodeData | undefined
  isRealtime: boolean
  selectedHours: number | undefined
  isDark: boolean
  backgroundEnabled: boolean
}
const field = (name: Field) => (r: StatusRecord) => r[name]
const percent = (value: number) => `${value.toFixed(1)}%`
const integer = (value: number) => String(Math.round(value))
const rate = (value: number) => `${formatBytes(value)}/s`

/** 统一保留实测时间和缺测；所有图共用一条时间轴，暂停对读不会改写采样数值。 */
export function buildLoadChartOptions({
  remoteData,
  gpuTempsByTime,
  nodeInfo,
  isRealtime,
  selectedHours,
  isDark,
  backgroundEnabled,
}: Input) {
  const colors = getChartThemeColors(isDark)
  const hours = selectedHours || 1
  const measured = remoteData
    .map(record => ({ time: Date.parse(record.time), record }))
    .filter(sample => Number.isFinite(sample.time))
  const times = measured.map(p => p.time)
  const domain = timeDomain(times, isRealtime ? undefined : hours)
  const cadence = typicalInterval(times, isRealtime ? 3000 : hours <= 4 ? 60_000 : hours <= 120 ? 900_000 : 3600_000)
  const samples: Sample[] = []
  for (const point of measured) {
    const previous = samples.at(-1)
    if (previous && point.time - previous.time > cadence * 2.5)
      samples.push({ time: previous.time + cadence, record: null })
    samples.push(point)
  }
  const axis = {
    type: 'value' as const,
    min: 0,
    splitNumber: 3,
    axisLabel: { fontSize: 11, color: colors.textSecondary, hideOverlap: true },
    axisLine: { show: false },
    axisTick: { show: false },
    axisPointer: { show: false },
    splitLine: { lineStyle: { color: colors.splitLineColor, type: 'solid' as const } },
  }
  const percentAxis = {
    ...axis,
    max: ({ max }: { max: number }) => [5, 10, 25, 50, 75, 100].find(n => n >= max) ?? Math.ceil(max / 25) * 25,
    axisLabel: { ...axis.axisLabel, formatter: '{value}%' },
  }
  const countAxis = { ...axis, minInterval: 1 }
  function bytesAxis(fields: Field[], suffix = '') {
    const max = measured.reduce((largest, { record }) => Math.max(largest, ...fields.map(key => record[key] ?? 0)), 0)
    return {
      ...axis,
      ...niceByteAxis(max),
      axisLabel: { ...axis.axisLabel, formatter: (v: number) => formatAxisBytes(v, suffix) },
    }
  }
  function bytesWithCapacity(capacity: Field, total?: number) {
    return (value: number, record: StatusRecord) => {
      const max = record[capacity] || total
      return max && max > 0 ? `${formatBytes(value)} · ${percent((value / max) * 100)}` : formatBytes(value)
    }
  }
  function plot(traces: Trace[], yAxis: object | object[], wideUnits = false) {
    const multiple = traces.length > 1
    return {
      animation: false,
      textStyle: { fontFamily: 'Geist Variable, system-ui, sans-serif' },
      color: traces.map(t => t.color),
      grid: {
        top: 12,
        left: wideUnits ? 70 : 38,
        right: traces.some(t => t.side === 'right') ? 34 : 10,
        bottom: multiple ? 48 : 25,
        outerBoundsMode: 'none',
      },
      xAxis: timeAxis(domain, colors, hours, isRealtime),
      yAxis,
      legend: multiple
        ? buildLegend(
            colors,
            traces.map(t => (t.dashed ? { name: t.name, icon: DASHED_LEGEND_ICON } : t.name)),
          )
        : undefined,
      tooltip: {
        ...buildBaseTooltip(colors, backgroundEnabled),
        confine: true,
        triggerOn: 'mousemove',
        formatter: (params: unknown) => {
          const items = params as { dataIndex: number; seriesIndex: number; value: [number, number | null] }[]
          if (!items.length) return ''
          const point = samples[items[0].dataIndex]
          if (!point) return ''
          const rows = items.map(item => {
            const trace = traces[item.seriesIndex]
            const value = item.value?.[1]
            const text =
              point.record && typeof value === 'number' && Number.isFinite(value)
                ? trace.formatValue(value, point.record)
                : '无采样'
            return `<div class="plot-tip-row"><i style="border-color:${trace.color};border-top-style:${trace.dashed ? 'dashed' : 'solid'}"></i><span>${format.encodeHTML(trace.name)}</span><b>${format.encodeHTML(text)}</b></div>`
          })
          return `<div class="plot-tip-time">${chartTimeLabel(point.time, hours)}</div>${rows.join('')}`
        },
      },
      series: traces.map(t => ({
        name: t.name,
        type: 'line' as const,
        showSymbol: measured.length === 1,
        symbolSize: 5,
        connectNulls: false,
        yAxisIndex: t.side === 'right' ? 1 : 0,
        data: samples.map(({ time, record }) => {
          const v = record ? t.value(record) : null
          return [time, typeof v === 'number' && Number.isFinite(v) ? v : null]
        }),
        lineStyle: {
          width: t.dashed ? 1.5 : 2,
          color: t.color,
          type: t.dashed ? ('dashed' as const) : ('solid' as const),
          cap: 'round' as const,
        },
        areaStyle: t.fill
          ? { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: areaStops(t.color) } }
          : undefined,
      })),
    }
  }
  const rightAxis = { ...axis, splitLine: { show: false } }
  const cpuChartOption = plot(
    [
      { name: 'CPU', color: CHART_COLORS.sky, value: field('cpu'), formatValue: percent, fill: true },
      {
        name: '系统负载',
        color: CHART_COLORS.neutral,
        value: field('load'),
        formatValue: v => v.toFixed(2),
        side: 'right',
        dashed: true,
      },
    ],
    [percentAxis, rightAxis],
  )
  const gpuDevices = nodeInfo?.gpu_detailed_info ?? []
  const hasGpu = gpuDevices.length > 0 || remoteData.some(r => (r.gpu ?? 0) > 0)
  const gpuTemperatures: { index: number; name: string }[] = []
  const gpuTraces: Trace[] = [
    { name: 'GPU', color: CHART_COLORS.violet, value: field('gpu'), formatValue: percent, fill: true },
  ]
  if (isRealtime) {
    const tempColors = [CHART_COLORS.amber, CHART_COLORS.cyan, CHART_COLORS.blue, CHART_COLORS.emerald]
    const temps = [...gpuTempsByTime.values()]
    gpuDevices.forEach((_, i) => {
      if (!temps.some(values => values[i] > 0)) return
      const name = gpuDevices.length > 1 ? `GPU${i} 温度` : '温度'
      gpuTemperatures.push({ index: i, name })
      gpuTraces.push({
        name,
        color: tempColors[i % tempColors.length],
        value: r => {
          const v = gpuTempsByTime.get(r.time)?.[i]
          return v && v > 0 ? v : null
        },
        formatValue: v => `${v}°C`,
        side: 'right',
        dashed: true,
      })
    })
  }
  const gpuChartOption = plot(
    gpuTraces,
    gpuTraces.length > 1
      ? [percentAxis, { ...rightAxis, axisLabel: { ...axis.axisLabel, formatter: '{value}°C' } }]
      : percentAxis,
  )
  const memoryChartOption = plot(
    [
      {
        name: 'RAM',
        color: CHART_COLORS.emerald,
        value: field('ram'),
        formatValue: bytesWithCapacity('ram_total', nodeInfo?.mem_total),
        fill: true,
      },
      {
        name: 'Swap',
        color: CHART_COLORS.amber,
        value: field('swap'),
        formatValue: bytesWithCapacity('swap_total', nodeInfo?.swap_total),
        dashed: true,
      },
    ],
    bytesAxis(['ram', 'swap']),
    true,
  )
  const diskChartOption = plot(
    [
      {
        name: '硬盘已用',
        color: '#F97316',
        value: field('disk'),
        formatValue: bytesWithCapacity('disk_total', nodeInfo?.disk_total),
        fill: true,
      },
    ],
    bytesAxis(['disk']),
    true,
  )
  const networkChartOption = plot(
    [
      { name: '上行', color: TRAFFIC_COLORS.up, value: field('net_out'), formatValue: rate },
      { name: '下行', color: TRAFFIC_COLORS.down, value: field('net_in'), formatValue: rate, dashed: true },
    ],
    bytesAxis(['net_in', 'net_out'], '/s'),
    true,
  )
  const connectionsChartOption = plot(
    [
      { name: 'TCP', color: CHART_COLORS.sky, value: field('connections'), formatValue: integer },
      { name: 'UDP', color: CHART_COLORS.violet, value: field('connections_udp'), formatValue: integer, dashed: true },
    ],
    countAxis,
  )
  const processChartOption = plot(
    [{ name: '进程数', color: CHART_COLORS.violet, value: field('process'), formatValue: integer, fill: true }],
    countAxis,
  )
  return {
    times,
    measured,
    cpuChartOption,
    gpuChartOption,
    memoryChartOption,
    diskChartOption,
    networkChartOption,
    connectionsChartOption,
    processChartOption,
    gpuDevices,
    gpuTemperatures,
    hasGpu,
  }
}
