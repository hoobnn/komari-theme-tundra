import type { NodeData } from '@/stores/nodes'
import { Icon } from '@iconify/react'
import { memo } from 'react'
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
  onPingClick?: (node: NodeData) => void
}

function NodeCard({ node, onClick, onPingClick }: NodeCardProps) {
  const lang = useAppStore(state => state.lang)
  const { pickSurfaceClass } = useBackgroundSurface()
  const { formatUptime } = useNodeFormatters()

  const offlineTime = formatDateTime(node.time)
  const expiredDate = formatDateTime(node.expired_at, 'YYYY-MM-DD')

  const priceTags = getPriceTags(node, lang)
  const remainingTimeTagClass = getRemainingTimeTagClass(node)
  const customTags = getCustomTags(node)

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
          <button
            type="button"
            className="min-w-0 flex-1 truncate rounded-sm text-left text-[15px] font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title={node.name}
          >
            {node.name}
          </button>
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
          className={cn('flex flex-1 flex-col gap-2.5', !node.online && 'pointer-events-none opacity-35 blur-[1.5px]')}
        >
          {/* 在线时长与费用 */}
          <div className="flex min-h-6 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-1.5 py-1">
              <Icon icon="lucide:clock-3" width="12" height="12" />
              <span>
                在线{' '}
                <span className="num text-foreground/80">{node.uptime > 0 ? formatUptime(node.uptime) : '--'}</span>
              </span>
            </span>
            <DataTooltip placement="top" content={expiredDate} contentClass="whitespace-nowrap">
              <span className="num inline-flex flex-wrap gap-x-2 gap-y-1 rounded-md bg-muted/60 px-1.5 py-1">
                {priceTags.map(tag => (
                  <span key={tag.text} className={tag.highlight ? remainingTimeTagClass : ''}>
                    {tag.text}
                  </span>
                ))}
              </span>
            </DataTooltip>
          </div>

          <NodeResourceMetrics node={node} />
          <NodeNetworkMetrics node={node} />
          <NodePingSummary node={node} onClick={onPingClick} />

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
