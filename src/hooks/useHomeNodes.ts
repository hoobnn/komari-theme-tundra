import { useEffect, useState } from 'react'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { selectNodeViewMode, useAppStore } from '@/stores/app'
import { useNodeGroups, useNodesStore } from '@/stores/nodes'
import { isNodeInGroup } from '@/utils/groupHelper'
import { isNodeMatchSearch } from '@/utils/nodeSearch'

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
  const isWideScreen = useMediaQuery('(min-width: 1024px)')
  const [searchText, setSearchText] = useState('')
  const [query, setQuery] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => setQuery(searchText.trim()), 300)
    return () => clearTimeout(timer)
  }, [searchText])

  useEffect(() => {
    // 初次载入前不清除持久化分组。
    if (nodes.length && selectedGroup !== 'all' && !groupNames.includes(selectedGroup)) setSelectedGroup('all')
  }, [nodes.length, groupNames, selectedGroup, setSelectedGroup])

  const groupNodes = nodes.filter(node => isNodeInGroup(node.group, selectedGroup))
  const globeNodes = earthNodes.filter(node => isNodeInGroup(node.group, selectedGroup))
  const matches = groupNodes.filter(node => isNodeMatchSearch(node, query))
  const visibleNodes = offlineNodesLast ? [...matches].sort((a, b) => Number(b.online) - Number(a.online)) : matches

  function clearSearch() {
    setSearchText('')
    setQuery('')
  }

  return {
    groupNames,
    selectedGroup,
    setSelectedGroup,
    groupNodes,
    globeNodes,
    visibleNodes,
    searchText,
    setSearchText,
    query,
    clearSearch,
    viewMode: isWideScreen ? savedViewMode : ('card' as const),
    setViewMode,
    isWideScreen,
  }
}
