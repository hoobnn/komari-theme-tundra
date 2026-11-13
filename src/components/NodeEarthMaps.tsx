import type { EChartsCoreOption } from 'echarts/core'
import type { NodeData } from '@/stores/nodes'
import { useEffect, useState } from 'react'
import { EChart } from '@/components/EChart'
import { Empty } from '@/components/ui/empty'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { useIsDark } from '@/stores/app'
import { useNodesStore } from '@/stores/nodes'
import { ensureWorldMapRegistered } from '@/utils/echartsWorldMap'
import { getCoordByCode, getCountryCodeFromRegion } from '@/utils/geoHelper'
import { getRegionDisplayName } from '@/utils/regionHelper'

interface EarthMapPoint {
  code: string
  name: string
  coord: [number, number]
  online: number
  offline: number
  total: number
}

interface NodeEarthMapsProps {
  nodes?: NodeData[]
  className?: string
}

const regionDisplayNames =
  typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames(['zh-Hans'], { type: 'region' }) : null

function resolveCountryDisplayName(region: string, code: string): string {
  const regionName = getRegionDisplayName(region)
  if (regionName !== region) return regionName

  return regionDisplayNames?.of(code) ?? code
}

function buildPoints(nodes: NodeData[]): EarthMapPoint[] {
  const map = new Map<string, EarthMapPoint>()
  for (const node of nodes) {
    const code = getCountryCodeFromRegion(node.region)
    if (!code) continue
    const coord = getCoordByCode(code)
    if (!coord) continue
    const current = map.get(code)
    if (!current) {
      map.set(code, {
        code,
        name: resolveCountryDisplayName(node.region, code),
        coord,
        online: node.online ? 1 : 0,
        offline: node.online ? 0 : 1,
        total: 1,
      })
      continue
    }
    current.total += 1
    current.online += node.online ? 1 : 0
    current.offline += node.online ? 0 : 1
  }

  return Array.from(map.values()).sort((a, b) => b.online - a.online || b.total - a.total)
}

export default function NodeEarthMaps({ nodes, className }: NodeEarthMapsProps) {
  const isDark = useIsDark()
  const earthNodes = useNodesStore(state => state.earthNodes)
  const displayNodes = nodes ?? earthNodes
  const [mapName, setMapName] = useState<string>()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ensureWorldMapRegistered()
      .then(name => {
        if (!cancelled) setMapName(name)
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : '地图资源加载失败')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const points = buildPoints(displayNodes)

  const totalServers = displayNodes.length
  const onlineServers = displayNodes.filter(node => node.online).length
  const offlineServers = totalServers - onlineServers

  const colors = {
    areaColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.06)',
    borderColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(15, 23, 42, 0.06)',
    hoverBorderColor: isDark ? 'rgba(16, 185, 129, 0.9)' : 'rgba(5, 150, 105, 0.85)',
    activeAreaColor: isDark ? 'rgba(16, 185, 129, 0.52)' : 'rgba(16, 185, 129, 0.36)',
    offlineAreaColor: isDark ? 'rgba(234, 179, 8, 0.32)' : 'rgba(202, 138, 4, 0.22)',
    activeBorderColor: isDark ? 'rgba(16, 185, 129, 0.95)' : 'rgba(5, 150, 105, 0.92)',
    offlineBorderColor: isDark ? 'rgba(234, 179, 8, 0.8)' : 'rgba(202, 138, 4, 0.88)',
    dotEmerald: isDark ? 'rgba(16, 185, 129, 0.92)' : 'rgba(5, 150, 105, 0.9)',
    dotYellow: isDark ? 'rgba(234, 179, 8, 0.92)' : 'rgba(202, 138, 4, 0.9)',
    text: isDark ? 'rgba(255, 255, 255, 0.85)' : 'rgba(0, 0, 0, 0.85)',
    textSecondary: isDark ? 'rgba(255, 255, 255, 0.55)' : 'rgba(0, 0, 0, 0.55)',
    tooltipBg: isDark ? 'rgba(40, 40, 40, 0.95)' : 'rgba(255, 255, 255, 0.8)',
    tooltipShadow: isDark ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.06)',
  }

  const mapSeriesData = points.map(point => ({
    name: point.code,
    value: point.total,
    itemStyle: {
      areaColor: point.online > 0 ? colors.activeAreaColor : colors.offlineAreaColor,
      borderColor: point.online > 0 ? colors.activeBorderColor : colors.offlineBorderColor,
      borderWidth: 0.5,
    },
    emphasis: {
      itemStyle: {
        areaColor: point.online > 0 ? colors.activeAreaColor : colors.offlineAreaColor,
        borderColor: point.online > 0 ? colors.activeBorderColor : colors.offlineBorderColor,
      },
    },
  }))

  const scatterData = points.map(point => ({
    name: point.name,
    code: point.code,
    value: [point.coord[1], point.coord[0], point.total],
    online: point.online,
    offline: point.offline,
    symbolSize: point.total <= 1 ? 8 : 14,
    label: { show: point.total > 1 },
    itemStyle: {
      color: point.offline > 0 ? colors.dotYellow : colors.dotEmerald,
    },
  }))

  const chartOption: EChartsCoreOption = {
    animationDurationUpdate: 300,
    animationEasingUpdate: 'cubicOut',
    tooltip: {
      trigger: 'item',
      confine: true,
      backgroundColor: colors.tooltipBg,
      borderColor: 'transparent',
      borderWidth: 0,
      borderRadius: 6,
      className: 'tundra-chart-tooltip',
      textStyle: {
        color: colors.text,
        fontSize: 12,
        lineHeight: 20,
      },
      extraCssText: `padding: 3px 6px;backdrop-filter: blur(5px);z-index:9;box-shadow:0 0 0 0.5px ${colors.tooltipShadow}, 0 0 16px ${colors.tooltipShadow}`,
      formatter: (params: unknown) => {
        const p = params as { name: string; data: { code: string; online: number; offline: number } }
        if (!p.data) return ''
        const flag = `<img src="/assets/flags/${p.data.code}.svg" style="width:16px;height:16px;vertical-align:middle;margin-right:2px" />`
        const dot = (color: string) =>
          `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${color}"></span>`
        const online = `<span style="display:flex;gap:4px;align-items:center">${dot(colors.dotEmerald)} ${p.data.online}</span>`
        const offline =
          p.data.offline > 0
            ? ` <span style="display:flex;gap:4px;align-items:center">${dot(colors.dotYellow)} ${p.data.offline}</span>`
            : ''
        return `<div style="line-height:1.4"><span style="display:flex;gap:2px;align-items:center;">${flag}${p.name}</span><div style="display:flex;gap:8px;align-items:center;color:${colors.textSecondary}">${online}${offline}</div></div>`
      },
    },
    geo: {
      map: mapName,
      roam: false,
      left: 'center',
      top: 'center',
      width: '100%',
      silent: true,
      itemStyle: {
        areaColor: 'transparent',
        borderColor: 'transparent',
      },
      emphasis: {
        itemStyle: {
          areaColor: 'transparent',
          borderColor: 'transparent',
        },
        label: { show: false },
      },
      label: { show: false },
    },
    series: [
      {
        type: 'map',
        map: mapName,
        roam: false,
        selectedMode: false,
        left: 'center',
        top: 'center',
        width: '100%',
        tooltip: { show: false },
        emphasis: {
          label: { show: false },
          itemStyle: {
            areaColor: colors.borderColor,
            borderColor: colors.hoverBorderColor,
            borderWidth: 0.5,
          },
        },
        itemStyle: {
          areaColor: colors.areaColor,
          borderColor: colors.borderColor,
          borderWidth: 0.5,
        },
        data: mapSeriesData,
        label: { show: false },
      },
      {
        type: 'scatter',
        coordinateSystem: 'geo',
        data: scatterData,
        symbol: 'circle',
        itemStyle: {
          color: colors.dotEmerald,
          borderColor: '#ffffff',
          borderWidth: 1,
        },
        label: {
          fontSize: 10,
          color: '#ffffff',
          formatter: (params: unknown) => {
            const p = params as { value: Array<number | string> }
            const total = typeof p.value?.[2] === 'number' ? p.value[2] : 0
            return String(total)
          },
        },
        emphasis: {
          scale: 1.3,
        },
      },
    ],
  }

  return (
    <div className={cn('relative h-full border-none', className)}>
      {/* 预加载国旗图片，避免 tooltip 重复请求 */}
      <div className="hidden">
        {points.map(point => (
          <img key={point.code} src={`/assets/flags/${point.code}.svg`} />
        ))}
      </div>
      <div className="relative flex h-full min-h-0 flex-col items-center">
        {totalServers > 0 && (
          <div className="absolute top-0 right-0 z-2 text-[11px] text-muted-foreground pointer-events-none flex gap-2 items-center backdrop-blur-lg bg-background/60 rounded px-2 py-0.5">
            {onlineServers > 0 && (
              <div className="flex items-center gap-1">
                <span className="inline-block size-1.5 rounded-full bg-green-600 animate-pulse" />
                <span className="text-green-600">{onlineServers}</span>
              </div>
            )}
            {offlineServers > 0 && (
              <div className="flex items-center gap-1">
                <span className="inline-block size-1.5 rounded-full bg-yellow-600 animate-pulse" />
                <span className="text-yellow-600">{offlineServers}</span>
              </div>
            )}
          </div>
        )}

        <div className="relative min-h-0 flex-1 w-full">
          <Spinner show={loading} className="h-full w-full" contentClass="!bg-transparent">
            {mapName ? (
              <EChart option={chartOption} className="h-full w-full" />
            ) : loadError ? (
              <Empty description="地图资源加载失败" className="h-full" />
            ) : null}
          </Spinner>
        </div>
      </div>
    </div>
  )
}
