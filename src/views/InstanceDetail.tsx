import { Icon } from '@iconify/react'
import type { ReactNode } from 'react'
import { Activity, lazy, Suspense } from 'react'
import { Link, useParams } from 'react-router'
import ChartPlaceholder from '@/components/charts/ChartPlaceholder'
import { Button } from '@/components/ui/button'
import { CardX } from '@/components/ui/card-x'
import { Empty } from '@/components/ui/empty'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useBackgroundSurface } from '@/hooks/useBackgroundSurface'
import { useDetailNavigation } from '@/hooks/useDetailNavigation'
import type { DetailSection } from '@/hooks/useDetailNavigation'
import { useNodeFormatters } from '@/hooks/useNodeFormatters'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/stores/app'
import { useNode } from '@/stores/nodes'
import { formatDateTime } from '@/utils/helper'
import { hasRegion } from '@/utils/nodeHelpers'
import { getFlagSrc, getRegionDisplayName } from '@/utils/regionHelper'

const LoadChart = lazy(() => import('@/components/LoadChart'))
const PingChart = lazy(() => import('@/components/PingChart'))
const NodeSpecifications = lazy(() => import('@/components/detail/NodeSpecifications'))

const sections = [
  { value: 'load', label: '运行负载' },
  { value: 'latency', label: '延迟与丢包' },
  { value: 'specifications', label: '规格与费用' },
] as const

function DetailPanel({
  value,
  selected,
  children,
}: {
  value: DetailSection
  selected: DetailSection
  children: ReactNode
}) {
  const active = value === selected
  return (
    <TabsContent
      forceMount
      value={value}
      hidden={!active}
      className="min-w-0 rounded-md focus-visible:outline-2 focus-visible:outline-ring"
    >
      <Activity mode={active ? 'visible' : 'hidden'}>
        <Suspense fallback={<ChartPlaceholder />}>{children}</Suspense>
      </Activity>
    </TabsContent>
  )
}

export default function InstanceDetail() {
  const { id = '' } = useParams()
  const node = useNode(id)
  const { detailRef, section, selectSection } = useDetailNavigation(node?.uuid)
  const { pickSurfaceClass } = useBackgroundSurface()
  const { formatUptime } = useNodeFormatters()
  const animate = !useAppStore(state => state.settings.disablePageAnimation)
  const surface = pickSurfaceClass('bg-card shadow-xs', 'bg-card/85 backdrop-blur-sm')

  if (!node)
    return (
      <div className="p-4">
        <CardX className={surface}>
          <Empty
            description="节点不存在或已被删除"
            extra={
              <Button asChild>
                <Link to="/">返回首页</Link>
              </Button>
            }
          />
        </CardX>
      </div>
    )

  return (
    <div ref={detailRef} className={cn('instance-detail px-4 pt-3 sm:pt-5', animate && 'page-enter')}>
      <Tabs value={section} onValueChange={selectSection} className="flex-col gap-3" activationMode="manual">
        <div className={cn('overflow-hidden rounded-xl border', surface)}>
          <div className="atlas-plate px-4 pb-4 sm:px-6 sm:pb-5">
            <Link
              to="/"
              aria-label="返回节点列表"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-sm text-xs text-white/85 hover:text-white focus-visible:outline-2 focus-visible:outline-white pointer-coarse:min-h-11"
            >
              <Icon icon="lucide:arrow-left" aria-hidden="true" className="size-3.5" /> 节点列表
            </Link>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5">
              <h1
                tabIndex={-1}
                className="min-w-0 wrap-anywhere text-stat font-semibold leading-tight tracking-tight outline-none sm:text-display"
              >
                {node.name}
              </h1>
              <span className="inline-flex flex-wrap items-center gap-1.5 rounded-md bg-black/55 px-2 py-1 text-xs text-white">
                <span className={cn('size-1.5 rounded-full', node.online ? 'bg-emerald-300' : 'bg-red-300')} />
                <span className={cn('font-medium', !node.online && 'text-red-200')}>
                  {node.online ? '在线' : '离线'}
                </span>
                {node.online && node.uptime > 0 ? (
                  <span className="num">{formatUptime(node.uptime)}</span>
                ) : !node.online && node.time ? (
                  <span>
                    最后上报{' '}
                    <time dateTime={node.time} className="num">
                      {formatDateTime(node.time)}
                    </time>
                  </span>
                ) : null}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/85">
              {hasRegion(node.region) && (
                <span className="inline-flex items-center gap-1.5">
                  <img src={getFlagSrc(node.region)} alt="" className="h-3 w-4 rounded-[2px] object-cover" />
                  {getRegionDisplayName(node.region)}
                </span>
              )}
              {node.os && <span>{node.os}</span>}
              {node.cpu_cores > 0 && <span className="num">{node.cpu_cores} 核</span>}
            </div>
          </div>
          <TabsList
            aria-label="节点详情章节"
            variant="line"
            className="flex h-auto w-full justify-start gap-1 border-t px-2 py-0 sm:px-4"
          >
            {sections.map(item => (
              <TabsTrigger
                key={item.value}
                value={item.value}
                className="h-10 flex-none rounded-none px-2.5 text-compact shadow-none after:inset-x-2.5 after:bottom-0 after:h-0.5 data-[state=active]:shadow-none pointer-coarse:min-h-11"
              >
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <DetailPanel value="load" selected={section}>
          <LoadChart uuid={node.uuid} />
        </DetailPanel>
        <DetailPanel value="latency" selected={section}>
          <PingChart uuid={node.uuid} />
        </DetailPanel>
        <DetailPanel value="specifications" selected={section}>
          <NodeSpecifications data={node} />
        </DetailPanel>
      </Tabs>
    </div>
  )
}
