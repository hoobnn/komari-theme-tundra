import type { NodeData } from '@/stores/nodes'
import { Fragment } from 'react'
import { Icon } from '@iconify/react'
import { useNodeFormatters } from '@/hooks/useNodeFormatters'
import { cn } from '@/lib/utils'

export default function NodeNetworkMetrics({ node }: { node: NodeData }) {
  const { formatBytes, formatBytesPerSecond } = useNodeFormatters()
  return (
    <div className="grid grid-cols-2 gap-2">
      {[
        {
          label: '实时网速',
          values: [formatBytesPerSecond(node.net_out ?? 0), formatBytesPerSecond(node.net_in ?? 0)],
        },
        {
          label: '累计流量',
          values: [formatBytes(node.net_total_up ?? 0), formatBytes(node.net_total_down ?? 0)],
        },
      ].map(section => (
        <div
          key={section.label}
          className={cn(
            'min-w-0 rounded-lg px-2 py-1.5',
            section.label === '实时网速' ? 'bg-emerald-50/70 dark:bg-emerald-400/5' : 'bg-sky-50/70 dark:bg-sky-400/5',
          )}
        >
          <div className="mb-1 text-[10px] text-muted-foreground">{section.label}</div>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-1 gap-y-1 text-[11px]">
            {section.values.map((value, index) => (
              <Fragment key={index}>
                <dt
                  className={cn(
                    'flex items-center gap-0.5 text-[10px]',
                    index === 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-sky-700 dark:text-sky-400',
                  )}
                >
                  <Icon icon={index === 0 ? 'lucide:arrow-up' : 'lucide:arrow-down'} width="12" height="12" />
                  {index === 0 ? '上行' : '下行'}
                </dt>
                <dd
                  className={cn(
                    'num text-right whitespace-nowrap font-medium',
                    index === 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-sky-700 dark:text-sky-400',
                  )}
                >
                  {value}
                </dd>
              </Fragment>
            ))}
          </dl>
        </div>
      ))}
    </div>
  )
}
