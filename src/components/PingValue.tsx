import type { PingReading } from '@/utils/pingDisplay'
import { cn } from '@/lib/utils'
import { pingLatencyTone, pingStatusLabel } from '@/utils/pingDisplay'

/** 紧凑数据格共用同一组符号，读屏保留完整状态。 */
export default function PingValue({
  value,
  decimals = 0,
  unit = false,
  className,
}: {
  value: PingReading
  decimals?: number
  unit?: boolean
  className?: string
}) {
  return (
    <span
      className={cn(
        'num whitespace-nowrap',
        pingLatencyTone(value).text,
        value === 'lost' && 'font-semibold',
        className,
      )}
    >
      {typeof value === 'number' ? (
        <>
          {value.toFixed(decimals)}
          {unit && <span className="ml-0.5 text-3xs font-normal text-muted-foreground">ms</span>}
        </>
      ) : (
        <>
          <span aria-hidden="true">{value === 'lost' ? '–' : '—'}</span>
          <span className="sr-only">{pingStatusLabel[value]}</span>
        </>
      )}
    </span>
  )
}
