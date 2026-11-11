<script setup lang="ts">
import type { NodeData } from '@/stores/nodes'
import { Icon } from '@iconify/vue'
import { useDebounceFn, useMediaQuery } from '@vueuse/core'
import { computed, defineAsyncComponent, nextTick, onActivated, onDeactivated, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import MarkdownRenderer from '@/components/MarkdownRenderer.vue'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Empty } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useBackgroundSurface } from '@/composables/useBackgroundSurface'
import { useAppStore } from '@/stores/app'
import { useNodesStore } from '@/stores/nodes'
import { isNodeInGroup, parseNodeGroups } from '@/utils/groupHelper'
import { isRegionMatch } from '@/utils/regionHelper'
import { TAB_TRIGGER_CLASS } from '@/utils/uiClasses'

defineOptions({ name: 'HomeView' })

const NodeCard = defineAsyncComponent(() => import('@/components/NodeCard.vue'))
const NodeGeneralCards = defineAsyncComponent(() => import('@/components/NodeGeneralCards.vue'))
const NodeList = defineAsyncComponent(() => import('@/components/NodeList.vue'))
const PingChart = defineAsyncComponent(() => import('@/components/PingChart.vue'))

const nodeItemStaggerMs = 35
const nodeItemStaggerLimit = 12

const appStore = useAppStore()
const { pickSurfaceClass } = useBackgroundSurface()
const nodesStore = useNodesStore()
const router = useRouter()

onActivated(() => {
  if (appStore.homeScrollPosition > 0) {
    nextTick(() => {
      window.scrollTo({ top: appStore.homeScrollPosition, behavior: 'instant' })
    })
  }
})

onDeactivated(() => {
  appStore.homeScrollPosition = window.scrollY
})

const searchText = ref('')
const debouncedSearchText = ref('')
const searchFocused = ref(false)
// 有关键词时保持展开，否则失焦后列表仍在过滤却看不到关键词
const searchExpanded = computed(() => searchFocused.value || searchText.value.length > 0)
const hasSearch = computed(() => debouncedSearchText.value.trim().length > 0)

function clearSearch(): void {
  searchText.value = ''
  debouncedSearchText.value = ''
}

// 窄屏下列表要横向滚动、基本不可用，统一渲染卡片；不改写用户保存的视图偏好
const isWideScreen = useMediaQuery('(min-width: 768px)')
const effectiveViewMode = computed(() => isWideScreen.value
  ? appStore.nodeViewMode
  : 'card')
const selectedPingNodeUuid = ref<string | null>(null)

const updateDebouncedSearch = useDebounceFn((value: string) => {
  debouncedSearchText.value = value
}, 300)

watch(searchText, (value) => {
  updateDebouncedSearch(value)
})

const viewModes = [
  { value: 'card', label: '卡片视图', icon: 'tabler:layout-grid' },
  { value: 'list', label: '列表视图', icon: 'tabler:table' },
] as const

const groups = computed(() => [
  { tab: '全部节点', name: 'all' },
  ...nodesStore.groups.map(g => ({ tab: g, name: g })),
])

watch(
  () => nodesStore.groups,
  (gs) => {
    const cur = appStore.nodeSelectedGroup
    if (cur !== 'all' && !gs.includes(cur)) {
      appStore.nodeSelectedGroup = 'all'
    }
  },
  { immediate: true },
)

function isNodeMatchSearch(node: typeof nodesStore.nodes[number], search: string): boolean {
  if (!search.trim())
    return true
  const lowerSearch = search.toLowerCase().trim()
  if (node.name.toLowerCase().includes(lowerSearch))
    return true
  if (node.region && isRegionMatch(node.region, search))
    return true
  if (node.os && node.os.toLowerCase().includes(lowerSearch))
    return true
  if (parseNodeGroups(node.group).some(group => group.toLowerCase().includes(lowerSearch)))
    return true
  if (node.tags && node.tags.toLowerCase().includes(lowerSearch))
    return true
  if (node.remark && node.remark.toLowerCase().includes(lowerSearch))
    return true
  return false
}

const groupNodeList = computed(() => {
  return nodesStore.nodes.filter(node => isNodeInGroup(node.group, appStore.nodeSelectedGroup))
})

const sampledGroupNodeList = computed(() => {
  return nodesStore.earthNodes.filter(node => isNodeInGroup(node.group, appStore.nodeSelectedGroup))
})

const nodeList = computed(() => {
  let filtered = groupNodeList.value
  if (debouncedSearchText.value.trim()) {
    filtered = filtered.filter(n => isNodeMatchSearch(n, debouncedSearchText.value))
  }
  if (!appStore.offlineNodesLast)
    return filtered
  // 稳定排序：在线节点在前、离线节点在后，组内保持原有顺序
  return [...filtered].sort((a, b) => (a.online === b.online
    ? 0
    : a.online
      ? -1
      : 1))
})

const selectedPingNode = computed(() => {
  if (!selectedPingNodeUuid.value)
    return null
  return nodesStore.nodes.find(node => node.uuid === selectedPingNodeUuid.value) ?? null
})

const pingDialogOpen = computed({
  get: () => selectedPingNode.value !== null,
  set: (open: boolean) => {
    if (!open)
      selectedPingNodeUuid.value = null
  },
})

function handleNodeClick(node: typeof nodesStore.nodes[number]) {
  router.push({
    name: 'instance-detail',
    params: { id: node.uuid },
  })
}

function handlePingClick(node: NodeData) {
  selectedPingNodeUuid.value = node.uuid
}

function getNodeItemTransitionKey(node: typeof nodesStore.nodes[number]): string {
  return `${appStore.nodeSelectedGroup}-${node.uuid}`
}

function getNodeItemTransitionStyle(index: number): Record<string, string> {
  return {
    '--node-item-delay': `${Math.min(index, nodeItemStaggerLimit) * nodeItemStaggerMs}ms`,
  }
}
</script>

<template>
  <div class="home-view">
    <div v-if="appStore.connectionError" class="alert px-4">
      <Alert
        variant="destructive"
        :class="pickSurfaceClass('border-none bg-red-400/10 rounded-md', 'border-none bg-red-400/10 backdrop-blur-xs rounded-md')"
      >
        <AlertTitle>暂时连不上服务器</AlertTitle>
        <AlertDescription>正在自动重连，恢复后数据会自动刷新。</AlertDescription>
      </Alert>
    </div>

    <div v-if="appStore.alertEnabled && appStore.alertContent" class="alert px-4">
      <Alert :class="pickSurfaceClass('border-none bg-background rounded-md', 'border-none bg-background/60 backdrop-blur-xs rounded-md')">
        <AlertTitle v-if="appStore.alertTitle">
          {{ appStore.alertTitle }}
        </AlertTitle>
        <AlertDescription>
          <MarkdownRenderer :content="appStore.alertContent" />
        </AlertDescription>
      </Alert>
    </div>

    <NodeGeneralCards
      v-if="appStore.earthViewMode !== 'hide'"
      :nodes="groupNodeList"
      :globe-nodes="sampledGroupNodeList"
      :transition-key="appStore.nodeSelectedGroup"
    />

    <div class="node-info p-4 pt-0 flex flex-col gap-4 relative z-1 md:pointer-events-none" :class="appStore.earthViewMode === 'hide' && 'pt-4'">
      <div class="nodes">
        <Tabs v-model="appStore.nodeSelectedGroup" class="w-full flex-col gap-4">
          <div class="flex flex-wrap items-start gap-2">
            <div class="min-w-0 overflow-x-auto rounded-sm md:pointer-events-auto">
              <TabsList :class="pickSurfaceClass('w-max h-8 bg-background/60 rounded-md', 'w-max h-8 bg-background/50 backdrop-blur-xl rounded-md')">
                <TabsTrigger
                  v-for="g in groups" :key="g.name" :value="g.name"
                  :class="TAB_TRIGGER_CLASS"
                >
                  {{ g.tab }}
                </TabsTrigger>
              </TabsList>
            </div>
            <div
              class="ml-auto flex items-center gap-2 pointer-events-auto"
              :class="searchExpanded && 'max-sm:basis-full'"
            >
              <div
                v-if="isWideScreen"
                class="inline-flex h-8 rounded-md p-0.5"
                :class="pickSurfaceClass('bg-background/60', 'bg-background/50 backdrop-blur-xs')"
                role="group" aria-label="视图"
              >
                <Button
                  v-for="mode in viewModes" :key="mode.value"
                  variant="ghost" size="icon" :aria-label="mode.label" :aria-pressed="appStore.nodeViewMode === mode.value"
                  class="size-7 rounded-sm shadow-none"
                  :class="appStore.nodeViewMode === mode.value
                    ? 'bg-card text-emerald-700 shadow-xs hover:bg-card hover:text-emerald-700 dark:bg-input/40 dark:text-emerald-300'
                    : 'text-muted-foreground hover:bg-transparent hover:text-foreground'"
                  @click="appStore.nodeViewMode = mode.value"
                >
                  <Icon :icon="mode.icon" :width="14" :height="14" />
                </Button>
              </div>
              <div
                class="relative h-8 transition-[width] duration-200"
                :class="searchExpanded ? 'w-60 max-sm:flex-1' : 'w-8'"
              >
                <Input
                  v-model="searchText" placeholder="搜索名称、地区、系统、标签" aria-label="搜索节点" autocomplete="off"
                  class="h-8 w-full rounded-md border-none pl-7.5 shadow-none placeholder:text-muted-foreground focus:!ring-emerald-500/10"
                  :class="[
                    pickSurfaceClass('bg-background hover:!bg-background/95 focus:!bg-background', 'bg-background/50 hover:!bg-background/60 focus:!bg-background/80 backdrop-blur-xs'),
                    !searchExpanded && 'cursor-pointer !pl-0 text-transparent placeholder:text-transparent',
                    searchText && 'pr-7',
                  ]"
                  @focus="searchFocused = true"
                  @blur="searchFocused = false"
                />
                <Icon
                  icon="tabler:search" :width="14" :height="14"
                  class="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                />
                <button
                  v-if="searchText"
                  type="button" aria-label="清除搜索"
                  class="absolute right-1 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
                  @click="clearSearch"
                >
                  <Icon icon="tabler:x" :width="14" :height="14" />
                </button>
              </div>
            </div>
          </div>
          <TabsContent :key="appStore.nodeSelectedGroup" :value="appStore.nodeSelectedGroup" class="pointer-events-auto">
            <TransitionGroup
              v-if="nodeList.length !== 0 && effectiveViewMode === 'card'"
              :appear="!appStore.disablePageAnimation"
              :css="!appStore.disablePageAnimation"
              name="node-card-switch"
              tag="div"
              class="gap-3 grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(300px,1fr))]"
            >
              <div
                v-for="(node, index) in nodeList"
                :key="getNodeItemTransitionKey(node)"
                class="min-w-0"
                :style="getNodeItemTransitionStyle(index)"
              >
                <NodeCard :node="node" @click="handleNodeClick(node)" @ping-click="handlePingClick" />
              </div>
            </TransitionGroup>
            <NodeList
              v-else-if="nodeList.length !== 0 && effectiveViewMode === 'list'"
              :nodes="nodeList"
              :transition-key="appStore.nodeSelectedGroup"
              @click="handleNodeClick"
              @ping-click="handlePingClick"
            />
            <div v-else-if="hasSearch" class="flex flex-col items-center gap-3 py-10 text-sm text-muted-foreground">
              <span>没有匹配「{{ debouncedSearchText.trim() }}」的节点</span>
              <Button variant="outline" size="sm" @click="clearSearch">
                清除搜索
              </Button>
            </div>
            <div v-else class="text-muted-foreground text-center py-8">
              <Empty description="暂无节点" />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>

    <Dialog v-model:open="pingDialogOpen">
      <DialogContent
        v-if="selectedPingNode"
        class="max-w-6xl gap-0 overflow-hidden rounded-xl p-0 shadow-xl"
        :class="pickSurfaceClass('bg-background', 'bg-background/60')"
        @open-auto-focus.prevent
      >
        <DialogHeader class="flex h-13 flex-row items-center border-b px-4">
          <DialogTitle class="truncate">
            {{ selectedPingNode.name }} 延迟与丢包
          </DialogTitle>
        </DialogHeader>
        <div class="max-h-[calc(90vh-4rem)] overflow-y-auto p-4">
          <PingChart :uuid="selectedPingNode.uuid" />
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>

<style scoped>
.node-card-switch-enter-active,
.node-card-switch-leave-active {
  transition:
    opacity 180ms ease,
    transform 220ms cubic-bezier(0.22, 1, 0.36, 1),
    filter 180ms ease;
}

.node-card-switch-enter-active {
  transition-delay: var(--node-item-delay, 0ms);
}

.node-card-switch-move {
  transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
}

.node-card-switch-enter-from {
  opacity: 0;
  transform: translateY(10px) scale(0.985);
  filter: blur(3px);
}

.node-card-switch-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.99);
  filter: blur(2px);
}

@media (prefers-reduced-motion: reduce) {
  .node-card-switch-enter-active,
  .node-card-switch-leave-active,
  .node-card-switch-move {
    transition: none;
    transition-delay: 0ms;
  }

  .node-card-switch-enter-from,
  .node-card-switch-leave-to {
    opacity: 1;
    transform: none;
    filter: none;
  }
}
</style>
