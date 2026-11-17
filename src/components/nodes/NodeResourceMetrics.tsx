import type { NodeData } from '@/stores/nodes'
import { Icon } from '@iconify/react'
import { DataTooltip } from '@/components/ui/data-tooltip'
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

// 每项资源一种身份色：图标底块、进度条渐变和轨道都用它；超标时进度条与数值换成告警色
const TONES = {
  sky: {
    chip: 'bg-sky-500/12 text-sky-600 dark:bg-sky-400/15 dark:text-sky-300',
    track: 'bg-sky-500/12 dark:bg-sky-400/20',
    fill: 'from-sky-400 to-sky-600 dark:from-sky-500 dark:to-sky-300',
  },
  emerald: {
    chip: 'bg-emerald-500/12 text-emerald-600 dark:bg-emerald-400/15 dark:text-emerald-300',
    track: 'bg-emerald-500/12 dark:bg-emerald-400/20',
    fill: 'from-emerald-400 to-emerald-600 dark:from-emerald-500 dark:to-emerald-300',
  },
  orange: {
    chip: 'bg-orange-500/12 text-orange-600 dark:bg-orange-400/15 dark:text-orange-300',
    track: 'bg-orange-500/12 dark:bg-orange-400/20',
    fill: 'from-orange-400 to-orange-600 dark:from-orange-500 dark:to-orange-300',
  },
  violet: {
    chip: 'bg-violet-500/12 text-violet-600 dark:bg-violet-400/15 dark:text-violet-300',
    track: 'bg-violet-500/12 dark:bg-violet-400/20',
    fill: 'from-violet-400 to-violet-600 dark:from-violet-500 dark:to-violet-300',
  },
} as const

const STATUS_FILL = {
  warning: 'from-amber-300 to-amber-500 dark:from-amber-500 dark:to-amber-300',
  error: 'from-red-400 to-red-600 dark:from-red-500 dark:to-red-400',
}

export default function NodeResourceMetrics({ node }: { node: NodeData }) {
  const { formatBytes } = useNodeFormatters()
  const memPercentage = getMemPercentage(node)
  const diskPercentage = getDiskPercentage(node)
  const trafficLimited = showTrafficProgress(node)
  const loads = [node.load, node.load5, node.load15].map(value => (value ?? 0).toFixed(2))
  const metrics = [
    {
      key: 'cpu',
      tone: TONES.sky,
      icon: 'lucide:cpu',
      label: 'CPU',
      value: node.cpu ?? 0,
      status: getStatus(node.cpu ?? 0),
      detail: (
        <span className="inline-flex gap-1.5">
          {loads.map((load, index) => (
            <span key={index}>{load}</span>
          ))}
        </span>
      ),
      total: node.cpu_cores ? `${node.cpu_cores} 核` : '',
      tip: `1 / 5 / 15 分钟负载\n${loads.join('  ')}`,
    },
    {
      key: 'mem',
      tone: TONES.emerald,
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
      tone: TONES.orange,
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
      tone: TONES.violet,
      icon: 'lucide:arrow-down-up',
      label: '流量',
      value: trafficLimited ? getTrafficUsedPercentage(node) : 0,
      status: 'info' as const,
      detail: formatBytes(getTrafficUsed(node)),
      total: trafficLimited ? `限 ${formatBytes(node.traffic_limit)}` : '',
      tip: `上行 ${formatBytes(node.net_total_up ?? 0)}\n下行 ${formatBytes(node.net_total_down ?? 0)}`,
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-2">
      {metrics.map(metric => {
        const alert = metric.status === 'warning' || metric.status === 'error' ? metric.status : null
        return (
          <DataTooltip
            key={metric.key}
            placement="top"
            className="block min-w-0"
            content={metric.tip}
            contentClass={cn(!metric.tip && '!hidden', 'whitespace-pre-wrap w-max')}
          >
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex items-center justify-between gap-1">
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className={cn('flex size-5 shrink-0 items-center justify-center rounded-md', metric.tone.chip)}>
                    <Icon icon={metric.icon} width="12" height="12" />
                  </span>
                  {metric.label}
                </span>
                <span
                  className={cn(
                    'num whitespace-nowrap text-xs leading-none',
                    alert === 'error'
                      ? 'text-red-600 dark:text-red-400'
                      : alert === 'warning'
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-foreground',
                  )}
                >
                  {metric.key === 'traffic' && !trafficLimited ? (
                    <span className="text-xs font-normal text-muted-foreground">不限</span>
                  ) : (
                    <>
                      {metric.value.toFixed(1)}
                      <span className="ml-px text-2xs font-normal text-muted-foreground">%</span>
                    </>
                  )}
                </span>
              </div>
              <div className={cn('h-[5px] overflow-hidden rounded-full', metric.tone.track)}>
                <div
                  className={cn(
                    'h-full rounded-full bg-linear-to-r transition-[width] duration-300 ease-out',
                    alert ? STATUS_FILL[alert] : metric.tone.fill,
                  )}
                  style={{ width: `${Math.max(0, Math.min(100, metric.value))}%` }}
                />
              </div>
              <div className="num flex min-w-0 items-baseline justify-between gap-x-1 text-2xs leading-4 text-muted-foreground">
                <span className="truncate text-foreground/80">{metric.detail}</span>
                {metric.total && <span className="shrink-0">{metric.total}</span>}
              </div>
            </div>
          </DataTooltip>
        )
      })}
    </div>
  )
}
