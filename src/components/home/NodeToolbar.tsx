import { Icon } from '@iconify/react'
import type { RefObject } from 'react'
import { useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollableTabsList, TabsTrigger } from '@/components/ui/tabs'
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
  onClearSearch: () => void
  viewMode: NodeViewMode
  onViewModeChange: (value: NodeViewMode) => void
  showViewModes: boolean
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
  onClearSearch,
  viewMode,
  onViewModeChange,
  showViewModes,
}: NodeToolbarProps) {
  const [searchOpen, setSearchOpen] = useState(false)
  const searchButtonRef = useRef<HTMLButtonElement>(null)
  const searchId = useId()
  const expanded = showViewModes || searchOpen || searchText.length > 0
  const groups = [{ name: 'all', label: '全部节点' }, ...groupNames.map(name => ({ name, label: name }))]

  function closeSearch() {
    onClearSearch()
    setSearchOpen(false)
    if (!showViewModes) searchButtonRef.current?.focus()
  }

  return (
    <div className="pointer-events-none grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 sm:gap-x-3 lg:grid-cols-[auto_minmax(0,1fr)_12rem_auto]">
      <div className="flex items-baseline gap-1.5 border-r pr-2 sm:gap-2 sm:pr-4">
        <h2 className="text-value font-semibold tracking-tight">节点</h2>
        <span
          role="status"
          className="num text-end text-xs font-medium text-muted-foreground"
          style={{ minInlineSize: `${String(totalCount).length}ch` }}
        >
          {resultCount}
          <span className="sr-only"> 个节点</span>
        </span>
      </div>
      <ScrollableTabsList
        selectedValue={selectedGroup}
        aria-label="节点分组"
        scrollClassName="w-fit max-w-full pointer-events-auto"
        className="h-9 gap-0.5 rounded-lg bg-background/90 p-0.5"
      >
        {groups.map(group => (
          <TabsTrigger
            key={group.name}
            value={group.name}
            className="h-8 flex-none rounded-md px-2.5 text-xs max-[22rem]:px-1.5 data-[state=active]:border-border data-[state=active]:bg-card dark:data-[state=active]:border-border dark:data-[state=active]:bg-muted"
          >
            {group.label}
          </TabsTrigger>
        ))}
      </ScrollableTabsList>
      {expanded && (
        <div
          id={searchId}
          role="search"
          aria-label="搜索节点"
          className="pointer-events-auto relative col-span-full row-start-2 mt-1 lg:col-span-1 lg:col-start-3 lg:row-start-1 lg:mt-0"
        >
          <Input
            ref={searchRef}
            autoFocus={!showViewModes}
            value={searchText}
            onValueChange={onSearchChange}
            aria-label="搜索名称、地区、系统、标签"
            placeholder="搜索节点"
            autoComplete="off"
            enterKeyHint="search"
            className="h-9 rounded-lg border-border bg-card pl-9 pr-9 shadow-xs md:text-compact dark:bg-card"
            onKeyDown={event => {
              if (event.key === 'Escape' && !event.nativeEvent.isComposing) {
                event.stopPropagation()
                closeSearch()
              }
            }}
          />
          <Icon
            icon="lucide:search"
            className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          {searchText && (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="清除搜索"
              className="absolute inset-y-0 right-0.5 my-auto"
              onClick={() => {
                onClearSearch()
                searchRef.current?.focus()
              }}
            >
              <Icon icon="lucide:x" />
            </Button>
          )}
        </div>
      )}
      {showViewModes ? (
        <div
          role="group"
          aria-label="节点视图"
          className="pointer-events-auto col-start-4 row-start-1 inline-flex rounded-lg border bg-muted p-0.5"
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
              className={cn('size-7.5 rounded-md', segmentClass(viewMode === mode.value))}
              onClick={() => onViewModeChange(mode.value)}
            >
              <Icon icon={mode.icon} />
            </Button>
          ))}
        </div>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          ref={searchButtonRef}
          aria-label={expanded ? '关闭节点搜索' : '搜索节点'}
          aria-expanded={expanded}
          aria-controls={expanded ? searchId : undefined}
          className={cn('pointer-events-auto col-start-3 row-start-1 size-9', expanded && 'bg-muted')}
          onClick={() => (expanded ? closeSearch() : setSearchOpen(true))}
        >
          <Icon icon={expanded ? 'lucide:x' : 'lucide:search'} />
        </Button>
      )}
    </div>
  )
}
