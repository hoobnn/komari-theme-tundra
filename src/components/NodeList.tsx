import type { KeyboardEvent } from 'react'
import type { NodeData } from '@/stores/nodes'
import { Icon } from '@iconify/react'
import { Fragment, memo, useState } from 'react'
import NodePingListCell from '@/components/NodePingListCell'
import TrafficProgress from '@/components/TrafficProgress'
import { Badge } from '@/components/ui/badge'
import { DataTooltip } from '@/components/ui/data-tooltip'
import { ProgressThin } from '@/components/ui/progress-thin'
import { useBackgroundSurface } from '@/hooks/useBackgroundSurface'
import { useNodeFormatters } from '@/hooks/useNodeFormatters'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/stores/app'
import { sortNodes } from '@/utils/nodeSort'
import { formatDateTime, getStatus } from '@/utils/helper'
import {
  formatOfflineTime,
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

interface ColumnConfig {
  key: string
  label: string
  width: string | number
  sortable: boolean
}

interface NodeListProps {
  nodes: NodeData[]
  onClick?: (node: NodeData) => void
  onPingClick?: (node: NodeData) => void
}

const rowStaggerMs = 16
const rowStaggerLimit = 6

// 列表只在 ≥1024px 出现（更窄时固定卡片视图）。最小列宽合计 878px + 10 个 8px 间距，
// 1024 宽时行内可用约 982px，不出现横向滚动；更宽时多出的空间优先给节点名，其次给标签。
const columns: ColumnConfig[] = [
  {
    key: 'status',
    label: '状态',
    width: '40px',
    sortable: true,
  },
  {
    key: 'os',
    label: '系统',
    width: '40px',
    sortable: true,
  },
  {
    key: 'name',
    label: '节点',
    width: 'minmax(150px, 1.6fr)',
    sortable: true,
  },
  {
    key: 'tags',
    label: '标签',
    width: 'minmax(72px, 1fr)',
    sortable: false,
  },
  {
    key: 'cpu',
    label: 'CPU',
    width: '68px',
    sortable: true,
  },
  {
    key: 'mem',
    label: '内存',
    width: '68px',
    sortable: true,
  },
  {
    key: 'disk',
    label: '硬盘',
    width: '68px',
    sortable: true,
  },
  {
    key: 'traffic',
    label: '流量',
    width: '68px',
    sortable: true,
  },
  {
    key: 'rate',
    label: '速率',
    width: '76px',
    sortable: true,
  },
  {
    key: 'networks',
    label: '延迟与丢包',
    width: '228px',
    sortable: false,
  },
]

const gridStyle = {
  gridTemplateColumns: columns.map(c => c.width).join(' '),
}

const offlineOverlayContentStyle = (() => {
  const keys = columns.map(c => c.key)
  const statusIndex = keys.indexOf('status')
  const regionIndex = keys.indexOf('region')
  const nameIndex = keys.indexOf('name')
  const startColumn =
    nameIndex !== -1 ? nameIndex + 1 : regionIndex !== -1 ? regionIndex + 2 : statusIndex === -1 ? 1 : statusIndex + 2
  return { gridColumn: `${startColumn} / -1` }
})()

interface NodeRowProps {
  node: NodeData
  index: number
  animate: boolean
  onClick?: (node: NodeData) => void
  onPingClick?: (node: NodeData) => void
}

const NodeRow = memo(({ node, index, animate, onClick, onPingClick }: NodeRowProps) => {
  const lang = useAppStore(state => state.lang)
  const { pickSurfaceClass } = useBackgroundSurface()
  const { formatBytes, formatBytesPerSecond, formatUptime } = useNodeFormatters()

  // 每行只算一次，避免模板里重复调用
  const priceTags = getPriceTags(node, lang)
  const customTags = getCustomTags(node)
  const memPercentage = getMemPercentage(node)
  const diskPercentage = getDiskPercentage(node)

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

  function renderCell(key: string) {
    switch (key) {
      // 在线状态指示器
      case 'status':
        return (
          <div className="flex justify-center">
            <span
              className={cn(
                'size-2 rounded-full ring-3',
                node.online
                  ? 'bg-emerald-600 ring-emerald-600/15 dark:bg-emerald-400 dark:ring-emerald-400/15'
                  : 'bg-red-600 ring-red-600/15 dark:bg-red-400 dark:ring-red-400/15',
              )}
            />
          </div>
        )

      // 节点名称
      case 'name':
        return (
          <div className={cn('space-y-0.5', !node.online && 'blur-sm opacity-30')}>
            <div className="flex items-center gap-1.5 text-[13px] font-semibold">
              {hasRegion(node.region) && (
                <img
                  src={getFlagSrc(node.region)}
                  alt={getRegionDisplayName(node.region)}
                  className="h-3.5 w-5 shrink-0 rounded-[2px] object-cover"
                />
              )}
              <button
                type="button"
                className="min-w-0 truncate text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                title={node.name}
              >
                {node.name}
              </button>
            </div>
            <div className="flex flex-row text-[11px] text-muted-foreground/70">
              {node.online && (
                <DataTooltip
                  content={formatUptime(node.uptime ?? 0)}
                  className="shrink-0"
                  placement="right"
                  contentClass="whitespace-pre-wrap left-0 ml-0 w-max"
                >
                  <span>{formatUptime(node.uptime ?? 0, 'day')}</span>
                </DataTooltip>
              )}
              {priceTags.length > 0 && (
                <DataTooltip
                  placement="left"
                  content={formatDateTime(node.expired_at, 'YYYY-MM-DD')}
                  contentClass="whitespace-nowrap right-0 mr-0"
                >
                  <div className="truncate">
                    {priceTags.map((tag, tagIndex) => (
                      <Fragment key={tagIndex}>
                        <span className="mx-1">·</span>
                        <span className={tag.highlight ? getRemainingTimeTagClass(node) : ''}>{tag.text}</span>
                      </Fragment>
                    ))}
                  </div>
                </DataTooltip>
              )}
            </div>
          </div>
        )

      // 标签
      case 'tags':
        return (
          <div>
            {/* 窄屏时标签最多两行，超出部分隐藏，悬停看全部 */}
            <div
              className="flex max-h-[44px] flex-wrap items-center gap-1 overflow-hidden"
              title={customTags.join('、')}
            >
              {customTags.map((tag, tagIndex) => (
                <Badge
                  key={tagIndex}
                  variant="outline"
                  className="rounded-md border-transparent bg-muted px-1.5 !text-[11px] font-normal text-muted-foreground"
                >
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        )

      // 网络
      case 'networks':
        return (
          <div className="flex flex-col gap-0.5">
            <NodePingListCell
              uuid={node.uuid}
              online={node.online}
              role="button"
              tabIndex={0}
              className="outline-none"
              aria-label={`查看 ${node.name} 的延迟与丢包`}
              onClick={event => {
                event.stopPropagation()
                openPingDialog()
              }}
              onKeyDown={handlePingKeyDown}
            />
          </div>
        )

      // 操作系统
      case 'os':
        return (
          <div className="flex justify-center">
            <img src={getOSImage(node.os)} alt={getOSName(node.os)} className="size-4" />
          </div>
        )

      // CPU
      case 'cpu':
        return (
          <div>
            <DataTooltip
              placement="top"
              className="block"
              contentClass="w-max"
              content={
                <div className="num grid grid-cols-[auto_auto] gap-x-3 whitespace-nowrap">
                  <span className="text-muted-foreground">1 分钟负载</span>
                  <span className="text-right">{(node.load ?? 0).toFixed(2)}</span>
                  <span className="text-muted-foreground">5 分钟负载</span>
                  <span className="text-right">{(node.load5 ?? 0).toFixed(2)}</span>
                  <span className="text-muted-foreground">15 分钟负载</span>
                  <span className="text-right">{(node.load15 ?? 0).toFixed(2)}</span>
                </div>
              }
            >
              <div className="space-y-1">
                <div className="num truncate text-[11px] text-muted-foreground">{(node.cpu ?? 0).toFixed(1)}%</div>
                <ProgressThin percentage={node.cpu ?? 0} status={getStatus(node.cpu ?? 0)} height={4} />
              </div>
            </DataTooltip>
          </div>
        )

      // 内存
      case 'mem':
        return (
          <div>
            <DataTooltip
              placement="top"
              className="block"
              contentClass="w-max"
              content={
                <div className="num grid grid-cols-[auto_auto] gap-x-3 whitespace-nowrap">
                  <span className="text-muted-foreground">已用</span>
                  <span className="text-right">{formatBytes(node.ram ?? 0)}</span>
                  <span className="text-muted-foreground">总量</span>
                  <span className="text-right">{formatBytes(node.mem_total ?? 0)}</span>
                  {node.swap ? (
                    <>
                      <span className="text-muted-foreground">Swap</span>
                      <span className="text-right">{formatBytes(node.swap)}</span>
                    </>
                  ) : null}
                </div>
              }
            >
              <div className="space-y-1">
                <div className="num truncate text-[11px] text-muted-foreground">{memPercentage.toFixed(1)}%</div>
                <ProgressThin percentage={memPercentage} status={getStatus(memPercentage)} height={4} />
              </div>
            </DataTooltip>
          </div>
        )

      // 硬盘
      case 'disk':
        return (
          <div>
            <DataTooltip
              placement="top"
              className="block"
              contentClass="w-max"
              content={
                <div className="num grid grid-cols-[auto_auto] gap-x-3 whitespace-nowrap">
                  <span className="text-muted-foreground">已用</span>
                  <span className="text-right">{formatBytes(node.disk ?? 0)}</span>
                  <span className="text-muted-foreground">总量</span>
                  <span className="text-right">{formatBytes(node.disk_total ?? 0)}</span>
                </div>
              }
            >
              <div className="space-y-1">
                <div className="num truncate text-[11px] text-muted-foreground">{diskPercentage.toFixed(1)}%</div>
                <ProgressThin percentage={diskPercentage} status={getStatus(diskPercentage)} height={4} />
              </div>
            </DataTooltip>
          </div>
        )

      // 流量
      case 'traffic':
        return (
          <div>
            <DataTooltip
              placement="top"
              className="flex items-center gap-2"
              contentClass="w-max"
              content={
                <div className="num grid grid-cols-[auto_auto] gap-x-3 whitespace-nowrap">
                  <span className="text-muted-foreground">上行</span>
                  <span className="text-right">{formatBytes(node.net_total_up ?? 0)}</span>
                  <span className="text-muted-foreground">下行</span>
                  <span className="text-right">{formatBytes(node.net_total_down ?? 0)}</span>
                  <span className="text-muted-foreground">额度</span>
                  <span className="text-right">
                    {showTrafficProgress(node) ? formatBytes(node.traffic_limit) : '不限'}
                  </span>
                </div>
              }
            >
              <div className="space-y-1 w-full">
                <div className="num truncate text-[11px] text-muted-foreground">
                  {showTrafficProgress(node)
                    ? `${getTrafficUsedPercentage(node).toFixed(1)}%`
                    : formatBytes(getTrafficUsed(node))}
                </div>
                <TrafficProgress
                  upload={node.net_total_up ?? 0}
                  download={node.net_total_down ?? 0}
                  trafficLimit={node.traffic_limit}
                  trafficLimitType={node.traffic_limit_type || 'sum'}
                  height="4px"
                />
              </div>
            </DataTooltip>
          </div>
        )

      // 速率
      case 'rate':
        return (
          <div>
            <div className="num flex flex-col text-[11px]">
              <span className="flex flex-row items-center gap-1 text-emerald-700 dark:text-emerald-300">
                <Icon icon="tabler:arrow-up" width="12" height="12" />
                {formatBytesPerSecond(node.net_out ?? 0)}
              </span>
              <span className="flex flex-row items-center gap-1 text-sky-700 dark:text-sky-300">
                <Icon icon="tabler:arrow-down" width="12" height="12" />
                {formatBytesPerSecond(node.net_in ?? 0)}
              </span>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div
      className={cn(
        'relative flex h-16 cursor-pointer flex-col justify-center rounded-xl border bg-card shadow-xs px-2 transition-colors duration-150 hover:border-foreground/20',
        pickSurfaceClass('', 'backdrop-blur-sm'),
        !node.online && 'border-red-600/25 dark:border-red-400/25',
        animate && 'node-enter',
      )}
      role="row"
      style={animate ? { animationDelay: `${Math.min(index, rowStaggerLimit) * rowStaggerMs}ms` } : undefined}
      onClick={() => onClick?.(node)}
    >
      <div role="presentation" className="grid gap-2 items-center" style={gridStyle}>
        {columns.map(col => {
          const cell = renderCell(col.key)
          return cell ? (
            <div role="cell" key={col.key} className="min-w-0">
              {cell}
            </div>
          ) : null
        })}
      </div>

      {!node.online && (
        <div className="absolute inset-0 z-2 p-2 bg-background/10 rounded-lg flex items-center" aria-hidden="true">
          <div className="grid gap-2 items-center justify-center" style={gridStyle}>
            <div className="h-full space-y-1" style={offlineOverlayContentStyle}>
              <div className="text-sm font-semibold truncate">
                <span className="text-red-600 dark:text-red-400">离线</span> {node.name}
              </div>
              <div className="text-xs text-muted-foreground">{formatOfflineTime(node)}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
})
NodeRow.displayName = 'NodeRow'

export default function NodeList({ nodes, onClick, onPingClick }: NodeListProps) {
  const disablePageAnimation = useAppStore(state => state.settings.disablePageAnimation)
  const { pickSurfaceClass } = useBackgroundSurface()

  const [sortKey, setSortKey] = useState('')
  const [sortDir, setSortDir] = useState<1 | -1>(1)

  function handleSort(col: ColumnConfig) {
    if (!col.sortable) return
    if (sortKey === col.key) {
      setSortDir(sortDir === 1 ? -1 : 1)
    } else {
      setSortKey(col.key)
      setSortDir(1)
    }
  }

  const sortedNodes = sortNodes(nodes, sortKey, sortDir)

  return (
    <div className="overflow-x-auto overflow-y-hidden min-w-0 p-1 -m-1">
      <div role="table" aria-label="节点列表" className="min-w-fit w-full flex flex-col gap-1">
        {/* 表头 */}
        <div
          role="row"
          className={cn('grid gap-2 rounded-xl border bg-card p-2', pickSurfaceClass('', 'backdrop-blur-sm'))}
          style={gridStyle}
        >
          {columns.map(col => (
            <div
              key={col.key}
              className={cn(
                'flex items-center',
                ['status', 'os'].includes(col.key) ? 'justify-center' : 'justify-start',
              )}
              role="columnheader"
              aria-sort={
                col.sortable ? (sortKey === col.key ? (sortDir === 1 ? 'ascending' : 'descending') : 'none') : undefined
              }
            >
              {col.sortable ? (
                <button
                  type="button"
                  className={cn(
                    'group/sort -mx-1 flex items-center gap-0.5 rounded px-1 py-0.5 text-xs transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    sortKey === col.key ? 'font-medium text-foreground' : 'text-muted-foreground',
                  )}
                  onClick={() => handleSort(col)}
                >
                  {col.label}
                  <Icon
                    icon={
                      sortKey === col.key
                        ? sortDir === 1
                          ? 'tabler:arrow-up'
                          : 'tabler:arrow-down'
                        : 'tabler:arrows-sort'
                    }
                    width="12"
                    height="12"
                    className={
                      sortKey === col.key
                        ? 'text-emerald-700 dark:text-emerald-300'
                        : 'opacity-40 group-hover/sort:opacity-80'
                    }
                  />
                </button>
              ) : (
                <span className="text-xs text-muted-foreground">{col.label}</span>
              )}
            </div>
          ))}
        </div>

        <div role="rowgroup" className="flex flex-col gap-1">
          {sortedNodes.map((node, index) => (
            <NodeRow
              key={node.uuid}
              node={node}
              index={index}
              animate={!disablePageAnimation}
              onClick={onClick}
              onPingClick={onPingClick}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
