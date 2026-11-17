import type { NodePingHistoryPoint, NodePingPerTaskStat, NodePingStatsState } from '@/hooks/useNodePingStats'
import type { PingReading } from '@/utils/pingDisplay'
import type { PingStack } from '@/utils/pingStack'
import { useMemo } from 'react'
import { NODE_PING_BAR_COUNT, useNodePingStats } from '@/hooks/useNodePingStats'
import { useAppStore } from '@/stores/app'
import { formatDateTime } from '@/utils/helper'
import {
  describePing,
  formatPingLoss,
  pingLatencyTone,
  pingLossTone,
  pingReading,
  pingStatusLabel,
} from '@/utils/pingDisplay'
import { groupPingTasksByStack, pingStackLabel } from '@/utils/pingStack'

type NodePingMetric = 'latency' | 'loss'

// getRecords 在新版主控中返回的是近期可用样本，不保证覆盖完整 1 小时。
const PING_RECORDS_QUERY_HOURS = 1

// 三网延迟固定展示的线路数量
const PING_NETWORK_DISPLAY_COUNT = 3

export interface NodePingBar {
  key: string
  className: string
  tooltip: string
}

export interface NodePingTableCell {
  key: string
  latency: PingReading
  tooltip: string
}

export interface NodePingTableRow {
  /** 无后缀任务为 null，行首不显示协议栈标签 */
  stack: PingStack | null
  cells: NodePingTableCell[]
  latency: PingReading
  loss: string | null
  lossTone: string
  latencyBars: NodePingBar[]
  lossBars: NodePingBar[]
}

export interface NodePingTable {
  headers: string[]
  rows: NodePingTableRow[]
  description: string
}

/** 去掉各线路名的公共前缀：四川电信、四川联通 → 电信、联通 */
function stripCommonPrefix(names: string[]): string[] {
  if (names.length < 2) return names
  let prefix = 0
  while (names.every(name => name.length > prefix + 1 && name[prefix] === names[0][prefix])) prefix += 1
  return names.map(name => name.slice(prefix).trim() || name)
}

function buildBars(metric: NodePingMetric, points: NodePingHistoryPoint[], label = ''): NodePingBar[] {
  const prefix = label ? `${label} ` : ''
  return points.map((point, index) => {
    const value = point[metric]
    const time = `${prefix}${formatDateTime(point.time, 'HH:mm:ss')}`
    if (value === null) {
      const state = metric === 'latency' && point.loss === 100 ? 'lost' : 'missing'
      return {
        key: `${label}${point.time}-${index}`,
        className: pingLatencyTone(state).bar,
        tooltip: `${time}\n${pingStatusLabel[state]}`,
      }
    }
    return {
      key: `${label}${point.time}-${index}`,
      className: (metric === 'latency' ? pingLatencyTone(value) : pingLossTone(value)).bar,
      tooltip: `${time}\n${metric === 'latency' ? describePing(value) : formatPingLoss(value)}`,
    }
  })
}

function buildPlaceholderBars(metric: NodePingMetric, tooltip: string): NodePingBar[] {
  return Array.from({ length: NODE_PING_BAR_COUNT }, (_, index) => ({
    key: `${metric}-empty-${index}`,
    className: 'bg-muted-foreground/10',
    tooltip,
  }))
}

/** 先按 v4 / v6 后缀把同一线路合成一组，再按「延迟节点排序」设置取前 3 组 */
function pickTopPingGroups(perTaskStats: NodePingPerTaskStat[], configuredNames: string[]) {
  const groups = groupPingTasksByStack(perTaskStats, stat => stat.name)
  if (!configuredNames.length) return groups.slice(0, PING_NETWORK_DISPLAY_COUNT)

  const selected = new Set<(typeof groups)[number]>()
  // 既可以写分组名（四川电信），也可以写完整任务名（四川电信 v4）
  for (const name of configuredNames) {
    const group = groups.find(
      g => !selected.has(g) && (g.base === name || g.items.some(({ item }) => item.name === name)),
    )
    if (group) selected.add(group)
  }
  // 不足 3 组时用剩余分组按后台顺序补位
  for (const group of groups) selected.add(group)
  return [...selected].slice(0, PING_NETWORK_DISPLAY_COUNT)
}

/** 统一的网络表：单栈一行、双栈两行，卡片和列表共用 */
function buildPingTable(
  stats: NodePingStatsState,
  configuredNames: string[],
  placeholderTooltip: string,
): NodePingTable | null {
  const groups = pickTopPingGroups(stats.perTaskStats, configuredNames)
  if (!groups.length) return null
  const byStack = stats.byStack
  const hasStack = (stack: PingStack) => groups.some(group => group.items.some(entry => entry.stack === stack))
  const stacks: Array<PingStack | null> = hasStack('v6') ? ['v4', 'v6'] : [hasStack('v4') ? 'v4' : null]
  const hasData = stats.hasData
  const overallBars = (metric: NodePingMetric) => {
    const bars = buildBars(metric, stats.history)
    return bars.length ? bars : buildPlaceholderBars(metric, placeholderTooltip)
  }

  const rows = stacks.map((stack): NodePingTableRow => {
    const cells = groups.map((group, index): NodePingTableCell => {
      // 无后缀任务视为 v4
      const found = stack ? group.items.find(entry => (entry.stack ?? 'v4') === stack) : group.items[0]
      const label = stack ? `${group.base} ${pingStackLabel(stack)}` : group.base
      const latency = pingReading(found?.item.avgLatency)
      return {
        key: found ? String(found.item.taskId) : `missing-${index}`,
        latency,
        tooltip: `${label} ${describePing(latency)}`,
      }
    })

    const part = byStack && stack ? byStack[stack] : null
    const avgLatency = part ? part.avgLatency : stats.avgLatency
    const avgLoss = part ? part.avgLoss : stats.avgLoss
    const label = pingStackLabel(stack)
    const rowHasData = part ? part.hasData : hasData
    const latency = pingReading(rowHasData ? avgLatency : null)
    const rowBars = (metric: NodePingMetric) => {
      if (!part) return overallBars(metric)
      return part.hasData
        ? buildBars(metric, part.history, label)
        : buildPlaceholderBars(metric, `${label} ${pingStatusLabel.missing}`)
    }
    return {
      stack,
      cells,
      latency,
      loss: rowHasData ? formatPingLoss(avgLoss) : null,
      lossTone: rowHasData ? pingLossTone(avgLoss).text : 'text-muted-foreground',
      latencyBars: rowBars('latency'),
      lossBars: rowBars('loss'),
    }
  })

  return {
    headers: stripCommonPrefix(groups.map(group => group.base)),
    rows,
    description: rows
      .map(row => [...row.cells.map(cell => cell.tooltip), `丢包率 ${row.loss ?? pingStatusLabel.missing}`].join('，'))
      .join('。'),
  }
}

/** 首页卡片 / 列表的三网延迟表 */
export function useNodePingDisplay(uuid: string) {
  const configuredNames = useAppStore(state => state.settings.pingNetworkOrder)
  const { stats, loading, error } = useNodePingStats(uuid, { hours: PING_RECORDS_QUERY_HOURS })
  const placeholderTooltip = loading ? pingStatusLabel.loading : error ? pingStatusLabel.error : pingStatusLabel.missing
  const pingTable = useMemo(
    () => buildPingTable(stats, configuredNames, placeholderTooltip),
    [stats, configuredNames, placeholderTooltip],
  )
  return { pingTable, emptyText: placeholderTooltip }
}
