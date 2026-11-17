import type { NodeData } from '@/stores/nodes'
import type { NodeViewMode } from '@/stores/app'
import { lazy, Suspense } from 'react'
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
  clearSearch: () => void
  onNodeClick: (node: NodeData) => void
  onPingClick: (node: NodeData, trigger: HTMLElement) => void
}

export default function NodeResults({
  nodes,
  viewMode,
  query,
  clearSearch,
  onNodeClick,
  onPingClick,
}: NodeResultsProps) {
  const animateItems = !useAppStore(state => state.settings.disablePageAnimation)
  return (
    <Suspense fallback={null}>
      {nodes.length !== 0 && viewMode === 'card' ? (
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
      ) : nodes.length !== 0 && viewMode === 'list' ? (
        <NodeList nodes={nodes} onClick={onNodeClick} onPingClick={onPingClick} />
      ) : query.length > 0 ? (
        <Empty
          className="min-h-44 wrap-anywhere rounded-xl border bg-card text-center shadow-xs [&>svg]:size-8"
          description={`没有匹配「${query}」的节点`}
          extra={
            <Button variant="outline" size="sm" onClick={clearSearch}>
              清除搜索
            </Button>
          }
        />
      ) : (
        <div className="text-muted-foreground text-center py-8">
          <Empty description="暂无节点" />
        </div>
      )}
    </Suspense>
  )
}
