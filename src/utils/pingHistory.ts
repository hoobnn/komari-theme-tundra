/**
 * 延迟图的历史数据获取：优先走新版 metrics RPC，主控不支持时回退到 common:getRecords。
 */
import type { MetricPoint, MetricSeries, PingRecord, PingTaskInfo } from '@/utils/rpc'
import dayjs from 'dayjs'
import { sortTasksByPublicOrder } from '@/utils/pingTaskOrder'
import { getSharedRpc, RpcError } from '@/utils/rpc'

export type PingLatencyRecord = Omit<PingRecord, 'value'> & { value: number | null }

export interface PingLossRecord {
  task_id: number
  time: string
  loss: number
}

export interface PingHistoryData {
  /** null 表示未得到延迟，显式的负延迟才表示超时。 */
  records: PingLatencyRecord[]
  tasks: PingTaskInfo[]
  lossRecords: PingLossRecord[]
}

// 与官方 komari-web HISTORY_MAX_POINTS 对齐；过小会导致长范围间隔过大、曲线断点过多
export const HISTORY_MAX_POINTS = 700

// 首次请求后记住主控是否支持 metrics RPC，避免每次切换范围都先失败一次
let metricRpcSupported: boolean | null = null

function isMethodNotFoundError(err: unknown): boolean {
  return err instanceof RpcError && err.code === -32601
}

function getMetricTaskId(series: MetricSeries, point: MetricPoint): number | null {
  const taskId = Number(point.tags?.task_id ?? series.tags?.task_id ?? point.tag?.task_id ?? series.tag?.task_id)

  return Number.isInteger(taskId) ? taskId : null
}

/** fill_empty 的 null 既可能是超时，也可能是空桶。丢包率由同一时间的 ping.loss 决定。 */
function toLatencyRecord(uuid: string, taskId: number, point: MetricPoint): PingLatencyRecord {
  return { client: uuid, task_id: taskId, time: point.time, value: point.value }
}

async function fetchMetricHistory(uuid: string, hours: number): Promise<PingHistoryData> {
  const rpc = getSharedRpc()
  const metricQuery = {
    entity_id: uuid,
    hours,
    max_points: HISTORY_MAX_POINTS,
    aggregation: 'avg',
    fill_empty: true,
  } as const
  const [metricResult, statsResult, lossResult, publicTasks] = await Promise.all([
    // 与官方主题一致：延迟曲线只吃 ping.latency_ms；丢包率走 getPingMetricStats。
    // fill_empty 与官方默认一致：空桶补 null，并把 latency=-1 规范为 null
    rpc.queryMetrics({
      ...metricQuery,
      metric_keys: ['ping.latency_ms'],
    }),
    rpc.getPingMetricStats({ uuid, hours, max_points: HISTORY_MAX_POINTS }),
    // 超过 6 小时后延迟降采样不再含负数，独立查询 ping.loss 供丢包标记使用
    rpc
      .queryMetrics({
        ...metricQuery,
        metric_keys: ['ping.loss'],
      })
      .catch(() => null),
    // getPingMetricStats 按 task_id 排序，后台拖拽顺序在 weight 上；
    // 与官方主题一致，用 getPublicPingTasks（weight ASC, id ASC）重排展示顺序
    rpc.getPublicPingTasks().catch(() => []),
  ])

  const records: PingLatencyRecord[] = []
  for (const series of metricResult?.series ?? []) {
    if (series.metric_key !== 'ping.latency_ms') continue
    for (const point of series.points ?? []) {
      const taskId = getMetricTaskId(series, point)
      if (taskId !== null) records.push(toLatencyRecord(uuid, taskId, point))
    }
  }

  const lossRecords: PingLossRecord[] = []
  for (const series of lossResult?.series ?? []) {
    if (series.metric_key !== 'ping.loss') continue
    for (const point of series.points ?? []) {
      const taskId = getMetricTaskId(series, point)
      if (
        taskId !== null &&
        point.value !== null &&
        Number.isFinite(point.value) &&
        point.value >= 0 &&
        point.value <= 1
      )
        lossRecords.push({ task_id: taskId, time: point.time, loss: point.value })
    }
  }

  const publicTaskList = Array.isArray(publicTasks) ? publicTasks : []
  const publicTaskNameMap = new Map(publicTaskList.map(task => [task.id, task.name?.trim() || ''] as const))

  const metricTasks: PingTaskInfo[] = (statsResult?.stats ?? [])
    .map(task => {
      const id = Number(task.task_id)
      return {
        id,
        name: publicTaskNameMap.get(id) || task.name || `Ping ${task.task_id}`,
        interval: task.interval ?? 60,
        loss: task.loss,
        p99: task.p99,
        p50: task.p50,
        p99_p50_ratio: task.p99_p50_ratio,
        min: task.min,
        max: task.max,
        avg: task.avg,
        latest: task.latest,
        total: task.total,
        type: task.type,
      }
    })
    .filter(task => Number.isInteger(task.id))

  return {
    records,
    tasks: sortTasksByPublicOrder(metricTasks, publicTaskList),
    lossRecords,
  }
}

async function fetchLegacyHistory(uuid: string, hours: number): Promise<PingHistoryData> {
  const rpc = getSharedRpc()
  const [result, publicTasks] = await Promise.all([
    rpc.getPingRecords({ uuid, hours }),
    rpc.getPublicPingTasks().catch(() => []),
  ])

  const publicTaskList = Array.isArray(publicTasks) ? publicTasks : []
  return {
    records: result?.records ?? [],
    tasks: sortTasksByPublicOrder(result?.tasks ?? [], publicTaskList),
    lossRecords: (result?.records ?? [])
      .filter(record => Number.isFinite(record.value))
      .map(record => ({ task_id: record.task_id, time: record.time, loss: record.value < 0 ? 1 : 0 })),
  }
}

export async function fetchPingHistory(uuid: string, hours: number): Promise<PingHistoryData> {
  let result: PingHistoryData
  if (metricRpcSupported === false) {
    result = await fetchLegacyHistory(uuid, hours)
  } else {
    try {
      result = await fetchMetricHistory(uuid, hours)
      metricRpcSupported = true
    } catch (err) {
      if (!isMethodNotFoundError(err)) throw err
      metricRpcSupported = false
      result = await fetchLegacyHistory(uuid, hours)
    }
  }

  result.records.sort((a, b) => dayjs(a.time).valueOf() - dayjs(b.time).valueOf())
  return result
}
