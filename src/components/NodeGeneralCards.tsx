import type { NodeData } from '@/stores/nodes'
import { lazy, Suspense } from 'react'
import OverviewMetricCard from '@/components/overview/OverviewMetricCard'
import OverviewFinanceCard from '@/components/overview/OverviewFinanceCard'
import { useNodeOverview } from '@/hooks/useNodeOverview'
import { useAppStore } from '@/stores/app'
import { useNodesStore } from '@/stores/nodes'
import { cn } from '@/lib/utils'

const NodeEarthGlobe = lazy(() => import('@/components/NodeEarthGlobe'))
const NodeEarthMaps = lazy(() => import('@/components/NodeEarthMaps'))

interface NodeGeneralCardsProps {
  nodes?: NodeData[]
  globeNodes?: NodeData[]
  transitionKey?: string
  suspendMotion?: boolean
}

/** 移动端汇总卡覆盖地球下缘，桌面端左右并排；整个概览有明确边界。 */
export default function NodeGeneralCards({
  nodes,
  globeNodes,
  transitionKey = 'all',
  suspendMotion = false,
}: NodeGeneralCardsProps) {
  const mode = useAppStore(state => state.settings.earthViewMode)
  const storeNodes = useNodesStore(state => state.nodes)
  const summaryNodes = nodes ?? storeNodes
  const metrics = useNodeOverview(summaryNodes)
  const showEarth = mode === 'earth' || mode === 'earth-stop'
  const showMaps = mode === 'maps'
  const showVisual = showEarth || showMaps
  return (
    <section
      aria-label="节点概览"
      className={cn('grid gap-3 px-4', showVisual && 'grid-cols-1 gap-0 md:grid-cols-2 md:gap-3')}
    >
      {showVisual && (
        <div
          className={cn(
            'relative isolate col-start-1 row-start-1 h-[clamp(22rem,100vw,26rem)] min-w-0 overflow-hidden md:col-start-2',
            // 桌面端地球不裁切，向下伸到分组工具栏后面；地图需要固定高度
            showEarth ? 'md:h-auto md:overflow-visible' : 'md:h-52',
          )}
        >
          <Suspense fallback={null}>
            {showEarth ? (
              <NodeEarthGlobe
                nodes={globeNodes}
                suspendMotion={suspendMotion}
                className="w-full max-w-88 translate-y-0 md:absolute md:inset-x-0 md:top-0 md:max-w-md md:-translate-y-12"
              />
            ) : (
              <NodeEarthMaps nodes={globeNodes} />
            )}
          </Suspense>
        </div>
      )}
      <div
        className={cn(
          'grid min-w-0 grid-cols-3 gap-2',
          showVisual ? 'relative z-10 col-start-1 row-start-1 self-end md:self-stretch' : 'lg:grid-cols-6',
        )}
      >
        <OverviewMetricCard {...metrics.memory} transitionKey={transitionKey} index={0} />
        <OverviewFinanceCard nodes={summaryNodes} transitionKey={transitionKey} />
        <OverviewMetricCard {...metrics.speedUp} transitionKey={transitionKey} index={2} />
        <OverviewMetricCard {...metrics.disk} transitionKey={transitionKey} index={3} />
        <OverviewMetricCard {...metrics.traffic} transitionKey={transitionKey} index={4} />
        <OverviewMetricCard {...metrics.speedDown} transitionKey={transitionKey} index={5} />
      </div>
    </section>
  )
}
