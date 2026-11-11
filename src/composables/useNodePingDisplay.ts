import type { MaybeRefOrGetter } from 'vue'
import type { NodePingHistoryPoint, NodePingPerTaskStat } from '@/composables/useNodePingStats'
import type { PingStack } from '@/utils/pingStack'
import { computed } from 'vue'
import { NODE_PING_BAR_COUNT, useNodePingStats } from '@/composables/useNodePingStats'
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

// 文字色：正常延迟保持中性，只有很快 / 偏慢 / 很差才上色
function latencyTextTone(value: number): string {
  if (!value)
    return 'text-muted-foreground'
  if (value <= 80)
    return 'text-emerald-600 dark:text-emerald-400'
  if (value <= 180)
    return 'text-foreground'
  if (value <= 240)
    return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

function lossTextTone(loss: number): string {
  if (loss <= 1)
    return 'text-muted-foreground'
  if (loss <= 6)
    return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

// 柱条色阶：翡翠绿 → 浅翡翠 → 琥珀 → 橙 → 红，阈值与文字色一致
const BAR_TONES = [
  'bg-emerald-500 dark:bg-emerald-400/90',
  'bg-emerald-400/60 dark:bg-emerald-400/60',
  'bg-amber-400 dark:bg-amber-400/90',
  'bg-orange-500 dark:bg-orange-500/90',
  'bg-red-500 dark:bg-red-500/90',
] as const

const BAR_THRESHOLDS: Record<NodePingMetric, readonly number[]> = {
  latency: [80, 180, 240, 300],
  loss: [1, 3, 6, 9],
}

function barTone(metric: NodePingMetric, value: number): string {
  const index = BAR_THRESHOLDS[metric].findIndex(limit => value <= limit)
  return BAR_TONES[index === -1
    ? BAR_TONES.length - 1
    : index]!
}

function formatTaskLatency(stat: NodePingPerTaskStat) {
  if (stat.avgLatency < 0)
    return { latency: '--', toneClass: 'text-rose-500' }
  const ms = Math.round(stat.avgLatency)
  return {
    latency: String(ms),
    toneClass: latencyTextTone(stat.avgLatency),
  }
}

/** 去掉各线路名的公共前缀：四川电信、四川联通 → 电信、联通 */
function stripCommonPrefix(names: string[]): string[] {
  if (names.length < 2)
    return names
  let prefix = 0
  while (names.every(name => name.length > prefix + 1 && name[prefix] === names[0]![prefix]))
    prefix += 1
  return names.map(name => name.slice(prefix).trim() || name)
}

export function useNodePingDisplay(uuid: MaybeRefOrGetter<string>) {
  const appStore = useAppStore()
  const pingStats = useNodePingStats(uuid, { hours: PING_RECORDS_QUERY_HOURS })

  function buildBars(metric: NodePingMetric, points: NodePingHistoryPoint[], label = ''): NodePingBar[] {
    const prefix = label
      ? `${label} `
      : ''
    return points.map((point, index) => {
      const value = point[metric]
      const time = `${prefix}${formatDateTime(point.time, 'HH:mm:ss')}`
      if (value === null)
        return { key: `${label}${point.time}-${index}`, className: 'bg-muted-foreground/15', tooltip: `${time} N/A` }
      return {
        key: `${label}${point.time}-${index}`,
        className: barTone(metric, value),
        tooltip: metric === 'latency'
          ? `${time}\n${Math.round(value)} ms`
          : `${time}\n${value.toFixed(1)}%`,
      }
    })
  }

  function buildPlaceholderBars(metric: NodePingMetric): NodePingBar[] {
    const tooltip = pingStats.loading.value
      ? '加载中'
      : pingStats.error.value ? '加载失败' : 'N/A'
    return Array.from({ length: NODE_PING_BAR_COUNT }, (_, index) => ({
      key: `${metric}-empty-${index}`,
      className: 'bg-muted-foreground/10',
      tooltip,
    }))
  }

  function overallBars(metric: NodePingMetric): NodePingBar[] {
    const bars = buildBars(metric, pingStats.history.value)
    return bars.length
      ? bars
      : buildPlaceholderBars(metric)
  }

  // 先按 v4 / v6 后缀把同一线路合成一组，再按「延迟节点排序」设置取前 3 组
  const topPingGroups = computed(() => {
    const groups = groupPingTasksByStack(pingStats.perTaskStats.value, stat => stat.name)
    const configuredNames = appStore.pingNetworkOrder
    if (!configuredNames.length)
      return groups.slice(0, PING_NETWORK_DISPLAY_COUNT)

    const selected = new Set<(typeof groups)[number]>()
    // 既可以写分组名（四川电信），也可以写完整任务名（四川电信 v4）
    for (const name of configuredNames) {
      const group = groups.find(g => !selected.has(g) && (g.base === name || g.items.some(({ item }) => item.name === name)))
      if (group)
        selected.add(group)
    }
    // 不足 3 组时用剩余分组按后台顺序补位
    for (const group of groups)
      selected.add(group)
    return [...selected].slice(0, PING_NETWORK_DISPLAY_COUNT)
  })

  // 统一的网络表：单栈一行、双栈两行，卡片和列表共用
  const pingTable = computed<NodePingTable | null>(() => {
    const groups = topPingGroups.value
    if (!groups.length)
      return null
    const byStack = pingStats.stats.value.byStack
    const hasStack = (stack: PingStack) => groups.some(group => group.items.some(entry => entry.stack === stack))
    const stacks: Array<PingStack | null> = hasStack('v6')
      ? ['v4', 'v6']
      : [
          hasStack('v4')
            ? 'v4'
            : null,
        ]
    const hasData = pingStats.hasData.value

    const rows = stacks.map((stack): NodePingTableRow => {
      const cells = groups.map((group): NodePingTableCell => {
        // 无后缀任务视为 v4
        const found = stack
          ? group.items.find(entry => (entry.stack ?? 'v4') === stack)
          : group.items[0]
        const label = stack
          ? `${group.base} ${pingStackLabel(stack)}`
          : group.base
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
          tooltip: `${label} ${latency === '--'
            ? latency
            : `${latency}ms`}`,
        }
      })

      const part = byStack && stack
        ? byStack[stack]
        : null
      const avgLatency = part ? part.avgLatency : pingStats.avgLatency.value
      const avgLoss = part ? part.avgLoss : pingStats.avgLoss.value
      const label = pingStackLabel(stack)
      return {
        stack,
        cells,
        latency: hasData
          ? `${Math.round(avgLatency)}`
          : '--',
        latencyTone: hasData
          ? latencyTextTone(avgLatency)
          : MUTED_TONE,
        loss: hasData
          ? `${avgLoss.toFixed(1)}%`
          : '--',
        lossTone: hasData
          ? lossTextTone(avgLoss)
          : MUTED_TONE,
        latencyBars: part
          ? buildBars('latency', part.history, label)
          : overallBars('latency'),
        lossBars: part
          ? buildBars('loss', part.history, label)
          : overallBars('loss'),
      }
    })

    return {
      headers: stripCommonPrefix(groups.map(group => group.base)),
      rows,
    }
  })

  return { pingTable }
}
