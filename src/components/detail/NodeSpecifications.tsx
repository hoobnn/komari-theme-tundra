import type { ReactNode } from 'react'
import { useState } from 'react'
import { Icon } from '@iconify/react'
import { ProgressThin } from '@/components/ui/progress-thin'
import { useBackgroundSurface } from '@/hooks/useBackgroundSurface'
import { useExchangeRates } from '@/hooks/useExchangeRates'
import { useNodeFormatters } from '@/hooks/useNodeFormatters'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/stores/app'
import type { NodeData } from '@/stores/nodes'
import type { CurrencyCode } from '@/utils/financeHelper'
import {
  calculateMonthlyAverageCostCNY,
  calculateRemainingValueCNY,
  calculateValueCNY,
  formatFinanceAmount,
  getStoredFinanceCurrency,
} from '@/utils/financeHelper'
import { formatDateTime } from '@/utils/helper'
import { getTrafficUsed } from '@/utils/nodeHelpers'
import { getOSImage } from '@/utils/osImageHelper'
import { getBillingCycleText, getExpireText, getExpireTextClass } from '@/utils/tagHelper'

interface InfoItem {
  label: string
  value: string | undefined
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

function SpecSection({
  title,
  icon,
  items,
  renderValue,
}: {
  title: string
  icon: string
  items: InfoItem[]
  renderValue?: (item: InfoItem) => ReactNode | undefined
}) {
  return (
    <section className="min-w-0 p-4">
      <h3 className="mb-3 flex items-center gap-2 text-compact font-semibold">
        <Icon icon={icon} className="size-4 text-muted-foreground" />
        {title}
      </h3>
      <dl className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-compact">
        {items.map(item => (
          <div key={item.label} className="contents">
            <dt className="text-muted-foreground">{item.label}</dt>
            <dd className="min-w-0 break-words font-medium">{renderValue?.(item) ?? item.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

export default function NodeSpecifications({ data }: { data: NodeData }) {
  const lang = useAppStore(state => state.lang)
  const { pickSurfaceClass } = useBackgroundSurface()
  const { formatBytes, formatBytesPerSecond, formatUptime } = useNodeFormatters()
  const { exchangeRates } = useExchangeRates()
  const [financeBaseCurrency] = useState<CurrencyCode>(() => getStoredFinanceCurrency())

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

  const hasPrice = calculateValueCNY(data, exchangeRates) > 0

  const nodePriceMetric: { value: string; unit?: string; cycle?: string } = (() => {
    if (!hasPrice) return { value: '--' }
    const cycle = getBillingCycleText(data.billing_cycle, lang)
    return {
      ...formatFinanceMetric(calculateValueCNY(data, exchangeRates), financeBaseCurrency),
      cycle: zhCycleText(cycle),
    }
  })()

  const monthlyAverageCostMetric: { value: string; unit?: string; cycle?: string } = (() => {
    if (!hasPrice || data.billing_cycle <= 0) return { value: '--' }
    return {
      ...formatFinanceMetric(calculateMonthlyAverageCostCNY(data, exchangeRates), financeBaseCurrency),
      cycle: lang === 'zh-CN' ? '每月' : '/ Month',
    }
  })()

  const remainingTimeMetric: { value: string; unit?: string } = (() => {
    if (!data.expired_at) return { value: '--' }
    const text = getExpireText(data.expired_at, lang)
    const match = text.match(EXPIRES_IN_SUFFIX_REGEX)
    return match ? { value: match[1] ?? text, unit: match[2] } : { value: text }
  })()

  const remainingValueMetric: { value: string; unit?: string } = (() => {
    if (!hasPrice) return { value: '--' }
    return formatFinanceMetric(calculateRemainingValueCNY(data, exchangeRates), financeBaseCurrency)
  })()

  const remainingTimeValueClass = data.expired_at ? getExpireTextClass(data.expired_at) : ''

  const metricCards: MetricCard[] = (
    [
      { label: '节点价格', icon: 'lucide:banknote', ...nodePriceMetric },
      { label: '月均支出', icon: 'lucide:receipt-text', ...monthlyAverageCostMetric },
      {
        label: '剩余时间',
        icon: 'lucide:calendar-clock',
        valueClass: remainingTimeValueClass,
        ...remainingTimeMetric,
      },
      { label: '剩余价值', icon: 'lucide:coins', ...remainingValueMetric },
    ] satisfies MetricCard[]
  ).map(card => ({ ...card, empty: card.value === '--' }))

  // 有 GPU 详情时用真实型号（WSL 等环境的 gpu_name 只是虚拟 DRM 名），同型号多卡显示为「N × 型号」
  const gpuDisplayName = (() => {
    const gpus = data.gpu_detailed_info
    if (!gpus?.length) {
      const name = data.gpu_name?.trim()
      return name && name.toLowerCase() !== 'none' ? name : '无'
    }
    const counts = new Map<string, number>()
    for (const gpu of gpus) counts.set(gpu.name, (counts.get(gpu.name) ?? 0) + 1)
    return Array.from(counts, ([name, count]) => (count > 1 ? `${count} × ${name}` : name)).join(' / ')
  })()

  const hardwareInfo: InfoItem[] = [
    {
      label: 'CPU',
      value: `${data.cpu_name} (x${data.cpu_cores})`,
    },
    { label: '架构', value: data.arch ?? '-' },
    { label: '虚拟化', value: data.virtualization ?? '-' },
    { label: 'GPU', value: gpuDisplayName },
  ]

  const systemInfo: InfoItem[] = [
    { label: '操作系统', value: data.os ?? '-' },
    { label: '内核版本', value: data.kernel_version ?? '-' },
    {
      label: '运行时间',
      value: formatUptime(data.uptime ?? 0, 'minute'),
    },
    {
      label: '最后上报',
      value: formatDateTime(data.time),
    },
  ]

  const storageInfo: InfoItem[] = [
    {
      label: '内存',
      value: formatBytes(data.mem_total ?? 0),
    },
    {
      label: 'Swap',
      value: formatBytes(data.swap_total ?? 0),
    },
    {
      label: '硬盘',
      value: formatBytes(data.disk_total ?? 0),
    },
  ]

  const trafficUsed = getTrafficUsed(data)
  const trafficLimit = data.traffic_limit ?? 0
  const hasTrafficLimit = trafficLimit > 0
  const trafficUsedPercentage = trafficLimit > 0 ? Math.min((trafficUsed / trafficLimit) * 100, 100) : 0
  const trafficLimitText = hasTrafficLimit ? `限 ${formatBytes(trafficLimit)}` : '不限'

  const cardClass = pickSurfaceClass(SURFACE_DEFAULT, SURFACE_CUSTOM)

  return (
    <div className="space-y-3">
      {/* 与首页概览一致：四项费用合成一块面板，格子之间用实线分隔 */}
      <div
        className={cn(
          'grid grid-cols-2 overflow-hidden rounded-xl border lg:grid-cols-4',
          cardClass,
          '[&>*]:border-border/70 [&>*:nth-child(odd)]:border-r [&>*:nth-child(-n+2)]:border-b lg:[&>*:nth-child(-n+2)]:border-b-0 lg:[&>*:not(:last-child)]:border-r',
        )}
      >
        {metricCards.map(item => (
          <div key={item.label} className="min-w-0 p-3 md:p-4">
            <div className="flex h-full flex-col justify-between gap-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">{item.label}</span>
                <Icon
                  icon={item.icon}
                  width={15}
                  height={15}
                  className="text-fuchsia-700/75 dark:text-fuchsia-300/80"
                />
              </div>
              <div className="min-w-0 space-y-1">
                <div
                  className={cn(
                    'flex min-w-0 items-baseline gap-1 truncate font-semibold leading-none',
                    item.empty ? 'text-muted-foreground/60' : item.valueClass,
                  )}
                >
                  <span className="num truncate text-value tracking-tight sm:text-stat">{item.value}</span>
                  {item.unit && (
                    <span className="shrink-0 text-2xs font-medium text-muted-foreground sm:text-xs">{item.unit}</span>
                  )}
                </div>
                {/* 没有计费周期时也占位，保证四张卡数值基线对齐 */}
                <div className={cn('text-2xs text-muted-foreground', !item.cycle && 'invisible')}>
                  {item.cycle || '-'}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 规格表：硬件、系统、存储、网络合成一张卡，标签与数值两列对齐，分区之间用细线隔开 */}
      <section
        aria-label="规格参数"
        className={cn(
          'grid overflow-hidden rounded-xl border outline-none md:grid-cols-2 xl:grid-cols-4',
          cardClass,
          '[&>*]:border-border/70 max-md:[&>*+*]:border-t md:[&>*:nth-child(odd)]:border-r md:max-xl:[&>*:nth-child(-n+2)]:border-b xl:[&>*:not(:last-child)]:border-r',
        )}
      >
        <SpecSection title="硬件" icon="lucide:cpu" items={hardwareInfo} />
        <SpecSection
          title="系统"
          icon="lucide:app-window"
          items={systemInfo}
          renderValue={item =>
            item.label === '操作系统' ? (
              <span className="flex min-w-0 items-center gap-1.5">
                <img src={getOSImage(data.os)} alt="" className="size-3.5 shrink-0" />
                <span className="min-w-0 break-words">{item.value}</span>
              </span>
            ) : undefined
          }
        />
        <SpecSection title="存储" icon="lucide:database" items={storageInfo} />
        <section className="min-w-0 p-4">
          <h3 className="mb-3 flex items-center gap-2 text-compact font-semibold">
            <Icon icon="lucide:network" className="size-4 text-muted-foreground" />
            网络
          </h3>
          <dl className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-compact">
            <dt className="text-muted-foreground">总流量</dt>
            <dd className="num flex min-w-0 flex-col gap-1.5">
              <span className="flex items-baseline justify-between gap-2">
                <span className="font-medium">{formatBytes(trafficUsed)}</span>
                <span className="text-2xs text-muted-foreground">{trafficLimitText}</span>
              </span>
              {hasTrafficLimit && (
                <ProgressThin
                  percentage={trafficUsedPercentage}
                  height={3}
                  className="[&>div]:bg-violet-600 dark:[&>div]:bg-violet-400"
                />
              )}
            </dd>
            {[
              {
                label: '上行',
                icon: 'lucide:arrow-up',
                tone: 'text-emerald-600 dark:text-emerald-400',
                rate: formatBytesPerSecond(data.net_out ?? 0),
                total: formatBytes(data.net_total_up ?? 0),
              },
              {
                label: '下行',
                icon: 'lucide:arrow-down',
                tone: 'text-sky-600 dark:text-sky-400',
                rate: formatBytesPerSecond(data.net_in ?? 0),
                total: formatBytes(data.net_total_down ?? 0),
              },
            ].map(row => (
              <div key={row.label} className="contents">
                <dt className="flex items-center gap-1 text-muted-foreground">
                  <Icon icon={row.icon} width={12} height={12} className={row.tone} />
                  {row.label}
                </dt>
                <dd className="num flex items-baseline justify-between gap-2">
                  <span className="font-medium">{data.online ? row.rate : '—'}</span>
                  <span className="text-2xs text-muted-foreground">
                    累计 <span className="text-foreground/80">{row.total}</span>
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </section>
    </div>
  )
}
