import type { NodeData } from '@/stores/nodes'
import { Icon } from '@iconify/react'
import { useNodeFormatters } from '@/hooks/useNodeFormatters'
import { cn } from '@/lib/utils'

/** 上下行各一格：方向色底块 + 实时网速，下面一行是累计流量。 */
export default function NodeNetworkMetrics({ node }: { node: NodeData }) {
  const { formatBytes, splitRate } = useNodeFormatters()
  const rows = [
    {
      key: 'up',
      label: '上行',
      icon: 'lucide:arrow-up',
      chip: 'bg-emerald-500/12 text-emerald-600 dark:bg-emerald-400/15 dark:text-emerald-300',
      rate: splitRate(node.net_out ?? 0),
      total: formatBytes(node.net_total_up ?? 0),
    },
    {
      key: 'down',
      label: '下行',
      icon: 'lucide:arrow-down',
      chip: 'bg-sky-500/12 text-sky-600 dark:bg-sky-400/15 dark:text-sky-300',
      rate: splitRate(node.net_in ?? 0),
      total: formatBytes(node.net_total_down ?? 0),
    },
  ]
  return (
    <div className="grid grid-cols-2 gap-x-5 border-t border-border/70 pt-2">
      {rows.map(row => (
        <div key={row.key} className="flex min-w-0 flex-col gap-1" title={`${row.label}实时网速与累计流量`}>
          <div className="flex min-w-0 items-center justify-between gap-1">
            <span className="@container inline-flex min-w-5 flex-1 items-center gap-1.5 text-xs text-muted-foreground">
              <span className={cn('flex size-5 shrink-0 items-center justify-center rounded-md', row.chip)}>
                <Icon icon={row.icon} width="12" height="12" />
              </span>
              <span className="whitespace-nowrap @max-[3.25rem]:sr-only">{row.label}</span>
            </span>
            <span className="num inline-flex shrink-0 items-baseline justify-end gap-0.5 whitespace-nowrap text-end leading-none">
              <span className="text-value font-semibold tracking-tight">{row.rate.value}</span>
              <span className="text-2xs text-muted-foreground">{row.rate.unit}</span>
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-1 text-2xs leading-4 text-muted-foreground">
            <span>累计</span>
            <span className="num text-end text-foreground/80">{row.total}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
