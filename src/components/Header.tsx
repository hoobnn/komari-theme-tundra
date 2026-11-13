import { Icon } from '@iconify/react'
import { Link } from 'react-router'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/stores/app'

export default function Header() {
  const isScrolled = useAppStore(state => state.isScrolled)
  const themeMode = useAppStore(state => state.themeMode)
  const isLoggedIn = useAppStore(state => state.isLoggedIn)
  const hideAdminEntry = useAppStore(state => state.settings.hideAdminEntryWhenLoggedOut)
  const sitename = useAppStore(state => state.publicSettings?.sitename) || 'Komari Monitor'
  const updateThemeMode = useAppStore(state => state.updateThemeMode)
  const title =
    themeMode === 'auto'
      ? '主题：跟随系统（点击切换为浅色）'
      : themeMode === 'light'
        ? '主题：浅色（点击切换为深色）'
        : '主题：深色（点击切换为跟随系统）'
  const icon =
    themeMode === 'auto'
      ? 'icon-park-outline:dark-mode'
      : themeMode === 'light'
        ? 'icon-park-outline:sun-one'
        : 'icon-park-outline:moon'

  return (
    <header
      className={cn(
        'sticky top-0 z-30 border-b border-transparent transition-colors duration-200',
        isScrolled ? 'border-border bg-background/95 backdrop-blur-xl' : 'bg-background/80',
      )}
    >
      <div className="mx-auto flex h-14 max-w-[1280px] items-center justify-between gap-3 px-4">
        <Link
          to="/"
          className="flex min-w-0 items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Avatar className="size-8 shrink-0">
            <AvatarImage src="/favicon.ico" alt="" />
            <AvatarFallback>{sitename.slice(0, 1)}</AvatarFallback>
          </Avatar>
          <span className="truncate text-lg font-semibold" title={sitename}>
            {sitename}
          </span>
        </Link>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={title}
            title={title}
            onClick={() => updateThemeMode()}
          >
            <Icon icon={icon} width={18} height={18} />
          </Button>
          {(isLoggedIn || !hideAdminEntry) && (
            <Button asChild variant="ghost" size="icon-sm">
              <a href="/admin" aria-label="后台管理" title="后台管理">
                <Icon icon="icon-park-outline:setting" width={18} height={18} />
              </a>
            </Button>
          )}
        </div>
      </div>
    </header>
  )
}
