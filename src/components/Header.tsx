import { Icon } from '@iconify/react'
import { useNavigate } from 'react-router'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { DataTooltip } from '@/components/ui/data-tooltip'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/stores/app'

const siteFavicon = '/favicon.ico'

export default function Header() {
  const navigate = useNavigate()
  const isScrolled = useAppStore(state => state.isScrolled)
  const themeMode = useAppStore(state => state.themeMode)
  const isLoggedIn = useAppStore(state => state.isLoggedIn)
  const hideAdminEntryWhenLoggedOut = useAppStore(state => state.settings.hideAdminEntryWhenLoggedOut)
  const sitename = useAppStore(state => state.publicSettings?.sitename) || 'Komari Monitor'
  const updateThemeMode = useAppStore(state => state.updateThemeMode)

  const actionButtons = [
    {
      // 三态循环 自动 → 浅色 → 深色 → 自动，提示里写明点击后切到哪一档
      title:
        themeMode === 'auto'
          ? '主题：跟随系统（点击切换为浅色）'
          : themeMode === 'light'
            ? '主题：浅色（点击切换为深色）'
            : '主题：深色（点击切换为跟随系统）',
      icon:
        themeMode === 'auto'
          ? 'icon-park-outline:dark-mode'
          : themeMode === 'light'
            ? 'icon-park-outline:sun-one'
            : 'icon-park-outline:moon',
      action: 'toggleTheme',
    },
  ]

  if (isLoggedIn || !hideAdminEntryWhenLoggedOut) {
    actionButtons.push({
      title: '后台管理',
      icon: 'icon-park-outline:setting',
      action: 'jumpToSetting',
    })
  }

  function handleButtonClick(action: string) {
    switch (action) {
      case 'toggleTheme':
        updateThemeMode()
        break
      case 'jumpToSetting':
        location.href = '/admin'
        break
    }
  }

  return (
    <div
      className={cn(
        'transition-all duration-200 top-0 sticky z-10 border-b border-transparent',
        isScrolled ? 'backdrop-blur-xl' : 'bg-transparent',
      )}
    >
      <div className="px-4 flex-between h-14 max-w-[1280px] mx-auto">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => void navigate('/')}>
          <Avatar className="size-8">
            <AvatarImage src={siteFavicon} alt={sitename} />
            <AvatarFallback>{sitename.slice(0, 1)}</AvatarFallback>
          </Avatar>
          <h3 className="m-0 text-lg font-semibold">{sitename}</h3>
        </div>
        <div className="flex items-center gap-2">
          {actionButtons.map(button => (
            <DataTooltip key={button.action} content={button.title} placement="left" contentClass="whitespace-nowrap">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={button.title}
                onClick={() => handleButtonClick(button.action)}
              >
                <Icon icon={button.icon} width={18} height={18} />
              </Button>
            </DataTooltip>
          ))}
        </div>
      </div>
    </div>
  )
}
