import type { NodeData } from '@/stores/nodes'
import { Icon } from '@iconify/react'
import { lazy, Suspense } from 'react'
import { useBackgroundSurface } from '@/hooks/useBackgroundSurface'
import { cn } from '@/lib/utils'
import { getCountryCodeFromRegion } from '@/utils/geoHelper'
import { getRegionDisplayName } from '@/utils/regionHelper'

const NodeEarthGlobe = lazy(() => import('@/components/NodeEarthGlobe'))
const NodeEarthMaps = lazy(() => import('@/components/NodeEarthMaps'))

export default function OverviewGeography({
  nodes,
  maps,
  suspendMotion,
  spanRows,
}: {
  nodes: NodeData[]
  maps: boolean
  suspendMotion: boolean
  spanRows: boolean
}) {
  const { pickSurfaceClass } = useBackgroundSurface()
  const regions = new Map<string, { name: string; count: number }>()
  for (const node of nodes) {
    const code = getCountryCodeFromRegion(node.region)
    if (!code) continue
    const region = regions.get(code)
    if (region) region.count++
    else regions.set(code, { name: getRegionDisplayName(node.region), count: 1 })
  }
  const regionList = [...regions].sort((a, b) => b[1].count - a[1].count)
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col overflow-hidden border-b lg:col-start-2 lg:row-start-1 lg:max-h-[30rem] lg:rounded-xl lg:border',
        spanRows && 'lg:row-span-2',
        pickSurfaceClass('bg-card lg:shadow-xs', 'bg-card/85 backdrop-blur-sm'),
      )}
    >
      <div className="flex items-center gap-2 px-4 pt-3.5">
        <Icon icon="lucide:globe" aria-hidden="true" className="size-4 text-muted-foreground" />
        <span className="font-atlas text-value font-semibold">节点分布</span>
        <span className="num ml-auto text-xs font-normal text-muted-foreground">{regions.size} 个地区</span>
      </div>
      <div className="relative isolate h-52 overflow-hidden sm:h-60 lg:h-auto lg:min-h-36 lg:flex-1">
        <Suspense fallback={null}>
          {maps ? (
            <NodeEarthMaps nodes={nodes} />
          ) : (
            <NodeEarthGlobe nodes={nodes} suspendMotion={suspendMotion} className="absolute inset-0 h-full w-full" />
          )}
        </Suspense>
      </div>
      {regionList.length > 0 && (
        <ul
          aria-label="各地区节点数"
          className="mx-4 grid max-h-32 min-w-0 overflow-y-auto grid-cols-[repeat(auto-fit,minmax(min(100%,6.5rem),1fr))] gap-x-5 gap-y-1.5 border-t py-2.5 text-xs text-muted-foreground"
        >
          {regionList.map(([code, region]) => (
            <li key={code} className="flex min-w-0 items-center gap-1.5">
              <img src={`/assets/flags/${code}.svg`} alt="" className="h-3 w-4 shrink-0 rounded-[2px] object-cover" />
              <span className="truncate" title={region.name}>
                {region.name}
              </span>
              <span className="num ml-auto text-compact font-medium text-foreground">
                {region.count}
                <span className="ml-1 text-2xs font-normal text-muted-foreground">台</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
