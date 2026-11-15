import type { PingRecord } from '@/utils/rpc'
import type { RelayRouteConfig } from '@/utils/relayRoutes'
import { Fragment, useState } from 'react'
import { Icon } from '@iconify/react'
import { Link } from 'react-router'
import { useSharedPingRecords } from '@/hooks/useNodePingStats'
import { useThemeSettings } from '@/stores/app'
import { cn } from '@/lib/utils'
import { formatDateTime } from '@/utils/helper'
import { relayLatencyTone, relayStateLabel, summarizeRelayLeg } from '@/utils/relayRoutes'

/** 断开失败采样；不跨丢包点画出一条看似正常的曲线。 */
function HistoryLine({ records }: { records: PingRecord[] }) {
  const max = Math.max(1, ...records.map(record => record.value))
  const start = Date.parse(records[0]?.time ?? '')
  const duration = Math.max(1, Date.parse(records.at(-1)?.time ?? '') - start)
  const path = records
    .map((record, index) => {
      if (record.value < 0) return ''
      const x = 4 + ((Date.parse(record.time) - start) / duration) * 592
      const y = 56 - (record.value / max) * 48
      return `${index > 0 && records[index - 1].value >= 0 ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')
  const hasValues = records.some(record => record.value >= 0)
  if (!hasValues) return <p className="py-4 text-xs text-muted-foreground">暂无成功采样</p>
  return (
    <svg
      viewBox="0 0 600 64"
      role="img"
      aria-label={`近期延迟曲线，最高 ${max.toFixed(1)} ms`}
      className="h-16 w-full text-emerald-600 dark:text-emerald-400"
    >
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" />
      {records
        .filter(record => record.value >= 0)
        .map((record, index) => (
          <circle
            key={`${record.time}-${index}`}
            cx={4 + ((Date.parse(record.time) - start) / duration) * 592}
            cy={56 - (record.value / max) * 48}
            r="1.8"
            fill="currentColor"
          />
        ))}
    </svg>
  )
}

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

/** 轨道颜色与延迟文字共用阈值：常规延迟保持中性，只有快、慢、差才上色。 */
function trackTone(leg: RelayLeg): string {
  if (leg.state === 'lost') return 'border-red-500/60'
  if (leg.latency === null) return 'border-foreground/12'
  if (leg.latency <= 80) return 'border-emerald-500/70'
  if (leg.latency <= 180) return 'border-foreground/25'
  if (leg.latency <= 240) return 'border-amber-500/70'
  return 'border-red-500/70'
}

/** 名称 | 站点 段 站点 … | 协议 | 合计 | 展开 */
const relayColumns = (maxNodes: number) =>
  [
    'auto',
    ...Array.from({ length: maxNodes * 2 - 1 }, (_, index) => (index % 2 ? 'minmax(0, 1fr)' : 'auto')),
    'auto',
    'auto',
    'auto',
  ].join(' ')

function StackBadge({ stack }: { stack: Stack }) {
  if (!stack) return null
  return (
    <span
      className={cn(
        // v4 实线描边，v6 虚线描边，与轨道线型对应
        'inline-flex h-4 items-center rounded border px-1 text-[10px] leading-none text-muted-foreground',
        stack === 'v6' ? 'border-dashed border-foreground/30' : 'border-border',
      )}
    >
      {stack}
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
  paused,
  onTogglePaused,
  maxNodes,
}: {
  name: string
  nodes: string[]
  routes: { route: RelayRouteConfig; stack: Stack }[]
  records: Map<string, PingRecord[]> | undefined
  loading: boolean
  error: string | null
  now: number
  order: number
  paused: boolean
  onTogglePaused: () => void
  maxNodes: number
}) {
  // 所有线路共用父级列：站点列按最长名称对齐，各段等宽，协议标与合计固定在右侧
  const stackColumn = maxNodes * 2 + 1
  const lines: RouteLine[] = routes.map(({ route, stack }) => {
    const legs = route.legs.map(leg => summarizeRelayLeg(leg, records?.get(leg.client) ?? [], now))
    const complete = legs.every(leg => leg.state === 'ok')
    return { route, stack, legs, total: complete ? legs.reduce((sum, leg) => sum + (leg.latency ?? 0), 0) : null }
  })
  const span = `1 / span ${lines.length}`
  const status = loading && !records ? '加载中' : error ? '刷新失败' : '线路数据不完整'
  const summaryTitle = lines
    .map(
      line =>
        `${line.route.name}：${nodes.join(' → ')}，${line.total === null ? status : `分段合计 ${line.total.toFixed(1)} ms`}`,
    )
    .join('\n')
  return (
    <details className="relay-route group col-span-full grid grid-cols-subgrid border-t border-border/60 first-of-type:border-t-0">
      <summary
        title={summaryTitle}
        className="col-span-full grid cursor-pointer list-none grid-cols-subgrid items-center px-3 py-2 text-[11px] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-foreground/40 sm:px-4 [&::-webkit-details-marker]:hidden"
      >
        <span
          className="max-w-16 min-w-0 truncate text-xs font-semibold text-foreground sm:max-w-32 sm:min-w-20"
          style={{ gridRow: span, gridColumn: 1 }}
        >
          {name}
        </span>
        {nodes.map((node, index) => (
          <span
            key={`node-${index}`}
            className="relative z-20 flex h-full items-center justify-center self-stretch"
            style={{ gridRow: span, gridColumn: 2 + index * 2 }}
          >
            {/* 窄屏只保留站点竖条，宽屏显示站点名称 */}
            <span aria-hidden="true" className="h-full min-h-3 w-[3px] rounded-full bg-foreground/20 sm:hidden" />
            <span className="hidden max-w-24 truncate text-muted-foreground transition-colors group-hover:text-foreground/80 sm:block">
              {node}
            </span>
          </span>
        ))}
        {lines.map((line, row) => (
          <Fragment key={line.route.name}>
            {line.total !== null && (
              <span
                aria-hidden="true"
                className="pointer-events-none relative h-full self-stretch overflow-hidden"
                style={{ gridRow: row + 1, gridColumn: `3 / ${nodes.length * 2}` }}
              >
                <span
                  className="relay-routes-flow absolute inset-y-0 left-[-72px] w-full"
                  style={{ animationDelay: `${order * 0.9 + row * 0.4}s` }}
                >
                  <span className="absolute top-1/2 left-0 block h-[2px] w-[72px] -translate-y-1/2 rounded-full bg-linear-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_6px_1px] shadow-emerald-400/40 dark:via-emerald-300" />
                </span>
              </span>
            )}
            {line.legs.map((leg, index) => (
              <span
                key={index}
                title={`${line.stack ?? ''} ${nodes[index]} → ${nodes[index + 1]}：${leg.latency === null ? relayStateLabel[leg.state] : `${leg.latency.toFixed(1)} ms`}`}
                className="relative flex h-[22px] min-w-0 items-center justify-center"
                style={{ gridRow: row + 1, gridColumn: 3 + index * 2 }}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute inset-x-0 top-1/2 border-t-[1.5px]',
                    line.stack === 'v6' && 'border-dashed',
                    trackTone(leg),
                  )}
                />
                <span
                  className={cn(
                    'num relative z-20 min-w-0 truncate bg-card px-0.5 leading-4 sm:px-1',
                    relayLatencyTone(leg.latency),
                    leg.state === 'lost' && 'text-red-600 dark:text-red-400',
                  )}
                >
                  {leg.latency === null ? relayStateLabel[leg.state] : leg.latency.toFixed(1)}
                </span>
              </span>
            ))}
            <span className="flex justify-center" style={{ gridRow: row + 1, gridColumn: stackColumn }}>
              <StackBadge stack={line.stack} />
            </span>
            <span
              className={cn(
                'num min-w-[3.25rem] text-right text-xs font-semibold tracking-tight sm:min-w-[4.25rem]',
                relayLatencyTone(line.total),
              )}
              style={{ gridRow: row + 1, gridColumn: stackColumn + 1 }}
            >
              {line.total === null ? (
                <span className="font-normal text-muted-foreground" aria-label={status}>
                  --
                </span>
              ) : (
                <>
                  {line.total.toFixed(1)}
                  <span className="ml-0.5 text-[10px] font-normal text-muted-foreground">ms</span>
                </>
              )}
            </span>
          </Fragment>
        ))}
        <Icon
          icon="lucide:chevron-down"
          aria-hidden="true"
          className="size-3 text-muted-foreground/60 transition-[rotate,color] group-open:rotate-180 group-hover:text-foreground"
          style={{ gridRow: span, gridColumn: stackColumn + 2 }}
        />
      </summary>
      <div className="col-span-full space-y-3 border-t border-border/60 px-3 py-3 sm:px-4">
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs leading-relaxed text-muted-foreground">
            各段独立探测，合计不代表经过中转的端到端延迟。曲线展示近期可用样本；丢包率按最近 10 分钟样本计算。
          </p>
          <button
            type="button"
            onClick={onTogglePaused}
            className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-foreground/40"
          >
            <Icon icon={paused ? 'lucide:play' : 'lucide:pause'} aria-hidden="true" className="size-3" />
            {paused ? '播放流光' : '暂停流光'}
          </button>
        </div>
        {error && (
          <p role="status" className="text-xs text-amber-700 dark:text-amber-400">
            刷新失败，保留的记录可能已过期，请稍后重试。
          </p>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          {lines.flatMap(line =>
            line.legs.map((leg, index) => (
              <div key={`${line.route.name}-${index}`} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="flex min-w-0 items-center gap-1.5 font-medium wrap-anywhere">
                    <StackBadge stack={line.stack} />
                    {nodes[index]} → {nodes[index + 1]}
                  </span>
                  <span className="num text-muted-foreground">
                    {relayStateLabel[leg.state]}，丢包 {leg.loss === null ? '--' : `${leg.loss.toFixed(1)}%`}
                  </span>
                </div>
                <HistoryLine records={leg.samples} />
                <div className="flex flex-wrap justify-between gap-2 text-[11px] text-muted-foreground">
                  <span className="num">
                    {leg.updated
                      ? `${formatDateTime(leg.samples[0].time, 'HH:mm')}–${formatDateTime(leg.updated, 'HH:mm')}，${leg.samples.length} 个样本`
                      : '等待探测数据'}
                  </span>
                  <Link to={`/instance/${encodeURIComponent(leg.client)}`} className="underline underline-offset-2">
                    探测节点任务 #{leg.taskId}
                  </Link>
                </div>
              </div>
            )),
          )}
        </div>
      </div>
    </details>
  )
}

export default function RelayRoutes() {
  const settings = useThemeSettings()
  const config = settings.relayRoutes
  const [paused, setPaused] = useState(false)
  const snapshot = useSharedPingRecords(1, settings.relayRoutesEnabled && config.routes.length > 0)
  if (!settings.relayRoutesEnabled) return null
  const maxNodes = Math.max(2, ...config.routes.map(route => route.nodes.length))
  return (
    <section
      aria-label="线路延迟"
      className="relative z-10 px-4"
      data-relay-motion={!paused && !settings.disablePageAnimation ? 'on' : 'off'}
    >
      <div
        className="relative grid gap-x-1 overflow-hidden rounded-xl border bg-card py-1 shadow-xs sm:gap-x-2"
        style={{ gridTemplateColumns: relayColumns(maxNodes) }}
      >
        <h2 className="sr-only">线路延迟</h2>
        {config.error || !config.routes.length ? (
          <p role="status" className="col-span-full px-4 py-3 text-sm text-muted-foreground">
            {config.error ?? '请在主题设置中配置线路节点和 Ping 任务。'}
          </p>
        ) : (
          groupRoutes(config.routes).map((group, index) => (
            <RouteGroup
              key={group.routes[0].route.name}
              {...group}
              order={index}
              maxNodes={maxNodes}
              paused={paused}
              onTogglePaused={() => setPaused(value => !value)}
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
