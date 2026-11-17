import type { NodeData } from '@/stores/nodes'
import { Icon } from '@iconify/react'
import { memo } from 'react'
import { Link } from 'react-router'
import NodeResourceMetrics from '@/components/nodes/NodeResourceMetrics'
import NodeNetworkMetrics from '@/components/nodes/NodeNetworkMetrics'
import NodePingSummary from '@/components/nodes/NodePingSummary'
import { Badge } from '@/components/ui/badge'
import { CardX } from '@/components/ui/card-x'
import { DataTooltip } from '@/components/ui/data-tooltip'
import { useBackgroundSurface } from '@/hooks/useBackgroundSurface'
import { useNodeFormatters } from '@/hooks/useNodeFormatters'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/stores/app'
import { formatDateTime } from '@/utils/helper'
import { getCustomTags, getPriceTags, getRemainingTimeTagClass, hasRegion } from '@/utils/nodeHelpers'
import { getOSImage, getOSName } from '@/utils/osImageHelper'
import { getFlagSrc, getRegionDisplayName } from '@/utils/regionHelper'

interface NodeCardProps {
  node: NodeData
  /** 点击卡片，回传 node 方便父级复用同一个稳定回调 */
  onClick?: (node: NodeData) => void
  onPingClick?: (node: NodeData, trigger: HTMLElement) => void
}

function NodeCard({ node, onClick, onPingClick }: NodeCardProps) {
  const lang = useAppStore(state => state.lang)
  const { pickSurfaceClass } = useBackgroundSurface()
  const { formatBytes, formatUptime } = useNodeFormatters()

  const offlineTime = formatDateTime(node.time)
  const expiredDate = formatDateTime(node.expired_at, 'YYYY-MM-DD')

  const priceTags = getPriceTags(node, lang)
  const remainingTimeTagClass = getRemainingTimeTagClass(node)
  const customTags = getCustomTags(node)

  return (
    <CardX
      contentClass="flex flex-1 flex-col pb-3"
      headerClass="pb-1.5 pt-2.5"
      className={cn(
        'node-card group/card h-full w-full cursor-pointer rounded-xl border bg-card shadow-xs transition-[border-color,box-shadow] duration-200 hover:border-foreground/20 hover:shadow-lg has-[:focus-visible]:border-ring/60',
        pickSurfaceClass('', 'backdrop-blur-sm'),
      )}
      onClick={() => onClick?.(node)}
      header={
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              'size-1.5 shrink-0 rounded-full ring-[3px]',
              node.online
                ? 'bg-emerald-600 ring-emerald-600/15 dark:bg-emerald-400 dark:ring-emerald-400/15'
                : 'bg-red-600 ring-red-600/15 dark:bg-red-400 dark:ring-red-400/15',
            )}
          />
          <Link
            to={`/instance/${node.uuid}`}
            onClick={event => event.stopPropagation()}
            className="min-w-0 truncate rounded-sm text-value font-semibold tracking-tight decoration-foreground/35 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
            title={node.name}
          >
            {node.name}
          </Link>
        </div>
      }
      headerExtra={
        <div className="flex items-center gap-2">
          <img src={getOSImage(node.os)} alt={getOSName(node.os)} className="size-4 opacity-80" />
          {hasRegion(node.region) && (
            <img
              src={getFlagSrc(node.region)}
              alt={getRegionDisplayName(node.region)}
              className="h-3.5 w-5 shrink-0 rounded-[2px] object-cover ring-1 ring-foreground/10"
            />
          )}
        </div>
      }
    >
      <div className="flex flex-1 flex-col gap-2">
        <div className="flex min-h-5 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/70 pb-2 text-2xs text-muted-foreground">
          {node.online && (
            <span className="inline-flex items-center gap-1">
              <Icon icon="lucide:clock-3" width="12" height="12" className="opacity-70" />
              <span>
                在线{' '}
                <span className="num text-foreground/80">{node.uptime > 0 ? formatUptime(node.uptime) : '--'}</span>
              </span>
            </span>
          )}
          {!node.online && <span className="font-medium text-red-600 dark:text-red-400">离线</span>}
          <DataTooltip placement="top" content={expiredDate} contentClass="whitespace-nowrap">
            <span className="num inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
              <Icon icon="lucide:wallet" width="12" height="12" className="opacity-70" />
              {priceTags.map(tag => (
                <span key={tag.text} className={tag.highlight ? remainingTimeTagClass : ''}>
                  {tag.text}
                </span>
              ))}
            </span>
          </DataTooltip>
        </div>

        {node.online ? (
          <>
            <NodeResourceMetrics node={node} />
            <NodeNetworkMetrics node={node} />
          </>
        ) : (
          <div className="flex min-h-24 flex-1 flex-col justify-center gap-1 py-2">
            <span className="flex items-center gap-1.5 text-xs font-medium">
              <Icon icon="lucide:clock-3" className="size-3.5 text-muted-foreground" />
              {node.time ? (
                <>
                  最后上报{' '}
                  <time dateTime={node.time} className="num">
                    {offlineTime}
                  </time>
                </>
              ) : (
                '暂无上报记录'
              )}
            </span>
            <span className="num text-2xs text-muted-foreground">
              {[
                node.cpu_cores > 0 && `${node.cpu_cores} 核`,
                node.mem_total > 0 && `内存 ${formatBytes(node.mem_total)}`,
                node.disk_total > 0 && `硬盘 ${formatBytes(node.disk_total)}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </div>
        )}
        <div className="border-t border-border/70 pt-1">
          <NodePingSummary node={node} onClick={onPingClick} />
        </div>

        {/* 底部只放自定义标签，没有就不渲染 */}
        {customTags.length > 0 && (
          <div className="mt-auto flex flex-wrap items-center gap-1">
            {customTags.map((tag, index) => (
              <Badge
                key={index}
                variant="outline"
                className="h-5 rounded-md border-border/80 bg-transparent px-1.5 !text-2xs font-normal text-muted-foreground"
              >
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </CardX>
  )
}

// 节点列表每隔几秒刷新一次，未变化的节点保持引用不变，memo 可跳过其重渲染
export default memo(NodeCard)
