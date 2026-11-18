import { Icon } from '@iconify/react'
import { useRef, useState } from 'react'
import PingValue from '@/components/PingValue'
import ChartTimeCursor from '@/components/charts/ChartTimeCursor'
import PingHistoryPlot from '@/components/charts/PingHistoryPlot'
import PingTaskDetails from '@/components/charts/PingTaskDetails'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, ScrollableTabsList, TabsTrigger } from '@/components/ui/tabs'
import { useChartCursor } from '@/hooks/useChartCursor'
import { usePingChartData } from '@/hooks/usePingChartData'
import { useBackgroundSurface } from '@/hooks/useBackgroundSurface'
import { cn } from '@/lib/utils'
import { useAppStore, useIsDark } from '@/stores/app'
import {
  getChartThemeColors,
  SERIES_PALETTE,
  SERIES_PALETTE_V6_DARK,
  SERIES_PALETTE_V6_LIGHT,
} from '@/utils/chartTheme'
import { buildChartViews, PING_CHART_VIEWS } from '@/utils/chartViews'
import { chartTimeLabel } from '@/utils/charts/chartTime'
import { buildPingTimeline } from '@/utils/charts/pingTimeline'
import { describePing, formatPingLoss, pingLossTone, pingTaskAverage } from '@/utils/pingDisplay'
import { groupPingTasksByStack, pingStackLabel } from '@/utils/pingStack'
import { CARD_SURFACE_CLASS, segmentClass, TAB_TRIGGER_CLASS, TOGGLE_BASE_CLASS, toggleClass } from '@/utils/uiClasses'

export default function PingChart({ uuid, className }: { uuid: string; className?: string }) {
  const { pickSurfaceClass } = useBackgroundSurface()
  const isDark = useIsDark()
  const maxHours = useAppStore(state => state.publicSettings?.ping_record_preserve_time) || 168
  const views = buildChartViews(PING_CHART_VIEWS, maxHours)
  const [picked, setPicked] = useState('')
  const view = views.find(v => v.label === picked) ?? views[0] ?? { label: '1 小时', hours: 1 }
  const { remoteData, lossRecordsData, tasks, loading, error, selectedTaskIds, setSelectedTaskIds } = usePingChartData(
    uuid,
    view.hours,
  )
  const [smooth, setSmooth] = useState(false)
  const [delay, setDelay] = useState(true)
  const [loss, setLoss] = useState(true)
  const groups = groupPingTasksByStack(tasks, t => t.name)
  const plotTasks = groups.flatMap((group, i) =>
    group.items.map(({ item: task, stack }) => ({
      task,
      stack,
      base: group.base,
      color:
        stack === 'v6'
          ? (isDark ? SERIES_PALETTE_V6_DARK : SERIES_PALETTE_V6_LIGHT)[i % SERIES_PALETTE.length]
          : SERIES_PALETTE[i % SERIES_PALETTE.length],
    })),
  )
  const allIds = plotTasks.map(({ task }) => task.id)
  const ipv4 = plotTasks.filter(t => t.stack === 'v4').map(t => t.task.id)
  const ipv6 = plotTasks.filter(t => t.stack === 'v6').map(t => t.task.id)
  const selected = plotTasks.filter(t => selectedTaskIds.includes(t.task.id))
  const sameSelection = (ids: number[]) =>
    ids.length === selectedTaskIds.length && ids.every(id => selectedTaskIds.includes(id))
  const intervals = tasks.map(t => t.interval).filter(v => v > 0)
  const frames = buildPingTimeline(
    remoteData,
    lossRecordsData,
    intervals.length ? Math.min(...intervals) : 60,
    view.hours,
  )
  const times = frames.map(f => f.time)
  const cursor = useChartCursor(times, `${uuid}|${view.hours}`)
  const frame = frames[cursor.index]
  const readingsTitle = useRef<HTMLHeadingElement>(null)
  const surface = pickSurfaceClass(CARD_SURFACE_CLASS, 'rounded-xl border bg-card/70 backdrop-blur-xs')
  const allSelected = sameSelection(allIds)

  return (
    <div className={cn('@container flex min-w-0 flex-col gap-3', className)}>
      <Tabs value={view.label} onValueChange={setPicked}>
        <ScrollableTabsList
          selectedValue={view.label}
          aria-label="延迟时间范围"
          scrollClassName="max-w-full"
          className="h-auto min-h-8 w-max rounded-md bg-muted/75"
        >
          {views.map(v => (
            <TabsTrigger key={v.label} value={v.label} className={cn(TAB_TRIGGER_CLASS, 'pointer-coarse:min-h-11')}>
              {v.label}
            </TabsTrigger>
          ))}
        </ScrollableTabsList>
      </Tabs>
      {loading ? (
        <Spinner className="min-h-64" description="正在读取延迟记录…" />
      ) : error ? (
        <p role="status" className="p-6 text-center text-compact text-destructive">
          {error}
        </p>
      ) : !tasks.length ? (
        <p className="p-6 text-center text-compact text-muted-foreground">这段时间没有延迟监测记录</p>
      ) : (
        <>
          <section aria-label="探测时序" className={cn(surface, 'min-w-0 p-3 sm:p-4')}>
            <header className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <h3 className="font-atlas text-value font-semibold">探测时序</h3>
              <div className="flex flex-wrap items-center gap-1" role="group" aria-label="图表显示">
                {[
                  { label: '延迟', active: delay, change: () => setDelay(!delay) },
                  { label: '丢包', active: loss, change: () => setLoss(!loss) },
                  { label: '平滑峰值', active: smooth, change: () => setSmooth(!smooth) },
                ].map(item => (
                  <Button
                    key={item.label}
                    type="button"
                    variant="ghost"
                    size="xs"
                    aria-pressed={item.active}
                    disabled={item.label === '平滑峰值' && !delay}
                    title={item.label === '平滑峰值' ? '只平滑连续的延迟曲线，采样读数保留原值' : undefined}
                    className={cn(TOGGLE_BASE_CLASS, toggleClass(item.active), 'pointer-coarse:min-h-11')}
                    onClick={item.change}
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
            </header>
            {!selected.length || (!delay && !loss) || !frames.length ? (
              <div className="flex min-h-44 flex-col items-center justify-center gap-3 text-xs text-muted-foreground">
                {!selected.length ? (
                  <>
                    尚未选择线路
                    <Button size="sm" variant="outline" onClick={() => setSelectedTaskIds(allIds)}>
                      显示全部线路
                    </Button>
                  </>
                ) : !delay && !loss ? (
                  <>
                    延迟和丢包均已隐藏
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setDelay(true)
                        setLoss(true)
                      }}
                    >
                      显示曲线
                    </Button>
                  </>
                ) : (
                  '所选时段没有采样'
                )}
              </div>
            ) : (
              <>
                <PingHistoryPlot
                  frames={frames}
                  times={times}
                  tasks={selected}
                  cursor={cursor}
                  hours={view.hours}
                  colors={getChartThemeColors(isDark)}
                  delay={delay}
                  loss={loss}
                  smooth={smooth}
                />
                <div className="mt-3 border-t pt-1.5">
                  <ChartTimeCursor times={times} hours={view.hours} cursor={cursor} />
                  {cursor.pinned && (
                    <button
                      type="button"
                      className="hidden min-h-11 cursor-pointer items-center gap-1 rounded-md text-xs font-medium focus-visible:outline-2 focus-visible:outline-ring pointer-coarse:inline-flex @min-[28rem]:!hidden"
                      onClick={() => {
                        readingsTitle.current?.focus({ preventScroll: true })
                        readingsTitle.current?.scrollIntoView({ block: 'nearest' })
                      }}
                    >
                      查看所选读数 <Icon icon="lucide:arrow-down" className="size-3" />
                    </button>
                  )}
                </div>
              </>
            )}
          </section>
          <section aria-label="线路读数" className={cn(surface, 'min-w-0 px-3 sm:px-4')}>
            <header className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b py-2">
              <div className="flex flex-wrap items-baseline gap-2">
                <h3
                  ref={readingsTitle}
                  tabIndex={-1}
                  className="rounded-sm font-atlas text-value font-semibold focus-visible:outline-2 focus-visible:outline-ring"
                >
                  线路读数
                </h3>
                {cursor.pinned && (
                  <time className="num text-2xs text-muted-foreground" dateTime={new Date(cursor.time).toISOString()}>
                    {chartTimeLabel(cursor.time, view.hours)}
                  </time>
                )}
              </div>
              <div className="ms-auto flex flex-wrap items-center gap-1">
                {!!ipv4.length && !!ipv6.length && (
                  <div role="group" aria-label="协议栈" className="inline-flex items-center rounded-md bg-muted p-0.5">
                    {(
                      [
                        ['全部', allIds],
                        ['IPv4', ipv4],
                        ['IPv6', ipv6],
                      ] as const
                    ).map(([name, ids]) => (
                      <Button
                        variant="ghost"
                        size="xs"
                        key={name}
                        aria-pressed={sameSelection(ids)}
                        className={cn(TOGGLE_BASE_CLASS, segmentClass(sameSelection(ids)), 'pointer-coarse:min-h-11')}
                        onClick={() => setSelectedTaskIds(ids)}
                      >
                        {name}
                      </Button>
                    ))}
                  </div>
                )}
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  className="text-xs text-muted-foreground pointer-coarse:min-h-11"
                  onClick={() => setSelectedTaskIds(allSelected ? [] : allIds)}
                >
                  {allSelected ? '全不选' : '全选'}
                </Button>
              </div>
            </header>
            <table className="w-full table-fixed border-collapse text-end text-xs">
              <caption className="sr-only">所选时刻的原始读数与整个时段的统计，可按线路切换曲线</caption>
              <thead className="text-2xs text-muted-foreground">
                <tr>
                  <th scope="col" className="py-2 text-start font-normal">
                    监测线路
                  </th>
                  <th scope="col" className="w-[22%] text-end font-normal">
                    所选时刻
                  </th>
                  <th scope="col" className="w-[18%] text-end font-normal">
                    时段均值
                  </th>
                  <th scope="col" className="w-[16%] text-end font-normal">
                    丢包率
                  </th>
                  <th scope="col" className="hidden w-[12%] text-end font-normal @min-[34rem]:table-cell">
                    波动率
                  </th>
                  <th scope="col" className="w-8 pointer-coarse:w-11">
                    <span className="sr-only">详情</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {plotTasks.map(({ task, base, stack, color }) => {
                  const active = selectedTaskIds.includes(task.id)
                  const sample = frame?.samples.get(task.id)
                  const reading = sample?.loss === 1 ? 'lost' : (sample?.latency ?? 'missing')
                  const avg = pingTaskAverage(task)
                  return (
                    <tr key={task.id} className={cn('num', !active && 'text-muted-foreground')}>
                      <th scope="row" className="text-start font-normal">
                        <button
                          type="button"
                          aria-label={`${task.name} 曲线`}
                          aria-pressed={active}
                          title={task.name}
                          onClick={() =>
                            setSelectedTaskIds(
                              active ? selectedTaskIds.filter(id => id !== task.id) : [...selectedTaskIds, task.id],
                            )
                          }
                          className="flex min-h-8 w-full min-w-0 cursor-pointer items-center gap-1 rounded-sm py-1 pe-1 text-start hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring pointer-coarse:min-h-11"
                        >
                          <Icon
                            aria-hidden="true"
                            icon={active ? 'lucide:square-check' : 'lucide:square'}
                            className="size-3.5 shrink-0"
                          />
                          <span className="flex min-w-0 flex-wrap items-center gap-x-1.5">
                            <span className="min-w-0 truncate font-medium">{base}</span>
                            {stack && (
                              <span
                                className={cn(
                                  'border-b-2 text-2xs text-muted-foreground',
                                  stack === 'v6' && 'border-dashed',
                                )}
                                style={{ borderColor: color }}
                              >
                                {pingStackLabel(stack)}
                              </span>
                            )}
                          </span>
                        </button>
                      </th>
                      <td
                        className="text-end"
                        title={`采样延迟 ${describePing(reading, 1)}，采样丢包 ${sample?.loss == null ? '无数据' : formatPingLoss(sample.loss * 100)}`}
                      >
                        {reading === 'lost' ? (
                          <span className="text-red-600 dark:text-red-400">超时</span>
                        ) : (
                          <PingValue
                            value={reading}
                            decimals={typeof reading === 'number' && !Number.isInteger(reading) ? 1 : 0}
                            unit
                          />
                        )}
                        {sample?.loss != null && sample.loss > 0 && sample.loss < 1 && (
                          <small className="block text-2xs text-amber-700 dark:text-amber-400">
                            丢包 {formatPingLoss(sample.loss * 100)}
                          </small>
                        )}
                      </td>
                      <td className="text-end">
                        <PingValue
                          value={avg}
                          decimals={typeof avg === 'number' && !Number.isInteger(avg) ? 1 : 0}
                          unit
                        />
                      </td>
                      <td className={cn('text-end', task.total !== 0 && pingLossTone(task.loss).text)}>
                        {task.total === 0 ? '—' : formatPingLoss(task.loss, 2)}
                      </td>
                      <td className="hidden text-end @min-[34rem]:table-cell">
                        {typeof avg === 'number' && task.p99_p50_ratio != null ? task.p99_p50_ratio.toFixed(2) : '—'}
                      </td>
                      <td className="text-end">
                        <PingTaskDetails task={task} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  )
}
