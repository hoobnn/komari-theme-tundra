import { useState } from 'react'
import { nearestTimeIndex } from '@/utils/charts/chartTime'

/** 用时间固定采样点；实时轮询移动数组下标时继续指向同一时刻。 */
export function useChartCursor(times: readonly number[], scope: string) {
  const [selection, setSelection] = useState<{ scope: string; time: number } | null>(null)
  const pinned = selection?.scope === scope && times.length > 0
  const index = pinned ? nearestTimeIndex(times, selection.time) : times.length - 1
  function pick(time: number) {
    const i = nearestTimeIndex(times, time)
    if (i >= 0) setSelection({ scope, time: times[i] })
  }
  return { index, time: times[index], pinned, pick, latest: () => setSelection(null) }
}
