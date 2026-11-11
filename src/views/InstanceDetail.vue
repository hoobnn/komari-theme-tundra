<script setup lang="ts">
import type { CurrencyCode } from '@/utils/financeHelper'
import { Icon } from '@iconify/vue'
import { computed, defineAsyncComponent, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'
import { CardX } from '@/components/ui/card-x'
import { Empty } from '@/components/ui/empty'
import { useBackgroundSurface } from '@/composables/useBackgroundSurface'
import { useExchangeRates } from '@/composables/useExchangeRates'
import { useNodeFormatters } from '@/composables/useNodeFormatters'
import { useAppStore } from '@/stores/app'
import { useNodesStore } from '@/stores/nodes'
import { calculateMonthlyAverageCostCNY, calculateRemainingValueCNY, calculateValueCNY, formatFinanceAmount, getStoredFinanceCurrency } from '@/utils/financeHelper'
import { formatDateTime } from '@/utils/helper'
import { getTrafficUsed } from '@/utils/nodeHelpers'
import { getOSImage, getOSName } from '@/utils/osImageHelper'
import { getFlagSrc, getRegionDisplayName } from '@/utils/regionHelper'
import { getBillingCycleText, getExpireText, getExpireTextClass } from '@/utils/tagHelper'

const LoadChart = defineAsyncComponent(() => import('@/components/LoadChart.vue'))
const PingChart = defineAsyncComponent(() => import('@/components/PingChart.vue'))

const route = useRoute()
const router = useRouter()

const appStore = useAppStore()
const { pickSurfaceClass } = useBackgroundSurface()
const nodesStore = useNodesStore()
const { formatBytes, formatBytesPerSecond, formatUptime } = useNodeFormatters()
const { exchangeRates } = useExchangeRates()
const financeBaseCurrency = ref<CurrencyCode>('CNY')

onMounted(() => {
  window.scrollTo({ top: 0, behavior: 'instant' })
  financeBaseCurrency.value = getStoredFinanceCurrency()
})

const data = computed(() => nodesStore.nodes.find(node => node.uuid === route.params.id))

interface InfoItem {
  label: string
  value: string | undefined
  icon?: string
}

interface MetricCard {
  label: string
  value: string
  /** 紧跟数值的小字单位（币种、天） */
  unit?: string
  /** 第二行的计费周期（每年 / 每月） */
  cycle?: string
  icon: string
  valueClass?: string
  /** 没有可显示的值时整张卡降为次要色 */
  empty?: boolean
}

const EXPIRES_IN_SUFFIX_REGEX = /^(\d+)\s*(天|days?)$/i

// 金额拆成「符号+数值」与币种：人民币只显示 ¥，其他币种在数值后补小字代码（避免 ¥ 同时表示日元时混淆）
function formatFinanceMetric(amountCNY: number, currency: CurrencyCode): { value: string, unit?: string } {
  const targetRate = exchangeRates.value[currency] || 1
  const formatted = formatFinanceAmount(amountCNY * targetRate, currency)
  return {
    value: `${formatted.symbol}${formatted.value}`,
    unit: currency === 'CNY'
      ? undefined
      : formatted.currency,
  }
}

// 计费周期写成「每年 / 每季度 / 每 30 天」，一次性付费保持原文
function zhCycleText(cycle: string): string {
  if (appStore.lang !== 'zh-CN')
    return `/ ${cycle}`
  if (cycle === '一次性')
    return cycle
  if (cycle === '季')
    return '每季度'
  return /^\d/.test(cycle)
    ? `每 ${cycle}`
    : `每${cycle}`
}

const hasPrice = computed(() => Boolean(data.value) && calculateValueCNY(data.value!, exchangeRates.value) > 0)

const nodePriceMetric = computed(() => {
  if (!data.value || !hasPrice.value)
    return { value: '--' }
  const cycle = getBillingCycleText(data.value.billing_cycle, appStore.lang)
  return {
    ...formatFinanceMetric(calculateValueCNY(data.value, exchangeRates.value), financeBaseCurrency.value),
    cycle: zhCycleText(cycle),
  }
})

const monthlyAverageCostMetric = computed(() => {
  if (!data.value || !hasPrice.value || Number(data.value.billing_cycle) <= 0)
    return { value: '--' }
  return {
    ...formatFinanceMetric(calculateMonthlyAverageCostCNY(data.value, exchangeRates.value), financeBaseCurrency.value),
    cycle: appStore.lang === 'zh-CN'
      ? '每月'
      : '/ Month',
  }
})

const remainingTimeMetric = computed(() => {
  if (!data.value?.expired_at)
    return { value: '--' }
  const text = getExpireText(data.value.expired_at, appStore.lang)
  const match = text.match(EXPIRES_IN_SUFFIX_REGEX)
  return match
    ? { value: match[1] ?? text, unit: match[2] }
    : { value: text }
})

const remainingValueMetric = computed(() => {
  if (!data.value || !hasPrice.value)
    return { value: '--' }
  return formatFinanceMetric(calculateRemainingValueCNY(data.value, exchangeRates.value), financeBaseCurrency.value)
})

const remainingTimeValueClass = computed(() => {
  if (!data.value?.expired_at)
    return ''

  return getExpireTextClass(data.value.expired_at)
})

const metricCards = computed<MetricCard[]>(() => {
  if (!data.value)
    return []

  const cards: MetricCard[] = [
    { label: '节点价格', icon: 'tabler:cash', ...nodePriceMetric.value },
    { label: '月均支出', icon: 'tabler:receipt-2', ...monthlyAverageCostMetric.value },
    {
      label: '剩余时间',
      icon: 'tabler:calendar-dollar',
      valueClass: remainingTimeValueClass.value,
      ...remainingTimeMetric.value,
    },
    { label: '剩余价值', icon: 'tabler:coins', ...remainingValueMetric.value },
  ]
  return cards.map(card => ({ ...card, empty: card.value === '--' }))
})

// 有 GPU 详情时用真实型号（WSL 等环境的 gpu_name 只是虚拟 DRM 名），同型号多卡显示为「N × 型号」
const gpuDisplayName = computed(() => {
  const gpus = data.value?.gpu_detailed_info
  if (!gpus?.length) {
    const name = data.value?.gpu_name?.trim()
    return name && name.toLowerCase() !== 'none'
      ? name
      : '无'
  }
  const counts = new Map<string, number>()
  for (const gpu of gpus)
    counts.set(gpu.name, (counts.get(gpu.name) ?? 0) + 1)
  return Array.from(counts, ([name, count]) => count > 1
    ? `${count} × ${name}`
    : name).join(' / ')
})

const hardwareInfo = computed<InfoItem[]>(() => [
  {
    label: 'CPU',
    value: data.value
      ? `${data.value.cpu_name} (x${data.value.cpu_cores})`
      : '-',
    icon: 'icon-park-outline:cpu',
  },
  { label: '架构', value: data.value?.arch ?? '-', icon: 'icon-park-outline:application-two' },
  { label: '虚拟化', value: data.value?.virtualization ?? '-', icon: 'icon-park-outline:server' },
  { label: 'GPU', value: gpuDisplayName.value, icon: 'icon-park-outline:video-one' },
])

const systemInfo = computed<InfoItem[]>(() => [
  { label: '操作系统', value: data.value?.os ?? '-', icon: 'icon-park-outline:computer' },
  { label: '内核版本', value: data.value?.kernel_version ?? '-', icon: 'icon-park-outline:code' },
  {
    label: '运行时间',
    value: formatUptime(data.value?.uptime ?? 0, 'minute'),
    icon: 'icon-park-outline:timer',
  },
  {
    label: '最后上报',
    value: formatDateTime(data.value?.time),
    icon: 'icon-park-outline:time',
  },
])

const storageInfo = computed<InfoItem[]>(() => [
  {
    label: '内存',
    value: formatBytes(data.value?.mem_total ?? 0),
    icon: 'icon-park-outline:memory',
  },
  {
    label: 'Swap',
    value: formatBytes(data.value?.swap_total ?? 0),
    icon: 'icon-park-outline:switch',
  },
  {
    label: '硬盘',
    value: formatBytes(data.value?.disk_total ?? 0),
    icon: 'icon-park-outline:hard-disk',
  },
])

const trafficUsed = computed(() => {
  if (!data.value)
    return 0
  return getTrafficUsed(data.value)
})

const hasTrafficLimit = computed(() => (data.value?.traffic_limit ?? 0) > 0)

const trafficUsedPercentage = computed(() => {
  const trafficLimit = data.value?.traffic_limit ?? 0
  if (trafficLimit <= 0)
    return 0

  return Math.min((trafficUsed.value / trafficLimit) * 100, 100)
})

const trafficUsageText = computed(() => {
  if (!hasTrafficLimit.value)
    return `${formatBytes(trafficUsed.value)} / 不限`

  return `${formatBytes(trafficUsed.value)} / ${formatBytes(data.value?.traffic_limit ?? 0)}`
})

const trafficProgressStyle = computed(() => ({
  width: `${trafficUsedPercentage.value}%`,
}))
</script>

<template>
  <div class="instance-detail space-y-4">
    <div v-if="!data" class="p-4">
      <CardX
        :class="pickSurfaceClass('bg-card shadow-xs', 'bg-card/60 backdrop-blur-xs')"
      >
        <Empty description="节点不存在或已被删除">
          <template #extra>
            <Button @click="router.push('/')">
              返回首页
            </Button>
          </template>
        </Empty>
      </CardX>
    </div>

    <template v-else>
      <div class="px-4 flex gap-4 items-center">
        <Button variant="ghost" size="icon-sm" class="bg-background/50 hover:bg-background" aria-label="返回首页" @click="router.push('/')">
          <Icon icon="tabler:arrow-left" :width="16" :height="16" />
        </Button>
        <div class="flex min-w-0 items-center gap-2 text-lg font-semibold">
          <img
            :src="getFlagSrc(data.region)" :alt="getRegionDisplayName(data.region)"
            class="h-4 w-6 shrink-0 rounded-[2px] object-cover"
          >
          <span>{{ data.name }}</span>
        </div>
        <span
          class="rounded-md px-1.5 py-0.5 text-xs font-medium"
          :class="data.online ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-red-500/10 text-red-600 dark:text-red-400'"
        >
          {{ data.online ? '在线' : '离线' }}
        </span>
      </div>

      <div class="px-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <CardX
          v-for="item in metricCards" :key="item.label" size="small"
          class="h-full rounded-xl border"
          :class="pickSurfaceClass('bg-card shadow-xs', 'bg-card/60 backdrop-blur-xs')"
          content-class="h-full !p-3"
        >
          <div class="flex h-full min-h-10 md:min-h-18 flex-col justify-between gap-3">
            <div class="flex items-center justify-between gap-2">
              <span class="text-xs font-medium text-muted-foreground">{{ item.label }}</span>
              <Icon :icon="item.icon" :width="18" :height="18" class="text-muted-foreground/50" />
            </div>
            <div class="min-w-0 space-y-1">
              <div
                class="flex min-w-0 items-baseline gap-1 truncate font-semibold leading-none"
                :class="item.empty ? 'text-muted-foreground/60' : item.valueClass"
              >
                <span class="num truncate text-base sm:text-[26px]">{{ item.value }}</span>
                <span v-if="item.unit" class="shrink-0 text-[11px] font-medium text-muted-foreground sm:text-xs">
                  {{ item.unit }}
                </span>
              </div>
              <!-- 没有计费周期时也占位，保证四张卡数值基线对齐 -->
              <div class="text-[11px] text-muted-foreground" :class="!item.cycle && 'invisible'">
                {{ item.cycle || '-' }}
              </div>
            </div>
          </div>
        </CardX>
      </div>

      <div class="px-4 gap-4 grid grid-cols-1 lg:grid-cols-2">
        <CardX
          title="硬件信息" size="small"
          class="h-full rounded-xl border"
          :class="pickSurfaceClass('bg-card shadow-xs', 'bg-card/60 backdrop-blur-xs')"
        >
          <div class="gap-3 grid grid-cols-3">
            <div
              v-for="(item, index) in hardwareInfo" :key="item.label"
              class="min-w-0 flex flex-col gap-1 rounded-sm bg-slate-500/5 p-2" :class="!index && 'col-span-3'"
            >
              <div class="flex gap-1 items-center text-muted-foreground">
                <Icon v-if="item.icon" :icon="item.icon" :width="14" :height="14" class="text-muted-foreground/70" />
                <span class="text-xs sm:text-sm">{{ item.label }}</span>
              </div>
              <span class="text-xs sm:text-sm break-words">{{ item.value }}</span>
            </div>
          </div>
        </CardX>

        <CardX
          title="系统信息" size="small"
          class="h-full rounded-xl border"
          :class="pickSurfaceClass('bg-card shadow-xs', 'bg-card/60 backdrop-blur-xs')"
        >
          <div class="gap-3 grid grid-cols-1 sm:grid-cols-2">
            <div
              v-for="item in systemInfo" :key="item.label"
              class="min-w-0 flex flex-col gap-1 rounded-sm bg-slate-500/5 p-2"
            >
              <div class="flex gap-1 items-center text-muted-foreground">
                <Icon v-if="item.icon" :icon="item.icon" :width="14" :height="14" class="text-muted-foreground/70" />
                <span class="text-xs sm:text-sm">{{ item.label }}</span>
              </div>
              <div class="flex min-w-0 gap-2 items-center">
                <img
                  v-if="item.label === '操作系统'" :src="getOSImage(data.os)" :alt="getOSName(data.os)"
                  class="size-5 shrink-0"
                >
                <span class="text-xs sm:text-sm break-words">
                  {{ item.value }}
                </span>
              </div>
            </div>
          </div>
        </CardX>

        <CardX
          title="存储信息" size="small"
          class="h-full rounded-xl border"
          :class="pickSurfaceClass('bg-card shadow-xs', 'bg-card/60 backdrop-blur-xs')"
        >
          <div class="gap-3 grid grid-cols-3">
            <div
              v-for="item in storageInfo" :key="item.label"
              class="min-w-0 flex flex-col gap-1 rounded-sm bg-slate-500/5 p-2"
            >
              <div class="flex gap-1 items-center text-muted-foreground">
                <Icon v-if="item.icon" :icon="item.icon" :width="14" :height="14" class="text-muted-foreground/70" />
                <span class="text-xs sm:text-sm">{{ item.label }}</span>
              </div>
              <span class="text-xs sm:text-sm break-words">{{ item.value }}</span>
            </div>
          </div>
        </CardX>

        <CardX
          title="网络信息" size="small"
          class="h-full rounded-xl border"
          :class="pickSurfaceClass('bg-card shadow-xs', 'bg-card/60 backdrop-blur-xs')"
          content-class="pt-0"
        >
          <div class="gap-3 grid grid-cols-2">
            <div class="relative min-w-0 overflow-hidden rounded-sm bg-slate-500/5 p-2">
              <div
                v-if="hasTrafficLimit"
                class="absolute inset-y-0 left-0 rounded-sm bg-primary/10 pointer-events-none transition-[width] duration-300 ease-out"
                :style="trafficProgressStyle"
              />
              <div class="relative flex flex-col gap-1.5">
                <div class="flex gap-1 items-center text-muted-foreground">
                  <Icon icon="icon-park-outline:transfer-data" :width="14" :height="14" />
                  <span class="text-xs sm:text-sm">总流量</span>
                </div>
                <span class="num text-xs sm:text-sm break-words">
                  {{ trafficUsageText }}
                </span>
                <div class="num flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                  <span class="flex items-center gap-0.5"><Icon icon="tabler:arrow-up" width="11" height="11" class="text-emerald-700 dark:text-emerald-300" />{{ formatBytes(data?.net_total_up ?? 0) }}</span>
                  <span class="flex items-center gap-0.5"><Icon icon="tabler:arrow-down" width="11" height="11" class="text-sky-700 dark:text-sky-300" />{{ formatBytes(data?.net_total_down ?? 0) }}</span>
                </div>
              </div>
            </div>
            <div class="min-w-0 flex flex-col gap-1 rounded-sm bg-slate-500/5 p-2">
              <div class="flex gap-1 items-center text-muted-foreground">
                <Icon icon="icon-park-outline:dashboard-one" :width="14" :height="14" />
                <span class="text-xs sm:text-sm">网络速率</span>
              </div>
              <span class="num flex flex-col gap-0.5 text-xs sm:text-sm">
                <span class="flex items-center gap-1">
                  <Icon icon="tabler:arrow-up" width="12" height="12" class="text-emerald-700 dark:text-emerald-300" />
                  {{ formatBytesPerSecond(data?.net_out ?? 0) }}
                </span>
                <span class="flex items-center gap-1">
                  <Icon icon="tabler:arrow-down" width="12" height="12" class="text-sky-700 dark:text-sky-300" />
                  {{ formatBytesPerSecond(data?.net_in ?? 0) }}
                </span>
              </span>
            </div>
          </div>
        </CardX>
      </div>

      <section class="space-y-3">
        <h2 class="px-4 text-base font-semibold">
          负载
        </h2>
        <LoadChart :uuid="data.uuid" class="px-4" />
      </section>
      <section class="space-y-3">
        <h2 class="px-4 text-base font-semibold">
          延迟与丢包
        </h2>
        <PingChart :uuid="data.uuid" class="px-4" />
      </section>
    </template>
  </div>
</template>
