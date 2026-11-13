import type { PingLossRecord } from '@/utils/pingHistory'
import type { PingRecord, PingTaskInfo } from '@/utils/rpc'
import { useEffect, useState } from 'react'
import { fetchPingHistory } from '@/utils/pingHistory'

interface FetchResult {
  uuid: string
  key: string
  records: PingRecord[]
  lossRecords: PingLossRecord[]
  tasks: PingTaskInfo[]
  error: string | null
}

const EMPTY_RECORDS: PingRecord[] = []
const EMPTY_LOSS: PingLossRecord[] = []
const EMPTY_TASKS: PingTaskInfo[] = []

/** 请求按节点和时间范围归属，切换时丢弃过期响应，并重置任务选择。 */
export function usePingChartData(uuid: string, selectedHours: number) {
  // 数据状态：结果带上请求键，loading / 过期数据均由键比较派生
  const [result, setResult] = useState<FetchResult | null>(null)
  const fetchKey = `${uuid}|${selectedHours}`
  const loading = Boolean(uuid) && result?.key !== fetchKey
  // 切换节点后旧节点的数据视为空；仅切换范围时保留旧数据到新数据到达
  const current = result?.uuid === uuid ? result : null
  const remoteData = current?.records ?? EMPTY_RECORDS
  const lossRecordsData = current?.lossRecords ?? EMPTY_LOSS
  const tasks = current?.tasks ?? EMPTY_TASKS
  const error = result?.key === fetchKey ? result.error : null

  // 任务选择
  const [selectedTaskIds, setSelectedTaskIds] = useState<number[]>([])
  // ==================== 数据获取 ====================

  // 切换视图或节点时重新拉取；cancelled 取代原先的 requestId 防乱序
  useEffect(() => {
    if (!uuid) return undefined

    let cancelled = false
    const key = `${uuid}|${selectedHours}`

    fetchPingHistory(uuid, selectedHours)
      .then(fetched => {
        if (cancelled) return
        setResult({
          uuid,
          key,
          records: fetched.records,
          lossRecords: fetched.lossRecords,
          tasks: fetched.tasks,
          error: null,
        })
        // 每次拉取完成后默认全选
        setSelectedTaskIds(fetched.tasks.map(t => t.id))
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setResult({
          uuid,
          key,
          records: EMPTY_RECORDS,
          lossRecords: EMPTY_LOSS,
          tasks: EMPTY_TASKS,
          error: err instanceof Error ? err.message : '获取数据失败',
        })
        setSelectedTaskIds([])
      })

    return () => {
      cancelled = true
    }
  }, [uuid, selectedHours])

  return { remoteData, lossRecordsData, tasks, loading, error, selectedTaskIds, setSelectedTaskIds }
}
