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

/** 请求按节点和时间范围归属；同一节点换范围时沿用已选线路。 */
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
  const [selection, setSelection] = useState<{ uuid: string; ids: number[] } | null>(null)
  const taskIds = tasks.map(task => task.id)
  const selectedTaskIds = selection?.uuid === uuid ? taskIds.filter(id => selection.ids.includes(id)) : taskIds
  function setSelectedTaskIds(ids: number[]) {
    setSelection(ids.length === taskIds.length ? null : { uuid, ids })
  }
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
      })

    return () => {
      cancelled = true
    }
  }, [uuid, selectedHours])

  return { remoteData, lossRecordsData, tasks, loading, error, selectedTaskIds, setSelectedTaskIds }
}
