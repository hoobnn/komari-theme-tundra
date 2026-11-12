import type { NodeData } from '@/stores/nodes'
import { Icon } from '@iconify/react'
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import MarkdownRenderer from '@/components/MarkdownRenderer'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Empty } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useBackgroundSurface } from '@/hooks/useBackgroundSurface'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { cn } from '@/lib/utils'
import { selectNodeViewMode, useAppStore } from '@/stores/app'
import { useNodeGroups, useNodesStore } from '@/stores/nodes'
import { isNodeInGroup, parseNodeGroups } from '@/utils/groupHelper'
import { isRegionMatch } from '@/utils/regionHelper'
import { TAB_TRIGGER_CLASS } from '@/utils/uiClasses'

const NodeCard = lazy(() => import('@/components/NodeCard'))
const NodeGeneralCards = lazy(() => import('@/components/NodeGeneralCards'))
const NodeList = lazy(() => import('@/components/NodeList'))
const PingChart = lazy(() => import('@/components/PingChart'))

const nodeItemStaggerMs = 35
const nodeItemStaggerLimit = 12

const viewModes = [
  { value: 'card', label: '卡片视图', icon: 'tabler:layout-grid' },
  { value: 'list', label: '列表视图', icon: 'tabler:table' },
] as const

function isNodeMatchSearch(node: NodeData, search: string): boolean {
  if (!search.trim()) return true
  const lowerSearch = search.toLowerCase().trim()
  if (node.name.toLowerCase().includes(lowerSearch)) return true
  if (node.region && isRegionMatch(node.region, search)) return true
  if (node.os && node.os.toLowerCase().includes(lowerSearch)) return true
  if (parseNodeGroups(node.group).some(group => group.toLowerCase().includes(lowerSearch))) return true
  if (node.tags && node.tags.toLowerCase().includes(lowerSearch)) return true
  if (node.remark && node.remark.toLowerCase().includes(lowerSearch)) return true
  return false
}

export default function HomeView() {
  const navigate = useNavigate()
  const { pickSurfaceClass } = useBackgroundSurface()

  const connectionError = useAppStore(state => state.connectionError)
  const alertEnabled = useAppStore(state => state.settings.alertEnabled)
  const alertTitle = useAppStore(state => state.settings.alertTitle)
  const alertContent = useAppStore(state => state.settings.alertContent)
  const earthViewMode = useAppStore(state => state.settings.earthViewMode)
  const disablePageAnimation = useAppStore(state => state.settings.disablePageAnimation)
  const offlineNodesLast = useAppStore(state => state.settings.offlineNodesLast)
  const nodeSelectedGroup = useAppStore(state => state.nodeSelectedGroup)
  const setNodeSelectedGroup = useAppStore(state => state.setNodeSelectedGroup)
  const nodeViewMode = useAppStore(selectNodeViewMode)
  const setNodeViewMode = useAppStore(state => state.setNodeViewMode)

  const nodes = useNodesStore(state => state.nodes)
  const earthNodes = useNodesStore(state => state.earthNodes)
  const groupNames = useNodeGroups()

  // 首页被 Activity 隐藏时 effect 会被卸载，重新显示时再次运行：进入时恢复滚动，离开时保存
  useLayoutEffect(() => {
    const { homeScrollPosition } = useAppStore.getState()
    if (homeScrollPosition > 0) window.scrollTo({ top: homeScrollPosition, behavior: 'instant' })
    // 可见期间持续记录：Activity 隐藏时页面高度先塌缩，卸载时再读 scrollY 可能已被截断
    const save = () => useAppStore.setState({ homeScrollPosition: window.scrollY })
    window.addEventListener('scroll', save, { passive: true })
    return () => window.removeEventListener('scroll', save)
  }, [])

  const [searchText, setSearchText] = useState('')
  const [debouncedSearchText, setDebouncedSearchText] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const [selectedPingNodeUuid, setSelectedPingNodeUuid] = useState<string | null>(null)

  // 有关键词时保持展开，否则失焦后列表仍在过滤却看不到关键词
  const searchExpanded = searchFocused || searchText.length > 0
  const hasSearch = debouncedSearchText.trim().length > 0

  function clearSearch(): void {
    setSearchText('')
    setDebouncedSearchText('')
  }

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchText(searchText), 300)
    return () => clearTimeout(timer)
  }, [searchText])

  // 列表最小宽度约 1150px，窄于 1024 时基本只能横向滚动，统一渲染卡片；不改写用户保存的视图偏好
  const isWideScreen = useMediaQuery('(min-width: 1024px)')
  const effectiveViewMode = isWideScreen ? nodeViewMode : 'card'

  const groups = [{ tab: '全部节点', name: 'all' }, ...groupNames.map(g => ({ tab: g, name: g }))]

  // 当前选中的分组消失后回退到「全部节点」
  useEffect(() => {
    if (nodeSelectedGroup !== 'all' && !groupNames.includes(nodeSelectedGroup)) setNodeSelectedGroup('all')
  }, [groupNames, nodeSelectedGroup, setNodeSelectedGroup])

  const groupNodeList = useMemo(
    () => nodes.filter(node => isNodeInGroup(node.group, nodeSelectedGroup)),
    [nodes, nodeSelectedGroup],
  )

  const sampledGroupNodeList = useMemo(
    () => earthNodes.filter(node => isNodeInGroup(node.group, nodeSelectedGroup)),
    [earthNodes, nodeSelectedGroup],
  )

  const nodeList = useMemo(() => {
    let filtered = groupNodeList
    if (debouncedSearchText.trim()) filtered = filtered.filter(n => isNodeMatchSearch(n, debouncedSearchText))
    if (!offlineNodesLast) return filtered
    // 稳定排序：在线节点在前、离线节点在后，组内保持原有顺序
    return [...filtered].sort((a, b) => (a.online === b.online ? 0 : a.online ? -1 : 1))
  }, [groupNodeList, debouncedSearchText, offlineNodesLast])

  const selectedPingNode = useNodesStore(state =>
    selectedPingNodeUuid ? (state.nodesByUuid.get(selectedPingNodeUuid) ?? null) : null,
  )

  // 回调保持稳定，卡片 / 行的 memo 才能生效
  const handleNodeClick = useCallback(
    (node: NodeData) => {
      void navigate(`/instance/${node.uuid}`)
    },
    [navigate],
  )

  const handlePingClick = useCallback((node: NodeData) => {
    setSelectedPingNodeUuid(node.uuid)
  }, [])

  const animateItems = !disablePageAnimation

  return (
    <div className="home-view">
      {connectionError && (
        <div className="alert px-4">
          <Alert
            variant="destructive"
            className={pickSurfaceClass(
              'border-none bg-red-400/10 rounded-md',
              'border-none bg-red-400/10 backdrop-blur-xs rounded-md',
            )}
          >
            <AlertTitle>暂时连不上服务器</AlertTitle>
            <AlertDescription>正在自动重连，恢复后数据会自动刷新。</AlertDescription>
          </Alert>
        </div>
      )}

      {alertEnabled && alertContent && (
        <div className="alert px-4">
          <Alert
            className={pickSurfaceClass(
              'border-none bg-background rounded-md',
              'border-none bg-background/60 backdrop-blur-xs rounded-md',
            )}
          >
            {alertTitle && <AlertTitle>{alertTitle}</AlertTitle>}
            <AlertDescription>
              <MarkdownRenderer content={alertContent} />
            </AlertDescription>
          </Alert>
        </div>
      )}

      {earthViewMode !== 'hide' && (
        <Suspense fallback={null}>
          <NodeGeneralCards nodes={groupNodeList} globeNodes={sampledGroupNodeList} transitionKey={nodeSelectedGroup} />
        </Suspense>
      )}

      <div
        className={cn(
          'node-info p-4 pt-0 flex flex-col gap-4 relative z-1 md:pointer-events-none',
          earthViewMode === 'hide' && 'pt-4',
        )}
      >
        <div className="nodes">
          <Tabs value={nodeSelectedGroup} onValueChange={setNodeSelectedGroup} className="w-full flex-col gap-4">
            <div className="flex flex-wrap items-start gap-2">
              <div className="min-w-0 overflow-x-auto overflow-y-hidden rounded-sm md:pointer-events-auto">
                <TabsList
                  className={pickSurfaceClass(
                    'w-max h-8 bg-background/60 rounded-md',
                    'w-max h-8 bg-background/50 backdrop-blur-xl rounded-md',
                  )}
                >
                  {groups.map(g => (
                    <TabsTrigger key={g.name} value={g.name} className={TAB_TRIGGER_CLASS}>
                      {g.tab}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
              <div
                className={cn(
                  'ml-auto flex items-center gap-2 pointer-events-auto',
                  searchExpanded && 'max-sm:basis-full',
                )}
              >
                {isWideScreen && (
                  <div
                    className={cn(
                      'inline-flex h-8 rounded-md border p-0.5 shadow-xs',
                      pickSurfaceClass('bg-card', 'bg-card/60 backdrop-blur-xs'),
                    )}
                    role="group"
                    aria-label="视图"
                  >
                    {viewModes.map(mode => (
                      <Button
                        key={mode.value}
                        variant="ghost"
                        size="icon"
                        aria-label={mode.label}
                        aria-pressed={nodeViewMode === mode.value}
                        className={cn(
                          'size-[26px] rounded-sm shadow-none',
                          nodeViewMode === mode.value
                            ? 'bg-card text-emerald-700 shadow-xs hover:bg-card hover:text-emerald-700 dark:bg-input/40 dark:text-emerald-300'
                            : 'text-muted-foreground hover:bg-transparent hover:text-foreground',
                        )}
                        onClick={() => setNodeViewMode(mode.value)}
                      >
                        <Icon icon={mode.icon} width={14} height={14} />
                      </Button>
                    ))}
                  </div>
                )}
                <div
                  className={cn(
                    'relative h-8 transition-[width] duration-200',
                    searchExpanded ? 'w-60 max-sm:flex-1' : 'w-8',
                  )}
                >
                  <Input
                    value={searchText}
                    onValueChange={setSearchText}
                    placeholder="搜索名称、地区、系统、标签"
                    aria-label="搜索节点"
                    autoComplete="off"
                    className={cn(
                      'h-8 w-full rounded-md border pl-7.5 shadow-xs placeholder:text-muted-foreground focus:!ring-emerald-500/10',
                      pickSurfaceClass(
                        'bg-card hover:!bg-card focus:!bg-card',
                        'bg-card/60 hover:!bg-card/70 focus:!bg-card/80 backdrop-blur-xs',
                      ),
                      !searchExpanded && 'cursor-pointer !pl-0 text-transparent placeholder:text-transparent',
                      searchText && 'pr-7',
                    )}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setSearchFocused(false)}
                  />
                  <Icon
                    icon="tabler:search"
                    width={14}
                    height={14}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  />
                  {searchText && (
                    <button
                      type="button"
                      aria-label="清除搜索"
                      className="absolute right-1 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
                      onClick={clearSearch}
                    >
                      <Icon icon="tabler:x" width={14} height={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>
            <TabsContent key={nodeSelectedGroup} value={nodeSelectedGroup} className="pointer-events-auto">
              <Suspense fallback={null}>
                {nodeList.length !== 0 && effectiveViewMode === 'card' ? (
                  <div className="gap-3 grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
                    {nodeList.map((node, index) => (
                      <div
                        key={`${nodeSelectedGroup}-${node.uuid}`}
                        className={cn(
                          'min-w-0',
                          animateItems &&
                            'animate-in fade-in slide-in-from-bottom-2 duration-300 fill-mode-backwards motion-reduce:animate-none',
                        )}
                        style={
                          animateItems
                            ? { animationDelay: `${Math.min(index, nodeItemStaggerLimit) * nodeItemStaggerMs}ms` }
                            : undefined
                        }
                      >
                        <NodeCard node={node} onClick={handleNodeClick} onPingClick={handlePingClick} />
                      </div>
                    ))}
                  </div>
                ) : nodeList.length !== 0 && effectiveViewMode === 'list' ? (
                  <NodeList
                    nodes={nodeList}
                    transitionKey={nodeSelectedGroup}
                    onClick={handleNodeClick}
                    onPingClick={handlePingClick}
                  />
                ) : hasSearch ? (
                  <div className="flex flex-col items-center gap-3 py-10 text-sm text-muted-foreground">
                    <span>
                      没有匹配「
                      {debouncedSearchText.trim()}
                      」的节点
                    </span>
                    <Button variant="outline" size="sm" onClick={clearSearch}>
                      清除搜索
                    </Button>
                  </div>
                ) : (
                  <div className="text-muted-foreground text-center py-8">
                    <Empty description="暂无节点" />
                  </div>
                )}
              </Suspense>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <Dialog
        open={selectedPingNode !== null}
        onOpenChange={open => {
          if (!open) setSelectedPingNodeUuid(null)
        }}
      >
        {selectedPingNode && (
          <DialogContent
            className={cn(
              'max-w-6xl gap-0 overflow-hidden rounded-xl p-0 shadow-xl',
              pickSurfaceClass('bg-background', 'bg-background/60'),
            )}
            aria-describedby={undefined}
            onOpenAutoFocus={event => event.preventDefault()}
          >
            <DialogHeader className="flex h-13 flex-row items-center border-b px-4">
              <DialogTitle className="truncate">{selectedPingNode.name} 延迟与丢包</DialogTitle>
            </DialogHeader>
            <div className="max-h-[calc(90vh-4rem)] overflow-y-auto p-4">
              <Suspense fallback={null}>
                <PingChart uuid={selectedPingNode.uuid} />
              </Suspense>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  )
}
