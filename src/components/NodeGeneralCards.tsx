import type { ReactNode } from 'react'
import { Icon } from '@iconify/react'
import { useId, useState } from 'react'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import type { NodeData } from '@/stores/nodes'
import OverviewMetricCard from '@/components/overview/OverviewMetricCard'
import OverviewFinanceCard from '@/components/overview/OverviewFinanceCard'
import OverviewGeography from '@/components/overview/OverviewGeography'
import { useNodeOverview } from '@/hooks/useNodeOverview'
import { useBackgroundSurface } from '@/hooks/useBackgroundSurface'
import { useAppStore } from '@/stores/app'
import { cn } from '@/lib/utils'

interface NodeGeneralCardsProps {
  nodes: NodeData[]
  globeNodes: NodeData[]
  transitionKey: string
  suspendMotion: boolean
  children: ReactNode
  onShowStatus: (value: 'online' | 'offline') => void
}

export default function NodeGeneralCards({
  nodes,
  globeNodes,
  transitionKey,
  suspendMotion,
  children,
  onShowStatus,
}: NodeGeneralCardsProps) {
  const mode = useAppStore(state => state.settings.earthViewMode)
  const relayEnabled = useAppStore(state => state.settings.relayRoutesEnabled)
  const metrics = useNodeOverview(nodes)
  const { pickSurfaceClass } = useBackgroundSurface()
  const showVisual = mode === 'earth' || mode === 'earth-stop' || mode === 'maps'
  const wide = useMediaQuery('(min-width: 64rem)')
  const [geographyExpanded, setGeographyExpanded] = useState(false)
  const geographyId = useId()
  const geography = showVisual && (
    <OverviewGeography
      nodes={globeNodes}
      maps={mode === 'maps'}
      suspendMotion={suspendMotion}
      spanRows={relayEnabled}
    />
  )
  const online = nodes.filter(node => node.online).length
  const offline = nodes.length - online
  const availability = [
    { value: 'online', label: '在线', count: online, dot: 'bg-emerald-300' },
    { value: 'offline', label: '离线', count: offline, dot: offline ? 'bg-red-300' : 'bg-white/50' },
  ] as const
  const traffic = (
    <>
      <span className="inline-flex min-w-0 items-center gap-0.5" aria-label={`累计上行 ${metrics.traffic.up}`}>
        <span aria-hidden="true" className="text-emerald-700 dark:text-emerald-400">
          ↑
        </span>
        {metrics.traffic.up}
      </span>
      <span className="inline-flex min-w-0 items-center gap-0.5" aria-label={`累计下行 ${metrics.traffic.down}`}>
        <span aria-hidden="true" className="text-sky-700 dark:text-sky-400">
          ↓
        </span>
        {metrics.traffic.down}
      </span>
    </>
  )
  return (
    <div
      className={cn(
        'mx-4 grid items-stretch gap-2.5 sm:gap-3',
        showVisual && 'lg:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)]',
      )}
    >
      <section
        aria-label="节点概览"
        className={cn(
          'min-w-0 overflow-hidden rounded-xl border',
          pickSurfaceClass('bg-card shadow-xs', 'bg-card/85 backdrop-blur-sm'),
        )}
      >
        <div className="atlas-plate flex min-h-24 flex-col items-start justify-center gap-1 px-4 py-2 sm:min-h-34 sm:gap-2 sm:px-6 sm:py-4">
          <div className="flex max-w-full items-baseline gap-3">
            <h1 className="shrink-0 font-atlas text-display font-semibold leading-tight tracking-wide sm:text-masthead">
              运行概览
            </h1>
            <span className="truncate text-xs font-medium text-white/85">
              {transitionKey === 'all' ? '全部节点' : transitionKey}
            </span>
          </div>
          <div className="-ml-1.5 flex w-full items-center gap-2 whitespace-nowrap text-xs">
            {availability.map(item => (
              <button
                key={item.value}
                type="button"
                aria-label={`查看${item.count}个${item.label}节点`}
                onClick={() => onShowStatus(item.value)}
                className="inline-flex min-h-7 cursor-pointer items-center gap-1.5 rounded-md px-1.5 text-white/90 hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white pointer-coarse:min-h-11"
              >
                <span className={cn('size-1.5 rounded-full', item.dot)} />
                <span className="num text-compact font-semibold text-white">{item.count}</span>
                {item.label}
              </button>
            ))}
            {showVisual && !wide && (
              <button
                type="button"
                aria-controls={geographyId}
                aria-expanded={geographyExpanded}
                onClick={() => setGeographyExpanded(!geographyExpanded)}
                className="ml-auto inline-flex min-h-8 items-center gap-1.5 rounded-md bg-slate-950/60 px-2 text-xs text-white hover:bg-slate-950/80 focus-visible:outline-2 focus-visible:outline-white pointer-coarse:min-h-11"
              >
                <Icon icon="lucide:globe" className="size-3.5" aria-hidden="true" />
                节点分布
                <Icon
                  icon="lucide:chevron-down"
                  className={cn('size-3 motion-safe:transition-transform', geographyExpanded && 'rotate-180')}
                  aria-hidden="true"
                />
              </button>
            )}
          </div>
        </div>
        {showVisual && !wide && (
          <div id={geographyId} hidden={!geographyExpanded}>
            {geographyExpanded && geography}
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 [&>*]:border-border/80 max-sm:[&>*:nth-child(odd)]:border-r max-sm:[&>*:nth-child(-n+4)]:border-b sm:[&>*:nth-child(-n+4)]:border-r sm:[&>*:nth-child(-n+2)]:border-b">
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
          <OverviewFinanceCard nodes={nodes} transitionKey={transitionKey} />
          <OverviewMetricCard
            {...metrics.traffic}
            icon="lucide:arrow-down-up"
            tone="violet"
            footer={traffic}
            transitionKey={transitionKey}
            index={5}
          />
        </div>
      </section>
      {wide && geography}
      {children}
    </div>
  )
}
