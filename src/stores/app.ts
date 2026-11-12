import type { PublicSettings } from '@/utils/api'
import type { ByteDecimalsConfig } from '@/utils/helper'
import { create } from 'zustand'
import { readStorage, writeStorage } from '@/lib/storage'

export type ThemeMode = 'auto' | 'light' | 'dark'
type Lang = 'zh-CN' | 'en-US'
export type NodeViewMode = 'card' | 'list'
type RpcTransportMode = 'websocket' | 'http'
export type EarthViewMode = 'earth' | 'earth-stop' | 'maps' | 'cards' | 'hide'

/** 固定的字节精度配置 */
const BYTE_DECIMALS: ByteDecimalsConfig = {
  B: 0,
  KB: 0,
  MB: 1,
  GB: 1,
  TB: 2,
}

// 沿用 Emerald 时期的键名与裸字符串格式，升级后已保存的偏好继续生效
const THEME_MODE_KEY = 'themeMode'
const VIEW_MODE_KEY = 'nodeViewMode'
const SELECTED_GROUP_KEY = 'nodeSelectedGroup'

function isValidThemeMode(value: unknown): value is ThemeMode {
  return value === 'auto' || value === 'light' || value === 'dark'
}

function isValidViewMode(value: unknown): value is NodeViewMode {
  return value === 'card' || value === 'list'
}

function isValidEarthViewMode(value: unknown): value is EarthViewMode {
  return value === 'earth' || value === 'earth-stop' || value === 'maps' || value === 'cards' || value === 'hide'
}

/** 主题设置（komari-theme.json 的 configuration.data），已做类型校验并补默认值 */
export interface ThemeSettings {
  defaultViewMode: NodeViewMode
  rpcTransportMode: RpcTransportMode
  alertEnabled: boolean
  alertTitle: string
  alertContent: string
  earthViewMode: EarthViewMode
  visitorInfoCardEnabled: boolean
  hideAdminEntryWhenLoggedOut: boolean
  disablePageAnimation: boolean
  /** 三网延迟显示节点顺序（未配置时为空数组，保持默认排序） */
  pingNetworkOrder: string[]
  offlineNodesLast: boolean
  icpEnabled: boolean
  icpNumber: string
  icpUrl: string
  policeEnabled: boolean
  policeNumber: string
  policeUrl: string
  backgroundEnabled: boolean
  backgroundType: 'image' | 'video'
  lightBackgroundUrl: string
  darkBackgroundUrl: string
  backgroundBlur: number
  backgroundOverlay: number
}

function parsePingNetworkOrder(raw: string): string[] {
  const seen = new Set<string>()
  const names: string[] = []
  for (const item of raw.split(',')) {
    const normalized = item.trim()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    names.push(normalized)
  }
  return names
}

export function deriveThemeSettings(publicSettings: PublicSettings | undefined): ThemeSettings {
  const s: Record<string, unknown> = publicSettings?.theme_settings ?? {}
  const bool = (key: string, fallback: boolean) => (typeof s[key] === 'boolean' ? s[key] : fallback)
  const str = (key: string) => (typeof s[key] === 'string' ? s[key] : '')
  const backgroundBlur = s.backgroundBlur
  const backgroundOverlay = s.backgroundOverlay

  return {
    defaultViewMode: isValidViewMode(s.defaultViewMode) ? s.defaultViewMode : 'card',
    rpcTransportMode: s.rpcTransportMode === 'http' ? 'http' : 'websocket',
    alertEnabled: bool('alertEnabled', false),
    alertTitle: str('alertTitle'),
    alertContent: str('alertContent'),
    earthViewMode: isValidEarthViewMode(s.earthViewMode) ? s.earthViewMode : 'earth',
    visitorInfoCardEnabled: bool('visitorInfoCardEnabled', true),
    hideAdminEntryWhenLoggedOut: bool('hideAdminEntryWhenLoggedOut', false),
    disablePageAnimation: bool('disablePageAnimation', false),
    pingNetworkOrder: parsePingNetworkOrder(str('pingNetworkOrder')),
    offlineNodesLast: bool('offlineNodesLast', false),
    icpEnabled: bool('icpEnabled', false),
    icpNumber: str('icpNumber'),
    icpUrl: str('icpUrl').trim() || 'https://beian.miit.gov.cn/',
    policeEnabled: bool('policeEnabled', false),
    policeNumber: str('policeNumber'),
    policeUrl: str('policeUrl').trim(),
    backgroundEnabled: bool('backgroundEnabled', false),
    backgroundType: s.backgroundType === 'video' ? 'video' : 'image',
    lightBackgroundUrl: str('lightBackgroundUrl').trim(),
    darkBackgroundUrl: str('darkBackgroundUrl').trim(),
    backgroundBlur: typeof backgroundBlur === 'number' && backgroundBlur >= 0 ? backgroundBlur : 0,
    backgroundOverlay:
      typeof backgroundOverlay === 'number' && backgroundOverlay >= -100 && backgroundOverlay <= 100
        ? backgroundOverlay
        : 0,
  }
}

const darkQuery = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null

interface AppState {
  loading: boolean
  themeMode: ThemeMode
  /** 系统是否偏好暗色（跟随 prefers-color-scheme） */
  prefersDark: boolean
  lang: Lang
  publicSettings: PublicSettings | undefined
  /** 由 publicSettings.theme_settings 派生，已校验 */
  settings: ThemeSettings
  nodeSelectedGroup: string
  /** localStorage 里保存的视图模式；为 null 时跟随主题设置的默认值 */
  storedViewMode: NodeViewMode | null
  isLoggedIn: boolean
  connectionError: boolean
  /** 首页滚动位置记忆 */
  homeScrollPosition: number
  /** 页面是否已滚动（顶栏据此加毛玻璃） */
  isScrolled: boolean
  visitorCountryCode: string | null
  byteDecimals: ByteDecimalsConfig

  setPublicSettings: (settings: PublicSettings) => void
  /** 传入模式时直接切换；不传时按 auto → light → dark → auto 轮换 */
  updateThemeMode: (mode?: ThemeMode) => void
  updateLoginState: (loggedIn: boolean) => void
  setNodeViewMode: (mode: NodeViewMode) => void
  setNodeSelectedGroup: (group: string) => void
}

const storedThemeMode = readStorage(THEME_MODE_KEY)
const storedViewMode = readStorage(VIEW_MODE_KEY)

export const useAppStore = create<AppState>()(set => ({
  loading: true,
  themeMode: isValidThemeMode(storedThemeMode) ? storedThemeMode : 'auto',
  prefersDark: darkQuery?.matches ?? false,
  lang: 'zh-CN',
  publicSettings: undefined,
  settings: deriveThemeSettings(undefined),
  nodeSelectedGroup: readStorage(SELECTED_GROUP_KEY) ?? 'all',
  storedViewMode: isValidViewMode(storedViewMode) ? storedViewMode : null,
  isLoggedIn: false,
  connectionError: false,
  homeScrollPosition: 0,
  isScrolled: false,
  visitorCountryCode: null,
  byteDecimals: { ...BYTE_DECIMALS },

  setPublicSettings: publicSettings => {
    const settings = deriveThemeSettings(publicSettings)
    set(state => {
      // 没保存过视图模式时，用主题设置的默认值并写回本地
      if (state.storedViewMode === null) {
        writeStorage(VIEW_MODE_KEY, settings.defaultViewMode)
        return { publicSettings, settings, storedViewMode: settings.defaultViewMode }
      }
      return { publicSettings, settings }
    })
  },
  updateThemeMode: mode => {
    set(state => {
      const nextMode: Record<ThemeMode, ThemeMode> = { auto: 'light', light: 'dark', dark: 'auto' }
      const themeMode = mode ? (isValidThemeMode(mode) ? mode : 'auto') : nextMode[state.themeMode]
      writeStorage(THEME_MODE_KEY, themeMode)
      return { themeMode }
    })
  },
  updateLoginState: loggedIn => set({ isLoggedIn: loggedIn }),
  setNodeViewMode: mode => {
    writeStorage(VIEW_MODE_KEY, mode)
    set({ storedViewMode: mode })
  },
  setNodeSelectedGroup: group => {
    writeStorage(SELECTED_GROUP_KEY, group)
    set({ nodeSelectedGroup: group })
  },
}))

darkQuery?.addEventListener('change', event => useAppStore.setState({ prefersDark: event.matches }))

export function selectIsDark(state: Pick<AppState, 'themeMode' | 'prefersDark'>): boolean {
  return state.themeMode === 'auto' ? state.prefersDark : state.themeMode === 'dark'
}

/** 当前实际使用的视图模式 */
export function selectNodeViewMode(state: Pick<AppState, 'storedViewMode' | 'settings'>): NodeViewMode {
  return state.storedViewMode ?? state.settings.defaultViewMode
}

/** 当前主题模式下的背景 URL，未启用背景时为空 */
export function selectCurrentBackgroundUrl(state: Pick<AppState, 'themeMode' | 'prefersDark' | 'settings'>): string {
  if (!state.settings.backgroundEnabled) return ''
  return selectIsDark(state) ? state.settings.darkBackgroundUrl : state.settings.lightBackgroundUrl
}

/** 校验过的主题设置 */
export function useThemeSettings(): ThemeSettings {
  return useAppStore(state => state.settings)
}

export function useIsDark(): boolean {
  return useAppStore(selectIsDark)
}
