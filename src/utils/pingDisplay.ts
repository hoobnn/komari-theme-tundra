import type { PingTaskInfo } from '@/utils/rpc'

export const pingStatusLabel = {
  lost: '超时',
  missing: '无数据',
  stale: '数据过期',
  loading: '加载中',
  error: '加载失败',
} as const

export type PingStatus = keyof typeof pingStatusLabel
export type PingReading = number | PingStatus

const tones = {
  fast: {
    text: 'text-emerald-700 dark:text-emerald-400',
    bar: 'bg-emerald-500/85 dark:bg-emerald-400/80',
    line: 'border-emerald-500/80',
  },
  normal: {
    text: 'text-foreground',
    bar: 'bg-sky-400/80 dark:bg-sky-400/65',
    line: 'border-sky-500/70 dark:border-sky-400/70',
  },
  slow: {
    text: 'text-amber-700 dark:text-amber-400',
    bar: 'bg-amber-400 dark:bg-amber-400/90',
    line: 'border-amber-500/80',
  },
  bad: {
    text: 'text-red-600 dark:text-red-400',
    bar: 'bg-red-500 dark:bg-red-500/90',
    line: 'border-red-500/80',
  },
  missing: { text: 'text-muted-foreground', bar: 'bg-muted-foreground/15', line: 'border-foreground/15' },
} as const

const lowLossTone = { text: 'text-muted-foreground', bar: tones.fast.bar } as const

export function pingLatencyTone(reading: PingReading) {
  if (reading === 'lost') return tones.bad
  if (typeof reading !== 'number') return tones.missing
  if (reading <= 80) return tones.fast
  if (reading <= 180) return tones.normal
  if (reading <= 240) return tones.slow
  return tones.bad
}

export function pingLossTone(percent: number) {
  if (percent <= 1) return lowLossTone
  if (percent <= 6) return tones.slow
  return tones.bad
}

export function pingReading(value: number | null | undefined): PingReading {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'missing'
  return value < 0 ? 'lost' : value
}

/** 全丢包时部分主控省略延迟字段，旧主控也可能返回负数。 */
export function pingTaskAverage(task: Pick<PingTaskInfo, 'avg' | 'loss' | 'total'>): PingReading {
  if (task.total === 0) return 'missing'
  if (task.loss === 100) return 'lost'
  return pingReading(task.avg)
}

export function describePing(value: PingReading, decimals = 0): string {
  return typeof value === 'number' ? `${value.toFixed(decimals)} ms` : pingStatusLabel[value]
}

export function formatPingLoss(loss: number, decimals = 1): string {
  return `${loss === 0 || loss === 100 ? loss : loss.toFixed(decimals)}%`
}
