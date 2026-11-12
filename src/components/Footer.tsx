import type { VersionInfo } from '@/utils/api'
import { useEffect, useState } from 'react'
import { DataTooltip } from '@/components/ui/data-tooltip'
import VisitorInfoCard from '@/components/VisitorInfoCard'
import { cn } from '@/lib/utils'
import { useThemeSettings } from '@/stores/app'
import { getSharedApi } from '@/utils/api'

const buildVersion = __BUILD_VERSION__
const buildGitHash = __BUILD_GIT_HASH__

export default function Footer() {
  const settings = useThemeSettings()
  const [serverVersion, setServerVersion] = useState<VersionInfo | null>(null)

  useEffect(() => {
    let cancelled = false
    getSharedApi()
      .getVersion()
      .then(info => {
        if (!cancelled) setServerVersion(info)
      })
      .catch(() => {
        // 静默失败
      })
    return () => {
      cancelled = true
    }
  }, [])

  // 主控版本可能带或不带 v 前缀，统一成 v1.6.1；拿不到时不显示
  const rawVersion = serverVersion?.version?.trim()
  const formattedServerVersion = rawVersion ? (/^v/i.test(rawVersion) ? rawVersion : `v${rawVersion}`) : null
  const serverHash = serverVersion?.hash?.slice(0, 7) ?? ''

  const showIcp = settings.icpEnabled && !!settings.icpNumber
  const showPolice = settings.policeEnabled && !!settings.policeNumber
  const showFiling = showIcp || showPolice

  return (
    <>
      {settings.visitorInfoCardEnabled && <VisitorInfoCard />}
      {/* 访客胶囊是 fixed 浮层，开启时页脚底部留出它的高度，滚到底不会压住署名 */}
      <footer
        className={cn(
          'w-full sm:flex-row sm:gap-4 max-w-[1280px] mx-auto p-4',
          settings.visitorInfoCardEnabled && 'pb-16',
        )}
      >
        <div className="flex flex-col items-start gap-1 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-1 whitespace-nowrap">
            Powered by
            <DataTooltip as="span" placement="top" content={serverHash} contentClass="whitespace-nowrap">
              <a
                href="https://github.com/komari-monitor/komari"
                target="_blank"
                rel="noopener noreferrer"
                className="transition-opacity hover:opacity-80"
              >
                <span className="font-medium text-foreground">Komari Monitor</span>
                {formattedServerVersion && <span className="num ml-1">{formattedServerVersion}</span>}
              </a>
            </DataTooltip>
          </div>
          {/* 右侧留出「回到顶部」按钮（fixed bottom-8 right-8 size-10）的位置，滚到底时不压字 */}
          <div className="flex items-center gap-1 whitespace-nowrap sm:pr-16 min-[1440px]:pr-0">
            Theme by
            <DataTooltip as="span" placement="top" content={buildGitHash} contentClass="whitespace-pre w-max">
              <a
                href="https://github.com/hoobnn/komari-theme-tundra"
                target="_blank"
                rel="noopener noreferrer"
                className="transition-opacity hover:opacity-80"
              >
                <span className="font-medium text-foreground">Tundra</span>
                <span className="num ml-1">v{buildVersion}</span>
              </a>
            </DataTooltip>
          </div>
        </div>

        {showFiling && (
          <div className="flex flex-wrap gap-2 items-center justify-center sm:flex-shrink-0 pb-7">
            {showIcp && (
              <a
                href={settings.icpUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="transition-opacity hover:opacity-70"
              >
                <span className="text-xs text-muted-foreground">{settings.icpNumber || ''}</span>
              </a>
            )}
            {showIcp && showPolice && <span className="opacity-50 text-xs text-muted-foreground">·</span>}
            {showPolice &&
              (settings.policeUrl ? (
                <a
                  href={settings.policeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-opacity hover:opacity-70"
                >
                  <span className="text-xs text-muted-foreground">{settings.policeNumber || ''}</span>
                </a>
              ) : (
                <span className="text-xs text-muted-foreground">{settings.policeNumber || ''}</span>
              ))}
          </div>
        )}
      </footer>
    </>
  )
}
