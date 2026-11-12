import type { PingRecord, PingTaskInfo as RpcPingTaskInfo } from '@/utils/rpc'
import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { parsePingTaskName } from '@/utils/pingStack'
import { sortTasksByPublicOrder } from '@/utils/pingTaskOrder'
import { getSharedRpc } from '@/utils/rpc'

export interface NodePingHistoryPoint {
  time: string
  latency: number | null
  loss: number | null
}

interface NodePingStackStats {
  avgLatency: number
  avgLoss: number
  history: NodePingHistoryPoint[]
}

export interface NodePingStatsState {
  /** 节点同时有 v4 与 v6 数据时按协议栈拆分（无后缀任务归入 v4），否则为 null */
  byStack: { v4: NodePingStackStats; v6: NodePingStackStats } | null
  avgLatency: number
  avgLoss: number
  avgVolatility: number
  history: NodePingHistoryPoint[]
  hasData: boolean
  perTaskStats: NodePingPerTaskStat[]
}

// 首页卡片只用到任务 id 与名称
type PingTaskInfo = Pick<RpcPingTaskInfo, 'id' | 'name'>

interface SharedPingRecordsState {
  recordsByClient: Map<string, PingRecord[]>
  tasks: PingTaskInfo[]
}

interface SharedPingRecordsSnapshot {
  data: SharedPingRecordsState | null
  loading: boolean
  error: string | null
}

interface SharedPingRecordsEntry {
  /** 每次变化都替换成新对象，供 useSyncExternalStore 比较 */
  snapshot: SharedPingRecordsSnapshot
  listeners: Set<() => void>
  subscribe: (listener: () => void) => () => void
  promise: Promise<void> | null
  refreshTimer: ReturnType<typeof setInterval> | null
  subscribers: number
  lastFetchedAt: number
}

export interface NodePingPerTaskStat {
  taskId: number
  name: string
  avgLatency: number
  loss: number
}

export const NODE_PING_BAR_COUNT = 10
const CACHE_VERSION = 8
const CACHE_KEY_PREFIX = 'komari-theme-tundra:node-ping-stats'
const FULL_LOSS_EPSILON = 1e-6
const PING_RECORD_REFRESH_INTERVAL_MS = 60_000
const sharedPingRecordsCache = new Map<number, SharedPingRecordsEntry>()

interface TaskRecordSummary {
  total: number
  success: number
}

function createEmptyStats(): NodePingStatsState {
  return {
    byStack: null,
    avgLatency: 0,
    avgLoss: 0,
    avgVolatility: 0,
    history: [],
    hasData: false,
    perTaskStats: [],
  }
}

function average(values: number[]): number {
  if (!values.length) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function summarizeTaskRecords(records: PingRecord[]): Map<number, TaskRecordSummary> {
  const summaries = new Map<number, TaskRecordSummary>()

  for (const record of records) {
    const summary = summaries.get(record.task_id) ?? { total: 0, success: 0 }
    summary.total += 1
    if (record.value >= 0) {
      summary.success += 1
    }
    summaries.set(record.task_id, summary)
  }

  return summaries
}

function getIncludedTaskIds(records: PingRecord[]): Set<number> {
  const recordSummaries = summarizeTaskRecords(records)

  return new Set(
    [...recordSummaries.entries()]
      .filter(([, summary]) => summary.total > 0 && summary.success > 0)
      .map(([taskId]) => taskId),
  )
}

function getCacheKey(uuid: string, hours: number): string {
  return `${CACHE_KEY_PREFIX}:${uuid}:${hours}`
}

function isValidHistoryPoint(value: unknown): value is NodePingHistoryPoint {
  if (!value || typeof value !== 'object') return false

  const point = value as Record<string, unknown>
  const latency = point.latency
  const loss = point.loss

  return (
    typeof point.time === 'string' &&
    (latency === null || typeof latency === 'number') &&
    (loss === null || typeof loss === 'number')
  )
}

function isValidStatsState(value: unknown): value is NodePingStatsState {
  if (!value || typeof value !== 'object') return false

  const state = value as Record<string, unknown>
  return (
    typeof state.avgLatency === 'number' &&
    typeof state.avgLoss === 'number' &&
    typeof state.avgVolatility === 'number' &&
    typeof state.hasData === 'boolean' &&
    Array.isArray(state.history) &&
    state.history.every(isValidHistoryPoint) &&
    Array.isArray(state.perTaskStats) &&
    (state.byStack === null || typeof state.byStack === 'object')
  )
}

function readStatsCache(uuid: string, hours: number): NodePingStatsState | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(getCacheKey(uuid, hours))
    if (!raw) return null

    const parsed = JSON.parse(raw) as { version?: number; stats?: unknown }
    if (parsed.version !== CACHE_VERSION || !isValidStatsState(parsed.stats)) return null

    return parsed.stats
  } catch {
    return null
  }
}

function writeStatsCache(uuid: string, hours: number, value: NodePingStatsState): void {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(
      getCacheKey(uuid, hours),
      JSON.stringify({
        version: CACHE_VERSION,
        updatedAt: new Date().toISOString(),
        stats: value,
      }),
    )
  } catch {}
}

function createSharedPingRecordsEntry(): SharedPingRecordsEntry {
  const listeners = new Set<() => void>()
  return {
    snapshot: { data: null, loading: false, error: null },
    listeners,
    subscribe: listener => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    promise: null,
    refreshTimer: null,
    subscribers: 0,
    lastFetchedAt: 0,
  }
}

function getSharedPingRecordsEntry(hours: number): SharedPingRecordsEntry {
  const cachedEntry = sharedPingRecordsCache.get(hours)
  if (cachedEntry) return cachedEntry

  const nextEntry = createSharedPingRecordsEntry()
  sharedPingRecordsCache.set(hours, nextEntry)
  return nextEntry
}

function patchSnapshot(entry: SharedPingRecordsEntry, patch: Partial<SharedPingRecordsSnapshot>): void {
  entry.snapshot = { ...entry.snapshot, ...patch }
  entry.listeners.forEach(listener => listener())
}

function buildRecordsByClient(records: PingRecord[]): Map<string, PingRecord[]> {
  const grouped = new Map<string, PingRecord[]>()

  for (const record of records) {
    if (!record.client) continue

    const clientRecords = grouped.get(record.client) ?? []
    clientRecords.push(record)
    grouped.set(record.client, clientRecords)
  }

  for (const clientRecords of grouped.values()) {
    clientRecords.sort((left, right) => new Date(left.time).getTime() - new Date(right.time).getTime())
  }

  return grouped
}

async function loadSharedPingRecords(entry: SharedPingRecordsEntry, hours: number): Promise<void> {
  if (entry.promise) return entry.promise

  const rpc = getSharedRpc()
  patchSnapshot(entry, { loading: true, error: null })

  entry.promise = (async () => {
    try {
      const [result, publicTasks] = await Promise.all([
        // 新版 getRecords 可能只返回近期可用样本，hours 仅作为服务端查询窗口。
        rpc.getPingRecords({ hours }),
        // getRecords 的 tasks 不一定带 weight；用 getPublicPingTasks 对齐后台拖拽顺序
        rpc.getPublicPingTasks().catch(() => []),
      ])

      const publicTaskList = Array.isArray(publicTasks) ? publicTasks : []
      const recordTasks = result?.tasks ?? []
      const orderedTasks = publicTaskList.length
        ? sortTasksByPublicOrder(
            recordTasks.length
              ? recordTasks
              : publicTaskList.map(task => ({ id: task.id, name: task.name || `Ping ${task.id}` })),
            publicTaskList,
          )
        : recordTasks

      entry.lastFetchedAt = Date.now()
      patchSnapshot(entry, {
        data: {
          recordsByClient: buildRecordsByClient(result?.records ?? []),
          tasks: orderedTasks,
        },
        loading: false,
      })
    } catch (err) {
      patchSnapshot(entry, {
        loading: false,
        error: err instanceof Error ? err.message : '获取 Ping 历史失败',
      })
      throw err
    } finally {
      entry.promise = null
    }
  })()

  return entry.promise
}

function startSharedPingRecordsRefresh(entry: SharedPingRecordsEntry, hours: number): void {
  if (entry.refreshTimer) return

  entry.refreshTimer = setInterval(() => {
    void loadSharedPingRecords(entry, hours).catch(() => {})
  }, PING_RECORD_REFRESH_INTERVAL_MS)
}

function stopSharedPingRecordsRefresh(entry: SharedPingRecordsEntry): void {
  if (!entry.refreshTimer) return

  clearInterval(entry.refreshTimer)
  entry.refreshTimer = null
}

function retainSharedPingRecordsEntry(hours: number): () => void {
  const entry = getSharedPingRecordsEntry(hours)
  entry.subscribers += 1
  startSharedPingRecordsRefresh(entry, hours)

  let released = false
  return () => {
    if (released) return

    released = true
    entry.subscribers = Math.max(0, entry.subscribers - 1)
    if (entry.subscribers === 0) stopSharedPingRecordsRefresh(entry)
  }
}

function buildPingHistory(records: PingRecord[]): NodePingHistoryPoint[] {
  const sortedRecords = records
    .map(record => {
      const timestamp = new Date(record.time).getTime()
      return { ...record, timestamp }
    })
    .filter(record => Number.isFinite(record.timestamp))
    .sort((left, right) => left.timestamp - right.timestamp)

  if (!sortedRecords.length) return []

  const firstTime = sortedRecords[0]?.timestamp ?? 0
  const lastTime = sortedRecords.at(-1)?.timestamp ?? firstTime
  const bucketCount = Math.min(NODE_PING_BAR_COUNT, sortedRecords.length)
  const bucketSize = Math.max(1, (lastTime - firstTime) / bucketCount)

  return Array.from({ length: bucketCount }, (_, index) => {
    const startTime = firstTime + bucketSize * index
    const endTime = index === bucketCount - 1 ? lastTime + 1 : startTime + bucketSize
    const bucketRecords = sortedRecords.filter(record => record.timestamp >= startTime && record.timestamp < endTime)
    const validLatencyRecords = bucketRecords.filter(record => record.value >= 0)
    const lostCount = bucketRecords.length - validLatencyRecords.length
    const latency = validLatencyRecords.length ? average(validLatencyRecords.map(record => record.value)) : null
    const loss = bucketRecords.length ? (lostCount / bucketRecords.length) * 100 : null

    return {
      time: new Date(startTime).toISOString(),
      latency,
      loss,
    }
  })
}

function getPercentile(values: number[], percentile: number): number | null {
  if (!values.length) return null

  const sorted = [...values].sort((left, right) => left - right)
  const position = Math.min(sorted.length - 1, Math.max(0, (sorted.length - 1) * percentile))
  const lowerIndex = Math.floor(position)
  const upperIndex = Math.ceil(position)
  const lowerValue = sorted[lowerIndex]
  const upperValue = sorted[upperIndex]

  if (lowerValue === undefined || upperValue === undefined) return null
  if (lowerIndex === upperIndex) return lowerValue

  return lowerValue + (upperValue - lowerValue) * (position - lowerIndex)
}

function buildStats(records: PingRecord[], tasks: PingTaskInfo[], splitStacks = true): NodePingStatsState {
  const includedTaskIds = getIncludedTaskIds(records)

  if (!includedTaskIds.size) return createEmptyStats()

  const filteredRecords = records.filter(record => includedTaskIds.has(record.task_id))
  const history = buildPingHistory(filteredRecords)
  const taskRecords = new Map<number, PingRecord[]>()

  for (const record of filteredRecords) {
    const currentRecords = taskRecords.get(record.task_id) ?? []
    currentRecords.push(record)
    taskRecords.set(record.task_id, currentRecords)
  }

  const latencyValues: number[] = []
  const taskLossValues: number[] = []
  const volatilityValues: number[] = []

  for (const recordsByTask of taskRecords.values()) {
    const validValues = recordsByTask.map(record => record.value).filter(value => value >= 0)

    if (!validValues.length) continue

    latencyValues.push(average(validValues))
    taskLossValues.push(((recordsByTask.length - validValues.length) / recordsByTask.length) * 100)

    if (validValues.length > 1) {
      const p50 = getPercentile(validValues, 0.5)
      const p99 = getPercentile(validValues, 0.99)
      if (isFiniteNumber(p50) && isFiniteNumber(p99) && p50 > FULL_LOSS_EPSILON) {
        volatilityValues.push(p99 / p50)
      }
    }
  }

  const historyLatencyValues = history.map(point => point.latency).filter(isFiniteNumber)
  const historyLossValues = history.map(point => point.loss).filter(isFiniteNumber)

  // 全部丢包时没有有效延迟样本，用 -1 区分，避免显示成 0 ms
  const avgLatency = latencyValues.length
    ? average(latencyValues)
    : historyLatencyValues.length
      ? average(historyLatencyValues)
      : -1
  const avgLoss = taskLossValues.length ? average(taskLossValues) : average(historyLossValues)
  const avgVolatility = average(volatilityValues)
  const hasData = history.length > 0 || latencyValues.length > 0 || taskLossValues.length > 0

  const taskOrderMap = new Map(tasks.map((t, index) => [t.id, index]))
  const taskNameMap = new Map(tasks.map(t => [t.id, t.name]))
  const perTaskStats: NodePingPerTaskStat[] = Array.from(taskRecords.entries(), ([taskId, taskRecs]) => {
    const validValues = taskRecs.map(r => r.value).filter(v => v >= 0)
    const avgLatency = validValues.length ? average(validValues) : -1
    const loss = taskRecs.length ? ((taskRecs.length - validValues.length) / taskRecs.length) * 100 : 100
    const name = taskNameMap.get(taskId) ?? `Ping ${taskId}`
    return { taskId, name, avgLatency, loss }
  }).sort((a, b) => (taskOrderMap.get(a.taskId) ?? 0) - (taskOrderMap.get(b.taskId) ?? 0))

  let byStack: NodePingStatsState['byStack'] = null
  if (splitStacks) {
    const v6TaskIds = new Set(
      perTaskStats.filter(stat => parsePingTaskName(stat.name).stack === 'v6').map(stat => stat.taskId),
    )
    if (v6TaskIds.size && v6TaskIds.size < perTaskStats.length) {
      const pick = (state: NodePingStatsState): NodePingStackStats => ({
        avgLatency: state.avgLatency,
        avgLoss: state.avgLoss,
        history: state.history,
      })
      byStack = {
        v4: pick(
          buildStats(
            filteredRecords.filter(r => !v6TaskIds.has(r.task_id)),
            tasks,
            false,
          ),
        ),
        v6: pick(
          buildStats(
            filteredRecords.filter(r => v6TaskIds.has(r.task_id)),
            tasks,
            false,
          ),
        ),
      }
    }
  }

  return {
    byStack,
    avgLatency,
    avgLoss,
    avgVolatility,
    history,
    hasData,
    perTaskStats,
  }
}

// 共享记录会定时刷新，节流回写 localStorage，避免多节点同时重算时密集写盘
const lastCacheWriteAt = new Map<string, number>()

function persistStats(uuid: string, hours: number, value: NodePingStatsState): void {
  const key = getCacheKey(uuid, hours)
  const now = Date.now()
  if (now - (lastCacheWriteAt.get(key) ?? 0) < PING_RECORD_REFRESH_INTERVAL_MS) return
  lastCacheWriteAt.set(key, now)
  writeStatsCache(uuid, hours, value)
}

/**
 * 节点近期 Ping 统计。所有节点共享同一份 getRecords 结果（按 hours 分桶），每分钟刷新；
 * 首次加载完成前先用本地缓存，避免卡片闪空。
 */
export function useNodePingStats(
  uuid: string,
  options?: {
    hours?: number
    enabled?: boolean
  },
) {
  const hours = Math.max(1, Math.floor(options?.hours ?? 24))
  const active = (options?.enabled ?? true) && uuid.trim() !== ''
  const entry = getSharedPingRecordsEntry(hours)
  const snapshot = useSyncExternalStore(entry.subscribe, () => entry.snapshot)

  useEffect(() => {
    if (!active) return
    const release = retainSharedPingRecordsEntry(hours)
    const current = getSharedPingRecordsEntry(hours)
    if (!current.snapshot.data || Date.now() - current.lastFetchedAt >= PING_RECORD_REFRESH_INTERVAL_MS)
      void loadSharedPingRecords(current, hours).catch(() => {})
    return release
  }, [active, hours])

  // stats 由共享 getRecords 的近期样本派生，不将结果视为完整的 hours 时段数据
  const stats = useMemo<NodePingStatsState>(() => {
    if (!active) return createEmptyStats()
    if (!snapshot.data) return readStatsCache(uuid, hours) ?? createEmptyStats()
    const records = snapshot.data.recordsByClient.get(uuid) ?? []
    return records.length ? buildStats(records, snapshot.data.tasks) : createEmptyStats()
  }, [active, snapshot.data, uuid, hours])

  useEffect(() => {
    if (active && stats.hasData) persistStats(uuid, hours, stats)
  }, [active, stats, uuid, hours])

  // 只有首次加载（还没有共享数据）时才显示加载中 / 失败
  const firstLoad = active && !snapshot.data
  return {
    stats,
    loading: firstLoad && (snapshot.loading || !snapshot.error),
    error: firstLoad ? snapshot.error : null,
  }
}
