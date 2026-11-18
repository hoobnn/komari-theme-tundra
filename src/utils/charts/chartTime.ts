import dayjs from 'dayjs'
import type { ChartThemeColors } from '@/utils/chartTheme'

/** 返回离指针最近的真实采样；两点等距时取较早的一点。 */
export function nearestTimeIndex(times: readonly number[], time: number) {
  if (!times.length) return -1
  let lo = 0
  let hi = times.length - 1
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (times[mid] < time) lo = mid + 1
    else hi = mid
  }
  return lo > 0 && time - times[lo - 1] <= times[lo] - time ? lo - 1 : lo
}

export function typicalInterval(times: readonly number[], fallback: number) {
  const gaps = times
    .slice(1)
    .map((time, i) => time - times[i])
    .filter(gap => gap > 0)
    .sort((a, b) => a - b)
  // 只有一处间隔时，它本身可能就是停报，沿用已知采样频率。
  return gaps.length >= 2 ? gaps[Math.floor((gaps.length - 1) / 2)] : fallback
}

export function timeDomain(times: readonly number[], hours?: number): [number, number] {
  const last = times.at(-1) ?? 0
  const start = hours ? last - hours * 3600_000 : (times[0] ?? last)
  return start < last ? [start, last] : [last - 30_000, last + 30_000]
}

export function chartTimeLabel(time: number, hours = 1) {
  return dayjs(time).format(hours >= 24 ? 'MM/DD HH:mm' : 'HH:mm:ss')
}

export function timeAxis(domain: [number, number], colors: ChartThemeColors, hours = 1, realtime = false) {
  return {
    type: 'time' as const,
    min: domain[0],
    max: domain[1],
    splitNumber: 4,
    axisLabel: {
      color: colors.textSecondary,
      fontSize: 11,
      margin: 8,
      hideOverlap: true,
      showMinLabel: true,
      showMaxLabel: true,
      alignMinLabel: 'left' as const,
      alignMaxLabel: 'right' as const,
      formatter: (value: number) => dayjs(value).format(hours >= 48 ? 'M/D' : realtime ? 'HH:mm:ss' : 'HH:mm'),
    },
    axisLine: { show: true, lineStyle: { color: colors.borderColor } },
    axisPointer: { label: { show: false } },
    axisTick: { show: false },
    splitLine: { show: false },
  }
}
