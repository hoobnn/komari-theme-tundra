import type { NodeData } from '@/stores/nodes'
import type { ReactNode } from 'react'
import { lazy, Suspense } from 'react'
import OverviewMetricCard from '@/components/overview/OverviewMetricCard'
import OverviewFinanceCard from '@/components/overview/OverviewFinanceCard'
import { useNodeOverview } from '@/hooks/useNodeOverview'
import { useBackgroundSurface } from '@/hooks/useBackgroundSurface'
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
  /** 放在概览面板下方、与地球同排的内容（首页传入线路卡） */
  children?: ReactNode
}

/**
 * 桌面端左列是概览面板和线路，右列地球跨两行；移动端汇总面板覆盖地球下缘，线路接在下面。
 */
export default function NodeGeneralCards({
  nodes,
  globeNodes,
  transitionKey = 'all',
  suspendMotion = false,
  children,
}: NodeGeneralCardsProps) {
  const mode = useAppStore(state => state.settings.earthViewMode)
  const storeNodes = useNodesStore(state => state.nodes)
  const summaryNodes = nodes ?? storeNodes
  const metrics = useNodeOverview(summaryNodes)
  const { pickSurfaceClass } = useBackgroundSurface()
  const showEarth = mode === 'earth' || mode === 'earth-stop'
  const showMaps = mode === 'maps'
  const showVisual = showEarth || showMaps
  const traffic = (
    <>
      <span className="inline-flex min-w-0 items-center gap-0.5 truncate">
        <span className="text-emerald-600 dark:text-emerald-400">↑</span>
        <span className="text-foreground/80">{metrics.traffic.up}</span>
      </span>
      <span className="inline-flex min-w-0 items-center gap-0.5 truncate">
        <span className="text-sky-600 dark:text-sky-400">↓</span>
        <span className="text-foreground/80">{metrics.traffic.down}</span>
      </span>
    </>
  )
  return (
    <section
      aria-label="节点概览"
      className={cn(
        'grid gap-3 px-4',
        showVisual && 'grid-cols-1 gap-y-0 md:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] md:gap-3',
      )}
    >
      {showVisual && (
        <div
          className={cn(
            'relative isolate col-start-1 row-start-1 h-[clamp(22rem,100vw,26rem)] min-w-0 overflow-hidden md:col-start-2 md:row-span-2',
            // 桌面端地球不裁切，向下伸到分组工具栏后面；地图铺满右列
            showEarth ? 'md:h-auto md:overflow-visible' : 'md:h-auto md:min-h-52',
          )}
        >
          <Suspense fallback={null}>
            {showEarth ? (
              <NodeEarthGlobe
                nodes={globeNodes}
                suspendMotion={suspendMotion}
                className="w-full max-w-88 md:absolute md:inset-x-0 md:top-0 md:max-w-md md:-translate-y-10 md:[mask-image:linear-gradient(to_bottom,black_62%,transparent_92%)]"
              />
            ) : (
              <NodeEarthMaps nodes={globeNodes} />
            )}
          </Suspense>
        </div>
      )}
      {/* 六项指标合成一块面板，格子之间用实线分隔 */}
      <div
        className={cn(
          'grid min-w-0 grid-cols-2 overflow-hidden rounded-xl border sm:grid-cols-3',
          pickSurfaceClass('bg-card shadow-xs', 'bg-card/60 backdrop-blur-xs'),
          '[&>*]:border-border/70 max-sm:[&>*:nth-child(odd)]:border-r max-sm:[&>*:nth-child(-n+4)]:border-b sm:[&>*:not(:nth-child(3n))]:border-r sm:[&>*:nth-child(-n+3)]:border-b',
          showVisual && 'relative z-10 col-start-1 row-start-1 self-end md:self-start',
        )}
      >
        <OverviewMetricCard
          {...metrics.memory}
          icon="lucide:memory-stick"
          tone="emerald"
          aside={metrics.memory.total}
          transitionKey={transitionKey}
          index={0}
        />
        <OverviewMetricCard
          {...metrics.disk}
          icon="lucide:hard-drive"
          tone="orange"
          aside={metrics.disk.total}
          transitionKey={transitionKey}
          index={1}
        />
        <OverviewFinanceCard nodes={summaryNodes} transitionKey={transitionKey} />
        <OverviewMetricCard
          {...metrics.speedUp}
          icon="lucide:arrow-up"
          tone="emerald"
          transitionKey={transitionKey}
          index={3}
        />
        <OverviewMetricCard
          {...metrics.speedDown}
          icon="lucide:arrow-down"
          tone="sky"
          transitionKey={transitionKey}
          index={4}
        />
        <OverviewMetricCard
          {...metrics.traffic}
          icon="lucide:arrow-down-up"
          tone="violet"
          footer={traffic}
          transitionKey={transitionKey}
          index={5}
        />
      </div>
      {children && (
        <div className={cn('min-w-0 empty:hidden', showVisual && 'max-md:mt-3 md:col-start-1 md:row-start-2')}>
          {children}
        </div>
      )}
    </section>
  )
}
