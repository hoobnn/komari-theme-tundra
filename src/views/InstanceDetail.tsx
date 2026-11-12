import type { CurrencyCode } from '@/utils/financeHelper'
import { Icon } from '@iconify/react'
import { lazy, Suspense, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { CardX } from '@/components/ui/card-x'
import { Empty } from '@/components/ui/empty'
import { useBackgroundSurface } from '@/hooks/useBackgroundSurface'
import { useExchangeRates } from '@/hooks/useExchangeRates'
import { useNodeFormatters } from '@/hooks/useNodeFormatters'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/stores/app'
import { useNode } from '@/stores/nodes'
import {
  calculateMonthlyAverageCostCNY,
  calculateRemainingValueCNY,
  calculateValueCNY,
  formatFinanceAmount,
  getStoredFinanceCurrency,
} from '@/utils/financeHelper'
import { formatDateTime } from '@/utils/helper'
import { getTrafficUsed } from '@/utils/nodeHelpers'
import { getOSImage, getOSName } from '@/utils/osImageHelper'
import { getFlagSrc, getRegionDisplayName } from '@/utils/regionHelper'
import { getBillingCycleText, getExpireText, getExpireTextClass } from '@/utils/tagHelper'

const LoadChart = lazy(() => import('@/components/LoadChart'))
const PingChart = lazy(() => import('@/components/PingChart'))

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

const SURFACE_DEFAULT = 'bg-card shadow-xs'
const SURFACE_CUSTOM = 'bg-card/60 backdrop-blur-xs'

function InstanceDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()

  const lang = useAppStore(state => state.lang)
  const { pickSurfaceClass } = useBackgroundSurface()
  const { formatBytes, formatBytesPerSecond, formatUptime } = useNodeFormatters()
  const { exchangeRates } = useExchangeRates()
  const [financeBaseCurrency] = useState<CurrencyCode>(() => getStoredFinanceCurrency())

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [])

  const data = useNode(id)

  // 金额拆成「符号+数值」与币种：人民币只显示 ¥，其他币种在数值后补小字代码（避免 ¥ 同时表示日元时混淆）
  function formatFinanceMetric(amountCNY: number, currency: CurrencyCode): { value: string; unit?: string } {
    const targetRate = exchangeRates[currency] || 1
    const formatted = formatFinanceAmount(amountCNY * targetRate, currency)
    return {
      value: `${formatted.symbol}${formatted.value}`,
      unit: currency === 'CNY' ? undefined : formatted.currency,
    }
  }

  // 计费周期写成「每年 / 每季度 / 每 30 天」，一次性付费保持原文
  function zhCycleText(cycle: string): string {
    if (lang !== 'zh-CN') return `/ ${cycle}`
    if (cycle === '一次性') return cycle
    if (cycle === '季') return '每季度'
    return /^\d/.test(cycle) ? `每 ${cycle}` : `每${cycle}`
  }

  const hasPrice = Boolean(data) && calculateValueCNY(data!, exchangeRates) > 0

  const nodePriceMetric: { value: string; unit?: string; cycle?: string } = (() => {
    if (!data || !hasPrice) return { value: '--' }
    const cycle = getBillingCycleText(data.billing_cycle, lang)
    return {
      ...formatFinanceMetric(calculateValueCNY(data, exchangeRates), financeBaseCurrency),
      cycle: zhCycleText(cycle),
    }
  })()

  const monthlyAverageCostMetric: { value: string; unit?: string; cycle?: string } = (() => {
    if (!data || !hasPrice || data.billing_cycle <= 0) return { value: '--' }
    return {
      ...formatFinanceMetric(calculateMonthlyAverageCostCNY(data, exchangeRates), financeBaseCurrency),
      cycle: lang === 'zh-CN' ? '每月' : '/ Month',
    }
  })()

  const remainingTimeMetric: { value: string; unit?: string } = (() => {
    if (!data?.expired_at) return { value: '--' }
    const text = getExpireText(data.expired_at, lang)
    const match = text.match(EXPIRES_IN_SUFFIX_REGEX)
    return match ? { value: match[1] ?? text, unit: match[2] } : { value: text }
  })()

  const remainingValueMetric: { value: string; unit?: string } = (() => {
    if (!data || !hasPrice) return { value: '--' }
    return formatFinanceMetric(calculateRemainingValueCNY(data, exchangeRates), financeBaseCurrency)
  })()

  const remainingTimeValueClass = data?.expired_at ? getExpireTextClass(data.expired_at) : ''

  const metricCards: MetricCard[] = data
    ? (
        [
          { label: '节点价格', icon: 'tabler:cash', ...nodePriceMetric },
          { label: '月均支出', icon: 'tabler:receipt-2', ...monthlyAverageCostMetric },
          {
            label: '剩余时间',
            icon: 'tabler:calendar-dollar',
            valueClass: remainingTimeValueClass,
            ...remainingTimeMetric,
          },
          { label: '剩余价值', icon: 'tabler:coins', ...remainingValueMetric },
        ] satisfies MetricCard[]
      ).map(card => ({ ...card, empty: card.value === '--' }))
    : []

  // 有 GPU 详情时用真实型号（WSL 等环境的 gpu_name 只是虚拟 DRM 名），同型号多卡显示为「N × 型号」
  const gpuDisplayName = (() => {
    const gpus = data?.gpu_detailed_info
    if (!gpus?.length) {
      const name = data?.gpu_name?.trim()
      return name && name.toLowerCase() !== 'none' ? name : '无'
    }
    const counts = new Map<string, number>()
    for (const gpu of gpus) counts.set(gpu.name, (counts.get(gpu.name) ?? 0) + 1)
    return Array.from(counts, ([name, count]) => (count > 1 ? `${count} × ${name}` : name)).join(' / ')
  })()

  const hardwareInfo: InfoItem[] = [
    {
      label: 'CPU',
      value: data ? `${data.cpu_name} (x${data.cpu_cores})` : '-',
      icon: 'icon-park-outline:cpu',
    },
    { label: '架构', value: data?.arch ?? '-', icon: 'icon-park-outline:application-two' },
    { label: '虚拟化', value: data?.virtualization ?? '-', icon: 'icon-park-outline:server' },
    { label: 'GPU', value: gpuDisplayName, icon: 'icon-park-outline:video-one' },
  ]

  const systemInfo: InfoItem[] = [
    { label: '操作系统', value: data?.os ?? '-', icon: 'icon-park-outline:computer' },
    { label: '内核版本', value: data?.kernel_version ?? '-', icon: 'icon-park-outline:code' },
    {
      label: '运行时间',
      value: formatUptime(data?.uptime ?? 0, 'minute'),
      icon: 'icon-park-outline:timer',
    },
    {
      label: '最后上报',
      value: formatDateTime(data?.time),
      icon: 'icon-park-outline:time',
    },
  ]

  const storageInfo: InfoItem[] = [
    {
      label: '内存',
      value: formatBytes(data?.mem_total ?? 0),
      icon: 'icon-park-outline:memory',
    },
    {
      label: 'Swap',
      value: formatBytes(data?.swap_total ?? 0),
      icon: 'icon-park-outline:switch',
    },
    {
      label: '硬盘',
      value: formatBytes(data?.disk_total ?? 0),
      icon: 'icon-park-outline:hard-disk',
    },
  ]

  const trafficUsed = data ? getTrafficUsed(data) : 0
  const trafficLimit = data?.traffic_limit ?? 0
  const hasTrafficLimit = trafficLimit > 0
  const trafficUsedPercentage = trafficLimit > 0 ? Math.min((trafficUsed / trafficLimit) * 100, 100) : 0
  const trafficUsageText = hasTrafficLimit
    ? `${formatBytes(trafficUsed)} / ${formatBytes(trafficLimit)}`
    : `${formatBytes(trafficUsed)} / 不限`

  const cardClass = pickSurfaceClass(SURFACE_DEFAULT, SURFACE_CUSTOM)

  if (!data) {
    return (
      <div className="instance-detail space-y-4">
        <div className="p-4">
          <CardX className={cardClass}>
            <Empty
              description="节点不存在或已被删除"
              extra={<Button onClick={() => void navigate('/')}>返回首页</Button>}
            />
          </CardX>
        </div>
      </div>
    )
  }

  return (
    <div className="instance-detail space-y-4">
      <div className="px-4 flex gap-4 items-center">
        <Button
          variant="ghost"
          size="icon-sm"
          className="bg-background/50 hover:bg-background"
          aria-label="返回首页"
          onClick={() => void navigate('/')}
        >
          <Icon icon="tabler:arrow-left" width={16} height={16} />
        </Button>
        <div className="flex min-w-0 items-center gap-2 text-lg font-semibold">
          <img
            src={getFlagSrc(data.region)}
            alt={getRegionDisplayName(data.region)}
            className="h-4 w-6 shrink-0 rounded-[2px] object-cover"
          />
          <span>{data.name}</span>
        </div>
        <span
          className={cn(
            'rounded-md px-1.5 py-0.5 text-xs font-medium',
            data.online
              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
              : 'bg-red-500/10 text-red-600 dark:text-red-400',
          )}
        >
          {data.online ? '在线' : '离线'}
        </span>
      </div>

      <div className="px-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {metricCards.map(item => (
          <CardX
            key={item.label}
            size="small"
            className={cn('h-full rounded-xl border', cardClass)}
            contentClass="h-full !p-3"
          >
            <div className="flex h-full min-h-10 md:min-h-18 flex-col justify-between gap-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">{item.label}</span>
                <Icon icon={item.icon} width={18} height={18} className="text-muted-foreground/50" />
              </div>
              <div className="min-w-0 space-y-1">
                <div
                  className={cn(
                    'flex min-w-0 items-baseline gap-1 truncate font-semibold leading-none',
                    item.empty ? 'text-muted-foreground/60' : item.valueClass,
                  )}
                >
                  <span className="num truncate text-base sm:text-[26px]">{item.value}</span>
                  {item.unit && (
                    <span className="shrink-0 text-[11px] font-medium text-muted-foreground sm:text-xs">
                      {item.unit}
                    </span>
                  )}
                </div>
                {/* 没有计费周期时也占位，保证四张卡数值基线对齐 */}
                <div className={cn('text-[11px] text-muted-foreground', !item.cycle && 'invisible')}>
                  {item.cycle || '-'}
                </div>
              </div>
            </div>
          </CardX>
        ))}
      </div>

      <div className="px-4 gap-4 grid grid-cols-1 lg:grid-cols-2">
        <CardX title="硬件信息" size="small" className={cn('h-full rounded-xl border', cardClass)}>
          <div className="gap-3 grid grid-cols-3">
            {hardwareInfo.map((item, index) => (
              <div
                key={item.label}
                className={cn('min-w-0 flex flex-col gap-1 rounded-sm bg-slate-500/5 p-2', !index && 'col-span-3')}
              >
                <div className="flex gap-1 items-center text-muted-foreground">
                  {item.icon && <Icon icon={item.icon} width={14} height={14} className="text-muted-foreground/70" />}
                  <span className="text-xs sm:text-sm">{item.label}</span>
                </div>
                <span className="text-xs sm:text-sm break-words">{item.value}</span>
              </div>
            ))}
          </div>
        </CardX>

        <CardX title="系统信息" size="small" className={cn('h-full rounded-xl border', cardClass)}>
          <div className="gap-3 grid grid-cols-1 sm:grid-cols-2">
            {systemInfo.map(item => (
              <div key={item.label} className="min-w-0 flex flex-col gap-1 rounded-sm bg-slate-500/5 p-2">
                <div className="flex gap-1 items-center text-muted-foreground">
                  {item.icon && <Icon icon={item.icon} width={14} height={14} className="text-muted-foreground/70" />}
                  <span className="text-xs sm:text-sm">{item.label}</span>
                </div>
                <div className="flex min-w-0 gap-2 items-center">
                  {item.label === '操作系统' && (
                    <img src={getOSImage(data.os)} alt={getOSName(data.os)} className="size-5 shrink-0" />
                  )}
                  <span className="text-xs sm:text-sm break-words">{item.value}</span>
                </div>
              </div>
            ))}
          </div>
        </CardX>

        <CardX title="存储信息" size="small" className={cn('h-full rounded-xl border', cardClass)}>
          <div className="gap-3 grid grid-cols-3">
            {storageInfo.map(item => (
              <div key={item.label} className="min-w-0 flex flex-col gap-1 rounded-sm bg-slate-500/5 p-2">
                <div className="flex gap-1 items-center text-muted-foreground">
                  {item.icon && <Icon icon={item.icon} width={14} height={14} className="text-muted-foreground/70" />}
                  <span className="text-xs sm:text-sm">{item.label}</span>
                </div>
                <span className="text-xs sm:text-sm break-words">{item.value}</span>
              </div>
            ))}
          </div>
        </CardX>

        <CardX title="网络信息" size="small" className={cn('h-full rounded-xl border', cardClass)} contentClass="pt-0">
          <div className="gap-3 grid grid-cols-2">
            <div className="relative min-w-0 overflow-hidden rounded-sm bg-slate-500/5 p-2">
              {hasTrafficLimit && (
                <div
                  className="absolute inset-y-0 left-0 rounded-sm bg-primary/10 pointer-events-none transition-[width] duration-300 ease-out"
                  style={{ width: `${trafficUsedPercentage}%` }}
                />
              )}
              <div className="relative flex flex-col gap-1.5">
                <div className="flex gap-1 items-center text-muted-foreground">
                  <Icon icon="icon-park-outline:transfer-data" width={14} height={14} />
                  <span className="text-xs sm:text-sm">总流量</span>
                </div>
                <span className="num text-xs sm:text-sm break-words">{trafficUsageText}</span>
                <div className="num flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-0.5">
                    <Icon
                      icon="tabler:arrow-up"
                      width="11"
                      height="11"
                      className="text-emerald-700 dark:text-emerald-300"
                    />
                    {formatBytes(data.net_total_up ?? 0)}
                  </span>
                  <span className="flex items-center gap-0.5">
                    <Icon icon="tabler:arrow-down" width="11" height="11" className="text-sky-700 dark:text-sky-300" />
                    {formatBytes(data.net_total_down ?? 0)}
                  </span>
                </div>
              </div>
            </div>
            <div className="min-w-0 flex flex-col gap-1 rounded-sm bg-slate-500/5 p-2">
              <div className="flex gap-1 items-center text-muted-foreground">
                <Icon icon="icon-park-outline:dashboard-one" width={14} height={14} />
                <span className="text-xs sm:text-sm">网络速率</span>
              </div>
              <span className="num flex flex-col gap-0.5 text-xs sm:text-sm">
                <span className="flex items-center gap-1">
                  <Icon
                    icon="tabler:arrow-up"
                    width="12"
                    height="12"
                    className="text-emerald-700 dark:text-emerald-300"
                  />
                  {formatBytesPerSecond(data.net_out ?? 0)}
                </span>
                <span className="flex items-center gap-1">
                  <Icon icon="tabler:arrow-down" width="12" height="12" className="text-sky-700 dark:text-sky-300" />
                  {formatBytesPerSecond(data.net_in ?? 0)}
                </span>
              </span>
            </div>
          </div>
        </CardX>
      </div>

      <section className="space-y-3">
        <h2 className="px-4 text-base font-semibold">负载</h2>
        <Suspense fallback={null}>
          <LoadChart uuid={data.uuid} className="px-4" />
        </Suspense>
      </section>
      <section className="space-y-3">
        <h2 className="px-4 text-base font-semibold">延迟与丢包</h2>
        <Suspense fallback={null}>
          <PingChart uuid={data.uuid} className="px-4" />
        </Suspense>
      </section>
    </div>
  )
}

export default InstanceDetail
