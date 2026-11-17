import type { NodeData } from '@/stores/nodes'
import { Icon } from '@iconify/react'
import { memo, useState } from 'react'
import { Link } from 'react-router'
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
  width?: string
  sortable?: boolean
}

interface NodeListProps {
  nodes: NodeData[]
  onClick?: (node: NodeData) => void
  onPingClick?: (node: NodeData, trigger: HTMLElement) => void
}

const rowStaggerMs = 16
const rowStaggerLimit = 6

// 给读数留出稳定列宽，其余空间优先留给节点名。
const columns: ColumnConfig[] = [
  { key: 'status', label: '状态', width: '3.25rem', sortable: true },
  { key: 'os', label: '系统', width: '3.25rem', sortable: true },
  { key: 'name', label: '节点', sortable: true },
  { key: 'tags', label: '标签', width: '12%' },
  { key: 'cpu', label: 'CPU', width: '4.75rem', sortable: true },
  { key: 'mem', label: '内存', width: '4.75rem', sortable: true },
  { key: 'disk', label: '硬盘', width: '4.75rem', sortable: true },
  { key: 'traffic', label: '流量', width: '4.75rem', sortable: true },
  { key: 'rate', label: '速率', width: '5.25rem', sortable: true },
  { key: 'networks', label: '延迟与丢包', width: '14.75rem' },
]

function ResourceValue({ value, tone }: { value: number; tone: string }) {
  const status = getStatus(value)
  return (
    <div className="space-y-1">
      <div
        className={cn(
          'num text-xs font-medium',
          status === 'warning' && 'text-amber-700 dark:text-amber-400',
          status === 'error' && 'text-red-600 dark:text-red-400',
        )}
      >
        {value.toFixed(1)}%
      </div>
      <ProgressThin percentage={value} status={status} height={4} className={status === 'success' ? tone : undefined} />
    </div>
  )
}

interface NodeRowProps {
  node: NodeData
  index: number
  animate: boolean
  onClick?: (node: NodeData) => void
  onPingClick?: (node: NodeData, trigger: HTMLElement) => void
}

const NodeRow = memo(({ node, index, animate, onClick, onPingClick }: NodeRowProps) => {
  const lang = useAppStore(state => state.lang)
  const { formatBytes, formatBytesPerSecond, formatUptime } = useNodeFormatters()

  // 每行只算一次，避免模板里重复调用
  const priceTags = getPriceTags(node, lang)
  const customTags = getCustomTags(node)
  const memPercentage = getMemPercentage(node)
  const diskPercentage = getDiskPercentage(node)

  function renderCell(key: string) {
    switch (key) {
      // 在线状态指示器
      case 'status':
        return (
          <div className="flex justify-center" title={node.online ? '在线' : '离线'}>
            <span className="sr-only">{node.online ? '在线' : '离线'}</span>
            <span
              className={cn(
                'size-1.5 rounded-full ring-[3px]',
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
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-compact font-semibold">
              {hasRegion(node.region) && (
                <img
                  src={getFlagSrc(node.region)}
                  alt={getRegionDisplayName(node.region)}
                  className="h-3.5 w-5 shrink-0 rounded-[2px] object-cover"
                />
              )}
              <Link
                to={`/instance/${node.uuid}`}
                onClick={event => event.stopPropagation()}
                className="min-w-0 truncate rounded-sm text-left underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                title={node.name}
              >
                {node.name}
              </Link>
            </div>
            <div className="flex flex-row gap-x-2 text-2xs text-muted-foreground">
              {!node.online && <span className="shrink-0 text-red-600 dark:text-red-400">离线</span>}
              {node.online && (
                <DataTooltip
                  content={formatUptime(node.uptime ?? 0)}
                  className="shrink-0"
                  placement="right"
                  contentClass="whitespace-pre-wrap w-max"
                >
                  <span>{formatUptime(node.uptime ?? 0, 'day')}</span>
                </DataTooltip>
              )}
              {priceTags.length > 0 && (
                <DataTooltip
                  placement="left"
                  content={formatDateTime(node.expired_at, 'YYYY-MM-DD')}
                  contentClass="whitespace-nowrap"
                >
                  <div className="flex gap-x-1.5 truncate">
                    {priceTags.map((tag, tagIndex) => (
                      <span key={tagIndex} className={tag.highlight ? getRemainingTimeTagClass(node) : ''}>
                        {tag.text}
                      </span>
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
                  className="h-5 rounded-md border-border/80 bg-transparent px-1.5 !text-2xs font-normal text-muted-foreground"
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
              aria-label={`查看 ${node.name} 的延迟与丢包`}
              onClick={event => {
                event.stopPropagation()
                onPingClick?.(node, event.currentTarget)
              }}
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
              <ResourceValue value={node.cpu ?? 0} tone="[&>div]:bg-sky-500 dark:[&>div]:bg-sky-400" />
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
              <ResourceValue value={memPercentage} tone="[&>div]:bg-emerald-500 dark:[&>div]:bg-emerald-400" />
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
              <ResourceValue value={diskPercentage} tone="[&>div]:bg-orange-500 dark:[&>div]:bg-orange-400" />
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
                <div className="num truncate text-xs text-foreground">
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
            <div className="num flex flex-col text-2xs">
              <span className="flex flex-row items-center gap-1">
                <Icon
                  icon="lucide:arrow-up"
                  width="12"
                  height="12"
                  className="text-emerald-600 dark:text-emerald-400"
                />
                {formatBytesPerSecond(node.net_out ?? 0)}
              </span>
              <span className="flex flex-row items-center gap-1">
                <Icon icon="lucide:arrow-down" width="12" height="12" className="text-sky-600 dark:text-sky-400" />
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
    <tr
      className={cn(
        'h-16 cursor-pointer border-t border-border/75 hover:bg-muted/45 focus-within:bg-muted/40',
        animate && 'node-enter',
      )}
      style={animate ? { animationDelay: `${Math.min(index, rowStaggerLimit) * rowStaggerMs}ms` } : undefined}
      onClick={() => onClick?.(node)}
    >
      {columns.map(col => {
        // 离线时实时值没有参考意义，保留可操作的节点名、标签与历史延迟。
        if (!node.online && col.key === 'cpu')
          return (
            <td key={col.key} colSpan={5} className="px-2 text-xs text-muted-foreground">
              {node.time ? (
                <>
                  最后上报{' '}
                  <time dateTime={node.time} className="num">
                    {formatOfflineTime(node)}
                  </time>
                </>
              ) : (
                '暂无上报记录'
              )}
            </td>
          )
        if (!node.online && ['mem', 'disk', 'traffic', 'rate'].includes(col.key)) return null
        return (
          <td key={col.key} className="px-1.5 py-1">
            {renderCell(col.key)}
          </td>
        )
      })}
    </tr>
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
    <div
      className={cn(
        'overflow-x-auto rounded-xl border',
        pickSurfaceClass('bg-card shadow-xs', 'bg-card/80 backdrop-blur-sm'),
      )}
    >
      <table aria-label="节点列表" className="w-full min-w-[60rem] table-fixed border-collapse text-left">
        <colgroup>
          {columns.map(col => (
            <col key={col.key} style={{ width: col.width }} />
          ))}
        </colgroup>
        <thead className="bg-muted/55">
          <tr>
            {columns.map(col => (
              <th
                key={col.key}
                scope="col"
                className={cn('px-1.5 py-1.5 text-xs font-medium', ['status', 'os'].includes(col.key) && 'text-center')}
                aria-sort={sortKey === col.key ? (sortDir === 1 ? 'ascending' : 'descending') : undefined}
              >
                {col.sortable ? (
                  <button
                    type="button"
                    className={cn(
                      'group/sort -mx-1 inline-flex min-h-7 cursor-pointer items-center gap-0.5 whitespace-nowrap rounded-md px-1 text-xs transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      sortKey === col.key ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground',
                    )}
                    onClick={() => handleSort(col)}
                  >
                    {col.label}
                    <Icon
                      icon={
                        sortKey === col.key
                          ? sortDir === 1
                            ? 'lucide:arrow-up'
                            : 'lucide:arrow-down'
                          : 'lucide:arrow-up-down'
                      }
                      aria-hidden="true"
                      width="11"
                      height="11"
                      className={sortKey === col.key ? 'text-foreground' : 'opacity-40 group-hover/sort:opacity-80'}
                    />
                  </button>
                ) : (
                  <span className="text-xs text-muted-foreground">{col.label}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
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
        </tbody>
      </table>
    </div>
  )
}
