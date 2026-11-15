import type { PingRecord } from '@/utils/rpc'

export interface RelayLegConfig {
  client: string
  taskId: number
  staleAfterSeconds: number
}

export interface RelayRouteConfig {
  name: string
  nodes: string[]
  legs: RelayLegConfig[]
}

export interface RelayRoutesConfig {
  routes: RelayRouteConfig[]
  error: string | null
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const isLabel = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= 120

/** 全量校验，避免配置错误时静默展示一条不完整的线路。 */
export function parseRelayRoutes(raw: string): RelayRoutesConfig {
  if (!raw.trim()) return { routes: [], error: null }
  try {
    const value: unknown = JSON.parse(raw)
    if (!Array.isArray(value) || value.length > 12) throw new Error('请填写最多 12 条线路的 JSON 数组')
    const names = new Set<string>()
    const routes = value.map((route: unknown, index): RelayRouteConfig => {
      const invalid = () => new Error(`第 ${index + 1} 条线路需要唯一名称、2–9 个节点，以及数量匹配的探测段`)
      if (!isObject(route) || !isLabel(route.name) || names.has(route.name.trim())) throw invalid()
      if (
        !Array.isArray(route.nodes) ||
        route.nodes.length < 2 ||
        route.nodes.length > 9 ||
        !route.nodes.every(isLabel)
      )
        throw invalid()
      if (!Array.isArray(route.legs) || route.legs.length !== route.nodes.length - 1) throw invalid()
      const legs = route.legs.map((leg: unknown): RelayLegConfig => {
        if (!isObject(leg) || !isLabel(leg.client) || !Number.isSafeInteger(leg.taskId) || Number(leg.taskId) <= 0)
          throw invalid()
        const staleAfterSeconds = leg.staleAfterSeconds ?? 180
        if (
          typeof staleAfterSeconds !== 'number' ||
          !Number.isFinite(staleAfterSeconds) ||
          staleAfterSeconds < 30 ||
          staleAfterSeconds > 86400
        )
          throw new Error(`第 ${index + 1} 条线路的 staleAfterSeconds 应为 30–86400 秒`)
        return { client: leg.client.trim(), taskId: Number(leg.taskId), staleAfterSeconds }
      })
      names.add(route.name.trim())
      return { name: route.name.trim(), nodes: route.nodes.map(node => node.trim()), legs }
    })
    return { routes, error: null }
  } catch (error) {
    return {
      routes: [],
      error:
        error instanceof SyntaxError
          ? '线路配置不是有效的 JSON'
          : error instanceof Error
            ? error.message
            : '线路配置无效',
    }
  }
}

export type RelayLegState = 'ok' | 'lost' | 'stale' | 'missing'

export function summarizeRelayLeg(config: RelayLegConfig, records: readonly PingRecord[], now: number) {
  const samples = records
    .filter(
      record =>
        record.client === config.client &&
        record.task_id === config.taskId &&
        Number.isFinite(record.value) &&
        Number.isFinite(Date.parse(record.time)) &&
        Date.parse(record.time) <= now,
    )
    .toSorted((a, b) => Date.parse(a.time) - Date.parse(b.time))
  const latest = samples.at(-1)
  const state: RelayLegState = !latest
    ? 'missing'
    : now - Date.parse(latest.time) > config.staleAfterSeconds * 1000
      ? 'stale'
      : latest.value < 0
        ? 'lost'
        : 'ok'
  const recent = samples.filter(sample => Date.parse(sample.time) >= now - 10 * 60_000)
  const loss = recent.length ? (recent.filter(sample => sample.value < 0).length / recent.length) * 100 : null
  return {
    ...config,
    state,
    latency: state === 'ok' ? latest!.value : null,
    updated: latest?.time ?? null,
    loss,
    samples,
  }
}

export const relayStateLabel: Record<RelayLegState, string> = {
  ok: '正常',
  lost: '探测失败',
  stale: '数据过期',
  missing: '无数据',
}

/** 与节点卡片的延迟阈值保持一致。 */
export function relayLatencyTone(value: number | null): string {
  if (value === null) return 'text-muted-foreground'
  if (value <= 80) return 'text-emerald-700 dark:text-emerald-400'
  if (value <= 180) return 'text-foreground'
  if (value <= 240) return 'text-amber-700 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}
