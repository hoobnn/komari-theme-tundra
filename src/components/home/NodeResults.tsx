import type { NodeData } from '@/stores/nodes'
import type { NodeViewMode } from '@/stores/app'
import type { NodeStatusFilter } from '@/hooks/useHomeNodes'
import { lazy, Suspense, useDeferredValue } from 'react'
import { Button } from '@/components/ui/button'
import { Empty } from '@/components/ui/empty'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/stores/app'

const NodeCard = lazy(() => import('@/components/NodeCard'))
const NodeList = lazy(() => import('@/components/NodeList'))
const nodeItemStaggerMs = 16
const nodeItemStaggerLimit = 6

interface NodeResultsProps {
  nodes: NodeData[]
  viewMode: NodeViewMode
  query: string
  statusFilter: NodeStatusFilter
  resetFilters: () => void
  onNodeClick: (node: NodeData) => void
  onPingClick: (node: NodeData, trigger: HTMLElement) => void
}

export default function NodeResults({
  nodes,
  viewMode,
  query,
  statusFilter,
  resetFilters,
  onNodeClick,
  onPingClick,
}: NodeResultsProps) {
  const animateItems = !useAppStore(state => state.settings.disablePageAnimation)
  // 首次切换还要下载对应视图，加载期间保留当前内容和页面高度。
  const visibleMode = useDeferredValue(viewMode)
  const statusLabel = statusFilter === 'offline' ? '离线' : statusFilter === 'online' ? '在线' : ''
  return (
    <Suspense fallback={null}>
      {nodes.length !== 0 && visibleMode === 'card' ? (
        <div className="gap-3 grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
          {nodes.map((node, index) => (
            <div
              key={node.uuid}
              className={cn('min-w-0', animateItems && 'node-enter')}
              style={
                animateItems
                  ? { animationDelay: `${Math.min(index, nodeItemStaggerLimit) * nodeItemStaggerMs}ms` }
                  : undefined
              }
            >
              <NodeCard node={node} onClick={onNodeClick} onPingClick={onPingClick} />
            </div>
          ))}
        </div>
      ) : nodes.length !== 0 && visibleMode === 'list' ? (
        <NodeList nodes={nodes} onClick={onNodeClick} onPingClick={onPingClick} />
      ) : (
        <Empty
          className="min-h-44 wrap-anywhere rounded-xl border bg-card text-center shadow-xs [&>svg]:size-8"
          description={
            query
              ? `没有匹配「${query}」的${statusLabel}节点`
              : statusLabel
                ? `当前分组没有${statusLabel}节点`
                : '暂无节点'
          }
          extra={
            (query || statusLabel) && (
              <Button variant="outline" size="sm" onClick={resetFilters}>
                {query && statusLabel ? '清除搜索和状态筛选' : query ? '清除搜索' : '查看全部状态'}
              </Button>
            )
          }
        />
      )}
    </Suspense>
  )
}
