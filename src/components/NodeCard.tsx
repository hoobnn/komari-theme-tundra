import type { KeyboardEvent } from 'react'
import type { NodeData } from '@/stores/nodes'
import { Icon } from '@iconify/react'
import { Fragment, memo } from 'react'
import { Badge } from '@/components/ui/badge'
import { CardX } from '@/components/ui/card-x'
import { DataTooltip } from '@/components/ui/data-tooltip'
import { ProgressThin } from '@/components/ui/progress-thin'
import { useBackgroundSurface } from '@/hooks/useBackgroundSurface'
import { useNodeFormatters } from '@/hooks/useNodeFormatters'
import { useNodePingDisplay } from '@/hooks/useNodePingDisplay'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/stores/app'
import { formatDateTime, getStatus } from '@/utils/helper'
import {
  getCustomTags,
  getDiskPercentage,
  getMemPercentage,
  getPriceTags,
  getRemainingTimeTagClass,
  getTrafficUsed,
  getTrafficUsedPercentage,
  hasRegion,
  showTrafficProgress,
} from '@/utils/nodeHelpers'
import { getOSImage, getOSName } from '@/utils/osImageHelper'
import { getFlagSrc, getRegionDisplayName } from '@/utils/regionHelper'

interface NodeCardProps {
  node: NodeData
  /** 点击卡片，回传 node 方便父级复用同一个稳定回调 */
  onClick?: (node: NodeData) => void
  onPingClick?: (node: NodeData) => void
}

function NodeCard({ node, onClick, onPingClick }: NodeCardProps) {
  const lang = useAppStore(state => state.lang)
  const { pickSurfaceClass } = useBackgroundSurface()
  const { formatBytes, formatBytesPerSecond, formatUptime } = useNodeFormatters()
  const { pingTable } = useNodePingDisplay(node.uuid)

  const offlineTime = formatDateTime(node.time)
  const expiredDate = formatDateTime(node.expired_at, 'YYYY-MM-DD')

  const memPercentage = getMemPercentage(node)
  const diskPercentage = getDiskPercentage(node)
  const trafficUsedPercentage = getTrafficUsedPercentage(node)
  const trafficUsed = getTrafficUsed(node)

  // 延迟 / 丢包趋势：固定高度，单栈一行占满、双栈上下两行，保证各卡片对齐
  const pingRows = pingTable?.rows ?? []
  const trendPanels = [
    {
      metric: 'latency',
      label: '延迟',
      rows: pingRows.map(row => ({ key: `${row.stack}`, bars: row.latencyBars })),
    },
    {
      metric: 'loss',
      label: '丢包',
      rows: pingRows.map(row => ({ key: `${row.stack}`, bars: row.lossBars })),
    },
  ]

  const metrics = [
    {
      key: 'cpu',
      label: 'CPU',
      value: node.cpu ?? 0,
      status: getStatus(node.cpu ?? 0),
      detail: `${(node.load ?? 0).toFixed(2)}  ${(node.load5 ?? 0).toFixed(2)}  ${(node.load15 ?? 0).toFixed(2)}`,
      total: '',
      tip: `1 分钟负载 ${(node.load ?? 0).toFixed(2)}\n5 分钟负载 ${(node.load5 ?? 0).toFixed(2)}\n15 分钟负载 ${(node.load15 ?? 0).toFixed(2)}`,
    },
    {
      key: 'mem',
      label: '内存',
      value: memPercentage,
      status: getStatus(memPercentage),
      detail: formatBytes(node.ram ?? 0),
      total: `共 ${formatBytes(node.mem_total ?? 0)}`,
      tip: node.swap ? `Swap ${formatBytes(node.swap)}` : '',
    },
    {
      key: 'disk',
      label: '硬盘',
      value: diskPercentage,
      status: getStatus(diskPercentage),
      detail: formatBytes(node.disk ?? 0),
      total: `共 ${formatBytes(node.disk_total ?? 0)}`,
      tip: '',
    },
    {
      key: 'traffic',
      label: '流量',
      value: trafficUsedPercentage,
      status: 'info' as const,
      detail: formatBytes(trafficUsed),
      total: showTrafficProgress(node) ? `限 ${formatBytes(node.traffic_limit)}` : '不限',
      tip: `上行 ${formatBytes(node.net_total_up ?? 0)}\n下行 ${formatBytes(node.net_total_down ?? 0)}`,
    },
  ]

  const priceTags = getPriceTags(node, lang)
  const remainingTimeTagClass = getRemainingTimeTagClass(node)
  const customTags = getCustomTags(node)

  function openPingDialog() {
    onPingClick?.(node)
  }

  function handlePingKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.stopPropagation()
      event.preventDefault()
      openPingDialog()
    }
  }

  return (
    <CardX
      contentClass="flex flex-1 flex-col"
      headerClass="pb-2"
      className={cn(
        'node-card group/card h-full w-full cursor-pointer rounded-xl border bg-card shadow-xs transition-colors duration-150 hover:border-foreground/20',
        pickSurfaceClass('', 'backdrop-blur-sm'),
        !node.online && 'border-red-600/25 dark:border-red-400/25',
      )}
      onClick={() => onClick?.(node)}
      header={
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              'size-2 shrink-0 rounded-full ring-3',
              node.online
                ? 'bg-emerald-600 ring-emerald-600/15 dark:bg-emerald-400 dark:ring-emerald-400/15'
                : 'bg-red-600 ring-red-600/15 dark:bg-red-400 dark:ring-red-400/15',
            )}
          />
          <div className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-tight">{node.name}</div>
        </div>
      }
      headerExtra={
        <div className="flex items-center gap-2 opacity-90">
          <img src={getOSImage(node.os)} alt={getOSName(node.os)} className="size-4" />
          {hasRegion(node.region) && (
            <img
              src={getFlagSrc(node.region)}
              alt={getRegionDisplayName(node.region)}
              className="h-3.5 w-5 shrink-0 rounded-[2px] object-cover"
            />
          )}
        </div>
      }
    >
      <div className="relative flex flex-1 flex-col">
        {!node.online && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 text-xs text-muted-foreground">
            <span className="text-sm font-medium text-red-600 dark:text-red-400">离线</span>
            <span className="num">{offlineTime}</span>
          </div>
        )}

        <div
          className={cn('flex flex-1 flex-col gap-3', !node.online && 'pointer-events-none opacity-35 blur-[1.5px]')}
        >
          {/* 资源 */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
            {metrics.map(metric => (
              <DataTooltip
                key={metric.key}
                placement="top"
                className="block"
                content={metric.tip}
                contentClass={cn(!metric.tip && '!hidden', 'whitespace-pre-wrap w-max')}
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="text-muted-foreground">{metric.label}</span>
                    <span className="num text-[13px] font-medium">
                      {metric.value.toFixed(1)}
                      <span className="text-[11px] text-muted-foreground">%</span>
                    </span>
                  </div>
                  <ProgressThin percentage={metric.value} status={metric.status} height={3} />
                  <div className="num flex items-baseline justify-between gap-2 text-[11px] text-muted-foreground">
                    <span className="truncate text-foreground/75">{metric.detail}</span>
                    {metric.total && <span className="shrink-0">{metric.total}</span>}
                  </div>
                </div>
              </DataTooltip>
            ))}
          </div>

          {/* 运行信息 */}
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t pt-2.5 text-[11px]">
            <dt className="text-muted-foreground">速率</dt>
            <dd className="num flex justify-end gap-2.5">
              <span className="inline-flex items-center gap-0.5 text-emerald-700 dark:text-emerald-300">
                <Icon icon="tabler:arrow-up" width="11" height="11" />
                {formatBytesPerSecond(node.net_out ?? 0)}
              </span>
              <span className="inline-flex items-center gap-0.5 text-sky-700 dark:text-sky-300">
                <Icon icon="tabler:arrow-down" width="11" height="11" />
                {formatBytesPerSecond(node.net_in ?? 0)}
              </span>
            </dd>
            <dt className="text-muted-foreground">在线</dt>
            <dd className="num text-right">{node.uptime > 0 ? formatUptime(node.uptime) : '--'}</dd>
            <dt className="text-muted-foreground">费用</dt>
            <dd className="flex justify-end">
              <DataTooltip placement="left" content={expiredDate} contentClass="whitespace-nowrap">
                <span className="num flex gap-2">
                  {priceTags.map(tag => (
                    <span key={tag.text} className={tag.highlight ? remainingTimeTagClass : ''}>
                      {tag.text}
                    </span>
                  ))}
                </span>
              </DataTooltip>
            </dd>
          </dl>

          {/* 网络：趋势 + 表格，单栈 / 双栈同一结构 */}
          <div
            role="button"
            tabIndex={0}
            className="-mx-1.5 flex flex-col gap-2 rounded-md px-1.5 py-1 text-[11px] transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`${node.name} 延迟详情`}
            onClick={event => {
              event.stopPropagation()
              openPingDialog()
            }}
            onKeyDown={handlePingKeyDown}
          >
            <div className="grid grid-cols-2 gap-x-4">
              {trendPanels.map(panel => (
                <div key={panel.metric} className="flex flex-col gap-1">
                  <span className="text-[10px] leading-none text-muted-foreground">{panel.label}</span>
                  <div className="flex h-4 flex-col gap-[2px]">
                    {panel.rows.length ? (
                      panel.rows.map(row => (
                        <div
                          key={row.key}
                          className="grid min-h-0 flex-1 gap-[2px]"
                          style={{ gridTemplateColumns: `repeat(${row.bars.length || 1}, minmax(0, 1fr))` }}
                        >
                          {row.bars.map(bar => (
                            <DataTooltip
                              key={bar.key}
                              placement="top"
                              content={bar.tooltip}
                              className="h-full w-full"
                              contentClass="whitespace-pre-wrap w-max"
                            >
                              <span className={cn('block h-full w-full rounded-[2px]', bar.className)} />
                            </DataTooltip>
                          ))}
                        </div>
                      ))
                    ) : (
                      <div className="flex-1 rounded-[2px] bg-muted" />
                    )}
                  </div>
                </div>
              ))}
            </div>

            {pingTable ? (
              <div
                className="num grid items-baseline gap-x-2 gap-y-0.5"
                style={{
                  gridTemplateColumns: `1.1rem repeat(${pingTable.headers.length}, minmax(0, 1fr)) minmax(0, 1fr) minmax(0, 1fr)`,
                }}
              >
                <span />
                {pingTable.headers.map(header => (
                  <span key={header} className="truncate text-right font-sans text-[11px] text-muted-foreground">
                    {header}
                  </span>
                ))}
                <span className="text-right font-sans text-[11px] text-muted-foreground">延迟</span>
                <span className="text-right font-sans text-[11px] text-muted-foreground">丢包</span>
                {pingTable.rows.map(row => (
                  <Fragment key={`${row.stack}`}>
                    <span className="text-[10px] text-muted-foreground/80">{row.stack ?? ''}</span>
                    {row.cells.map(cell => (
                      <DataTooltip
                        key={cell.key}
                        placement="top"
                        content={cell.tooltip}
                        contentClass="whitespace-pre-wrap w-max"
                      >
                        <span className={cn('block text-right text-xs', cell.toneClass)}>{cell.latency}</span>
                      </DataTooltip>
                    ))}
                    <span className={cn('text-right text-xs font-medium', row.latencyTone)}>
                      {row.latency}
                      {row.latency !== '--' && (
                        <span className="text-[10px] font-normal text-muted-foreground">ms</span>
                      )}
                    </span>
                    <span className={cn('text-right text-xs', row.lossTone)}>{row.loss}</span>
                  </Fragment>
                ))}
              </div>
            ) : (
              <div className="text-[11px] text-muted-foreground/70">未配置延迟监测</div>
            )}
          </div>

          {/* 标签：没有也占位，卡片底部对齐 */}
          <div className="mt-auto flex min-h-[22px] flex-wrap items-center gap-1">
            {customTags.map((tag, index) => (
              <Badge
                key={index}
                variant="outline"
                className="rounded-md border-transparent bg-muted px-1.5 !text-[11px] font-normal text-muted-foreground"
              >
                {tag}
              </Badge>
            ))}
            {/* 没有自定义标签时用地区和系统填充占位行，避免一块空白 */}
            {!customTags.length && (
              <span className="flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
                {hasRegion(node.region) && <span className="truncate">{getRegionDisplayName(node.region)}</span>}
                <span className="truncate">{getOSName(node.os)}</span>
              </span>
            )}
          </div>
        </div>
      </div>
    </CardX>
  )
}

// 节点列表每隔几秒刷新一次，未变化的节点保持引用不变，memo 可跳过其重渲染
export default memo(NodeCard)
