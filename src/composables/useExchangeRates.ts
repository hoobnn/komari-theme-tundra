import { onMounted, ref } from 'vue'
import { DEFAULT_EXCHANGE_RATES, getDailyExchangeRates } from '@/utils/financeHelper'

/** 挂载时加载当日汇率（带本地缓存），加载前先用内置默认汇率 */
export function useExchangeRates() {
  const exchangeRates = ref(DEFAULT_EXCHANGE_RATES)

  onMounted(async () => {
    const { rates } = await getDailyExchangeRates()
    exchangeRates.value = rates
  })

  return { exchangeRates }
}
