import { Icon } from '@iconify/react'
import { DropdownMenu } from 'radix-ui'
import { Link } from 'react-router'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/stores/app'
import type { ThemeMode } from '@/stores/app'

const appearances = {
  auto: { label: '跟随系统', icon: 'lucide:monitor' },
  light: { label: '浅色', icon: 'lucide:sun' },
  dark: { label: '深色', icon: 'lucide:moon' },
} as const
const modes: ThemeMode[] = ['auto', 'light', 'dark']

export default function Header() {
  const isScrolled = useAppStore(state => state.isScrolled)
  const themeMode = useAppStore(state => state.themeMode)
  const isLoggedIn = useAppStore(state => state.isLoggedIn)
  const hideAdminEntry = useAppStore(state => state.settings.hideAdminEntryWhenLoggedOut)
  const sitename = useAppStore(state => state.publicSettings?.sitename) || 'Komari Monitor'
  const updateThemeMode = useAppStore(state => state.updateThemeMode)
  const appearance = appearances[themeMode]

  return (
    <header className={cn('sticky top-0 z-30 border-b bg-card/95 backdrop-blur-xl', isScrolled && 'shadow-xs')}>
      <div className="mx-auto flex h-13 max-w-[1280px] items-center justify-between gap-3 px-4 sm:h-14">
        <Link
          to="/"
          className="flex min-w-0 items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-ring"
        >
          <Avatar className="size-7 shrink-0">
            <AvatarImage src="/favicon.ico" alt="" />
            <AvatarFallback>{sitename.slice(0, 1)}</AvatarFallback>
          </Avatar>
          <span className="truncate text-value font-semibold tracking-tight" title={sitename}>
            {sitename}
          </span>
        </Link>
        <div className="flex shrink-0 items-center gap-1">
          <DropdownMenu.Root modal={false}>
            <DropdownMenu.Trigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="size-9 text-muted-foreground hover:text-foreground pointer-coarse:size-11"
                aria-label={`外观，当前${appearance.label}`}
                title={`外观 · ${appearance.label}`}
              >
                <Icon icon={appearance.icon} />
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={6}
                collisionPadding={8}
                aria-label="外观"
                className="z-40 min-w-36 rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg"
              >
                <DropdownMenu.RadioGroup
                  value={themeMode}
                  onValueChange={value => {
                    const mode = modes.find(item => item === value)
                    if (mode) updateThemeMode(mode)
                  }}
                >
                  {modes.map(mode => (
                    <DropdownMenu.RadioItem
                      key={mode}
                      value={mode}
                      className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-compact outline-none select-none data-highlighted:bg-muted pointer-coarse:min-h-11"
                    >
                      <Icon icon={appearances[mode].icon} aria-hidden="true" className="size-4 text-muted-foreground" />
                      {appearances[mode].label}
                      <DropdownMenu.ItemIndicator className="ml-auto">
                        <Icon icon="lucide:check" className="size-4" />
                      </DropdownMenu.ItemIndicator>
                    </DropdownMenu.RadioItem>
                  ))}
                </DropdownMenu.RadioGroup>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
          {(isLoggedIn || !hideAdminEntry) && (
            <Button
              asChild
              variant="ghost"
              size="icon-sm"
              className="size-9 text-muted-foreground hover:text-foreground pointer-coarse:size-11"
            >
              <a href="/admin" aria-label="后台管理" title="后台管理">
                <Icon icon="lucide:settings" />
              </a>
            </Button>
          )}
        </div>
      </div>
    </header>
  )
}
