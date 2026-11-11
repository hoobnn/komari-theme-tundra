<script setup lang="ts">
import { computed } from 'vue'
import { DataTooltip } from '@/components/ui/data-tooltip'
import { useNodePingDisplay } from '@/composables/useNodePingDisplay'

const props = defineProps<{
  uuid: string
  online: boolean
}>()

const { pingTable } = useNodePingDisplay(() => props.uuid)

// 列表各行线路数不同（2 条或 3 条），固定 3 格并补位，保证丢包列和趋势条起点上下对齐
const CELL_SLOTS = 3

const rows = computed(() => pingTable.value?.rows.map((row) => {
  const cells = row.cells.slice(0, CELL_SLOTS)
  while (cells.length < CELL_SLOTS) {
    cells.push({
      key: `pad-${cells.length}`,
      latency: '',
      toneClass: '',
      tooltip: '',
    })
  }
  return { ...row, cells }
}) ?? [])
</script>

<template>
  <!-- 与卡片同一张网络表的紧凑版：每个协议栈一行，固定 3 个线路延迟 + 丢包 + 趋势条 -->
  <div v-if="pingTable" class="num flex w-full flex-col gap-1 pr-3">
    <div
      v-for="row in rows" :key="`${row.stack}`"
      class="grid items-center gap-x-1.5"
      style="grid-template-columns: 1.1rem repeat(3, 1.75rem) 2.5rem minmax(0, 1fr)"
    >
      <span class="font-sans text-[10px] text-muted-foreground">{{ row.stack ?? '' }}</span>
      <DataTooltip
        v-for="cell in row.cells" :key="cell.key" placement="top" :content="cell.tooltip"
        content-class="whitespace-pre-wrap w-max"
      >
        <span class="block text-right text-[11px]" :class="cell.toneClass">{{ cell.latency }}</span>
      </DataTooltip>
      <DataTooltip placement="top" :content="`平均丢包 ${row.loss}`" content-class="whitespace-nowrap">
        <span class="block text-right text-[11px]" :class="row.lossTone">{{ row.loss }}</span>
      </DataTooltip>
      <div
        class="ml-1 grid h-1.5 gap-[1px]"
        :style="{ gridTemplateColumns: `repeat(${row.latencyBars.length || 1}, minmax(0, 1fr))` }"
      >
        <DataTooltip
          v-for="bar in row.latencyBars" :key="bar.key" placement="top" :content="bar.tooltip"
          class="h-full w-full" content-class="whitespace-pre-wrap w-max"
        >
          <span class="block h-full w-full rounded-[1px]" :class="bar.className" />
        </DataTooltip>
      </div>
    </div>
  </div>
  <div v-else class="text-[11px] text-muted-foreground">
    未配置延迟监测
  </div>
</template>
