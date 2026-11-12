/**
 * 延迟任务的双栈分组。
 * 约定：任务名以 v4 / v6（或 IPv4 / IPv6）结尾即视为同一线路的两个协议栈，
 * 例如「四川电信 v4」「四川电信 v6」归为一组「四川电信」；不带后缀的任务单独成组。
 */

export type PingStack = 'v4' | 'v6'

export interface ParsedPingTaskName {
  base: string
  stack: PingStack | null
}

// 后缀须以分隔符开头（空格、下划线、连字符、间隔号），避免把「xxxv6」这类名字误拆
const STACK_SUFFIX_RE = /[\s_\-·](?:ip)?v([46])$/i
const TRAILING_SEPARATOR_RE = /[\s_\-·]+$/

export function parsePingTaskName(name: string): ParsedPingTaskName {
  const trimmed = name.trim()
  const match = STACK_SUFFIX_RE.exec(trimmed)
  if (!match) return { base: trimmed, stack: null }
  const base = trimmed.slice(0, match.index).replace(TRAILING_SEPARATOR_RE, '')
  if (!base) return { base: trimmed, stack: null }
  return {
    base,
    stack: match[1] === '6' ? 'v6' : 'v4',
  }
}

export function pingStackLabel(stack: PingStack | null): string {
  if (stack === 'v6') return 'IPv6'
  if (stack === 'v4') return 'IPv4'
  return ''
}

export interface PingStackGroup<T> {
  /** 分组名（去掉协议栈后缀） */
  base: string
  /** 组内任务，按 v4、v6、无后缀排序 */
  items: Array<{ stack: PingStack | null; item: T }>
}

const STACK_ORDER: Record<string, number> = { v4: 0, v6: 1, none: 2 }

/**
 * 按任务名分组，组的顺序取组内第一个任务在原数组中的位置（即后台排序）。
 */
export function groupPingTasksByStack<T>(items: readonly T[], getName: (item: T) => string): PingStackGroup<T>[] {
  const groups: PingStackGroup<T>[] = []
  const byBase = new Map<string, PingStackGroup<T>>()

  for (const item of items) {
    const { base, stack } = parsePingTaskName(getName(item))
    // 无后缀任务不参与合并，避免与同名的带后缀任务混在一起
    const key = stack ? `stack:${base}` : `plain:${getName(item)}`
    let group = byBase.get(key)
    if (!group) {
      group = {
        base: stack ? base : getName(item).trim(),
        items: [],
      }
      byBase.set(key, group)
      groups.push(group)
    }
    group.items.push({ stack, item })
  }

  for (const group of groups)
    group.items.sort((a, b) => STACK_ORDER[a.stack ?? 'none'] - STACK_ORDER[b.stack ?? 'none'])

  return groups
}
