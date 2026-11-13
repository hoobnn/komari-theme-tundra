import { Icon } from '@iconify/react'
import { useState } from 'react'
import { EChart } from '@/components/EChart'
import { CardX } from '@/components/ui/card-x'
import { Empty } from '@/components/ui/empty'
import { ProgressThin } from '@/components/ui/progress-thin'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, ScrollableTabsList, TabsTrigger } from '@/components/ui/tabs'
import { useBackgroundSurface } from '@/hooks/useBackgroundSurface'
import { useLoadRecords } from '@/hooks/useLoadRecords'
import { cn } from '@/lib/utils'
import { useAppStore, useIsDark } from '@/stores/app'
import { useNode } from '@/stores/nodes'
import { buildLoadChartOptions } from '@/utils/charts/loadChartOptions'
import { buildChartViews, LOAD_CHART_VIEWS } from '@/utils/chartViews'
import { formatBytes } from '@/utils/helper'
import { CARD_SURFACE_CLASS, TAB_TRIGGER_CLASS } from '@/utils/uiClasses'

interface LoadChartProps {
  uuid: string
  className?: string
}

function gpuMemoryPercent(used: number, total: number): number {
  return total > 0 ? (used / total) * 100 : 0
}

function gpuTempClass(temp: number): string {
  if (temp >= 85) return 'text-red-500'
  if (temp >= 75) return 'text-amber-500'
  return ''
}

export default function LoadChart({ uuid, className }: LoadChartProps) {
  const { pickSurfaceClass } = useBackgroundSurface()
  const isDark = useIsDark()
  const backgroundEnabled = useAppStore(s => s.settings.backgroundEnabled)
  const recordPreserveTime = useAppStore(s => s.publicSettings?.record_preserve_time)
  const rawInterval = useAppStore(s => s.publicSettings?.theme_settings?.dataUpdateInterval)
  const nodeInfo = useNode(uuid)

  // 从 publicSettings 获取记录保留时间
  const maxRecordPreserveTime = recordPreserveTime || 720

  // 数据更新间隔（秒），默认 3 秒；确保值在合理范围内（1-60秒）
  const dataUpdateInterval =
    typeof rawInterval === 'number' && rawInterval >= 1 && rawInterval <= 60 ? rawInterval * 1000 : 3000

  // 视图选项（与 PingChart 对齐，实时仅负载图有；60/90 天仅在实际保留时间足够时显示）
  // 可用视图：实时 + 按记录保留时长裁剪的历史范围
  const availableViews: Array<{ label: string; hours?: number }> = [
    { label: '实时' },
    ...buildChartViews(LOAD_CHART_VIEWS, maxRecordPreserveTime),
  ]

  // 当前选中的视图
  const [selectedView, setSelectedView] = useState('实时')
  const selectedHours = availableViews.find(v => v.label === selectedView)?.hours
  const isRealtime = selectedView === '实时'

  const { remoteData, gpuTempsByTime, loading, error } = useLoadRecords(
    uuid,
    isRealtime,
    selectedHours,
    dataUpdateInterval,
    Boolean(nodeInfo?.gpu_detailed_info?.length),
  )

  const {
    cpuChartOption,
    gpuChartOption,
    memoryChartOption,
    diskChartOption,
    networkChartOption,
    connectionsChartOption,
    processChartOption,
    gpuDevices,
    hasGpu,
  } = buildLoadChartOptions({
    remoteData,
    gpuTempsByTime,
    nodeInfo,
    isRealtime,
    selectedHours,
    isDark,
    backgroundEnabled,
  })
  const latestStatus = remoteData.at(-1) ?? null

  const cardClass = pickSurfaceClass(CARD_SURFACE_CLASS, 'rounded-xl border bg-card/60 backdrop-blur-xs')

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* 时间选择器 */}
      <Tabs value={selectedView} onValueChange={setSelectedView} className="w-full items-center">
        <ScrollableTabsList
          selectedValue={selectedView}
          aria-label="负载时间范围"
          scrollClassName="w-full"
          className={pickSurfaceClass(
            'h-8 bg-background/60 pointer-events-auto rounded-md',
            'h-8 bg-background/50 backdrop-blur-xl pointer-events-auto rounded-md',
          )}
        >
          {availableViews.map(view => (
            <TabsTrigger key={view.label} value={view.label} className={TAB_TRIGGER_CLASS}>
              {view.label}
            </TabsTrigger>
          ))}
        </ScrollableTabsList>
      </Tabs>

      {/* 内容区域 */}
      <Spinner show={loading}>
        {error ? (
          <div className="text-red-500 py-8 text-center">{error}</div>
        ) : remoteData.length === 0 && !loading ? (
          <div className="py-8">
            <Empty description="暂无负载数据" />
          </div>
        ) : (
          /* 图表网格 */
          <div className="gap-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
            {/* CPU 卡片 */}
            <CardX
              size="small"
              className={cardClass}
              header={
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">CPU</span>
                  {latestStatus?.cpu != null ? (
                    <div className="num text-xs flex gap-0.5 items-baseline">
                      <span>{latestStatus.cpu.toFixed(1)}</span>
                      <span>%</span>
                    </div>
                  ) : (
                    <span>--</span>
                  )}
                </div>
              }
            >
              <div className="h-48">
                <EChart option={cpuChartOption} />
              </div>
            </CardX>

            {/* GPU 卡片（仅有 GPU 数据的节点显示） */}
            {hasGpu && (
              <CardX
                size="small"
                className={cardClass}
                header={
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">GPU</span>
                    {latestStatus?.gpu != null ? (
                      <div className="num text-xs flex gap-0.5 items-baseline">
                        <span>{latestStatus.gpu.toFixed(1)}</span>
                        <span>%</span>
                      </div>
                    ) : (
                      <span>--</span>
                    )}
                  </div>
                }
              >
                {/* 有设备详情时压缩图表高度，让单卡时与相邻卡片等高 */}
                <div className={gpuDevices.length ? 'h-38' : 'h-48'}>
                  <EChart option={gpuChartOption} />
                </div>
                {gpuDevices.length > 0 && (
                  <div className="mt-2 flex flex-col gap-2">
                    {gpuDevices.map((gpu, index) => (
                      <div key={index} className="flex flex-col gap-1 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-muted-foreground" title={gpu.name}>
                            {gpu.name}
                          </span>
                          <div className="flex shrink-0 gap-2 items-baseline">
                            <span>{gpu.utilization}%</span>
                            <span className={gpuTempClass(gpu.temperature)}>
                              {gpu.temperature > 0 ? `${gpu.temperature}°C` : '-'}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <ProgressThin
                            percentage={gpuMemoryPercent(gpu.memory_used, gpu.memory_total)}
                            status={gpuMemoryPercent(gpu.memory_used, gpu.memory_total) >= 90 ? 'warning' : 'info'}
                            className="flex-1"
                          />
                          <span className="num shrink-0 text-muted-foreground">
                            显存 <span className="text-foreground">{formatBytes(gpu.memory_used)}</span> 共{' '}
                            {formatBytes(gpu.memory_total)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardX>
            )}

            {/* 内存卡片 */}
            <CardX
              size="small"
              className={cardClass}
              header={
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">内存</span>
                  <div className="num flex items-baseline gap-1 text-xs">
                    <span>{latestStatus?.ram != null ? formatBytes(latestStatus.ram) : '--'}</span>
                    {nodeInfo?.mem_total ? (
                      <span className="text-muted-foreground">共 {formatBytes(nodeInfo.mem_total)}</span>
                    ) : null}
                  </div>
                </div>
              }
            >
              <div className="h-48">
                <EChart option={memoryChartOption} />
              </div>
            </CardX>

            {/* 硬盘卡片 */}
            <CardX
              size="small"
              className={cardClass}
              header={
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">硬盘</span>
                  <div className="num flex items-baseline gap-1 text-xs">
                    <span>{latestStatus?.disk != null ? formatBytes(latestStatus.disk) : '--'}</span>
                    {nodeInfo?.disk_total ? (
                      <span className="text-muted-foreground">共 {formatBytes(nodeInfo.disk_total)}</span>
                    ) : null}
                  </div>
                </div>
              }
            >
              <div className="h-48">
                <EChart option={diskChartOption} />
              </div>
            </CardX>

            {/* 网络卡片 */}
            <CardX
              size="small"
              className={cardClass}
              header={
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">网络</span>
                  <div className="num flex items-baseline gap-2 text-xs">
                    <span className="flex items-center gap-0.5">
                      <Icon
                        icon="tabler:arrow-up"
                        width="12"
                        height="12"
                        className="text-emerald-700 dark:text-emerald-300"
                      />
                      {latestStatus?.net_out != null ? `${formatBytes(latestStatus.net_out)}/s` : '--'}
                    </span>
                    <span className="flex items-center gap-0.5">
                      <Icon
                        icon="tabler:arrow-down"
                        width="12"
                        height="12"
                        className="text-sky-700 dark:text-sky-300"
                      />
                      {latestStatus?.net_in != null ? `${formatBytes(latestStatus.net_in)}/s` : '--'}
                    </span>
                  </div>
                </div>
              }
            >
              <div className="h-48">
                <EChart option={networkChartOption} />
              </div>
            </CardX>

            {/* 连接数卡片 */}
            <CardX
              size="small"
              className={cardClass}
              header={
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">连接</span>
                  <div className="num flex items-baseline gap-2 text-xs">
                    <span>
                      <span className="text-muted-foreground">TCP</span> {latestStatus?.connections ?? '--'}
                    </span>
                    <span>
                      <span className="text-muted-foreground">UDP</span> {latestStatus?.connections_udp ?? '--'}
                    </span>
                  </div>
                </div>
              }
            >
              <div className="h-48">
                <EChart option={connectionsChartOption} />
              </div>
            </CardX>

            {/* 进程卡片：有 GPU 时共 7 张，最后一张横跨整行，避免末行孤零零一张 */}
            <CardX
              size="small"
              className={cn(cardClass, hasGpu && 'md:col-span-2 xl:col-span-3')}
              header={
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">进程</span>
                  <span className="num text-xs">{latestStatus?.process ?? '--'}</span>
                </div>
              }
            >
              <div className="h-48">
                <EChart option={processChartOption} />
              </div>
            </CardX>
          </div>
        )}
      </Spinner>
    </div>
  )
}
