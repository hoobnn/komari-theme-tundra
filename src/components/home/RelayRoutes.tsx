import type { PingRecord } from '@/utils/rpc'
import type { RelayRouteConfig } from '@/utils/relayRoutes'
import type { PingReading } from '@/utils/pingDisplay'
import { Fragment, useLayoutEffect, useRef, useState } from 'react'
import PingValue from '@/components/PingValue'
import { DataTooltip } from '@/components/ui/data-tooltip'
import { useSharedPingRecords } from '@/hooks/useNodePingStats'
import { useThemeSettings } from '@/stores/app'
import { cn } from '@/lib/utils'
import { summarizeRelayLeg } from '@/utils/relayRoutes'
import { describePing, pingLatencyTone, pingStatusLabel } from '@/utils/pingDisplay'
import { pingStackLabel } from '@/utils/pingStack'

type Stack = 'v4' | 'v6' | null

interface RouteLine {
  route: RelayRouteConfig
  stack: Stack
  legs: PingReading[]
  total: PingReading
}

const parseStack = (name: string): { stack: Stack; base: string } => {
  const stack: Stack = /IPv6/i.test(name) ? 'v6' : /IPv4/i.test(name) ? 'v4' : null
  return { stack, base: stack ? name.replace(/\s*[·|—-]?\s*IPv[46]\s*$/i, '').trim() : name }
}

/** 同名、同节点的 v4 / v6 线路合成一组，共用站点，各占一条轨道。 */
function groupRoutes(routes: RelayRouteConfig[]) {
  const groups = new Map<
    string,
    { name: string; nodes: string[]; routes: { route: RelayRouteConfig; stack: Stack }[] }
  >()
  for (const route of routes) {
    const { stack, base } = parseStack(route.name)
    const key = JSON.stringify([base, ...route.nodes])
    const group = groups.get(key) ?? { name: base, nodes: route.nodes, routes: [] }
    group.routes.push({ route, stack })
    groups.set(key, group)
  }
  return [...groups.values()].map(group => ({
    ...group,
    routes: group.routes.toSorted((a, b) => (a.stack === 'v6' ? 1 : 0) - (b.stack === 'v6' ? 1 : 0)),
  }))
}

interface SummaryProps {
  name: string
  nodes: string[]
  lines: RouteLine[]
  order: number
}

function relayTotal(legs: PingReading[]): PingReading {
  if (legs.includes('lost')) return 'lost'
  let sum = 0
  for (const leg of legs) {
    if (typeof leg !== 'number') return leg
    sum += leg
  }
  return sum
}

/** 合并同一协议内相邻的正常段，每个连续区间播放一道流光。 */
function connectedSpans(legs: PingReading[]) {
  const spans: { start: number; length: number }[] = []
  for (const [index, leg] of legs.entries()) {
    if (typeof leg !== 'number') continue
    const previous = spans.at(-1)
    if (previous && previous.start + previous.length === index) previous.length += 1
    else spans.push({ start: index, length: 1 })
  }
  return spans
}

function RouteLane({ line, row, order }: { line: RouteLine; row: number; order: number }) {
  const below = line.stack === 'v6' || row > 0
  const trackRow = below ? 1 : 2
  return (
    <span
      className={cn(
        'col-span-full grid grid-cols-subgrid',
        below ? 'grid-rows-[0.5rem_1rem]' : 'grid-rows-[1rem_0.5rem]',
      )}
    >
      {line.legs.map((leg, index) => {
        // 站点和探测段交替占列，各协议共享同一组列宽。
        const gridColumn = index * 2 + 2
        const label = `${pingStackLabel(line.stack) || 'Ping'} ${line.route.nodes[index]} → ${line.route.nodes[index + 1]}`
        return (
          <Fragment key={index}>
            <DataTooltip
              as="span"
              content={`${label} · ${describePing(leg, 1)}`}
              style={{ gridColumn, gridRow: below ? 2 : 1 }}
              className={cn(
                'num relative flex justify-center px-1 text-2xs leading-none',
                below ? 'items-start' : 'items-end',
              )}
            >
              <span className="sr-only">{label} </span>
              <PingValue value={leg} decimals={1} unit />
            </DataTooltip>
            <span
              aria-hidden="true"
              data-flowing={typeof leg === 'number' || undefined}
              style={{ gridColumn, gridRow: trackRow }}
              className={cn(
                'relay-routes-track relative self-center border-t-2',
                line.stack === 'v6' && 'border-dashed',
                pingLatencyTone(leg).line,
              )}
            />
          </Fragment>
        )
      })}
      {connectedSpans(line.legs).map(({ start, length }) => (
        <span
          key={start}
          aria-hidden="true"
          className="pointer-events-none relative z-10 overflow-x-clip"
          style={{ gridColumn: `${start * 2 + 2} / span ${length * 2 - 1}`, gridRow: trackRow }}
        >
          <span
            className="relay-routes-flow absolute inset-0"
            style={{
              animationDelay: `${-(order * 1.1 + row * 0.8 + start * 0.4)}s`,
              animationDuration: length === 1 ? '2.8s' : undefined,
            }}
          >
            <span className="relay-routes-comet absolute top-1/2 right-full h-0.5 w-7 -translate-y-1/2 rounded-full" />
          </span>
        </span>
      ))}
    </span>
  )
}

function PathSummary({ name, nodes, lines, order }: SummaryProps) {
  const trackRef = useRef<HTMLSpanElement>(null)
  const [overflows, setOverflows] = useState(false)
  useLayoutEffect(() => {
    const track = trackRef.current
    if (!track || !track.firstElementChild) return undefined
    const measure = () => setOverflows(track.scrollWidth > track.clientWidth + 1)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(track)
    observer.observe(track.firstElementChild)
    return () => observer.disconnect()
  }, [])
  return (
    <span className="flex flex-col gap-2">
      <span className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1.5">
        <span className="min-w-0 wrap-anywhere text-compact font-semibold tracking-tight">{name}</span>
        <span className="ms-auto flex max-w-full flex-wrap items-baseline justify-end gap-x-4 gap-y-1">
          {lines.map(line => (
            <DataTooltip
              as="span"
              key={line.route.name}
              className="inline-flex items-baseline gap-1.5 whitespace-nowrap text-xs"
              content={`${line.route.name} · 分段合计 ${describePing(line.total, 1)}`}
            >
              <span className="text-3xs text-muted-foreground">{pingStackLabel(line.stack) || '合计'}</span>
              {line.total === 'loading' || line.total === 'error' ? (
                <span className="text-xs text-muted-foreground">{pingStatusLabel[line.total]}</span>
              ) : (
                <PingValue value={line.total} decimals={1} unit />
              )}
            </DataTooltip>
          ))}
        </span>
      </span>
      <span
        ref={trackRef}
        tabIndex={overflows ? 0 : undefined}
        role={overflows ? 'region' : undefined}
        aria-label={overflows ? `${name} 站点与分段延迟，可横向滚动` : undefined}
        className="min-w-0 overflow-x-auto overscroll-x-contain rounded-sm focus-visible:outline-2 focus-visible:outline-ring"
      >
        <span
          className="grid w-full min-w-max items-center [--relay-leg-min:4rem] @max-[23rem]:[--relay-leg-min:3rem]"
          style={{
            gridTemplateColumns: `repeat(${nodes.length - 1}, max-content minmax(var(--relay-leg-min), 1fr)) max-content`,
          }}
        >
          {nodes.map((node, index) => (
            <span
              key={index}
              style={{ gridColumn: index * 2 + 1 }}
              className="relative z-20 row-start-1 max-w-32 wrap-anywhere rounded-md border bg-card px-2.5 py-1.5 text-center text-compact font-semibold leading-4 text-foreground @max-[23rem]:px-1.5 @max-[23rem]:text-xs"
            >
              {node}
            </span>
          ))}
          <span className="col-span-full row-start-1 grid grid-cols-subgrid gap-y-1">
            {lines.length === 1 && lines[0].stack === 'v6' && <span aria-hidden="true" className="col-span-full h-4" />}
            {lines.map((line, row) => (
              <RouteLane key={line.route.name} line={line} row={row} order={order} />
            ))}
            {lines.length === 1 && lines[0].stack !== 'v6' && <span aria-hidden="true" className="col-span-full h-4" />}
          </span>
        </span>
      </span>
    </span>
  )
}

function RouteGroup({
  name,
  nodes,
  routes,
  records,
  error,
  now,
  order,
}: {
  name: string
  nodes: string[]
  routes: { route: RelayRouteConfig; stack: Stack }[]
  records: Map<string, PingRecord[]> | undefined
  error: string | null
  now: number
  order: number
}) {
  const missing = error ? 'error' : records ? 'missing' : 'loading'
  const lines: RouteLine[] = routes.map(({ route, stack }) => {
    const legs = route.legs.map((config): PingReading => {
      const leg = summarizeRelayLeg(config, records?.get(config.client) ?? [], now)
      return leg.state === 'lost' || leg.state === 'stale' ? leg.state : (leg.latency ?? missing)
    })
    return { route, stack, legs, total: relayTotal(legs) }
  })
  const summaryTitle = lines
    .map(line => `${line.route.name} · ${nodes.join(' → ')} · 分段合计 ${describePing(line.total, 1)}`)
    .join('\n')
  return (
    <div title={summaryTitle} className="relay-route @container min-w-0 rounded-xl border bg-card px-4 py-3 shadow-xs">
      <PathSummary name={name} nodes={nodes} lines={lines} order={order} />
    </div>
  )
}

export default function RelayRoutes() {
  const settings = useThemeSettings()
  const config = settings.relayRoutes
  const snapshot = useSharedPingRecords(1, settings.relayRoutesEnabled && config.routes.length > 0)
  if (!settings.relayRoutesEnabled) return null
  return (
    <section
      aria-label="线路延迟"
      className="@container relative z-10 min-w-0"
      data-relay-motion={settings.disablePageAnimation ? 'off' : 'on'}
    >
      <div className="grid min-w-0 items-start gap-3 @min-[36rem]:grid-cols-2">
        <h2 className="sr-only">线路延迟</h2>
        {config.error || !config.routes.length ? (
          <p
            role="status"
            className="col-span-full rounded-xl border bg-card px-4 py-3 text-compact text-muted-foreground shadow-xs"
          >
            {config.error ?? '请在主题设置中配置线路节点和 Ping 任务。'}
          </p>
        ) : (
          groupRoutes(config.routes).map((group, index) => (
            <RouteGroup
              key={group.routes[0].route.name}
              {...group}
              order={index}
              records={snapshot.data?.recordsByClient}
              error={snapshot.error}
              now={snapshot.observedAt}
            />
          ))
        )}
      </div>
    </section>
  )
}
