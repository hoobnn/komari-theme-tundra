import type { NodeData } from '@/stores/nodes'
import type { CurrencyCode } from '@/utils/financeHelper'
import type { CSSProperties } from 'react'
import { Icon } from '@iconify/react'
import { Popover } from 'radix-ui'
import { useState } from 'react'
import { useExchangeRates } from '@/hooks/useExchangeRates'
import { useBackgroundSurface } from '@/hooks/useBackgroundSurface'
import { useAppStore } from '@/stores/app'
import { cn } from '@/lib/utils'
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

const financeRateCurrencies = DISPLAY_FINANCE_CURRENCIES

export default function OverviewFinanceCard({ nodes, transitionKey }: { nodes: NodeData[]; transitionKey: string }) {
  const { exchangeRates } = useExchangeRates()
  const { pickSurfaceClass } = useBackgroundSurface()
  const disableAnimation = useAppStore(state => state.settings.disablePageAnimation)
  const metricSwitchClass = disableAnimation ? '' : 'metric-switch-in'
  const [exchangeRateBaseCurrency, setExchangeRateBaseCurrency] = useState<CurrencyCode>(getStoredFinanceCurrency)
  const [excludeFreeNodes] = useState(shouldExcludeFreeNodes)
  function handleBaseCurrencyChange(value: string) {
    const currency = normalizeCurrency(value)
    setExchangeRateBaseCurrency(currency)
    setStoredFinanceCurrency(currency)
  }
  function getMetricSwitchStyle(index: number): CSSProperties {
    return { '--metric-switch-delay': `${index * 18}ms` } as CSSProperties
  }
  const targetExchangeRate = exchangeRates[exchangeRateBaseCurrency] || 1
  const remainingValueCNY = calculateTotalRemainingValueCNY(nodes, exchangeRates, excludeFreeNodes)
  const formattedRemainingValue = formatFinanceAmount(remainingValueCNY * targetExchangeRate, exchangeRateBaseCurrency)
  const totalValueCNY = calculateTotalValueCNY(nodes, exchangeRates, excludeFreeNodes)
  const formattedTotalValue = formatFinanceAmount(totalValueCNY * targetExchangeRate, exchangeRateBaseCurrency)
  const monthlyAverageCostCNY = calculateTotalMonthlyAverageCostCNY(nodes, exchangeRates, excludeFreeNodes)
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

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label="查看费用与汇率"
          className={cn(
            'flex min-h-20 min-w-0 flex-col justify-between gap-3 rounded-xl border p-3 text-left shadow-xs transition-colors hover:border-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-24',
            pickSurfaceClass('bg-card', 'bg-card/60 backdrop-blur-xs'),
          )}
        >
          <span className="flex w-full items-center justify-between gap-1 text-xs text-muted-foreground">
            <span className="whitespace-nowrap">剩余价值</span>
            <span className="inline-flex items-center gap-0.5 text-[10px]">
              <Icon icon="tabler:chevron-down" width={12} height={12} />
            </span>
          </span>
          <span
            key={transitionKey}
            className={cn(
              'num block w-full truncate text-xs min-[360px]:text-lg font-semibold leading-none lg:text-2xl xl:text-[28px]',
              metricSwitchClass,
            )}
            title={`${formattedRemainingValue.symbol}${formattedRemainingValue.value}`}
          >
            {formattedRemainingValue.symbol}
            {formattedRemainingValue.value}
          </span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="center"
          sideOffset={8}
          collisionPadding={16}
          className={cn(
            'z-40 w-88 max-w-[calc(100vw-2rem)] rounded-xl border p-4 shadow-lg focus:outline-none',
            pickSurfaceClass('bg-popover', 'bg-popover/95 backdrop-blur-xl'),
          )}
          aria-label="费用与汇率"
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">费用与汇率</h2>
            <Popover.Close
              aria-label="关闭费用详情"
              className="flex size-8 items-center justify-center rounded-md hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Icon icon="tabler:x" width={16} height={16} />
            </Popover.Close>
          </div>
          <div className="flex h-full min-w-0 flex-col overflow-hidden">
            <div className="shrink-0 grid grid-cols-3 gap-1.5">
              {financeSummaryItems.map((item, index) => (
                <div key={item.label} className="min-w-0">
                  <div className="flex mb-1.5 items-center text-xs font-medium text-muted-foreground">{item.label}</div>
                  <div
                    key={`remaining-value-${item.label}-${exchangeRateBaseCurrency}`}
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
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
