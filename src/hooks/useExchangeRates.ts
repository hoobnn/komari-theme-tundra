import { useEffect, useState } from 'react'
import { DEFAULT_EXCHANGE_RATES, getDailyExchangeRates } from '@/utils/financeHelper'

/** 挂载时加载当日汇率（带本地缓存），加载前先用内置默认汇率 */
export function useExchangeRates() {
  const [exchangeRates, setExchangeRates] = useState(DEFAULT_EXCHANGE_RATES)

  useEffect(() => {
    let cancelled = false
    void getDailyExchangeRates().then(({ rates }) => {
      if (!cancelled) setExchangeRates(rates)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return { exchangeRates }
}
