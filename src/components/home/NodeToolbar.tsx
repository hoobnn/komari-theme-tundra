import { Icon } from '@iconify/react'
import { useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollableTabsList, TabsTrigger } from '@/components/ui/tabs'
import { useBackgroundSurface } from '@/hooks/useBackgroundSurface'
import { cn } from '@/lib/utils'
import type { NodeViewMode } from '@/stores/app'
import { segmentClass } from '@/utils/uiClasses'

interface NodeToolbarProps {
  groupNames: string[]
  selectedGroup: string
  searchText: string
  onSearchChange: (value: string) => void
  onClearSearch: () => void
  viewMode: NodeViewMode
  onViewModeChange: (value: NodeViewMode) => void
  showViewModes: boolean
}

const viewModes = [
  { value: 'card', label: '卡片视图', icon: 'tabler:layout-grid' },
  { value: 'list', label: '列表视图', icon: 'tabler:table' },
] as const

/** 同一表面承载分组与操作；搜索显式展开，避免失焦时整行跳动。 */
export default function NodeToolbar(props: NodeToolbarProps) {
  const { pickSurfaceClass } = useBackgroundSurface()
  const [searchOpen, setSearchOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const searchButtonRef = useRef<HTMLButtonElement>(null)
  const searchId = useId()
  const expanded = searchOpen || props.searchText.length > 0
  const groups = [{ name: 'all', label: '全部节点' }, ...props.groupNames.map(name => ({ name, label: name }))]

  function closeSearch() {
    props.onClearSearch()
    setSearchOpen(false)
    searchButtonRef.current?.focus()
  }

  return (
    <div
      className={cn(
        'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 rounded-xl border px-2 py-1 shadow-xs',
        pickSurfaceClass('bg-card', 'bg-card/90 backdrop-blur-xl'),
        // 桌面端地球会伸到工具栏后面：工具栏去掉整条底色，只保留控件本身，空白处可拖动地球
        'md:pointer-events-none md:border-0 md:bg-transparent md:p-0 md:shadow-none md:backdrop-blur-none',
      )}
    >
      <ScrollableTabsList
        selectedValue={props.selectedGroup}
        aria-label="节点分组"
        className="bg-transparent p-0 md:pointer-events-auto md:rounded-md md:bg-background/60 md:backdrop-blur-xl"
      >
        {groups.map(group => (
          <TabsTrigger
            key={group.name}
            value={group.name}
            className="h-8 flex-none rounded-md px-2.5 text-xs focus-visible:border-transparent focus-visible:ring-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foreground/50 data-[state=active]:border-transparent data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:shadow-none dark:data-[state=active]:border-transparent dark:data-[state=active]:bg-muted dark:data-[state=active]:text-foreground"
          >
            {group.label}
          </TabsTrigger>
        ))}
      </ScrollableTabsList>
      <div className="flex shrink-0 items-center gap-2 md:pointer-events-auto md:rounded-md md:bg-background/60 md:backdrop-blur-xl">
        {props.showViewModes && (
          <div role="group" aria-label="节点视图" className="inline-flex rounded-md bg-muted/60 p-0.5">
            {viewModes.map(mode => (
              <Button
                key={mode.value}
                type="button"
                variant="ghost"
                size="icon-sm"
                title={mode.label}
                aria-label={mode.label}
                aria-pressed={props.viewMode === mode.value}
                className={cn('rounded-sm', segmentClass(props.viewMode === mode.value))}
                onClick={() => props.onViewModeChange(mode.value)}
              >
                <Icon icon={mode.icon} width={16} height={16} />
              </Button>
            ))}
          </div>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          ref={searchButtonRef}
          aria-label={expanded ? '关闭节点搜索' : '搜索节点'}
          aria-expanded={expanded}
          aria-controls={expanded ? searchId : undefined}
          className={cn(expanded && 'bg-muted')}
          onClick={() => (expanded ? closeSearch() : setSearchOpen(true))}
        >
          <Icon icon={expanded ? 'tabler:x' : 'tabler:search'} width={16} height={16} />
        </Button>
      </div>
      {expanded && (
        <div
          id={searchId}
          role="search"
          aria-label="搜索节点"
          className="relative col-span-2 mb-1 md:pointer-events-auto md:mt-2 md:mb-0"
        >
          <Input
            ref={inputRef}
            autoFocus
            value={props.searchText}
            onValueChange={props.onSearchChange}
            aria-label="搜索名称、地区、系统、标签"
            placeholder="搜索名称、地区、系统、标签"
            autoComplete="off"
            className="h-9 pl-8 pr-9"
            onKeyDown={event => {
              if (event.key === 'Escape') {
                event.stopPropagation()
                closeSearch()
              }
            }}
          />
          <Icon
            icon="tabler:search"
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          {props.searchText && (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="清除搜索"
              className="absolute right-0.5 top-0.5"
              onClick={() => {
                props.onClearSearch()
                inputRef.current?.focus()
              }}
            >
              <Icon icon="tabler:x" width={14} height={14} />
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
