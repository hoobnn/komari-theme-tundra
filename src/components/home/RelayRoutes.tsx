import type { PingRecord } from '@/utils/rpc'
import type { RelayRouteConfig } from '@/utils/relayRoutes'
import type { ReactNode } from 'react'
import { Fragment } from 'react'
import { useSharedPingRecords } from '@/hooks/useNodePingStats'
import { useThemeSettings } from '@/stores/app'
import { cn } from '@/lib/utils'
import { relayLatencyTone, relayStateLabel, summarizeRelayLeg } from '@/utils/relayRoutes'

type RelayLeg = ReturnType<typeof summarizeRelayLeg>
type Stack = 'v4' | 'v6' | null

interface RouteLine {
  route: RelayRouteConfig
  stack: Stack
  legs: RelayLeg[]
  total: number | null
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
  status: string
  order: number
}

const stackLabel = (stack: Stack) => (stack === 'v4' ? 'IPv4' : stack === 'v6' ? 'IPv6' : 'Ping')

function FlowStreak({ delay }: { delay: number }) {
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-x-clip">
      <span className="relay-routes-flow absolute inset-0" style={{ animationDelay: `${-delay}s` }}>
        <span className="relay-routes-comet absolute top-1/2 -left-16 h-[2px] w-16 -translate-y-1/2 rounded-full" />
      </span>
    </span>
  )
}

/** 每段线的颜色与卡片延迟同一阈值：快绿、常规天蓝、慢琥珀、差或失败红。 */
function legBorder(leg: RelayLeg): string {
  if (leg.state === 'lost') return 'border-red-500/80'
  if (leg.latency === null) return 'border-foreground/15'
  if (leg.latency <= 80) return 'border-emerald-500/80'
  if (leg.latency <= 180) return 'border-sky-500/70 dark:border-sky-400/70'
  if (leg.latency <= 240) return 'border-amber-500/80'
  return 'border-red-500/80'
}

function StackSwatch({ stack }: { stack: Stack }) {
  if (!stack) return null
  return (
    <span
      aria-hidden="true"
      className={cn('w-3 border-t-2 border-muted-foreground/60', stack === 'v6' && 'border-dashed')}
    />
  )
}

/** 合计：有完整数据显示毫秒数；有段探测失败显示「中断」，其余显示加载 / 刷新状态。 */
function LineTotal({ line, status }: { line: RouteLine; status: string }) {
  if (line.total !== null) {
    return (
      <span
        className={cn('num whitespace-nowrap text-compact font-semibold leading-none', relayLatencyTone(line.total))}
      >
        {line.total.toFixed(1)}
        <span className="ml-0.5 text-3xs font-normal text-muted-foreground">ms</span>
      </span>
    )
  }
  const broken = line.legs.some(leg => leg.state === 'lost')
  return (
    <span
      className={cn(
        'whitespace-nowrap text-xs font-medium leading-none',
        broken ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground',
      )}
    >
      {broken ? '中断' : status}
    </span>
  )
}

const VALUE_ROW = 'h-4'
const LINE_ROW = 'h-2'

/**
 * 每个协议一条轨道：v4 数值在线上方，v6 数值在线下方，两根线居中夹在站点标签的中线两侧。
 * 只有一个协议时下方补一行同高的空位，保持线在标签中线上。
 */
function Lanes({
  lines,
  children,
}: {
  lines: RouteLine[]
  children: (line: RouteLine, row: number) => { value?: ReactNode; track: ReactNode }
}) {
  return (
    <span className="flex flex-col gap-1">
      {lines.map((line, row) => {
        const { value, track } = children(line, row)
        const below = row > 0
        return (
          <span key={line.route.name} className="flex flex-col">
            {!below && <span className={cn('flex items-end justify-center', VALUE_ROW)}>{value}</span>}
            <span className={cn('relative', LINE_ROW)}>{track}</span>
            {below && <span className={cn('flex items-start justify-center', VALUE_ROW)}>{value}</span>}
          </span>
        )
      })}
      {lines.length === 1 && <span aria-hidden="true" className={VALUE_ROW} />}
    </span>
  )
}

function PathSummary({ name, nodes, lines, status, order }: SummaryProps) {
  return (
    <span className="flex flex-col gap-3">
      <span className="flex min-w-0 items-center gap-3">
        <span className="min-w-0 truncate text-compact font-semibold">{name}</span>
        <span className="ml-auto flex shrink-0 items-center gap-4">
          {lines.map(line => (
            <span key={line.route.name} className="flex items-center gap-1.5">
              <span className="flex items-center gap-1 text-3xs text-muted-foreground">
                <StackSwatch stack={line.stack} />
                {line.stack ?? '合计'}
              </span>
              <LineTotal line={line} status={status} />
            </span>
          ))}
        </span>
      </span>
      <span className="min-w-0 overflow-x-auto">
        <span className="relative flex w-full min-w-max items-center">
          {/* 流光沿每根协议线从左到右穿过整条线路，站点标签盖在它上面 */}
          <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2">
            <Lanes lines={lines}>
              {(line, row) => ({ track: line.total !== null && <FlowStreak delay={order * 1.1 + row * 0.8} /> })}
            </Lanes>
          </span>
          {nodes.map((node, index) => (
            <Fragment key={index}>
              {index > 0 && (
                <span className="min-w-16 flex-1 @max-[23rem]:min-w-12">
                  <Lanes lines={lines}>
                    {line => {
                      const leg = line.legs[index - 1]
                      return {
                        value: (
                          <span
                            title={`${stackLabel(line.stack)} ${nodes[index - 1]} → ${node}`}
                            className={cn(
                              'num px-1 text-xs font-medium leading-none',
                              leg.state === 'lost' ? 'text-red-600 dark:text-red-400' : relayLatencyTone(leg.latency),
                            )}
                          >
                            {leg.latency === null ? (
                              <span className="text-3xs">{relayStateLabel[leg.state]}</span>
                            ) : (
                              leg.latency.toFixed(1)
                            )}
                          </span>
                        ),
                        track: (
                          <span
                            aria-hidden="true"
                            className={cn(
                              'absolute inset-x-0 top-1/2 -translate-y-1/2 border-t-2',
                              line.stack === 'v6' && 'border-dashed',
                              legBorder(leg),
                            )}
                          />
                        ),
                      }
                    }}
                  </Lanes>
                </span>
              )}
              <span className="relative z-20 max-w-32 shrink-0 truncate rounded-lg border bg-card px-2.5 py-1.5 text-compact font-semibold leading-4 text-foreground @max-[23rem]:px-1.5 @max-[23rem]:text-xs">
                {node}
              </span>
            </Fragment>
          ))}
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
  loading,
  error,
  now,
  order,
}: {
  name: string
  nodes: string[]
  routes: { route: RelayRouteConfig; stack: Stack }[]
  records: Map<string, PingRecord[]> | undefined
  loading: boolean
  error: string | null
  now: number
  order: number
}) {
  const lines: RouteLine[] = routes.map(({ route, stack }) => {
    const legs = route.legs.map(leg => summarizeRelayLeg(leg, records?.get(leg.client) ?? [], now))
    const complete = legs.every(leg => leg.state === 'ok')
    return { route, stack, legs, total: complete ? legs.reduce((sum, leg) => sum + (leg.latency ?? 0), 0) : null }
  })
  const status = loading && !records ? '加载中' : error ? '刷新失败' : '线路数据不完整'
  const summaryTitle = lines
    .map(
      line =>
        `${line.route.name}：${nodes.join(' → ')}，${line.total === null ? status : `分段合计 ${line.total.toFixed(1)} ms`}`,
    )
    .join('\n')
  return (
    <div title={summaryTitle} className="relay-route @container min-w-0 rounded-xl border bg-card px-4 py-3 shadow-xs">
      <PathSummary name={name} nodes={nodes} lines={lines} status={status} order={order} />
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
              loading={snapshot.loading}
              error={snapshot.error}
              now={snapshot.observedAt}
            />
          ))
        )}
      </div>
    </section>
  )
}
