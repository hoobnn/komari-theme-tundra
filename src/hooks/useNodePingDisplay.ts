import type { NodePingHistoryPoint, NodePingPerTaskStat, NodePingStatsState } from '@/hooks/useNodePingStats'
import type { PingStack } from '@/utils/pingStack'
import { useMemo } from 'react'
import { NODE_PING_BAR_COUNT, useNodePingStats } from '@/hooks/useNodePingStats'
import { useAppStore } from '@/stores/app'
import { formatDateTime } from '@/utils/helper'
import { groupPingTasksByStack, pingStackLabel } from '@/utils/pingStack'

type NodePingMetric = 'latency' | 'loss'

// getRecords 在新版主控中返回的是近期可用样本，不保证覆盖完整 1 小时。
const PING_RECORDS_QUERY_HOURS = 1

// 三网延迟固定展示的线路数量
const PING_NETWORK_DISPLAY_COUNT = 3

const MUTED_TONE = 'text-muted-foreground/50'

export interface NodePingBar {
  key: string
  className: string
  tooltip: string
}

export interface NodePingTableCell {
  key: string
  /** 不带单位的数值，缺失时为 -- */
  latency: string
  toneClass: string
  tooltip: string
}

export interface NodePingTableRow {
  /** 无后缀任务为 null，行首不显示协议栈标签 */
  stack: PingStack | null
  cells: NodePingTableCell[]
  latency: string
  latencyTone: string
  loss: string
  lossTone: string
  latencyBars: NodePingBar[]
  lossBars: NodePingBar[]
}

export interface NodePingTable {
  headers: string[]
  rows: NodePingTableRow[]
}

// 文字与柱条共用同一组阈值：延迟 快 ≤80 / 正常 ≤180 / 慢 ≤240 / 差；丢包 正常 ≤1 / 偏高 ≤6 / 差
type PingTier = 'fast' | 'normal' | 'slow' | 'bad'

function latencyTier(value: number): PingTier {
  if (value <= 80) return 'fast'
  if (value <= 180) return 'normal'
  if (value <= 240) return 'slow'
  return 'bad'
}

function lossTier(loss: number): PingTier {
  if (loss <= 1) return 'fast'
  if (loss <= 6) return 'slow'
  return 'bad'
}

// 文字色：正常保持中性，只有很快 / 偏慢 / 很差才上色（浅色用 700 档保证小字对比度）
const LATENCY_TEXT_TONES: Record<PingTier, string> = {
  fast: 'text-emerald-700 dark:text-emerald-400',
  normal: 'text-foreground',
  slow: 'text-amber-700 dark:text-amber-400',
  bad: 'text-red-600 dark:text-red-400',
}

// 丢包低于 1% 视为正常，文字不上色
const LOSS_TEXT_TONES: Record<PingTier, string> = {
  ...LATENCY_TEXT_TONES,
  fast: 'text-muted-foreground',
}

// 柱条：快 / 丢包正常为实心翡翠绿，延迟正常为浅翡翠绿（不用灰，避免和「无数据」混淆）
const BAR_TONES: Record<PingTier, string> = {
  fast: 'bg-emerald-500 dark:bg-emerald-400/90',
  normal: 'bg-emerald-500/55 dark:bg-emerald-400/50',
  slow: 'bg-amber-400 dark:bg-amber-400/90',
  bad: 'bg-red-500 dark:bg-red-500/90',
}

// 0 ms 是同城探测的真实值；没有样本的情况在上游用 -1 或 hasData 区分
function latencyTextTone(value: number): string {
  if (value < 0) return 'text-muted-foreground'
  return LATENCY_TEXT_TONES[latencyTier(value)]
}

function lossTextTone(loss: number): string {
  return LOSS_TEXT_TONES[lossTier(loss)]
}

function barTone(metric: NodePingMetric, value: number): string {
  return BAR_TONES[metric === 'latency' ? latencyTier(value) : lossTier(value)]
}

function formatTaskLatency(stat: NodePingPerTaskStat) {
  if (stat.avgLatency < 0) return { latency: '--', toneClass: 'text-red-600 dark:text-red-400' }
  const ms = Math.round(stat.avgLatency)
  return {
    latency: String(ms),
    toneClass: latencyTextTone(stat.avgLatency),
  }
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
    if (value === null)
      return { key: `${label}${point.time}-${index}`, className: 'bg-muted-foreground/15', tooltip: `${time} N/A` }
    return {
      key: `${label}${point.time}-${index}`,
      className: barTone(metric, value),
      tooltip: metric === 'latency' ? `${time}\n${Math.round(value)} ms` : `${time}\n${value.toFixed(1)}%`,
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
    const cells = groups.map((group): NodePingTableCell => {
      // 无后缀任务视为 v4
      const found = stack ? group.items.find(entry => (entry.stack ?? 'v4') === stack) : group.items[0]
      const label = stack ? `${group.base} ${pingStackLabel(stack)}` : group.base
      if (!found) {
        return {
          key: `${group.base}-${stack}`,
          latency: '--',
          toneClass: MUTED_TONE,
          tooltip: `${label} 无数据`,
        }
      }
      const { latency, toneClass } = formatTaskLatency(found.item)
      return {
        key: String(found.item.taskId),
        latency,
        toneClass,
        tooltip: `${label} ${latency === '--' ? latency : `${latency}ms`}`,
      }
    })

    const part = byStack && stack ? byStack[stack] : null
    const avgLatency = part ? part.avgLatency : stats.avgLatency
    const avgLoss = part ? part.avgLoss : stats.avgLoss
    const label = pingStackLabel(stack)
    const hasLatency = hasData && avgLatency >= 0
    return {
      stack,
      cells,
      latency: hasLatency ? `${Math.round(avgLatency)}` : '--',
      latencyTone: hasLatency ? latencyTextTone(avgLatency) : MUTED_TONE,
      loss: hasData ? `${avgLoss.toFixed(1)}%` : '--',
      lossTone: hasData ? lossTextTone(avgLoss) : MUTED_TONE,
      latencyBars: part ? buildBars('latency', part.history, label) : overallBars('latency'),
      lossBars: part ? buildBars('loss', part.history, label) : overallBars('loss'),
    }
  })

  return {
    headers: stripCommonPrefix(groups.map(group => group.base)),
    rows,
  }
}

/** 首页卡片 / 列表的三网延迟表 */
export function useNodePingDisplay(uuid: string): { pingTable: NodePingTable | null } {
  const configuredNames = useAppStore(state => state.settings.pingNetworkOrder)
  const { stats, loading, error } = useNodePingStats(uuid, { hours: PING_RECORDS_QUERY_HOURS })
  const placeholderTooltip = loading ? '加载中' : error ? '加载失败' : 'N/A'
  const pingTable = useMemo(
    () => buildPingTable(stats, configuredNames, placeholderTooltip),
    [stats, configuredNames, placeholderTooltip],
  )
  return { pingTable }
}
