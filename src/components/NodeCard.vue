<script setup lang="ts">
import type { NodeData } from '@/stores/nodes'
import { Icon } from '@iconify/vue'
import { computed } from 'vue'
import { Badge } from '@/components/ui/badge'
import { CardX } from '@/components/ui/card-x'
import { DataTooltip } from '@/components/ui/data-tooltip'
import { ProgressThin } from '@/components/ui/progress-thin'
import { useBackgroundSurface } from '@/composables/useBackgroundSurface'
import { useNodeFormatters } from '@/composables/useNodeFormatters'
import { useNodePingDisplay } from '@/composables/useNodePingDisplay'
import { useAppStore } from '@/stores/app'
import { formatDateTime, getStatus } from '@/utils/helper'
import { getCustomTags, getDiskPercentage, getMemPercentage, getPriceTags, getRemainingTimeTagClass, getTrafficUsed, getTrafficUsedPercentage, hasRegion, showTrafficProgress } from '@/utils/nodeHelpers'
import { getOSImage, getOSName } from '@/utils/osImageHelper'
import { getFlagSrc, getRegionDisplayName } from '@/utils/regionHelper'

const props = defineProps<{ node: NodeData }>()

const emit = defineEmits<{
  click: []
  pingClick: [node: NodeData]
}>()

const appStore = useAppStore()
const { pickSurfaceClass } = useBackgroundSurface()
const { formatBytes, formatBytesPerSecond, formatUptime } = useNodeFormatters()

const offlineTime = computed(() => formatDateTime(props.node.time))
const expiredDate = computed(() => formatDateTime(props.node.expired_at, 'YYYY-MM-DD'))

const cpuStatus = computed(() => getStatus(props.node.cpu ?? 0))
const memPercentage = computed(() => getMemPercentage(props.node))
const memStatus = computed(() => getStatus(memPercentage.value))
const diskPercentage = computed(() => getDiskPercentage(props.node))
const diskStatus = computed(() => getStatus(diskPercentage.value))

const trafficUsedPercentage = computed(() => getTrafficUsedPercentage(props.node))
const trafficUsed = computed(() => getTrafficUsed(props.node))

const { pingTable } = useNodePingDisplay(() => props.node.uuid)

// 延迟 / 丢包趋势：固定高度，单栈一行占满、双栈上下两行，保证各卡片对齐
const trendPanels = computed(() => {
  const rows = pingTable.value?.rows ?? []
  return [
    {
      metric: 'latency',
      label: '延迟',
      rows: rows.map(row => ({ key: `${row.stack}`, bars: row.latencyBars })),
    },
    {
      metric: 'loss',
      label: '丢包',
      rows: rows.map(row => ({ key: `${row.stack}`, bars: row.lossBars })),
    },
  ]
})

const metrics = computed(() => [
  {
    key: 'cpu',
    label: 'CPU',
    value: props.node.cpu ?? 0,
    status: cpuStatus.value,
    detail: `${(props.node.load ?? 0).toFixed(2)}  ${(props.node.load5 ?? 0).toFixed(2)}  ${(props.node.load15 ?? 0).toFixed(2)}`,
    tip: '1 / 5 / 15 分钟负载',
  },
  {
    key: 'mem',
    label: '内存',
    value: memPercentage.value,
    status: memStatus.value,
    detail: `${formatBytes(props.node.ram ?? 0)} / ${formatBytes(props.node.mem_total ?? 0)}`,
    tip: props.node.swap
      ? `Swap ${formatBytes(props.node.swap)}`
      : '',
  },
  {
    key: 'disk',
    label: '硬盘',
    value: diskPercentage.value,
    status: diskStatus.value,
    detail: `${formatBytes(props.node.disk ?? 0)} / ${formatBytes(props.node.disk_total ?? 0)}`,
    tip: '',
  },
  {
    key: 'traffic',
    label: '流量',
    value: trafficUsedPercentage.value,
    status: 'info' as const,
    detail: `${formatBytes(trafficUsed.value)} / ${showTrafficProgress(props.node)
      ? formatBytes(props.node.traffic_limit)
      : '∞'}`,
    tip: `上行 ${formatBytes(props.node.net_total_up ?? 0)}\n下行 ${formatBytes(props.node.net_total_down ?? 0)}`,
  },
])

const priceTags = computed(() => getPriceTags(props.node, appStore.lang))
const remainingTimeTagClass = computed(() => getRemainingTimeTagClass(props.node))
const customTags = computed(() => getCustomTags(props.node))

function openPingDialog() {
  emit('pingClick', props.node)
}
</script>

<template>
  <CardX
    content-class="flex flex-1 flex-col"
    header-class="pb-2"
    class="node-card group/card h-full w-full cursor-pointer rounded-xl border bg-card shadow-xs transition-colors duration-150 hover:border-foreground/20"
    :class="[pickSurfaceClass('', 'backdrop-blur-sm'), !props.node.online && 'border-red-600/25 dark:border-red-400/25']"
    @click="emit('click')"
  >
    <template #header>
      <div class="flex min-w-0 items-center gap-2">
        <span
          class="size-2 shrink-0 rounded-full ring-3"
          :class="props.node.online ? 'bg-emerald-600 ring-emerald-600/15 dark:bg-emerald-400 dark:ring-emerald-400/15' : 'bg-red-600 ring-red-600/15'"
        />
        <div class="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-tight">
          {{ props.node.name }}
        </div>
      </div>
    </template>

    <template #header-extra>
      <div class="flex items-center gap-2 opacity-90">
        <img :src="getOSImage(props.node.os)" :alt="getOSName(props.node.os)" class="size-4">
        <img
          v-if="hasRegion(props.node.region)" :src="getFlagSrc(props.node.region)"
          :alt="getRegionDisplayName(props.node.region)" class="h-3.5 w-5 shrink-0 rounded-[2px] object-cover"
        >
      </div>
    </template>

    <template #default>
      <div class="relative flex flex-1 flex-col">
        <div
          v-if="!props.node.online"
          class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 text-xs text-muted-foreground"
        >
          <span class="text-sm font-medium text-red-700 dark:text-red-400">离线</span>
          <span class="num">{{ offlineTime }}</span>
        </div>

        <div class="flex flex-1 flex-col gap-3" :class="[!props.node.online && 'pointer-events-none opacity-35 blur-[1.5px]']">
          <!-- 资源 -->
          <div class="grid grid-cols-2 gap-x-4 gap-y-2.5">
            <DataTooltip
              v-for="metric in metrics" :key="metric.key" placement="top" class="block"
              :content="metric.tip" :content-class="[!metric.tip && '!hidden', 'whitespace-pre-wrap text-[11px]']"
            >
              <div class="flex flex-col gap-1">
                <div class="flex items-baseline justify-between text-xs">
                  <span class="text-muted-foreground">{{ metric.label }}</span>
                  <span class="num text-[13px] font-medium">{{ metric.value.toFixed(1) }}<span class="text-[11px] text-muted-foreground">%</span></span>
                </div>
                <ProgressThin :percentage="metric.value" :status="metric.status" :height="3" />
                <div class="num truncate text-[11px] text-muted-foreground">
                  {{ metric.detail }}
                </div>
              </div>
            </DataTooltip>
          </div>

          <!-- 运行信息 -->
          <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t pt-2.5 text-[11px]">
            <dt class="text-muted-foreground">
              速率
            </dt>
            <dd class="num flex justify-end gap-2.5">
              <span class="inline-flex items-center gap-0.5 text-emerald-700 dark:text-emerald-300">
                <Icon icon="tabler:arrow-up" width="11" height="11" />{{ formatBytesPerSecond(props.node.net_out ?? 0) }}
              </span>
              <span class="inline-flex items-center gap-0.5 text-sky-700 dark:text-sky-300">
                <Icon icon="tabler:arrow-down" width="11" height="11" />{{ formatBytesPerSecond(props.node.net_in ?? 0) }}
              </span>
            </dd>
            <dt class="text-muted-foreground">
              在线
            </dt>
            <dd class="num text-right">
              {{ props.node.uptime > 0 ? formatUptime(props.node.uptime) : '--' }}
            </dd>
            <dt class="text-muted-foreground">
              费用
            </dt>
            <dd class="flex justify-end">
              <DataTooltip placement="left" :content="expiredDate" content-class="whitespace-nowrap">
                <span class="num flex gap-2">
                  <span v-for="tag in priceTags" :key="tag.text" :class="tag.highlight ? remainingTimeTagClass : ''">{{ tag.text }}</span>
                </span>
              </DataTooltip>
            </dd>
          </dl>

          <!-- 网络：趋势 + 表格，单栈 / 双栈同一结构 -->
          <div
            role="button" tabindex="0"
            class="-mx-1.5 flex flex-col gap-2 rounded-md px-1.5 py-1 text-[11px] transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            :aria-label="`${props.node.name} 延迟详情`"
            @click.stop="openPingDialog" @keydown.enter.stop.prevent="openPingDialog" @keydown.space.stop.prevent="openPingDialog"
          >
            <div class="grid grid-cols-2 gap-x-4">
              <div v-for="panel in trendPanels" :key="panel.metric" class="flex flex-col gap-1">
                <span class="text-[10px] leading-none text-muted-foreground">{{ panel.label }}</span>
                <div class="flex h-4 flex-col gap-[2px]">
                  <template v-if="panel.rows.length">
                    <div
                      v-for="row in panel.rows" :key="row.key"
                      class="grid min-h-0 flex-1 gap-[2px]"
                      :style="{ gridTemplateColumns: `repeat(${row.bars.length || 1}, minmax(0, 1fr))` }"
                    >
                      <DataTooltip
                        v-for="bar in row.bars" :key="bar.key" placement="top" :content="bar.tooltip"
                        class="h-full w-full" content-class="whitespace-pre-wrap w-max px-1.5 !leading-[1.2] text-[11px]"
                      >
                        <span class="block h-full w-full rounded-[2px]" :class="bar.className" />
                      </DataTooltip>
                    </div>
                  </template>
                  <div v-else class="flex-1 rounded-[2px] bg-muted" />
                </div>
              </div>
            </div>

            <div
              v-if="pingTable"
              class="num grid items-baseline gap-x-2 gap-y-0.5"
              :style="{ gridTemplateColumns: `1.1rem repeat(${pingTable.headers.length}, minmax(0, 1fr)) minmax(0, 1fr) minmax(0, 1fr)` }"
            >
              <span />
              <span v-for="header in pingTable.headers" :key="header" class="truncate text-right font-sans text-[10px] text-muted-foreground">{{ header }}</span>
              <span class="text-right font-sans text-[10px] text-muted-foreground">延迟</span>
              <span class="text-right font-sans text-[10px] text-muted-foreground">丢包</span>
              <template v-for="row in pingTable.rows" :key="`${row.stack}`">
                <span class="text-[10px] text-muted-foreground/80">{{ row.stack ?? '' }}</span>
                <DataTooltip
                  v-for="cell in row.cells" :key="cell.key" placement="top" :content="cell.tooltip"
                  content-class="whitespace-pre-wrap w-max px-1.5 !leading-[1.2] text-[11px]"
                >
                  <span class="block text-right text-xs" :class="cell.toneClass">{{ cell.latency }}</span>
                </DataTooltip>
                <span class="text-right text-xs font-medium" :class="row.latencyTone">{{ row.latency }}<span v-if="row.latency !== '--'" class="text-[10px] font-normal text-muted-foreground">ms</span></span>
                <span class="text-right text-xs" :class="row.lossTone">{{ row.loss }}</span>
              </template>
            </div>
            <div v-else class="text-[11px] text-muted-foreground/70">
              未配置延迟监测
            </div>
          </div>

          <!-- 标签：没有也占位，卡片底部对齐 -->
          <div class="mt-auto flex min-h-[22px] flex-wrap items-center gap-1">
            <Badge
              v-for="(tag, index) in customTags" :key="index" variant="outline"
              class="rounded-md border-transparent bg-muted px-1.5 !text-[11px] font-normal text-muted-foreground"
            >
              {{ tag }}
            </Badge>
          </div>
        </div>
      </div>
    </template>
  </CardX>
</template>
