import type { CSSProperties } from 'react'
import type { NodeData } from '@/stores/nodes'
import type { CurrencyCode } from '@/utils/financeHelper'
import { Icon } from '@iconify/react'
import { lazy, Suspense, useState } from 'react'
import NodeEarthGlobe from '@/components/NodeEarthGlobe'
import { CardX } from '@/components/ui/card-x'
import { DataTooltip } from '@/components/ui/data-tooltip'
import { useBackgroundSurface } from '@/hooks/useBackgroundSurface'
import { useExchangeRates } from '@/hooks/useExchangeRates'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/stores/app'
import { useNodesStore } from '@/stores/nodes'
import {
  calculateTotalMonthlyAverageCostCNY,
  calculateTotalRemainingValueCNY,
  calculateTotalValueCNY,
  CURRENCY_SYMBOLS,
  DISPLAY_FINANCE_CURRENCIES,
  formatFinanceAmount,
  getStoredFinanceCurrency,
  normalizeCurrency,
  setStoredFinanceCurrency,
  shouldExcludeFreeNodes,
} from '@/utils/financeHelper'
import { formatBytesPerSecondSplit, formatBytesSplit } from '@/utils/helper'

const NodeEarthMaps = lazy(() => import('@/components/NodeEarthMaps'))

const financeRateCurrencies: readonly CurrencyCode[] = DISPLAY_FINANCE_CURRENCIES

interface NodeGeneralCardsProps {
  nodes?: NodeData[]
  globeNodes?: NodeData[]
  transitionKey?: string
}

export default function NodeGeneralCards({ nodes, globeNodes, transitionKey }: NodeGeneralCardsProps) {
  const settings = useAppStore(state => state.settings)
  const byteDecimals = useAppStore(state => state.byteDecimals)
  const { pickSurfaceClass } = useBackgroundSurface()
  const storeNodes = useNodesStore(state => state.nodes)
  const { exchangeRates } = useExchangeRates()
  const [exchangeRateBaseCurrency, setExchangeRateBaseCurrency] = useState<CurrencyCode>(() =>
    getStoredFinanceCurrency(),
  )
  const [excludeFreeNodes] = useState(() => shouldExcludeFreeNodes())
  const [openFinanceCard, setOpenFinanceCard] = useState(false)

  const summaryNodes = nodes ?? storeNodes
  const summaryTransitionKey = transitionKey ?? 'all'
  // 指标切换：key 变化时重新挂载并播放入场动画（原 metric-switch Transition，仅保留 enter）
  const metricSwitchClass = settings.disablePageAnimation ? '' : 'metric-switch-in'

  function getMetricSwitchStyle(index: number): CSSProperties {
    return { '--metric-switch-delay': `${index * 35}ms` } as CSSProperties
  }

  function handleBaseCurrencyChange(value: string): void {
    const currency = normalizeCurrency(value)
    setExchangeRateBaseCurrency(currency)
    setStoredFinanceCurrency(currency)
  }

  const onlineNodes = summaryNodes.filter(node => node.online)
  const totalSpeed = {
    up: onlineNodes.reduce((sum, node) => sum + (node.net_out || 0), 0),
    down: onlineNodes.reduce((sum, node) => sum + (node.net_in || 0), 0),
  }

  const totalTraffic = {
    up: summaryNodes.reduce((sum, node) => sum + (node.net_total_up || 0), 0),
    down: summaryNodes.reduce((sum, node) => sum + (node.net_total_down || 0), 0),
  }

  const formattedTrafficUp = formatBytesSplit(totalTraffic.up, byteDecimals)
  const formattedTrafficDown = formatBytesSplit(totalTraffic.down, byteDecimals)
  const totalTrafficTooltip = formatBytesSplit(totalTraffic.up + totalTraffic.down, byteDecimals)

  const formattedSpeedUp = formatBytesPerSecondSplit(totalSpeed.up, byteDecimals)
  const formattedSpeedDown = formatBytesPerSecondSplit(totalSpeed.down, byteDecimals)

  // ==================== 内存 / 硬盘 汇总 ====================
  // 离线节点的 ram / disk 为 0，不影响 used 求和；mem_total / disk_total 是静态库存信息，按全量统计
  let memoryUsed = 0
  let memoryTotal = 0
  let diskUsed = 0
  let diskTotal = 0
  for (const node of summaryNodes) {
    memoryUsed += node.ram || 0
    memoryTotal += node.mem_total || 0
    diskUsed += node.disk || 0
    diskTotal += node.disk_total || 0
  }

  const formattedMemoryUsed = formatBytesSplit(memoryUsed, byteDecimals)
  const formattedMemoryTotal = formatBytesSplit(memoryTotal, byteDecimals)
  const formattedDiskUsed = formatBytesSplit(diskUsed, byteDecimals)
  const formattedDiskTotal = formatBytesSplit(diskTotal, byteDecimals)

  const targetExchangeRate = exchangeRates[exchangeRateBaseCurrency] || 1
  const remainingValueCNY = calculateTotalRemainingValueCNY(summaryNodes, exchangeRates, excludeFreeNodes)
  const formattedRemainingValue = formatFinanceAmount(remainingValueCNY * targetExchangeRate, exchangeRateBaseCurrency)
  const totalValueCNY = calculateTotalValueCNY(summaryNodes, exchangeRates, excludeFreeNodes)
  const formattedTotalValue = formatFinanceAmount(totalValueCNY * targetExchangeRate, exchangeRateBaseCurrency)
  const monthlyAverageCostCNY = calculateTotalMonthlyAverageCostCNY(summaryNodes, exchangeRates, excludeFreeNodes)
  const formattedMonthlyAverageCost = formatFinanceAmount(
    monthlyAverageCostCNY * targetExchangeRate,
    exchangeRateBaseCurrency,
  )
  const financeSummaryItems = [
    {
      label: '总价值',
      icon: 'tabler:wallet',
      value: formattedTotalValue.value,
      symbol: formattedTotalValue.symbol,
      currency: formattedTotalValue.currency,
    },
    {
      label: '月均支出',
      icon: 'tabler:receipt-2',
      value: formattedMonthlyAverageCost.value,
      symbol: formattedMonthlyAverageCost.symbol,
      currency: `${formattedMonthlyAverageCost.currency}/月`,
    },
    {
      label: '剩余价值',
      icon: 'tabler:coins',
      value: formattedRemainingValue.value,
      symbol: formattedRemainingValue.symbol,
      currency: formattedRemainingValue.currency,
    },
  ]
  const exchangeRateRows = financeRateCurrencies.map(currency => {
    const baseRate = exchangeRates[exchangeRateBaseCurrency] || 1
    const targetRate = exchangeRates[currency] || 1
    const rate = targetRate / baseRate

    return {
      currency,
      baseCurrency: exchangeRateBaseCurrency,
      baseSymbol: CURRENCY_SYMBOLS[exchangeRateBaseCurrency],
      targetSymbol: CURRENCY_SYMBOLS[currency],
      rate: new Intl.NumberFormat('zh-CN', {
        maximumFractionDigits: 4,
        minimumFractionDigits: 4,
      }).format(rate),
    }
  })

  const showEarth = settings.earthViewMode === 'earth' || settings.earthViewMode === 'earth-stop'
  const showMaps = settings.earthViewMode === 'maps'
  const showVisualPanel = showEarth || showMaps
  const wrapperClass = showVisualPanel
    ? 'p-4 grid grid-cols-12 grid-rows-1 gap-2 h-auto md:h-58'
    : 'p-4 grid grid-cols-1 gap-2 h-auto'
  const cardGridClass = showVisualPanel
    ? 'h-42 -mt-42 md:mt-0 col-span-12 row-start-3 z-9 md:h-auto md:col-span-6 md:row-start-1 grid grid-cols-12 grid-rows-2 gap-2'
    : 'col-span-1 grid grid-cols-3 md:grid-cols-6 gap-2'

  const visualPanelClass = 'col-span-12 col-start-1 md:col-span-6 md:col-start-7'

  return (
    <div className={wrapperClass}>
      {showEarth && <NodeEarthGlobe nodes={globeNodes} className={visualPanelClass} />}
      {!showEarth && showMaps && (
        <Suspense fallback={null}>
          <NodeEarthMaps nodes={globeNodes} className={visualPanelClass} />
        </Suspense>
      )}

      <div className={cardGridClass}>
        <CardX
          className={cn(
            'h-full rounded-xl border',
            pickSurfaceClass('bg-card shadow-xs', 'bg-card/60 backdrop-blur-xs'),
            showVisualPanel
              ? 'col-span-4 row-span-1 col-start-1 row-start-1'
              : 'col-span-1 row-start-1 col-start-1 min-h-18 md:min-h-24 md:row-start-1 md:col-start-1',
          )}
          contentClass="h-full !p-3"
        >
          <div className="flex h-full flex-col justify-between gap-1">
            <div className="flex items-start justify-between gap-2">
              <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">内存用量</span>
              <span className="num hidden min-w-0 truncate text-[11px] text-muted-foreground xl:inline">
                共 {formattedMemoryTotal.value} {formattedMemoryTotal.unit}
              </span>
            </div>
            <div
              key={`memory-${summaryTransitionKey}`}
              className={cn('flex items-baseline gap-1 min-w-0', metricSwitchClass)}
              style={getMetricSwitchStyle(0)}
            >
              <span className="num truncate text-lg lg:text-2xl xl:text-[28px] font-semibold leading-none">
                {formattedMemoryUsed.value}
              </span>
              <span className="text-[11px] md:text-xs font-medium text-muted-foreground truncate">
                {formattedMemoryUsed.unit}
              </span>
            </div>
          </div>
        </CardX>
        <CardX
          className={cn(
            'h-full rounded-xl border',
            pickSurfaceClass('bg-card shadow-xs', 'bg-card/60 backdrop-blur-xs'),
            showVisualPanel
              ? 'col-span-4 row-span-1 col-start-1 row-start-2'
              : 'col-span-1 row-start-2 col-start-1 min-h-18 md:min-h-24 md:row-start-1 md:col-start-2',
          )}
          contentClass="h-full !p-3"
        >
          <div className="flex h-full flex-col justify-between gap-1">
            <div className="flex items-start justify-between gap-2">
              <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">硬盘用量</span>
              <span className="num hidden min-w-0 truncate text-[11px] text-muted-foreground xl:inline">
                共 {formattedDiskTotal.value} {formattedDiskTotal.unit}
              </span>
            </div>
            <div
              key={`disk-${summaryTransitionKey}`}
              className={cn('flex items-baseline gap-1 min-w-0', metricSwitchClass)}
              style={getMetricSwitchStyle(1)}
            >
              <span className="num truncate text-lg lg:text-2xl xl:text-[28px] font-semibold leading-none">
                {formattedDiskUsed.value}
              </span>
              <span className="text-[11px] md:text-xs font-medium text-muted-foreground truncate">
                {formattedDiskUsed.unit}
              </span>
            </div>
          </div>
        </CardX>
        <div
          className={cn(
            'relative w-full h-full',
            showVisualPanel
              ? 'col-span-4 row-span-1 col-start-5 row-start-1'
              : 'col-span-1 row-start-1 col-start-2 min-h-18 md:min-h-24 md:row-start-1 md:col-start-3',
          )}
        >
          <CardX
            className={cn(
              'h-full cursor-pointer rounded-xl border transition-colors',
              pickSurfaceClass(
                'bg-card shadow-xs hover:border-foreground/20',
                'bg-card/60 hover:border-foreground/20 backdrop-blur-xs',
              ),
            )}
            contentClass="h-full !p-3"
            onClick={() => setOpenFinanceCard(v => !v)}
          >
            <div className="flex h-full flex-col justify-between gap-1">
              <div className="flex items-start justify-between">
                <span className="text-xs text-muted-foreground">剩余价值</span>
                <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
                  {formattedRemainingValue.currency}
                  <Icon
                    icon="tabler:chevron-down"
                    width={14}
                    height={14}
                    className={cn('transition-transform', openFinanceCard && 'rotate-180')}
                  />
                </span>
              </div>
              <div
                key={`remaining-value-${summaryTransitionKey}`}
                className={cn('flex items-baseline gap-1 min-w-0', metricSwitchClass)}
                style={getMetricSwitchStyle(2)}
              >
                <span className="num truncate text-lg lg:text-2xl xl:text-[28px] font-semibold leading-none">
                  {formattedRemainingValue.symbol}
                  {formattedRemainingValue.value}
                </span>
              </div>
            </div>
          </CardX>
          <CardX
            hoverable
            className={cn(
              'absolute top-0 left-1/2 z-20 h-42 w-[260%] max-w-88 -translate-x-[50%] -translate-y-[25%] rounded-xl border shadow-lg transition-all',
              pickSurfaceClass('bg-popover', 'bg-popover/80 backdrop-blur-lg'),
              openFinanceCard ? 'opacity-100 scale-100  -translate-y-[5%]' : 'opacity-0 pointer-events-none scale-50',
            )}
            contentClass="h-full !p-4"
            onClick={() => setOpenFinanceCard(false)}
          >
            <div className="flex h-full min-w-0 flex-col overflow-hidden">
              <div className="shrink-0 grid grid-cols-3 gap-1.5">
                {financeSummaryItems.map((item, index) => (
                  <div key={item.label} className="min-w-0">
                    <div className="flex mb-1.5 items-center text-xs font-medium text-muted-foreground">
                      {item.label}
                    </div>
                    <div
                      key={`remaining-value-${summaryTransitionKey}-${exchangeRateBaseCurrency}`}
                      className={cn('flex min-w-0 items-baseline truncate', metricSwitchClass)}
                      style={getMetricSwitchStyle(index)}
                    >
                      <span className="shrink-0 text-xs mr-0.5 font-semibold leading-none text-muted-foreground">
                        {item.symbol}
                      </span>
                      <span className=" text-sm md:text-lg font-bold leading-none tracking-tight">{item.value}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex-1 my-1.5" />
              <div className="shrink-0 flex flex-col flex-1">
                <div className="flex mb-1 items-center justify-between gap-2">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">今日汇率</div>
                  <select
                    value={exchangeRateBaseCurrency}
                    className="shrink-0 rounded-sm border border-border/70 bg-background/70 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus:text-foreground"
                    aria-label="切换汇率基准币种"
                    onClick={event => event.stopPropagation()}
                    onChange={event => {
                      event.stopPropagation()
                      handleBaseCurrencyChange(event.target.value)
                    }}
                  >
                    {financeRateCurrencies.map(currency => (
                      <option key={currency} value={currency}>
                        {currency}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="h-15 grid grid-cols-2 gap-y-1 gap-x-4 overflow-auto">
                  {exchangeRateRows.map((row, index) => (
                    <div key={row.currency} className="text-[11px] flex items-center ">
                      <div
                        key={`remaining-value-${exchangeRateBaseCurrency}`}
                        className={cn('flex-1 flex justify-between', metricSwitchClass)}
                        style={getMetricSwitchStyle(index)}
                      >
                        <span className="text-muted-foreground">{row.currency}</span>
                        <span>
                          {row.targetSymbol}
                          {row.rate}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardX>
        </div>
        <CardX
          className={cn(
            'h-full rounded-xl border',
            pickSurfaceClass('bg-card shadow-xs', 'bg-card/60 backdrop-blur-xs'),
            showVisualPanel
              ? 'col-span-4 row-span-1 col-start-5 row-start-2'
              : 'col-span-1 row-start-2 col-start-2 min-h-18 md:min-h-24 md:row-start-1 md:col-start-4',
          )}
          contentClass="h-full !p-3"
        >
          <div className="flex h-full flex-col justify-between gap-1">
            <div className="flex items-start justify-between">
              <span className="text-xs text-muted-foreground">累计流量</span>
            </div>
            <DataTooltip
              as="span"
              placement="top"
              content={`↑ ${formattedTrafficUp.value} ${formattedTrafficUp.unit}\n↓ ${formattedTrafficDown.value} ${formattedTrafficDown.unit}`}
              className="min-w-0"
              contentClass="whitespace-pre w-max left-0 -translate-x-0"
            >
              <div
                key={`traffic-${summaryTransitionKey}`}
                className={cn('flex items-baseline gap-1', metricSwitchClass)}
                style={getMetricSwitchStyle(3)}
              >
                <span className="inline-block num text-lg lg:text-2xl xl:text-[28px] font-semibold leading-none">
                  {totalTrafficTooltip.value}
                </span>
                <span className="inline-block text-[11px] md:text-xs font-medium text-muted-foreground">
                  {totalTrafficTooltip.unit}
                </span>
              </div>
            </DataTooltip>
          </div>
        </CardX>

        <CardX
          className={cn(
            'h-full rounded-xl border',
            pickSurfaceClass('bg-card shadow-xs', 'bg-card/60 backdrop-blur-xs'),
            showVisualPanel
              ? 'col-span-4 row-span-1 col-start-9 row-start-1'
              : 'col-span-1 row-start-1 col-start-3 min-h-18 md:min-h-24 md:row-start-1 md:col-start-5',
          )}
          contentClass="h-full !p-3"
        >
          <div className="flex h-full flex-col justify-between gap-1">
            <div className="flex items-start justify-between">
              <span className="text-xs text-muted-foreground">实时上行</span>
            </div>
            <div
              key={`speed-up-${summaryTransitionKey}`}
              className={cn('flex items-baseline gap-1', metricSwitchClass)}
              style={getMetricSwitchStyle(4)}
            >
              <span className="num truncate text-lg lg:text-2xl xl:text-[28px] font-semibold leading-none">
                {formattedSpeedUp.value}
              </span>
              <span className="text-[11px] md:text-xs font-medium text-muted-foreground">{formattedSpeedUp.unit}</span>
            </div>
          </div>
        </CardX>
        <CardX
          className={cn(
            'h-full rounded-xl border',
            pickSurfaceClass('bg-card shadow-xs', 'bg-card/60 backdrop-blur-xs'),
            showVisualPanel
              ? 'col-span-4 row-span-1 col-start-9 row-start-2'
              : 'col-span-1 row-start-2 col-start-3 min-h-18 md:min-h-24 md:row-start-1 md:col-start-6',
          )}
          contentClass="h-full !p-3"
        >
          <div className="flex h-full flex-col justify-between gap-1">
            <div className="flex items-start justify-between">
              <span className="text-xs text-muted-foreground">实时下行</span>
            </div>
            <div
              key={`speed-down-${summaryTransitionKey}`}
              className={cn('flex items-baseline gap-1', metricSwitchClass)}
              style={getMetricSwitchStyle(5)}
            >
              <span className="num truncate text-lg lg:text-2xl xl:text-[28px] font-semibold leading-none">
                {formattedSpeedDown.value}
              </span>
              <span className="text-[11px] md:text-xs font-medium text-muted-foreground">
                {formattedSpeedDown.unit}
              </span>
            </div>
          </div>
        </CardX>
      </div>
    </div>
  )
}
