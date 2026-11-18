import type { PingLatencyRecord, PingLossRecord } from '@/utils/pingHistory'
import { HISTORY_MAX_POINTS } from '@/utils/pingHistory'
import { cutPeakValues } from '@/utils/recordHelper'
import { typicalInterval } from '@/utils/charts/chartTime'

export interface PingSample {
  latency: number | null
  loss: number | null
}
export interface PingFrame {
  time: number
  samples: Map<number, PingSample>
}

export function buildPingTimeline(
  records: readonly PingLatencyRecord[],
  losses: readonly PingLossRecord[],
  interval: number,
  hours: number,
): PingFrame[] {
  const events = [
    ...records.map(record => ({
      time: Date.parse(record.time),
      task: record.task_id,
      kind: 'latency' as const,
      value: record.value,
    })),
    ...losses.map(record => ({
      time: Date.parse(record.time),
      task: record.task_id,
      kind: 'loss' as const,
      value: record.loss,
    })),
  ]
    .filter(event => Number.isFinite(event.time))
    .sort((a, b) => a.time - b.time)
  const tolerance = Math.min(6000, Math.max(800, interval * 250))
  const frames: PingFrame[] = []
  for (const event of events) {
    let frame = frames.at(-1)
    if (!frame || event.time - frame.time > tolerance) {
      frame = { time: event.time, samples: new Map() }
      frames.push(frame)
    }
    const sample = frame.samples.get(event.task) ?? { latency: null, loss: null }
    if (event.value !== null && Number.isFinite(event.value)) {
      if (event.kind === 'loss') sample.loss = event.value
      else if (event.value >= 0) sample.latency = event.value
      else if (sample.loss === null) sample.loss = 1
    }
    frame.samples.set(event.task, sample)
  }
  const start = (frames.at(-1)?.time ?? 0) - hours * 3600_000
  return frames.filter(frame => frame.time >= start)
}

/** 同一任务的缺测、全丢包和长时间停报都会断线，平滑只在连续采样段内进行。 */
export function latencySeries(frames: PingFrame[], taskId: number, interval: number, hours: number, smooth: boolean) {
  const points = frames.flatMap(frame => {
    const sample = frame.samples.get(taskId)
    return sample ? [{ time: frame.time, latency: sample.loss === 1 ? null : sample.latency }] : []
  })
  const cadence = Math.max(
    interval * 1000,
    (hours * 3600_000) / HISTORY_MAX_POINTS,
    typicalInterval(
      points.map(p => p.time),
      interval * 1000,
    ),
  )
  const data: [number, number | null][] = []
  let run: typeof points = []
  function finishRun() {
    const values = smooth ? cutPeakValues(run, ['latency']) : run
    for (const point of values) data.push([point.time, point.latency])
    run = []
  }
  for (const point of points) {
    const previous = run.at(-1)
    if (previous && point.time - previous.time > cadence * 2.5) {
      finishRun()
      data.push([previous.time + cadence, null])
    }
    if (point.latency === null) {
      finishRun()
      data.push([point.time, null])
    } else run.push(point)
  }
  finishRun()
  return data
}

/** 每格取该时段实测的最高丢包率。保留尾段事件，也保留完全没有采样的格子。 */
export function lossBins(frames: PingFrame[], taskId: number, domain: [number, number], count: number) {
  const bins: ({ loss: number; time: number } | null)[] = Array(count).fill(null)
  const duration = domain[1] - domain[0]
  for (const frame of frames) {
    const loss = frame.samples.get(taskId)?.loss
    if (loss == null || frame.time < domain[0] || frame.time > domain[1]) continue
    const index = Math.min(count - 1, Math.floor(((frame.time - domain[0]) / duration) * count))
    const previous = bins[index]
    if (!previous || loss >= previous.loss) bins[index] = { loss, time: frame.time }
  }
  return bins
}
