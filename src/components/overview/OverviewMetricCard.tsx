import type { CSSProperties } from 'react'
import { CardX } from '@/components/ui/card-x'
import { DataTooltip } from '@/components/ui/data-tooltip'
import { useBackgroundSurface } from '@/hooks/useBackgroundSurface'
import { useAppStore } from '@/stores/app'
import { cn } from '@/lib/utils'

interface OverviewMetricCardProps {
  label: string
  value: string
  unit: string
  total?: string
  tooltip?: string
  transitionKey: string
  index: number
}

export default function OverviewMetricCard({
  label,
  value,
  unit,
  total,
  tooltip,
  transitionKey,
  index,
}: OverviewMetricCardProps) {
  const { pickSurfaceClass } = useBackgroundSurface()
  const animate = !useAppStore(state => state.settings.disablePageAnimation)
  return (
    <CardX
      className={cn(
        'min-h-20 min-w-0 md:min-h-24',
        pickSurfaceClass('bg-card shadow-xs', 'bg-card/60 backdrop-blur-xs'),
      )}
      contentClass="flex h-full flex-col justify-between gap-3 !p-3"
    >
      <div className="flex min-w-0 items-baseline justify-between gap-2">
        <span className="whitespace-nowrap text-xs text-muted-foreground">{label}</span>
        {total && <span className="num hidden truncate text-[11px] text-muted-foreground xl:block">{total}</span>}
      </div>
      <DataTooltip as="span" content={tooltip} className="block min-w-0" contentClass="whitespace-pre w-max">
        <div
          key={transitionKey}
          className={cn('flex min-w-0 items-baseline gap-1', animate && 'metric-switch-in')}
          style={{ '--metric-switch-delay': `${index * 18}ms` } as CSSProperties}
        >
          <span
            className="num min-w-0 truncate text-base min-[360px]:text-lg font-semibold leading-none lg:text-2xl xl:text-[28px]"
            title={`${value} ${unit}`}
          >
            {value}
          </span>
          <span className="shrink-0 text-[11px] font-medium text-muted-foreground md:text-xs">{unit}</span>
        </div>
      </DataTooltip>
    </CardX>
  )
}
