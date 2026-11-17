import type { NodeData } from '@/stores/nodes'
import { lazy, Suspense, useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import HomeNotices from '@/components/home/HomeNotices'
import NodeToolbar from '@/components/home/NodeToolbar'
import NodeResults from '@/components/home/NodeResults'
import NodePingDialog from '@/components/home/NodePingDialog'
import RelayRoutes from '@/components/home/RelayRoutes'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { useHomeNodes } from '@/hooks/useHomeNodes'
import { useHomeScrollRestoration } from '@/hooks/useHomeScrollRestoration'
import { useAppStore } from '@/stores/app'
import { useNodesStore } from '@/stores/nodes'

const NodeGeneralCards = lazy(() => import('@/components/NodeGeneralCards'))

/** 页面只组合模块，筛选策略、滚动生命周期和各区域布局分别维护。 */
export default function HomeView() {
  const navigate = useNavigate()
  const earthViewMode = useAppStore(state => state.settings.earthViewMode)
  const home = useHomeNodes()
  const searchRef = useRef<HTMLInputElement>(null)
  const homeRef = useHomeScrollRestoration()
  const [pingDialog, setPingDialog] = useState<{ uuid: string; open: boolean } | null>(null)
  const pingTrigger = useRef<HTMLElement | null>(null)
  const pingNode = useNodesStore(state => (pingDialog ? (state.nodesByUuid.get(pingDialog.uuid) ?? null) : null))
  const openNode = useCallback(
    (node: NodeData) => {
      if (window.getSelection()?.isCollapsed === false) return
      void navigate(`/instance/${node.uuid}`)
    },
    [navigate],
  )
  const openPing = useCallback((node: NodeData, trigger: HTMLElement) => {
    pingTrigger.current = trigger
    setPingDialog({ uuid: node.uuid, open: true })
  }, [])

  return (
    <div ref={homeRef} className="home-view space-y-4">
      <HomeNotices />
      {earthViewMode !== 'hide' ? (
        <Suspense fallback={null}>
          <NodeGeneralCards
            nodes={home.groupNodes}
            globeNodes={home.globeNodes}
            transitionKey={home.selectedGroup}
            suspendMotion={pingDialog !== null && pingNode !== null}
          >
            <RelayRoutes />
          </NodeGeneralCards>
        </Suspense>
      ) : (
        <div className="px-4">
          <RelayRoutes />
        </div>
      )}
      <section aria-label="节点" className="relative z-10 px-4">
        <Tabs value={home.selectedGroup} onValueChange={home.setSelectedGroup} className="flex-col gap-3">
          <NodeToolbar
            groupNames={home.groupNames}
            selectedGroup={home.selectedGroup}
            totalCount={home.totalNodeCount}
            resultCount={home.visibleNodes.length}
            searchText={home.searchText}
            searchRef={searchRef}
            onSearchChange={home.setSearchText}
            onClearSearch={home.clearSearch}
            viewMode={home.viewMode}
            onViewModeChange={home.setViewMode}
            showViewModes={home.isWideScreen}
          />
          <TabsContent value={home.selectedGroup}>
            <NodeResults
              nodes={home.visibleNodes}
              viewMode={home.viewMode}
              query={home.query}
              clearSearch={() => {
                home.clearSearch()
                searchRef.current?.focus()
              }}
              onNodeClick={openNode}
              onPingClick={openPing}
            />
          </TabsContent>
        </Tabs>
      </section>
      <NodePingDialog
        node={pingNode}
        open={pingDialog?.open ?? false}
        onClose={() => setPingDialog(current => (current ? { ...current, open: false } : null))}
        onRestoreFocus={() => pingTrigger.current?.focus({ preventScroll: true })}
        onExited={() => setPingDialog(current => (current?.open ? current : null))}
      />
    </div>
  )
}
