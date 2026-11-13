import { Icon } from '@iconify/react'
import { useEffect, useId, useState } from 'react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/stores/app'

interface VisitorGeoData {
  ip: string
  isp: string
  location: string
  countryCode: string
}

interface VisitorClientData {
  device: string
  browser: string
}

interface VisitorInfoRow {
  label: string
  value: string
  icon: string
  expandOnly?: boolean
  fullWidth?: boolean
}

const ANDROID_REGEX = /android/i
const IPHONE_OR_IPOD_REGEX = /iphone|ipod/i
const IPAD_REGEX = /ipad/i
const TABLET_REGEX = /tablet/i
const EDGE_VERSION_REGEX = /(?:Edg|EdgA|EdgiOS)\/(\d+)/i
const OPERA_VERSION_REGEX = /OPR\/(\d+)/i
const CHROME_VERSION_REGEX = /(?:Chrome|CriOS)\/(\d+)/i
const EDGE_OR_OPERA_REGEX = /Edg|OPR/i
const FIREFOX_VERSION_REGEX = /(?:Firefox|FxiOS)\/(\d+)/i
const SAFARI_REGEX = /Safari/i
const CHROME_REGEX = /Chrome|CriOS/i
const IPV4_SEGMENT_REGEX = /^\d+$/
const IPV6_SEGMENT_REGEX = /^[\dA-F]{1,4}$/i
const IPV6_DOUBLE_COLON = '::'

function formatVisitTime(date: Date): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function maskIpForCollapsedState(value: string): string {
  return maskIpv4Address(value) ?? maskIpv6Address(value) ?? value
}

function maskIpv4Address(value: string): string | null {
  const segments = value.split('.')
  if (segments.length !== 4 || segments.some(segment => !IPV4_SEGMENT_REGEX.test(segment))) {
    return null
  }

  const [first, second, third, fourth] = segments as [string, string, string, string]

  return [first, second, '*'.repeat(third.length), fourth].join('.')
}

function maskIpv6Address(value: string): string | null {
  const percentIndex = value.indexOf('%')
  const address = percentIndex >= 0 ? value.slice(0, percentIndex) : value
  const scope = percentIndex >= 0 ? value.slice(percentIndex + 1) : ''
  if (!address.includes(':') || address.includes(':::')) {
    return null
  }

  const doubleColonCount = address.split(IPV6_DOUBLE_COLON).length - 1
  if (doubleColonCount > 1) {
    return null
  }

  const segments = address.split(':')
  if (segments.some((segment, index) => !isValidIpv6Segment(segment, index, segments))) {
    return null
  }

  let maskedAddress = address
  if (address.includes('::')) {
    const [prefix = ''] = address.split('::')
    const visibleSegments = prefix ? prefix.split(':').filter(Boolean).slice(0, 4) : []
    maskedAddress = visibleSegments.length > 0 ? `${visibleSegments.join(':')}::*` : '::*'
  } else if (segments.length > 4) {
    maskedAddress = `${segments.slice(0, 4).join(':')}:*`
  }

  return scope ? `${maskedAddress}%${scope}` : maskedAddress
}

function isValidIpv6Segment(segment: string, index: number, segments: string[]): boolean {
  if (!segment) {
    return true
  }
  if (segment.includes('.')) {
    return index === segments.length - 1 && maskIpv4Address(segment) !== null
  }
  return IPV6_SEGMENT_REGEX.test(segment)
}

function detectClient(): VisitorClientData {
  const ua = navigator.userAgent

  let detectedDevice = '桌面设备'
  if (ANDROID_REGEX.test(ua)) detectedDevice = 'Android 手机'
  else if (IPHONE_OR_IPOD_REGEX.test(ua)) detectedDevice = 'iPhone'
  else if (IPAD_REGEX.test(ua)) detectedDevice = 'iPad'
  else if (TABLET_REGEX.test(ua)) detectedDevice = '平板电脑'

  let detectedBrowser = '未知浏览器'
  const edgeMatch = ua.match(EDGE_VERSION_REGEX)
  const operaMatch = ua.match(OPERA_VERSION_REGEX)
  const chromeMatch = ua.match(CHROME_VERSION_REGEX)
  const firefoxMatch = ua.match(FIREFOX_VERSION_REGEX)

  if (edgeMatch) {
    detectedBrowser = 'Edge'
  } else if (operaMatch) {
    detectedBrowser = 'Opera'
  } else if (chromeMatch && !EDGE_OR_OPERA_REGEX.test(ua)) {
    detectedBrowser = 'Chrome'
  } else if (firefoxMatch) {
    detectedBrowser = 'Firefox'
  } else if (SAFARI_REGEX.test(ua) && !CHROME_REGEX.test(ua)) {
    detectedBrowser = 'Safari'
  }

  return {
    device: detectedDevice,
    browser: detectedBrowser,
  }
}

async function fetchJson<T>(url: string, timeoutMs: number): Promise<T> {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`)
    }
    return (await response.json()) as T
  } finally {
    window.clearTimeout(timeoutId)
  }
}

async function fetchVisitorGeo(): Promise<VisitorGeoData | null> {
  const loaders = [
    async (): Promise<VisitorGeoData> => {
      const data = await fetchJson<{
        ip?: string
        isp?: string
        organization?: string
        asn_organization?: string
        country?: string
        country_code?: string
        region?: string
        city?: string
      }>('https://api.ip.sb/geoip', 4000)

      if (!data.ip) {
        throw new Error('ip.sb unavailable')
      }

      return {
        ip: data.ip,
        isp: data.isp || data.organization || data.asn_organization || '未知运营商',
        location: [data.country, data.city || data.region].filter(Boolean).join(' · ') || '未知位置',
        countryCode: data.country_code || '',
      }
    },
    async (): Promise<VisitorGeoData> => {
      const data = await fetchJson<{
        success?: boolean
        message?: string
        ip?: string
        country?: string
        country_code?: string
        region?: string
        city?: string
        connection?: {
          isp?: string
          org?: string
        }
      }>('https://ipwho.is/', 4000)

      if (data.success === false || !data.ip) {
        throw new Error(data.message || 'ipwho.is unavailable')
      }

      return {
        ip: data.ip,
        isp: data.connection?.isp || data.connection?.org || '未知运营商',
        location: [data.country, data.city || data.region].filter(Boolean).join(' · ') || '未知位置',
        countryCode: data.country_code || '',
      }
    },
    async (): Promise<VisitorGeoData> => {
      const data = await fetchJson<{
        ip?: string
        company?: {
          name?: string
        }
        asn?: {
          org?: string
          descr?: string
          country?: string
        }
        datacenter?: {
          datacenter?: string
          country?: string
          region?: string
          city?: string
        }
        location?: {
          country?: string
          country_code?: string
          state?: string
          city?: string
        }
      }>('https://api.ipapi.is/', 4000)

      if (!data.ip) {
        throw new Error('ipapi.is unavailable')
      }

      return {
        ip: data.ip,
        isp: data.asn?.org || data.company?.name || data.datacenter?.datacenter || data.asn?.descr || '未知运营商',
        location:
          [
            data.location?.country || data.datacenter?.country,
            data.location?.city || data.location?.state || data.datacenter?.city || data.datacenter?.region,
          ]
            .filter(Boolean)
            .join(' · ') || '未知位置',
        countryCode: data.location?.country_code || data.asn?.country || data.datacenter?.country || '',
      }
    },
    async (): Promise<VisitorGeoData> => {
      const data = await fetchJson<{
        error?: boolean
        reason?: string
        ip?: string
        org?: string
        country_name?: string
        country_code?: string
        region?: string
        city?: string
      }>('https://ipapi.co/json/', 4000)

      if (data.error || !data.ip) {
        throw new Error(data.reason || 'ipapi unavailable')
      }

      return {
        ip: data.ip,
        isp: data.org || '未知运营商',
        location: [data.country_name, data.city || data.region].filter(Boolean).join(' · ') || '未知位置',
        countryCode: data.country_code || '',
      }
    },
    async (): Promise<VisitorGeoData> => {
      const data = await fetchJson<{
        code: number
        data?: {
          ip?: string
          isp?: string
          country?: string
          province?: string
          city?: string
          countryCode?: string
        }
      }>('https://api.vore.top/api/IPdata', 5000)

      if (data.code !== 0 || !data.data?.ip) {
        throw new Error('vore unavailable')
      }

      return {
        ip: data.data.ip,
        isp: data.data.isp || '未知运营商',
        location: [data.data.country, data.data.city || data.data.province].filter(Boolean).join(' · ') || '未知位置',
        countryCode: data.data.countryCode || '',
      }
    },
  ]

  for (const load of loaders) {
    try {
      return await load()
    } catch {}
  }

  return null
}

export default function VisitorInfoCard() {
  const [loading, setLoading] = useState(true)
  const [client] = useState(detectClient)
  const [ip, setIp] = useState('获取中')
  const [isp, setIsp] = useState('获取中')
  const [location, setLocation] = useState('正在定位访客来源')
  const [countryCode, setCountryCode] = useState('')
  const [visitTime] = useState(() => formatVisitTime(new Date()))
  const [flagVisible, setFlagVisible] = useState(true)
  const [expand, setExpand] = useState(false)
  const detailsId = useId()

  const subtitle = loading ? '检测中' : location || '网络访客'
  const flagSrc = countryCode ? `/assets/flags/${countryCode}.svg` : ''
  const displayIp = maskIpForCollapsedState(ip)

  const visitorRows: VisitorInfoRow[] = [
    {
      label: '位置',
      fullWidth: true,
      value: subtitle,
      icon: 'tabler:world-pin',
    },
    {
      label: '设备',
      value: client.device,
      icon: 'tabler:device-desktop',
      expandOnly: true,
    },
    {
      label: 'IP 地址',
      fullWidth: true,
      value: displayIp,
      icon: 'tabler:brand-socket-io',
    },
    {
      label: '浏览器',
      value: client.browser,
      icon: 'tabler:browser',
    },
    {
      label: '运营商',
      value: isp,
      icon: 'tabler:building-skyscraper',
      expandOnly: true,
    },
    {
      label: '访问时间',
      value: visitTime,
      icon: 'tabler:clock-hour-4',
      expandOnly: true,
    },
  ]
  const summaryRows = visitorRows.filter(item => !item.expandOnly)
  const detailRows = [...visitorRows.filter(item => item.fullWidth), ...visitorRows.filter(item => !item.fullWidth)]

  useEffect(() => {
    let cancelled = false
    void fetchVisitorGeo().then(geo => {
      if (cancelled) return
      if (geo) {
        const code = geo.countryCode.toUpperCase()
        setIp(geo.ip)
        setIsp(geo.isp)
        setLocation(geo.location)
        setCountryCode(code)
        useAppStore.setState({ visitorCountryCode: code })
      } else {
        setIp('暂无法获取')
        setIsp('网络信息不可用')
        setLocation('网络访客')
      }
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[max(0.625rem,env(safe-area-inset-bottom))] z-30 flex justify-center">
      <div
        className="visitor-card pointer-events-auto inline-grid max-w-[calc(100%-2rem)] grid-cols-[minmax(0,1fr)] overflow-hidden rounded-xl border bg-card shadow-sm"
        data-expanded={expand}
      >
        <button
          type="button"
          aria-label="访客网络信息"
          aria-expanded={expand}
          aria-controls={detailsId}
          className="flex min-w-0 items-center justify-center gap-3 rounded-[inherit] px-3 py-1.5 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foreground/50"
          onClick={() => setExpand(value => !value)}
          onKeyDown={event => {
            if (event.key === 'Escape') setExpand(false)
          }}
        >
          {summaryRows.map((item, index) => (
            <span key={item.icon} className="flex min-w-0 items-center gap-1">
              {item.icon === 'tabler:world-pin' && flagSrc && flagVisible ? (
                <img
                  src={flagSrc}
                  alt={countryCode}
                  className="h-4 w-4 shrink-0 object-cover"
                  onError={() => setFlagVisible(false)}
                />
              ) : (
                <span className="flex size-4 shrink-0 items-center justify-center rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                  <Icon icon={item.icon} width={14} height={14} />
                </span>
              )}
              <span className={cn('min-w-0', index > 0 && 'hidden md:block')}>
                {loading ? (
                  <span className="block h-2 w-15 animate-pulse rounded-full bg-muted/70" />
                ) : (
                  <span className="block max-w-30 truncate text-xs font-medium text-muted-foreground sm:max-w-50">
                    {item.value}
                  </span>
                )}
              </span>
            </span>
          ))}
          <Icon
            icon="tabler:chevron-up"
            className={cn(
              'size-3 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none',
              expand && 'rotate-180',
            )}
          />
        </button>
        <div
          id={detailsId}
          className="visitor-card-details"
          data-expanded={expand}
          aria-hidden={!expand}
          inert={!expand}
        >
          <div className="min-h-0 overflow-hidden">
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 border-t px-3 py-3 text-[11px]">
              {detailRows.map(item => (
                <div key={item.icon} className={cn('min-w-0', item.fullWidth && 'col-span-2')}>
                  <dt className="mb-0.5 text-[10px] text-muted-foreground">{item.label}</dt>
                  <dd className={cn('break-words text-foreground/85', item.label === 'IP 地址' && 'num break-all')}>
                    {item.label === 'IP 地址' ? ip : item.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </div>
  )
}
