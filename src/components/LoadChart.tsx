import type { EChartsCoreOption } from 'echarts/core'
import type { ReactNode } from 'react'
import { Icon } from '@iconify/react'
import { useState } from 'react'
import { EChart } from '@/components/EChart'
import ChartTimeCursor from '@/components/charts/ChartTimeCursor'
import { Empty } from '@/components/ui/empty'
import { ProgressThin } from '@/components/ui/progress-thin'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, ScrollableTabsList, TabsContent, TabsTrigger } from '@/components/ui/tabs'
import { useBackgroundSurface } from '@/hooks/useBackgroundSurface'
import { useChartCursor } from '@/hooks/useChartCursor'
import { useLoadRecords } from '@/hooks/useLoadRecords'
import { cn } from '@/lib/utils'
import { useAppStore, useIsDark } from '@/stores/app'
import { useNode } from '@/stores/nodes'
import { buildLoadChartOptions } from '@/utils/charts/loadChartOptions'
import { chartTimeLabel } from '@/utils/charts/chartTime'
import { buildChartViews, LOAD_CHART_VIEWS } from '@/utils/chartViews'
import { formatBytes, formatBytesSplit } from '@/utils/helper'
import { CARD_SURFACE_CLASS } from '@/utils/uiClasses'

function Readout({ value, unit, bytes }: { value: number | undefined; unit?: string; bytes?: boolean }) {
  if (value == null || !Number.isFinite(value)) return <span className="text-muted-foreground">—</span>
  const formatted = bytes
    ? formatBytesSplit(value, { B: value > 0 && value < 1 ? 2 : 0, KB: 1 })
    : { value: unit === '%' ? value.toFixed(1) : String(Math.round(value)), unit: '' }
  return (
    <span className="num whitespace-nowrap font-semibold">
      {formatted.value}
      <small className="ms-0.5 text-2xs font-normal text-muted-foreground">
        {formatted.unit}
        {unit}
      </small>
    </span>
  )
}

function LoadPlot({
  title,
  icon,
  tone,
  reading,
  option,
  cursor,
  className,
  children,
}: {
  title: string
  icon: string
  tone: string
  reading: ReactNode
  option: EChartsCoreOption
  cursor: ReturnType<typeof useChartCursor>
  className: string
  children?: ReactNode
}) {
  return (
    <section aria-label={title} className={cn('min-w-0 overflow-hidden', className)}>
      <header className="mx-3 flex min-h-12 flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b py-1.5">
        <h3 className="flex items-center gap-2 text-compact font-semibold">
          <Icon icon={icon} className={cn('size-4', tone)} />
          {title}
        </h3>
        <div className="flex min-w-0 flex-wrap items-baseline justify-end gap-x-2.5 gap-y-0.5 text-value">
          {reading}
        </div>
      </header>
      <EChart
        option={option}
        onTimePick={cursor.pick}
        cursorTime={cursor.pinned ? cursor.time : undefined}
        label={`${title}时序，选中时刻的读数见卡头`}
        className="my-1 h-42 sm:h-46"
      />
      {children}
    </section>
  )
}

export default function LoadChart({ uuid, className }: { uuid: string; className?: string }) {
  const { pickSurfaceClass } = useBackgroundSurface()
  const isDark = useIsDark()
  const backgroundEnabled = useAppStore(s => s.settings.backgroundEnabled)
  const recordPreserveTime = useAppStore(s => s.publicSettings?.record_preserve_time)
  const rawInterval = useAppStore(s => s.publicSettings?.theme_settings?.dataUpdateInterval)
  const nodeInfo = useNode(uuid)
  const views = [{ label: '实时', hours: undefined }, ...buildChartViews(LOAD_CHART_VIEWS, recordPreserveTime || 720)]
  const [picked, setPicked] = useState('实时')
  const view = views.find(v => v.label === picked) ?? views[0]
  const realtime = view.hours === undefined
  const interval = typeof rawInterval === 'number' && rawInterval >= 1 && rawInterval <= 60 ? rawInterval * 1000 : 3000
  const { remoteData, gpuTempsByTime, loading, error } = useLoadRecords(
    uuid,
    realtime,
    view.hours,
    interval,
    Boolean(nodeInfo?.gpu_detailed_info?.length),
  )
  const charts = buildLoadChartOptions({
    remoteData,
    gpuTempsByTime,
    nodeInfo,
    isRealtime: realtime,
    selectedHours: view.hours,
    isDark,
    backgroundEnabled,
  })
  const cursor = useChartCursor(charts.times, `${uuid}|${view.label}`)
  const sample = charts.measured[cursor.index]?.record
  const surface = pickSurfaceClass(CARD_SURFACE_CLASS, 'rounded-xl border bg-card/70 backdrop-blur-xs')
  const props = { cursor, className: surface }
  const ramCapacity = sample?.ram_total || nodeInfo?.mem_total
  const diskCapacity = sample?.disk_total || nodeInfo?.disk_total
  const sampledTemperatures = sample ? gpuTempsByTime.get(sample.time) : undefined
  return (
    <Tabs
      value={view.label}
      onValueChange={setPicked}
      activationMode="manual"
      className={cn('@container flex min-w-0 flex-col gap-3', className)}
    >
      <div
        role="group"
        aria-label="负载图表时间控制"
        className={cn(
          surface,
          'grid min-w-0 gap-y-1 p-1.5 @min-[42rem]:grid-cols-[minmax(0,max-content)_minmax(19rem,1fr)] @min-[42rem]:items-center',
        )}
      >
        <ScrollableTabsList
          selectedValue={view.label}
          aria-label="负载时间范围"
          scrollClassName="w-full py-0"
          className="h-auto min-w-full gap-0.5 rounded-none bg-transparent p-0"
        >
          {views.map(v => (
            <TabsTrigger
              key={v.label}
              value={v.label}
              className="h-8 min-w-11 flex-auto px-2.5 text-xs text-muted-foreground hover:bg-muted/60 data-[state=active]:border-border data-[state=active]:bg-muted data-[state=active]:shadow-none dark:data-[state=active]:border-border dark:data-[state=active]:bg-muted pointer-coarse:min-h-11 forced-colors:data-[state=active]:border-[Highlight]"
            >
              {v.label}
            </TabsTrigger>
          ))}
        </ScrollableTabsList>
        <div className="min-w-0 border-t px-1.5 pt-1 @min-[42rem]:ms-2 @min-[42rem]:border-s @min-[42rem]:border-t-0 @min-[42rem]:ps-3 @min-[42rem]:pt-0">
          <ChartTimeCursor times={charts.times} hours={view.hours ?? 1} cursor={cursor} />
        </div>
      </div>
      <TabsContent
        value={view.label}
        className="flex min-w-0 flex-col gap-3 rounded-md focus-visible:outline-2 focus-visible:outline-ring"
      >
        {error && charts.times.length > 0 && (
          <p role="status" className="text-xs text-amber-700 dark:text-amber-400">
            刷新失败，最近一次采样为 {chartTimeLabel(charts.times[charts.times.length - 1])}，正在等待下次更新。
          </p>
        )}
        {loading && !remoteData.length ? (
          <Spinner className="min-h-60" description="正在读取负载记录…" />
        ) : error && !charts.times.length ? (
          <div role="status" className="py-8 text-center text-compact text-destructive">
            {error}
          </div>
        ) : !charts.times.length ? (
          <div className="py-8">
            <Empty description="暂无负载数据" />
          </div>
        ) : (
          <div className="grid min-w-0 grid-cols-1 gap-3 @min-[40rem]:grid-cols-2 @min-[68rem]:grid-cols-3">
            <LoadPlot
              {...props}
              title="CPU"
              icon="lucide:cpu"
              tone="text-sky-600 dark:text-sky-400"
              option={charts.cpuChartOption}
              reading={
                <>
                  <Readout value={sample?.cpu} unit="%" />
                  {cursor.pinned && (
                    <small className="num text-2xs text-muted-foreground">
                      系统负载 {sample?.load != null ? sample.load.toFixed(2) : '—'}
                    </small>
                  )}
                </>
              }
            />
            {charts.hasGpu && (
              <LoadPlot
                {...props}
                title="GPU"
                icon="lucide:cpu"
                tone="text-violet-600 dark:text-violet-400"
                option={charts.gpuChartOption}
                reading={
                  <>
                    <Readout value={sample?.gpu} unit="%" />
                    {cursor.pinned &&
                      charts.gpuTemperatures.map(({ index, name }) => {
                        const temp = sampledTemperatures?.[index]
                        return (
                          <small key={index} className="num text-2xs text-muted-foreground">
                            {name} {temp != null && temp > 0 ? `${temp}°C` : '—'}
                          </small>
                        )
                      })}
                  </>
                }
              >
                {charts.gpuDevices.length > 0 && (
                  <div className="mx-3 mb-2 space-y-2 border-t pt-2">
                    <h4 className="text-2xs text-muted-foreground">实时设备</h4>
                    {charts.gpuDevices.map((gpu, i) => {
                      const used = gpu.memory_total > 0 ? (gpu.memory_used / gpu.memory_total) * 100 : 0
                      return (
                        <div key={i} className="num space-y-1 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="min-w-0 truncate" title={gpu.name}>
                              {gpu.name}
                            </span>
                            <span className="shrink-0">
                              {gpu.utilization}%{' '}
                              <span
                                className={cn(
                                  'ms-1',
                                  gpu.temperature >= 85
                                    ? 'text-red-500'
                                    : gpu.temperature >= 75
                                      ? 'text-amber-500'
                                      : 'text-muted-foreground',
                                )}
                              >
                                {gpu.temperature > 0 ? `${gpu.temperature}°C` : '—'}
                              </span>
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <ProgressThin
                              percentage={used}
                              status={used >= 90 ? 'warning' : 'info'}
                              className="flex-1"
                            />
                            <span className="text-2xs text-muted-foreground">
                              显存 {formatBytes(gpu.memory_used)} 共 {formatBytes(gpu.memory_total)}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </LoadPlot>
            )}
            <LoadPlot
              {...props}
              title="内存"
              icon="lucide:memory-stick"
              tone="text-emerald-600 dark:text-emerald-400"
              option={charts.memoryChartOption}
              reading={
                <>
                  <Readout bytes value={sample?.ram} />
                  {cursor.pinned && (
                    <small className="num text-2xs text-muted-foreground">
                      Swap {sample?.swap != null ? formatBytes(sample.swap) : '—'}
                    </small>
                  )}
                  {!!ramCapacity && (
                    <small className="text-2xs text-muted-foreground">共 {formatBytes(ramCapacity)}</small>
                  )}
                </>
              }
            />
            <LoadPlot
              {...props}
              title="网络"
              icon="lucide:arrow-up-down"
              tone="text-sky-600 dark:text-sky-400"
              option={charts.networkChartOption}
              reading={
                <>
                  <span className="inline-flex items-center gap-1" aria-label="上行">
                    <Icon icon="lucide:arrow-up" className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                    <Readout bytes value={sample?.net_out} unit="/s" />
                  </span>
                  <span className="inline-flex items-center gap-1" aria-label="下行">
                    <Icon icon="lucide:arrow-down" className="size-3.5 text-sky-600 dark:text-sky-400" />
                    <Readout bytes value={sample?.net_in} unit="/s" />
                  </span>
                </>
              }
            />
            <LoadPlot
              {...props}
              title="硬盘"
              icon="lucide:hard-drive"
              tone="text-orange-600 dark:text-orange-400"
              option={charts.diskChartOption}
              reading={
                <>
                  <Readout bytes value={sample?.disk} />
                  {!!diskCapacity && (
                    <small className="text-2xs text-muted-foreground">共 {formatBytes(diskCapacity)}</small>
                  )}
                </>
              }
            />
            <LoadPlot
              {...props}
              title="连接"
              icon="lucide:network"
              tone="text-sky-600 dark:text-sky-400"
              option={charts.connectionsChartOption}
              reading={
                <>
                  <span>
                    <small className="me-1 text-2xs text-muted-foreground">TCP</small>
                    <Readout value={sample?.connections} />
                  </span>
                  <span>
                    <small className="me-1 text-2xs text-muted-foreground">UDP</small>
                    <Readout value={sample?.connections_udp} />
                  </span>
                </>
              }
            />
            <LoadPlot
              {...props}
              className={cn(surface, charts.hasGpu && '@min-[40rem]:col-span-2 @min-[68rem]:col-span-3')}
              title="进程"
              icon="lucide:activity"
              tone="text-violet-600 dark:text-violet-400"
              option={charts.processChartOption}
              reading={<Readout value={sample?.process} />}
            />
          </div>
        )}
      </TabsContent>
    </Tabs>
  )
}
