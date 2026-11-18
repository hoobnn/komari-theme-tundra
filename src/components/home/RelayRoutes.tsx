import type { CSSProperties } from 'react'
import type { PingRecord } from '@/utils/rpc'
import type { RelayRouteConfig } from '@/utils/relayRoutes'
import type { PingReading } from '@/utils/pingDisplay'
import type { PingStack } from '@/utils/pingStack'
import { Icon } from '@iconify/react'
import { Popover } from 'radix-ui'
import { Fragment, useLayoutEffect, useRef, useState } from 'react'
import { useSharedPingRecords } from '@/hooks/useNodePingStats'
import { useThemeSettings } from '@/stores/app'
import { cn } from '@/lib/utils'
import { summarizeRelayLeg } from '@/utils/relayRoutes'
import { describePing, formatPingLoss, pingLatencyTone, pingLossTone, pingStatusLabel } from '@/utils/pingDisplay'
import { pingStackLabel } from '@/utils/pingStack'

type Stack = PingStack | null
type Leg = ReturnType<typeof summarizeRelayLeg> & { reading: PingReading }
interface RouteLine {
  route: RelayRouteConfig
  stack: Stack
  legs: Leg[]
  total: PingReading
}

function groupRoutes(routes: RelayRouteConfig[]) {
  const groups = new Map<
    string,
    { name: string; nodes: string[]; routes: { route: RelayRouteConfig; stack: Stack }[] }
  >()
  for (const route of routes) {
    const suffix = /(?:\s*[·|—_-]?\s*IPv([46])|[\s·|—_-]+v([46]))$/i.exec(route.name)
    const stack = suffix ? ((suffix[1] ?? suffix[2]) === '6' ? 'v6' : 'v4') : null
    const name = (suffix ? route.name.slice(0, suffix.index).trim() : route.name) || route.name
    const key = JSON.stringify([stack ? 'stack' : 'plain', name, ...route.nodes])
    const group = groups.get(key) ?? { name, nodes: route.nodes, routes: [] }
    group.routes.push({ route, stack })
    groups.set(key, group)
  }
  return [...groups.values()].map(group => ({
    ...group,
    routes: group.routes.toSorted((a, b) => Number(a.stack === 'v6') - Number(b.stack === 'v6')),
  }))
}

function relayTotal(legs: Leg[]): PingReading {
  if (legs.some(leg => leg.reading === 'lost')) return 'lost'
  let sum = 0
  for (const { reading } of legs) {
    if (typeof reading !== 'number') return reading
    sum += reading
  }
  return sum
}

function RelayReading({ value }: { value: PingReading }) {
  return (
    <span className={cn('num whitespace-nowrap', pingLatencyTone(value).text)}>
      {typeof value === 'number' ? (
        <>
          {Number(value.toFixed(1))}
          <small className="ms-0.5 text-3xs font-normal text-muted-foreground">ms</small>
        </>
      ) : (
        <span className="text-xs font-medium">{value === 'stale' ? '已过期' : pingStatusLabel[value]}</span>
      )}
    </span>
  )
}

/** 同一行内连续可达的段共用一道扫光，超时或缺测处自然断开。 */
function connectedSpans(legs: Leg[]) {
  const spans: { start: number; length: number }[] = []
  for (const [index, leg] of legs.entries()) {
    if (typeof leg.reading !== 'number') continue
    const previous = spans.at(-1)
    if (previous && previous.start + previous.length === index) previous.length += 1
    else spans.push({ start: index, length: 1 })
  }
  return spans
}

function RouteLane({
  line,
  start,
  end,
  row,
  order,
}: {
  line: RouteLine
  start: number
  end: number
  row: number
  order: number
}) {
  const below = line.stack === 'v6' || row > 0
  const trackRow = below ? 1 : 2
  const legs = line.legs.slice(start, end)
  return (
    <div
      aria-hidden="true"
      className={cn(
        'col-span-full grid grid-cols-subgrid',
        below ? 'grid-rows-[0.45rem_1.2rem]' : 'grid-rows-[1.2rem_0.45rem]',
      )}
    >
      {legs.map(({ reading }, i) => (
        <Fragment key={i}>
          <span
            style={{ gridColumn: i * 2 + 2, gridRow: below ? 2 : 1 }}
            className={cn('flex justify-center text-xs font-medium leading-tight', below ? 'items-start' : 'items-end')}
          >
            <RelayReading value={reading} />
          </span>
          <span
            aria-hidden="true"
            data-flowing={typeof reading === 'number' || undefined}
            style={{ gridColumn: i * 2 + 2, gridRow: trackRow }}
            className={cn(
              'relay-routes-track relative self-center border-t-2',
              line.stack === 'v6' && 'border-dashed',
              pingLatencyTone(reading).line,
            )}
          />
        </Fragment>
      ))}
      {connectedSpans(legs).map(span => (
        <span
          key={span.start}
          aria-hidden="true"
          className="pointer-events-none relative z-10 overflow-x-clip"
          style={{ gridColumn: `${span.start * 2 + 2} / span ${span.length * 2 - 1}`, gridRow: trackRow }}
        >
          <span
            className="relay-routes-flow absolute inset-0"
            style={{
              animationDelay: `${-(order * 1.1 + row * 0.8 + (start + span.start) * 0.4)}s`,
              animationDuration: span.length === 1 ? '3.2s' : undefined,
            }}
          >
            <span className="relay-routes-comet absolute top-1/2 right-full h-0.5 w-5 -translate-y-1/2 rounded-full" />
          </span>
        </span>
      ))}
    </div>
  )
}

function LegDetails({
  from,
  to,
  index,
  lines,
  column,
}: {
  from: string
  to: string
  index: number
  lines: RouteLine[]
  column: number
}) {
  const label = `${from} → ${to}`
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={`查看分段 ${label}`}
          aria-description={lines
            .map(line => `${pingStackLabel(line.stack)} ${describePing(line.legs[index].reading, 1)}`)
            .join('，')}
          title={`查看 ${label} 的探测记录`}
          style={{ gridColumn: column, gridRow: 1 }}
          className="relative z-20 min-h-11 cursor-pointer self-stretch rounded-md transition-colors hover:bg-foreground/5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring data-[state=open]:bg-foreground/5"
        />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="center"
          sideOffset={5}
          collisionPadding={10}
          aria-label={`${label} 分段详情`}
          className="z-50 w-72 max-w-[calc(100vw-1.25rem)] max-h-[var(--radix-popover-content-available-height)] overflow-auto rounded-xl border bg-popover p-3.5 text-popover-foreground shadow-lg"
        >
          <div className="flex items-center justify-between gap-2 border-b pb-2">
            <h4 className="min-w-0 wrap-anywhere text-compact font-semibold">{label}</h4>
            <Popover.Close
              aria-label="关闭分段详情"
              className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-md hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring pointer-coarse:size-11"
            >
              <Icon icon="lucide:x" className="size-4" />
            </Popover.Close>
          </div>
          <table className="mt-2 w-full text-end text-xs">
            <caption className="sr-only">{label} 最新探测与近十分钟丢包率</caption>
            <thead className="text-2xs text-muted-foreground">
              <tr>
                {['协议', '最新延迟', '10 分钟丢包', '采样时间'].map(t => (
                  <th key={t} scope="col" className="py-1 text-end font-normal first:text-start">
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map(line => {
                const leg = line.legs[index]
                return (
                  <tr key={line.route.name} className="num">
                    <th scope="row" className="py-1 text-start font-medium">
                      {pingStackLabel(line.stack) || 'Ping'}
                    </th>
                    <td>
                      <RelayReading value={leg.reading} />
                    </td>
                    <td className={leg.loss == null ? 'text-muted-foreground' : pingLossTone(leg.loss).text}>
                      {leg.loss == null ? '—' : formatPingLoss(leg.loss)}
                    </td>
                    <td className="text-muted-foreground">
                      {leg.updated ? (
                        <time dateTime={leg.updated} title={new Date(leg.updated).toLocaleString()}>
                          {new Date(leg.updated).toLocaleTimeString('zh-CN', { hour12: false })}
                        </time>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

function RoutePath({ nodes, lines, order }: { nodes: string[]; lines: RouteLine[]; order: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [perRow, setPerRow] = useState(2)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || nodes.length <= 3) return undefined
    const measure = () => setPerRow(Math.max(2, Math.floor(el.clientWidth / 160)))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [nodes.length])
  const rows = Math.ceil((nodes.length - 1) / perRow)
  return (
    <div ref={ref} className="min-w-0 divide-y">
      {Array.from({ length: rows }, (_, row) => {
        const start = row * perRow
        const end = Math.min(start + perRow, nodes.length - 1)
        return (
          <div
            key={start}
            className="relay-itinerary grid min-w-0 items-center py-1"
            style={{ '--relay-legs': end - start } as CSSProperties}
          >
            {nodes.slice(start, end + 1).map((name, i) => (
              <span
                key={i}
                style={{ gridColumn: i * 2 + 1, gridRow: 1 }}
                className="relative z-20 max-w-full bg-card px-1.5 text-center text-compact font-semibold leading-tight first:ps-0 @max-[21rem]:text-xs"
                title={name}
              >
                <span className="line-clamp-2 wrap-anywhere">{name}</span>
              </span>
            ))}
            <div className="col-span-full row-start-1 grid min-h-11 grid-cols-subgrid content-center gap-y-0.5">
              {lines.length === 1 && lines[0].stack === 'v6' && (
                <span aria-hidden="true" className="col-span-full h-3.5" />
              )}
              {lines.map((line, i) => (
                <RouteLane key={line.route.name} line={line} start={start} end={end} row={i} order={order} />
              ))}
              {lines.length === 1 && lines[0].stack !== 'v6' && (
                <span aria-hidden="true" className="col-span-full h-3.5" />
              )}
            </div>
            {nodes.slice(start, end).map((from, i) => (
              <LegDetails
                key={i}
                from={from}
                to={nodes[start + i + 1]}
                index={start + i}
                column={i * 2 + 2}
                lines={lines}
              />
            ))}
          </div>
        )
      })}
    </div>
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
  const fallback = error ? 'error' : records ? 'missing' : 'loading'
  const lines: RouteLine[] = routes.map(({ route, stack }) => {
    const legs = route.legs.map(config => {
      const leg = summarizeRelayLeg(config, records?.get(config.client) ?? [], now)
      const reading: PingReading = leg.state === 'lost' || leg.state === 'stale' ? leg.state : (leg.latency ?? fallback)
      return { ...leg, reading }
    })
    return { route, stack, legs, total: relayTotal(legs) }
  })
  return (
    <article
      aria-label={name}
      className="relay-route @container min-w-0 rounded-xl border bg-card px-3.5 pt-2.5 pb-1.5 shadow-xs sm:px-4"
    >
      <header className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b pb-2 @min-[19rem]:gap-x-4">
        <h3 className="min-w-0 wrap-anywhere text-value font-semibold tracking-tight">{name}</h3>
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 @min-[19rem]:ms-auto">
          {lines.some(line => line.stack) && <span className="text-2xs text-muted-foreground">分段合计</span>}
          <dl
            aria-label="分段合计"
            className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs leading-5"
          >
            {lines.map(line => (
              <div key={line.route.name} className="flex items-baseline gap-1.5 whitespace-nowrap">
                <dt
                  className={cn(
                    'text-2xs text-muted-foreground',
                    line.stack && 'relative ps-3.5 [text-box:trim-both_cap_alphabetic]',
                  )}
                >
                  {line.stack && (
                    <span
                      aria-hidden="true"
                      className={cn(
                        'absolute start-0 top-1/2 w-[1em] -translate-y-1/2 border-t-[1.5px] border-muted-foreground/75',
                        line.stack === 'v6' && 'border-dashed',
                      )}
                    />
                  )}
                  {pingStackLabel(line.stack) || '合计'}
                </dt>
                <dd className="font-medium">
                  <RelayReading value={line.total} />
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </header>
      <RoutePath nodes={nodes} lines={lines} order={order} />
    </article>
  )
}

export default function RelayRoutes() {
  const settings = useThemeSettings()
  const config = settings.relayRoutes
  const snapshot = useSharedPingRecords(1, settings.relayRoutesEnabled && config.routes.length > 0)
  if (!settings.relayRoutesEnabled) return null
  const groups = groupRoutes(config.routes)
  const wideItinerary = groups.length === 1 && groups[0].nodes.length > 3
  return (
    <section
      aria-label="线路延迟"
      className="@container relative z-10 min-w-0"
      data-relay-motion={settings.disablePageAnimation ? 'off' : 'on'}
    >
      <div className={cn('grid min-w-0 items-start gap-2.5', !wideItinerary && '@min-[36rem]:grid-cols-2')}>
        <h2 className="sr-only">线路延迟</h2>
        {config.error || !config.routes.length ? (
          <p
            role="status"
            className="col-span-full rounded-xl border bg-card px-4 py-3 text-compact text-muted-foreground shadow-xs"
          >
            {config.error ?? '请在主题设置中配置线路节点和 Ping 任务。'}
          </p>
        ) : (
          groups.map((group, index) => (
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
