<script setup lang="ts">
import { DataTooltip } from '@/components/ui/data-tooltip'
import { useNodePingDisplay } from '@/composables/useNodePingDisplay'

const props = defineProps<{
  uuid: string
  online: boolean
}>()

const { pingTable } = useNodePingDisplay(() => props.uuid)
</script>

<template>
  <!-- 与卡片同一张网络表的紧凑版：每个协议栈一行，行内是各线路延迟 + 该栈趋势条 -->
  <div v-if="pingTable" class="num flex w-full flex-col gap-1 pr-3">
    <div
      v-for="row in pingTable.rows" :key="`${row.stack}`"
      class="grid items-center gap-x-1.5"
      :style="{ gridTemplateColumns: `1rem repeat(${row.cells.length}, minmax(1.6rem, auto)) minmax(0, 1fr)` }"
    >
      <span class="text-[9px] text-muted-foreground/80">{{ row.stack ?? '' }}</span>
      <DataTooltip
        v-for="cell in row.cells" :key="cell.key" placement="top" :content="cell.tooltip"
        content-class="whitespace-pre-wrap w-max px-1.5 !leading-[1.2] text-[11px]"
      >
        <span class="block text-right text-[11px]" :class="cell.toneClass">{{ cell.latency }}</span>
      </DataTooltip>
      <div
        class="ml-1 grid h-1.5 gap-[1px]"
        :style="{ gridTemplateColumns: `repeat(${row.latencyBars.length || 1}, minmax(0, 1fr))` }"
      >
        <DataTooltip
          v-for="bar in row.latencyBars" :key="bar.key" placement="top" :content="bar.tooltip"
          class="h-full w-full" content-class="whitespace-pre-wrap w-max px-1.5 !leading-[1.2] text-[11px]"
        >
          <span class="block h-full w-full rounded-[1px]" :class="bar.className" />
        </DataTooltip>
      </div>
    </div>
  </div>
  <div v-else class="text-[11px] text-muted-foreground/70">
    未配置
  </div>
</template>
