import type { NodeData } from '@/stores/nodes'
import { Icon } from '@iconify/react'
import { DataTooltip } from '@/components/ui/data-tooltip'
import { ProgressThin } from '@/components/ui/progress-thin'
import { useNodeFormatters } from '@/hooks/useNodeFormatters'
import { cn } from '@/lib/utils'
import { getStatus } from '@/utils/helper'
import {
  getMemPercentage,
  getDiskPercentage,
  getTrafficUsed,
  getTrafficUsedPercentage,
  showTrafficProgress,
} from '@/utils/nodeHelpers'

export default function NodeResourceMetrics({ node }: { node: NodeData }) {
  const { formatBytes } = useNodeFormatters()
  const memPercentage = getMemPercentage(node)
  const diskPercentage = getDiskPercentage(node)
  const trafficUsedPercentage = getTrafficUsedPercentage(node)
  const trafficUsed = getTrafficUsed(node)
  const metrics = [
    {
      key: 'cpu',
      tone: 'text-sky-700 dark:text-sky-400',
      iconTone: 'bg-sky-50 text-sky-700 dark:bg-sky-400/10 dark:text-sky-400',
      barTone: '[&>div]:bg-sky-600 dark:[&>div]:bg-sky-400',
      icon: 'lucide:cpu',
      label: 'CPU',
      value: node.cpu ?? 0,
      status: getStatus(node.cpu ?? 0),
      detail: `${(node.load ?? 0).toFixed(2)} · ${(node.load5 ?? 0).toFixed(2)} · ${(node.load15 ?? 0).toFixed(2)}`,
      total: '负载',
      tip: `1 分钟负载 ${(node.load ?? 0).toFixed(2)}\n5 分钟负载 ${(node.load5 ?? 0).toFixed(2)}\n15 分钟负载 ${(node.load15 ?? 0).toFixed(2)}`,
    },
    {
      key: 'mem',
      tone: 'text-emerald-700 dark:text-emerald-400',
      iconTone: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-400',
      barTone: '[&>div]:bg-emerald-600 dark:[&>div]:bg-emerald-400',
      icon: 'lucide:memory-stick',
      label: '内存',
      value: memPercentage,
      status: getStatus(memPercentage),
      detail: formatBytes(node.ram ?? 0),
      total: `共 ${formatBytes(node.mem_total ?? 0)}`,
      tip: node.swap ? `Swap ${formatBytes(node.swap)}` : '',
    },
    {
      key: 'disk',
      tone: 'text-orange-700 dark:text-orange-400',
      iconTone: 'bg-orange-50 text-orange-700 dark:bg-orange-400/10 dark:text-orange-400',
      barTone: '[&>div]:bg-orange-600 dark:[&>div]:bg-orange-400',
      icon: 'lucide:hard-drive',
      label: '硬盘',
      value: diskPercentage,
      status: getStatus(diskPercentage),
      detail: formatBytes(node.disk ?? 0),
      total: `共 ${formatBytes(node.disk_total ?? 0)}`,
      tip: '',
    },
    {
      key: 'traffic',
      tone: 'text-violet-700 dark:text-violet-400',
      iconTone: 'bg-violet-50 text-violet-700 dark:bg-violet-400/10 dark:text-violet-400',
      barTone: '[&>div]:bg-violet-600 dark:[&>div]:bg-violet-400',
      icon: 'lucide:arrow-down-up',
      label: '流量',
      value: trafficUsedPercentage,
      status: 'info' as const,
      detail: formatBytes(trafficUsed),
      total: showTrafficProgress(node) ? `限 ${formatBytes(node.traffic_limit)}` : '不限',
      tip: `上行 ${formatBytes(node.net_total_up ?? 0)}\n下行 ${formatBytes(node.net_total_down ?? 0)}`,
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
      {metrics.map(metric => (
        <DataTooltip
          key={metric.key}
          placement="top"
          className="block min-w-0"
          content={metric.tip}
          contentClass={cn(!metric.tip && '!hidden', 'whitespace-pre-wrap w-max')}
        >
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex h-5 items-center justify-between gap-1">
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <span className={cn('flex size-5 shrink-0 items-center justify-center rounded-md', metric.iconTone)}>
                  <Icon icon={metric.icon} width="13" height="13" />
                </span>
                {metric.label}
              </span>
              <span
                className={cn(
                  'num whitespace-nowrap text-base font-semibold leading-none tracking-tight',
                  metric.status === 'error'
                    ? 'text-red-700 dark:text-red-400'
                    : metric.status === 'warning'
                      ? 'text-amber-700 dark:text-amber-400'
                      : metric.tone,
                )}
              >
                {metric.key === 'traffic' && !showTrafficProgress(node) ? (
                  <span className="text-xs font-normal text-muted-foreground">不限</span>
                ) : (
                  <>
                    {metric.value.toFixed(1)}
                    <span className="ml-0.5 text-[10px] font-normal text-muted-foreground">%</span>
                  </>
                )}
              </span>
            </div>
            <ProgressThin
              percentage={metric.value}
              status={metric.status}
              height={4}
              className={cn((metric.status === 'success' || metric.status === 'info') && metric.barTone)}
            />
            <div className="num flex min-w-0 flex-wrap items-baseline justify-between gap-x-1 text-[11px] leading-4">
              <span className="text-foreground/80">{metric.detail}</span>
              {metric.key !== 'cpu' && !(metric.key === 'traffic' && !showTrafficProgress(node)) && (
                <span className="text-[10px] text-muted-foreground">{metric.total}</span>
              )}
            </div>
          </div>
        </DataTooltip>
      ))}
    </div>
  )
}
