import { useId } from 'react'
import type { useChartCursor } from '@/hooks/useChartCursor'
import { cn } from '@/lib/utils'
import { chartTimeLabel } from '@/utils/charts/chartTime'

export default function ChartTimeCursor({
  times,
  hours,
  cursor,
}: {
  times: readonly number[]
  hours: number
  cursor: ReturnType<typeof useChartCursor>
}) {
  const id = useId()
  const time = times[cursor.index]
  const text = time === undefined ? '暂无采样' : chartTimeLabel(time, hours)
  return (
    <div className="chart-time-cursor grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 text-xs">
      <label htmlFor={id} className="flex items-baseline gap-1.5 whitespace-nowrap text-muted-foreground">
        采样时刻
        <span className={cn('num font-medium text-foreground', hours >= 24 ? 'min-w-[10ch]' : 'min-w-[7ch]')}>
          {time === undefined ? '—' : <time dateTime={new Date(time).toISOString()}>{text}</time>}
        </span>
      </label>
      <input
        id={id}
        type="range"
        min={0}
        max={Math.max(0, times.length - 1)}
        step={1}
        value={Math.max(0, cursor.index)}
        disabled={times.length < 2}
        aria-label="采样时刻"
        aria-valuetext={text}
        onChange={event => cursor.pick(times[Number(event.currentTarget.value)])}
        className="w-full min-w-0 cursor-pointer accent-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-default disabled:opacity-40 pointer-coarse:min-h-11"
      />
      <button
        type="button"
        onClick={cursor.latest}
        disabled={!cursor.pinned}
        title="回到最新采样"
        className="min-h-7 shrink-0 cursor-pointer rounded-md px-1.5 text-xs font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-default disabled:text-muted-foreground disabled:hover:bg-transparent pointer-coarse:min-h-11"
      >
        最新
      </button>
    </div>
  )
}
