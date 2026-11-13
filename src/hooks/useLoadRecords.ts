import type { StatusRecord } from '@/utils/rpc'
import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import { getSharedApi } from '@/utils/api'
import { getSharedRpc } from '@/utils/rpc'

const EMPTY_RECORDS: StatusRecord[] = []
const EMPTY_TEMPS = new Map<string, number[]>()

/** 负载记录与 GPU 温度的请求生命周期，轮询串行执行以防旧响应覆盖新数据。 */
export function useLoadRecords(
  uuid: string,
  realtime: boolean,
  selectedHours: number | undefined,
  dataUpdateInterval: number,
  hasGpuInfo: boolean,
) {
  // 数据状态（按 uuid + 视图归属，避免切换后短暂显示旧数据）
  const [fetched, setFetched] = useState<{ uuid: string; records: StatusRecord[]; temps: Map<string, number[]> }>(
    () => ({ uuid, records: [], temps: new Map() }),
  )
  // 切换节点时丢弃旧节点数据（切换视图则保留旧数据直到新数据到达）
  const remoteData = fetched.uuid === uuid ? fetched.records : EMPTY_RECORDS
  const gpuTempsByTime = fetched.uuid === uuid ? fetched.temps : EMPTY_TEMPS
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // gpuTempsByTime：实时视图的各卡温度，按记录时间对齐（RPC 实时记录不带 GPU 详情，REST /recent 每个点都带，且两者时间戳一致）

  // 拉取数据 + 实时轮询：依赖变化（节点 / 视图 / 间隔）时重建；cancelled 标记使 StrictMode 双跑和切换时的过期响应被丢弃
  useEffect(() => {
    if (!uuid) return undefined
    let cancelled = false
    let initial = true // 是否为首次加载（实时模式下只在首次显示加载动画）
    const rpc = getSharedRpc()
    const api = getSharedApi()
    const hours = selectedHours || 4

    async function fetchRecentGpuTemps(): Promise<Map<string, number[]>> {
      if (!hasGpuInfo) return new Map()
      try {
        const records = await api.getNodeRecentStatus(uuid)
        const map = new Map<string, number[]>()
        for (const r of records ?? []) {
          const gpus = r.gpu?.detailed_info
          if (gpus?.length)
            map.set(
              r.updated_at,
              gpus.map(g => g.temperature),
            )
        }
        return map
      } catch {
        return new Map()
      }
    }

    async function fetchRecentData() {
      // 只在首次加载时显示 loading
      if (initial) setLoading(true)
      setError(null)
      try {
        const [result, temps] = await Promise.all([rpc.getNodeRecentStatus(uuid), fetchRecentGpuTemps()])
        if (cancelled) return
        const records = result?.records || []
        records.sort((a, b) => dayjs(a.time).valueOf() - dayjs(b.time).valueOf())
        const maxLength = 150
        setFetched({ uuid, records: records.slice(-maxLength), temps })
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : '获取数据失败')
        setFetched({ uuid, records: [], temps: new Map() })
      } finally {
        if (!cancelled) {
          setLoading(false)
          initial = false
        }
      }
    }

    async function fetchHistoryData() {
      setLoading(true)
      setError(null)
      try {
        const records = (await api.getLoadRecords(uuid, hours))?.records ?? []
        if (cancelled) return
        // 按时间排序
        records.sort((a, b) => dayjs(a.time).valueOf() - dayjs(b.time).valueOf())
        setFetched({ uuid, records, temps: new Map() })
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : '获取数据失败')
        setFetched({ uuid, records: [], temps: new Map() })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    const fetchData = () => (realtime ? fetchRecentData() : fetchHistoryData())

    let timer: ReturnType<typeof setTimeout> | undefined
    async function poll() {
      await fetchData()
      if (!cancelled && realtime) timer = setTimeout(() => void poll(), dataUpdateInterval)
    }
    void poll()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // hasGpuInfo 仅在首次拿到节点信息时从 false 变 true，此时重新拉取以补上 GPU 温度
  }, [uuid, realtime, selectedHours, dataUpdateInterval, hasGpuInfo])

  return { remoteData, gpuTempsByTime, loading, error }
}
