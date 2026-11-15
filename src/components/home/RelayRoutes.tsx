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

function RouteRow({
  route,
  records,
  loading,
  error,
  now,
}: {
  route: RelayRouteConfig
  records: Map<string, PingRecord[]> | undefined
  loading: boolean
  error: string | null
  now: number
}) {
  const legs = route.legs.map(leg => summarizeRelayLeg(leg, records?.get(leg.client) ?? [], now))
  const complete = legs.every(leg => leg.state === 'ok')
  const total = complete ? legs.reduce((sum, leg) => sum + (leg.latency ?? 0), 0) : null
  const weight = legs.reduce((sum, leg) => sum + Math.max(leg.latency ?? 0, 1), 0)
  const stack = /IPv6/i.test(route.name) ? 'v6' : /IPv4/i.test(route.name) ? 'v4' : null
  const name = stack ? route.name.replace(/\s*[·|—-]?\s*IPv[46]\s*$/i, '').trim() : route.name
  const status = loading && !records ? '加载中' : error ? '刷新失败' : '线路数据不完整'
  return (
    <details className="relay-route group border-t border-border/40 first:border-t-0">
      <summary
        title={`${route.name} · ${route.nodes.join(' → ')} · ${total === null ? status : `分段合计 ${total.toFixed(1)} ms`}`}
        className="grid min-h-10 cursor-pointer list-none grid-cols-[4.5rem_minmax(0,1fr)_3.5rem_0.75rem] items-center gap-1.5 px-2.5 pr-9 text-[11px] transition-colors hover:bg-muted/35 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-foreground/40 sm:min-h-8 sm:grid-cols-[6.5rem_minmax(0,1fr)_4rem_0.75rem] sm:gap-3 sm:px-3 sm:pr-9 [&::-webkit-details-marker]:hidden"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate font-semibold text-foreground">{name}</span>
          {stack && (
            <span
              className={cn(
                'shrink-0 rounded px-1 py-px text-[9px] leading-none',
                stack === 'v6'
                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              {stack}
            </span>
          )}
        </span>
        <span className="relative isolate flex min-w-0 items-center gap-1 overflow-hidden text-[10px] sm:text-[11px]">
          {complete && (
            <span
              aria-hidden="true"
              className="relay-routes-flow pointer-events-none absolute inset-y-0 left-[-120px] z-10 w-full"
            >
              <span className="block h-full w-[120px] bg-linear-to-r from-transparent via-amber-400/30 to-transparent" />
            </span>
          )}
          <span className="relative z-20 hidden max-w-24 shrink-0 truncate bg-card text-muted-foreground sm:inline">
            {route.nodes[0]}
          </span>
          {legs.map((leg, index) => (
            <Fragment key={index}>
              <span
                title={`${route.nodes[index]} → ${route.nodes[index + 1]}：${leg.latency === null ? relayStateLabel[leg.state] : `${leg.latency.toFixed(1)} ms`}`}
                className={cn(
                  'num relative min-w-0 overflow-hidden rounded-[3px] bg-muted/70 px-0.5 text-center leading-4 sm:px-1',
                  relayLatencyTone(leg.latency),
                  stack === 'v6' && 'border-b border-dashed border-emerald-600/30 dark:border-emerald-300/30',
                  leg.state === 'lost' && 'text-red-600 dark:text-red-400',
                )}
                style={{
                  flex: `${Math.max(leg.latency ?? 0, 1) / weight} 1 0`,
                  minWidth: `min(3.25rem, calc((100% - ${(legs.length - 1) * 4}px) / ${legs.length}))`,
                }}
              >
                <span className="relative z-20 block truncate">
                  {leg.latency === null ? (
                    relayStateLabel[leg.state]
                  ) : (
                    <>
                      {leg.latency.toFixed(1)}
                      <span className="hidden sm:inline"> ms</span>
                    </>
                  )}
                </span>
              </span>
              <span className="relative z-20 hidden max-w-24 shrink-0 truncate bg-card text-muted-foreground sm:inline">
                {route.nodes[index + 1]}
              </span>
            </Fragment>
          ))}
        </span>
        <span className={cn('num text-right text-xs font-semibold tracking-tight', relayLatencyTone(total))}>
          {total === null ? (
            <span className="font-normal text-muted-foreground" aria-label={status}>
              --
            </span>
          ) : (
            <>
              {total.toFixed(1)}
              <span className="ml-0.5 text-[9px] font-normal text-muted-foreground">ms</span>
            </>
          )}
        </span>
        <Icon
          icon="lucide:chevron-down"
          aria-hidden="true"
          className="size-3 text-muted-foreground/60 group-open:rotate-180"
        />
      </summary>
      <div className="space-y-3 border-t border-border/40 px-3 py-3 sm:px-4">
        <p className="text-xs leading-relaxed text-muted-foreground">
          各段独立探测，合计不代表经过中转的端到端延迟。曲线展示近期可用样本；丢包率按最近 10 分钟样本计算。
        </p>
        {error && (
          <p role="status" className="text-xs text-amber-700 dark:text-amber-400">
            刷新失败，保留的记录可能已过期，请稍后重试。
          </p>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          {legs.map((leg, index) => (
            <div key={index} className="rounded-lg bg-muted/40 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
                <span className="font-medium wrap-anywhere">
                  {route.nodes[index]} → {route.nodes[index + 1]}
                </span>
                <span className="num text-muted-foreground">
                  {relayStateLabel[leg.state]} · 丢包 {leg.loss === null ? '--' : `${leg.loss.toFixed(1)}%`}
                </span>
              </div>
              <HistoryLine records={leg.samples} />
              <div className="flex flex-wrap justify-between gap-2 text-[11px] text-muted-foreground">
                <span className="num">
                  {leg.updated
                    ? `${formatDateTime(leg.samples[0].time, 'HH:mm')}–${formatDateTime(leg.updated, 'HH:mm')} · ${leg.samples.length} 个样本`
                    : '等待探测数据'}
                </span>
                <Link to={`/instance/${encodeURIComponent(leg.client)}`} className="underline underline-offset-2">
                  探测节点 · 任务 #{leg.taskId}
                </Link>
              </div>
            </div>
          ))}
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
  return (
    <section
      aria-label="线路延迟"
      className="relative z-10 px-4"
      data-relay-motion={!paused && !settings.disablePageAnimation ? 'on' : 'off'}
    >
      <div className="relative overflow-hidden rounded-xl bg-card py-1 shadow-xs">
        <h2 className="sr-only">线路延迟</h2>
        <button
          type="button"
          onClick={() => setPaused(value => !value)}
          title={paused ? '播放流光' : '暂停流光'}
          aria-label={paused ? '播放流光' : '暂停流光'}
          className="absolute top-3 right-1 z-30 flex size-6 items-center justify-center rounded-md text-muted-foreground/60 hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-foreground/40 sm:top-2"
        >
          <Icon icon={paused ? 'lucide:play' : 'lucide:pause'} aria-hidden="true" className="size-3" />
        </button>
        {config.error || !config.routes.length ? (
          <p role="status" className="px-4 py-3 text-sm text-muted-foreground">
            {config.error ?? '请在主题设置中配置线路节点和 Ping 任务。'}
          </p>
        ) : (
          config.routes.map(route => (
            <RouteRow
              key={route.name}
              route={route}
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
