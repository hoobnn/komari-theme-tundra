import type { NodeData } from '@/stores/nodes'
import { Icon } from '@iconify/react'
import { useNodeFormatters } from '@/hooks/useNodeFormatters'
import { cn } from '@/lib/utils'

/** 上下行各占一行，实时与累计按列对齐；色相只留给方向箭头。 */
export default function NodeNetworkMetrics({ node }: { node: NodeData }) {
  const { formatBytes, formatBytesPerSecond } = useNodeFormatters()
  const rows = [
    {
      key: 'up',
      label: '上行',
      icon: 'lucide:arrow-up',
      tone: 'text-emerald-600 dark:text-emerald-400',
      rate: formatBytesPerSecond(node.net_out ?? 0),
      total: formatBytes(node.net_total_up ?? 0),
    },
    {
      key: 'down',
      label: '下行',
      icon: 'lucide:arrow-down',
      tone: 'text-sky-600 dark:text-sky-400',
      rate: formatBytesPerSecond(node.net_in ?? 0),
      total: formatBytes(node.net_total_down ?? 0),
    },
  ]
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-3 gap-y-0.5 border-t border-border/70 pt-2 text-xs leading-5">
      <span />
      <span className="text-right text-[11px] leading-4 text-muted-foreground">实时网速</span>
      <span className="text-right text-[11px] leading-4 text-muted-foreground">累计流量</span>
      {rows.map(row => (
        <div key={row.key} className="contents">
          <span className={cn('inline-flex items-center gap-1 text-[11px]', row.tone)}>
            <Icon icon={row.icon} width="12" height="12" />
            <span className="text-muted-foreground">{row.label}</span>
          </span>
          <span className="num truncate text-right font-medium text-foreground">{row.rate}</span>
          <span className="num truncate text-right text-foreground/75">{row.total}</span>
        </div>
      ))}
    </div>
  )
}
