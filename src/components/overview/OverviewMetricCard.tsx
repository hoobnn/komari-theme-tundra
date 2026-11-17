import type { CSSProperties, ReactNode } from 'react'
import type { OverviewTone } from '@/utils/uiClasses'
import { Icon } from '@iconify/react'
import { useAppStore } from '@/stores/app'
import { cn } from '@/lib/utils'
import { OVERVIEW_CELL_CLASS, OVERVIEW_TONES, OVERVIEW_VALUE_CLASS } from '@/utils/uiClasses'

const BAR_TONES: Record<OverviewTone, { track: string; fill: string }> = {
  sky: { track: 'bg-sky-500/12 dark:bg-sky-400/20', fill: 'from-sky-400 to-sky-600 dark:from-sky-500 dark:to-sky-300' },
  emerald: {
    track: 'bg-emerald-500/12 dark:bg-emerald-400/20',
    fill: 'from-emerald-400 to-emerald-600 dark:from-emerald-500 dark:to-emerald-300',
  },
  orange: {
    track: 'bg-orange-500/12 dark:bg-orange-400/20',
    fill: 'from-orange-400 to-orange-600 dark:from-orange-500 dark:to-orange-300',
  },
  violet: {
    track: 'bg-violet-500/12 dark:bg-violet-400/20',
    fill: 'from-violet-400 to-violet-600 dark:from-violet-500 dark:to-violet-300',
  },
  fuchsia: {
    track: 'bg-fuchsia-500/12 dark:bg-fuchsia-400/20',
    fill: 'from-fuchsia-400 to-fuchsia-600 dark:from-fuchsia-500 dark:to-fuchsia-300',
  },
}

interface OverviewMetricCardProps {
  label: string
  icon: string
  tone: OverviewTone
  value: string
  unit: string
  /** 标题行右侧的补充，如总量 */
  aside?: ReactNode
  /** 0–100，有值时在底部画一条占用条 */
  ratio?: number | null
  /** 底部的补充行，与占用条二选一 */
  footer?: ReactNode
  transitionKey: string
  index: number
}

/** 概览面板中的一格；外框、分隔线由 NodeGeneralCards 的面板统一绘制。 */
export default function OverviewMetricCard({
  label,
  icon,
  tone,
  value,
  unit,
  aside,
  ratio,
  footer,
  transitionKey,
  index,
}: OverviewMetricCardProps) {
  const animate = !useAppStore(state => state.settings.disablePageAnimation)
  return (
    <div className={OVERVIEW_CELL_CLASS}>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
          <span className={cn('flex size-5 shrink-0 items-center justify-center rounded-md', OVERVIEW_TONES[tone])}>
            <Icon icon={icon} width="12" height="12" />
          </span>
          {label}
        </span>
        {aside && (
          <span
            className="num min-w-0 truncate text-3xs text-muted-foreground sm:text-2xs"
            title={typeof aside === 'string' ? aside : undefined}
          >
            {aside}
          </span>
        )}
      </div>
      <div
        key={transitionKey}
        className={cn('flex min-w-0 items-baseline gap-1', animate && 'metric-switch-in')}
        style={{ '--metric-switch-delay': `${index * 18}ms` } as CSSProperties}
      >
        <span className={OVERVIEW_VALUE_CLASS} title={`${value} ${unit}`}>
          {value}
        </span>
        <span className="shrink-0 text-2xs font-medium text-muted-foreground md:text-xs">{unit}</span>
        {ratio != null && (
          <span className="num ml-auto shrink-0 text-2xs text-muted-foreground">{ratio.toFixed(1)}%</span>
        )}
      </div>
      {ratio != null ? (
        <div className={cn('h-[5px] overflow-hidden rounded-full', BAR_TONES[tone].track)}>
          <div
            className={cn('h-full rounded-full bg-linear-to-r transition-[width] duration-300', BAR_TONES[tone].fill)}
            style={{ width: `${ratio}%` }}
          />
        </div>
      ) : (
        footer && (
          <div className="num flex min-h-[5px] min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-2xs leading-none text-muted-foreground">
            {footer}
          </div>
        )
      )}
    </div>
  )
}
