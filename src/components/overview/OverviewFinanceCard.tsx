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
import { OVERVIEW_CELL_CLASS, OVERVIEW_TONES, OVERVIEW_VALUE_CLASS } from '@/utils/uiClasses'
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
      icon: 'lucide:wallet',
      value: formattedTotalValue.value,
      symbol: formattedTotalValue.symbol,
      currency: formattedTotalValue.currency,
    },
    {
      label: '月均支出',
      icon: 'lucide:receipt-text',
      value: formattedMonthlyAverageCost.value,
      symbol: formattedMonthlyAverageCost.symbol,
      currency: `${formattedMonthlyAverageCost.currency}/月`,
    },
    {
      label: '剩余价值',
      icon: 'lucide:coins',
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
            OVERVIEW_CELL_CLASS,
            'group/finance cursor-pointer text-left transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring data-[state=open]:bg-muted/50 sm:col-start-3 sm:row-start-1 sm:border-b',
          )}
        >
          <span className="flex w-full items-center justify-between gap-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <span
                className={cn('flex size-5 shrink-0 items-center justify-center rounded-md', OVERVIEW_TONES.fuchsia)}
              >
                <Icon icon="lucide:coins" width={12} height={12} />
              </span>
              剩余价值
            </span>
            <Icon
              icon="lucide:chevron-down"
              width={14}
              height={14}
              className="motion-safe:transition-transform group-data-[state=open]/finance:rotate-180"
            />
          </span>
          <span
            key={transitionKey}
            className={cn(OVERVIEW_VALUE_CLASS, 'block w-full', metricSwitchClass)}
            title={`${formattedRemainingValue.symbol}${formattedRemainingValue.value}`}
          >
            {formattedRemainingValue.symbol}
            {formattedRemainingValue.value}
          </span>
          <span className="num flex min-w-0 items-center gap-3 text-2xs leading-none text-muted-foreground">
            <span className="truncate">
              月均{' '}
              <span className="text-foreground/80">
                {formattedMonthlyAverageCost.symbol}
                {formattedMonthlyAverageCost.value}
              </span>
            </span>
            <span className="hidden truncate xl:inline">
              总值{' '}
              <span className="text-foreground/80">
                {formattedTotalValue.symbol}
                {formattedTotalValue.value}
              </span>
            </span>
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
            'z-40 w-88 max-w-[calc(100vw-2rem)] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto overscroll-contain rounded-xl border p-4 shadow-lg focus:outline-none',
            pickSurfaceClass('bg-popover', 'bg-popover/95 backdrop-blur-xl'),
          )}
          aria-label="费用与汇率"
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-value font-semibold">费用与汇率</h2>
            <Popover.Close
              aria-label="关闭费用详情"
              className="flex size-8 items-center justify-center rounded-md hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Icon icon="lucide:x" width={16} height={16} />
            </Popover.Close>
          </div>
          <div className="flex min-w-0 flex-col gap-3">
            <div className="grid grid-cols-3 gap-2">
              {financeSummaryItems.map((item, index) => (
                <div key={item.label} className="min-w-0">
                  <div className="flex mb-1.5 items-center text-xs font-medium text-muted-foreground">{item.label}</div>
                  <div
                    key={`remaining-value-${item.label}-${exchangeRateBaseCurrency}`}
                    className={cn('num min-w-0 wrap-anywhere', metricSwitchClass)}
                    style={getMetricSwitchStyle(index)}
                  >
                    <span className="shrink-0 text-xs mr-0.5 font-semibold leading-none text-muted-foreground">
                      {item.symbol}
                    </span>
                    <span className="text-value font-semibold leading-none tracking-tight">{item.value}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t pt-2">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-xs text-muted-foreground">参考汇率 · 每 1 {exchangeRateBaseCurrency}</div>
                <select
                  value={exchangeRateBaseCurrency}
                  className="min-h-8 shrink-0 cursor-pointer rounded-md border bg-card px-2 text-xs font-medium focus-visible:outline-2 focus-visible:outline-ring"
                  aria-label="切换汇率基准币种"
                  onChange={event => handleBaseCurrencyChange(event.target.value)}
                >
                  {financeRateCurrencies.map(currency => (
                    <option key={currency} value={currency}>
                      {currency}
                    </option>
                  ))}
                </select>
              </div>
              <div className="num grid grid-cols-2 gap-x-5 gap-y-1.5">
                {exchangeRateRows.map((row, index) => (
                  <div key={row.currency} className="text-2xs flex items-center">
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
