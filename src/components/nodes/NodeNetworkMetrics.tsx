import type { NodeData } from '@/stores/nodes'
import { Icon } from '@iconify/react'
import { useNodeFormatters } from '@/hooks/useNodeFormatters'
import { cn } from '@/lib/utils'

/** 上下行各一格：方向色底块 + 实时网速，下面一行是累计流量。 */
export default function NodeNetworkMetrics({ node }: { node: NodeData }) {
  const { formatBytes, formatBytesPerSecond } = useNodeFormatters()
  const rows = [
    {
      key: 'up',
      label: '上行',
      icon: 'lucide:arrow-up',
      chip: 'bg-emerald-500/12 text-emerald-600 dark:bg-emerald-400/15 dark:text-emerald-300',
      rate: formatBytesPerSecond(node.net_out ?? 0),
      total: formatBytes(node.net_total_up ?? 0),
    },
    {
      key: 'down',
      label: '下行',
      icon: 'lucide:arrow-down',
      chip: 'bg-sky-500/12 text-sky-600 dark:bg-sky-400/15 dark:text-sky-300',
      rate: formatBytesPerSecond(node.net_in ?? 0),
      total: formatBytes(node.net_total_down ?? 0),
    },
  ]
  return (
    <div className="grid grid-cols-2 gap-x-5 border-t border-border/70 pt-2">
      {rows.map(row => (
        <div key={row.key} className="flex min-w-0 items-center gap-2" title={`${row.label}实时网速与累计流量`}>
          <span className={cn('flex size-6 shrink-0 items-center justify-center rounded-md', row.chip)}>
            <Icon icon={row.icon} width="13" height="13" />
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="num truncate text-value font-semibold leading-none tracking-tight">{row.rate}</span>
            <span className="num truncate text-2xs leading-4 text-muted-foreground">
              累计 <span className="text-foreground/80">{row.total}</span>
            </span>
          </span>
        </div>
      ))}
    </div>
  )
}
