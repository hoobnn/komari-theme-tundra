import { Icon } from '@iconify/react'
import type { RefObject } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollableTabsList, TabsTrigger } from '@/components/ui/tabs'
import type { NodeStatusFilter } from '@/hooks/useHomeNodes'
import { cn } from '@/lib/utils'
import type { NodeViewMode } from '@/stores/app'
import { segmentClass } from '@/utils/uiClasses'

interface NodeToolbarProps {
  groupNames: string[]
  selectedGroup: string
  totalCount: number
  resultCount: number
  searchText: string
  searchRef: RefObject<HTMLInputElement | null>
  onSearchChange: (value: string) => void
  statusFilter: NodeStatusFilter
  statusCounts: Record<Exclude<NodeStatusFilter, 'all'>, number>
  onStatusChange: (value: NodeStatusFilter) => void
  viewMode: NodeViewMode
  onViewModeChange: (value: NodeViewMode) => void
}

const viewModes = [
  { value: 'card', label: '卡片视图', icon: 'lucide:layout-grid' },
  { value: 'list', label: '列表视图', icon: 'lucide:table-2' },
] as const

export default function NodeToolbar({
  groupNames,
  selectedGroup,
  totalCount,
  resultCount,
  searchText,
  searchRef,
  onSearchChange,
  statusFilter,
  statusCounts,
  onStatusChange,
  viewMode,
  onViewModeChange,
}: NodeToolbarProps) {
  const groups = [{ name: 'all', label: '全部节点' }, ...groupNames.map(name => ({ name, label: name }))]
  function clearSearch() {
    onSearchChange('')
    searchRef.current?.focus()
  }

  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1.5 sm:gap-x-3 lg:grid-cols-[auto_minmax(0,1fr)_minmax(10rem,14rem)_auto_auto]">
      <div className="flex items-baseline gap-2 pr-1 sm:pr-2">
        <h2 className="font-atlas text-stat font-semibold leading-tight tracking-wide">节点</h2>
        <span
          role="status"
          className="num text-xs font-medium text-muted-foreground"
          style={{ minInlineSize: `${String(totalCount).length}ch` }}
        >
          {resultCount}
          <span className="sr-only"> 个节点</span>
        </span>
      </div>
      <ScrollableTabsList
        selectedValue={selectedGroup}
        aria-label="节点分组"
        scrollClassName="w-fit max-w-full"
        className="h-auto gap-0.5 rounded-lg bg-muted p-0.5"
      >
        {groups.map(group => (
          <TabsTrigger
            key={group.name}
            value={group.name}
            className="h-8 flex-none rounded-md px-2.5 text-xs pointer-coarse:min-h-11"
          >
            {group.label}
          </TabsTrigger>
        ))}
      </ScrollableTabsList>
      <div
        role="search"
        aria-label="搜索节点"
        className="relative col-span-2 row-start-2 lg:col-span-1 lg:col-start-3 lg:row-start-1"
      >
        <Input
          ref={searchRef}
          type="search"
          value={searchText}
          onValueChange={onSearchChange}
          aria-label="搜索名称、地区、系统、标签"
          placeholder="搜索节点"
          autoComplete="off"
          enterKeyHint="search"
          className="h-9 rounded-lg border-border bg-card pl-9 pr-10 shadow-none pointer-coarse:min-h-11 md:text-compact dark:bg-card [&::-webkit-search-cancel-button]:appearance-none"
          onKeyDown={event => {
            if (event.key === 'Escape' && !event.nativeEvent.isComposing) {
              event.preventDefault()
              clearSearch()
            }
          }}
        />
        <Icon
          icon="lucide:search"
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
        />
        {searchText && (
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="清除搜索"
            className="absolute inset-y-0 right-0 my-auto pointer-coarse:size-11"
            onClick={clearSearch}
          >
            <Icon icon="lucide:x" />
          </Button>
        )}
      </div>
      <div className="relative col-start-3 row-start-2 lg:col-start-4 lg:row-start-1">
        <select
          aria-label="节点状态"
          value={statusFilter}
          onChange={event => {
            const value = event.currentTarget.value
            if (value === 'all' || value === 'online' || value === 'offline') onStatusChange(value)
          }}
          className="h-9 w-full cursor-pointer appearance-none rounded-lg border bg-card pl-3 pr-8 text-xs font-medium hover:border-foreground/25 focus-visible:outline-2 focus-visible:outline-ring pointer-coarse:min-h-11"
        >
          <option value="all">全部状态</option>
          <option value="online">在线 · {statusCounts.online}</option>
          <option value="offline">离线 · {statusCounts.offline}</option>
        </select>
        <Icon
          icon="lucide:chevron-down"
          aria-hidden="true"
          className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
        />
      </div>
      <div
        role="group"
        aria-label="节点视图"
        className="col-start-3 row-start-1 inline-flex justify-self-end rounded-lg border bg-muted p-0.5 lg:col-start-5"
      >
        {viewModes.map(mode => (
          <Button
            key={mode.value}
            type="button"
            variant="ghost"
            size="icon-sm"
            title={mode.label}
            aria-label={mode.label}
            aria-pressed={viewMode === mode.value}
            className={cn('size-7.5 rounded-md pointer-coarse:size-11', segmentClass(viewMode === mode.value))}
            onClick={() => onViewModeChange(mode.value)}
          >
            <Icon icon={mode.icon} />
          </Button>
        ))}
      </div>
    </div>
  )
}
