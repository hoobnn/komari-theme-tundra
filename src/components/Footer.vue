<script setup lang="ts">
import type { VersionInfo } from '@/utils/api'
import { computed, onMounted, ref } from 'vue'
import { DataTooltip } from '@/components/ui/data-tooltip'
import VisitorInfoCard from '@/components/VisitorInfoCard.vue'
import { useAppStore } from '@/stores/app'
import { getSharedApi } from '@/utils/api'

const appStore = useAppStore()
const api = getSharedApi()

const buildVersion = __BUILD_VERSION__
const buildGitHash = __BUILD_GIT_HASH__

const serverVersion = ref<VersionInfo | null>(null)

onMounted(async () => {
  try {
    serverVersion.value = await api.getVersion()
  }
  catch {
    // 静默失败
  }
})

// 主控版本可能带或不带 v 前缀，统一成 v1.6.1；拿不到时不显示
const formattedServerVersion = computed(() => {
  const version = serverVersion.value?.version?.trim()
  if (!version)
    return null
  return /^v/i.test(version)
    ? version
    : `v${version}`
})
const serverHash = computed(() => serverVersion.value?.hash?.slice(0, 7) ?? '')

const showIcp = computed(() => appStore.icpEnabled && appStore.icpNumber)
const showPolice = computed(() => appStore.policeEnabled && appStore.policeNumber)
const showFiling = computed(() => showIcp.value || showPolice.value)
</script>

<template>
  <VisitorInfoCard v-if="appStore.visitorInfoCardEnabled" />
  <!-- 访客胶囊是 fixed 浮层，开启时页脚底部留出它的高度，滚到底不会压住署名 -->
  <footer class="w-full sm:flex-row sm:gap-4 max-w-[1280px] mx-auto p-4" :class="appStore.visitorInfoCardEnabled && 'pb-16'">
    <div class="flex flex-col items-start gap-1 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <div class="flex items-center gap-1 whitespace-nowrap">
        Powered by
        <DataTooltip
          as="span"
          placement="top"
          :content="serverHash"
          content-class="whitespace-nowrap"
        >
          <a
            href="https://github.com/komari-monitor/komari" target="_blank" rel="noopener noreferrer"
            class="transition-opacity hover:opacity-80"
          >
            <span class="font-medium text-foreground">Komari Monitor</span>
            <span v-if="formattedServerVersion" class="num ml-1">{{ formattedServerVersion }}</span>
          </a>
        </DataTooltip>
      </div>
      <!-- 右侧留出「回到顶部」按钮（fixed bottom-8 right-8 size-10）的位置，滚到底时不压字 -->
      <div class="flex items-center gap-1 whitespace-nowrap sm:pr-16 min-[1440px]:pr-0">
        Theme by
        <DataTooltip
          as="span"
          placement="top"
          :content="buildGitHash"
          content-class="whitespace-pre w-max"
        >
          <a
            href="https://github.com/hoobnn/komari-theme-tundra" target="_blank" rel="noopener noreferrer"
            class="transition-opacity hover:opacity-80"
          >
            <span class="font-medium text-foreground">Tundra</span>
            <span class="num ml-1">v{{ buildVersion }}</span>
          </a>
        </DataTooltip>
      </div>
    </div>

    <div v-if="showFiling" class="flex flex-wrap gap-2 items-center justify-center sm:flex-shrink-0 pb-7">
      <a
        v-if="showIcp" :href="appStore.icpUrl" target="_blank" rel="noopener noreferrer"
        class="transition-opacity hover:opacity-70"
      >
        <span class="text-xs text-muted-foreground">{{ appStore.icpNumber || '' }}</span>
      </a>
      <span v-if="showIcp && showPolice" class="opacity-50 text-xs text-muted-foreground">·</span>
      <template v-if="showPolice">
        <a
          v-if="appStore.policeUrl" :href="appStore.policeUrl" target="_blank" rel="noopener noreferrer"
          class="transition-opacity hover:opacity-70"
        >
          <span class="text-xs text-muted-foreground">{{ appStore.policeNumber || '' }}</span>
        </a>
        <span v-else class="text-xs text-muted-foreground">{{ appStore.policeNumber || '' }}</span>
      </template>
    </div>
  </footer>
</template>
