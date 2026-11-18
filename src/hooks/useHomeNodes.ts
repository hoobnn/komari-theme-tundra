import { useDeferredValue, useEffect, useState } from 'react'
import { selectNodeViewMode, useAppStore } from '@/stores/app'
import { useNodeGroups, useNodesStore } from '@/stores/nodes'
import { isNodeInGroup } from '@/utils/groupHelper'
import { isNodeMatchSearch } from '@/utils/nodeSearch'

export type NodeStatusFilter = 'all' | 'online' | 'offline'

/** 首页的筛选与视图策略；不包含 DOM、导航或卡片布局。 */
export function useHomeNodes() {
  const nodes = useNodesStore(state => state.nodes)
  const earthNodes = useNodesStore(state => state.earthNodes)
  const groupNames = useNodeGroups()
  const selectedGroup = useAppStore(state => state.nodeSelectedGroup)
  const setSelectedGroup = useAppStore(state => state.setNodeSelectedGroup)
  const offlineNodesLast = useAppStore(state => state.settings.offlineNodesLast)
  const savedViewMode = useAppStore(selectNodeViewMode)
  const setViewMode = useAppStore(state => state.setNodeViewMode)
  const [searchText, setSearchText] = useState('')
  const [statusFilter, setStatusFilter] = useState<NodeStatusFilter>('all')
  const query = useDeferredValue(searchText.trim())

  useEffect(() => {
    // 初次载入前不清除持久化分组。
    if (nodes.length && selectedGroup !== 'all' && !groupNames.includes(selectedGroup)) setSelectedGroup('all')
  }, [nodes.length, groupNames, selectedGroup, setSelectedGroup])

  const groupNodes = nodes.filter(node => isNodeInGroup(node.group, selectedGroup))
  const globeNodes = earthNodes.filter(node => isNodeInGroup(node.group, selectedGroup))
  const matches = groupNodes.filter(node => isNodeMatchSearch(node, query))
  const onlineCount = matches.filter(node => node.online).length
  const filtered =
    statusFilter === 'all' ? matches : matches.filter(node => node.online === (statusFilter === 'online'))
  const visibleNodes = offlineNodesLast ? [...filtered].sort((a, b) => Number(b.online) - Number(a.online)) : filtered

  function clearSearch() {
    setSearchText('')
  }

  return {
    totalNodeCount: nodes.length,
    groupNames,
    selectedGroup,
    setSelectedGroup,
    groupNodes,
    globeNodes,
    visibleNodes,
    searchText,
    setSearchText,
    query,
    statusFilter,
    setStatusFilter,
    statusCounts: { online: onlineCount, offline: matches.length - onlineCount },
    clearSearch,
    viewMode: savedViewMode,
    setViewMode,
  }
}
