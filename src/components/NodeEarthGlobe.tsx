import type { Arc, COBEOptions, Globe, Marker } from 'cobe'
import type { NodeData } from '@/stores/nodes'
import { Icon } from '@iconify/react'
import createGlobe from 'cobe'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { useAppStore, useIsDark } from '@/stores/app'
import { useNodesStore } from '@/stores/nodes'
import { getCoordByCode, getCountryCodeFromRegion } from '@/utils/geoHelper'
import { formatBytesPerSecondSplit } from '@/utils/helper'

interface NodeEarthGlobeProps {
  nodes?: NodeData[]
  className?: string
}

interface RegionCluster {
  code: string
  coord: [number, number]
  servers: number
  onlineServers: number
}

interface RegionRate {
  up: number
  down: number
}

type Vec3 = [number, number, number]

interface GlobeColors {
  dark: number
  mapBrightness: number
  baseColor: Vec3
  markerColor: Vec3
  glowColor: Vec3
  arcColor: Vec3
}

const INITIAL_THETA = 0.22
const MIN_THETA = -0.65
const MAX_THETA = 0.65
const CHINA_COORD = getCoordByCode('CN') ?? [35.8617, 104.1954]
const DEFAULT_PHI = normalizePhi(-Math.PI / 2 - (CHINA_COORD[1] * Math.PI) / 180)
const GLOBE_RADIUS = 0.8
const GLOBE_SCALE = 1
const MARKER_ELEVATION = 0
// phi 收敛/静止时整帧跳过 globe.update，WebGL + overlay 位置更新双双归零
const ORIENTATION_IDLE_EPSILON = 1e-5

/** 渲染循环用到的最新渲染数据（每次渲染后同步） */
interface GlobeLatest {
  clusters: RegionCluster[]
  markers: Marker[]
  arcs: Arc[]
  colors: GlobeColors
  autoRotate: boolean
  shouldRender: boolean
  width: number
  height: number
}

/** 命令式部分（cobe 实例、旋转状态、rAF）集中在一个稳定对象里，渲染期间不读写 */
interface GlobeCtx {
  globe: Globe | null
  rafId: number | null
  phi: number
  targetPhi: number
  theta: number
  targetTheta: number
  isPointerDown: boolean
  lastPointerX: number
  lastPointerY: number
  staticRedrawUntil: number
  overlayEls: Map<string, HTMLDivElement>
  container: HTMLDivElement | null
  canvas: HTMLCanvasElement | null
  latest: GlobeLatest
}

function normalizePhi(value: number): number {
  const circle = Math.PI * 2
  let next = value % circle
  if (next <= -Math.PI) next += circle
  if (next > Math.PI) next -= circle
  return next
}

function clampTheta(value: number): number {
  return Math.min(Math.max(value, MIN_THETA), MAX_THETA)
}

function getCtx(ref: { current: GlobeCtx | null }): GlobeCtx {
  ref.current ??= createCtx()
  return ref.current
}

function createCtx(): GlobeCtx {
  return {
    globe: null,
    rafId: null,
    phi: DEFAULT_PHI,
    targetPhi: DEFAULT_PHI,
    theta: INITIAL_THETA,
    targetTheta: INITIAL_THETA,
    isPointerDown: false,
    lastPointerX: 0,
    lastPointerY: 0,
    staticRedrawUntil: 0,
    overlayEls: new Map(),
    container: null,
    canvas: null,
    latest: {
      clusters: [],
      markers: [],
      arcs: [],
      colors: getThemeColors(false),
      autoRotate: true,
      shouldRender: false,
      width: 0,
      height: 0,
    },
  }
}

function now(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now()
}

function resetStoppedView(ctx: GlobeCtx) {
  ctx.phi = DEFAULT_PHI
  ctx.targetPhi = DEFAULT_PHI
  ctx.theta = INITIAL_THETA
  ctx.targetTheta = INITIAL_THETA
}

function triggerStaticRedrawWindow(ctx: GlobeCtx, duration = 1500) {
  ctx.staticRedrawUntil = now() + duration
}

function shouldKeepStaticRedraw(ctx: GlobeCtx): boolean {
  return now() < ctx.staticRedrawUntil
}

// 减少高采样导致的性能问题
function getCappedDpr(): number {
  if (typeof window === 'undefined') return 1
  return Math.min(window.devicePixelRatio || 1, 2)
}

function clusterKey(c: RegionCluster) {
  return `${c.code}:${c.servers}:${c.onlineServers}`
}

function coordToGlobePoint([lat, lon]: [number, number]): Vec3 {
  const latRad = (lat * Math.PI) / 180
  const lonRad = (lon * Math.PI) / 180 - Math.PI
  const cosLat = Math.cos(latRad)
  return [-cosLat * Math.cos(lonRad), Math.sin(latRad), cosLat * Math.sin(lonRad)]
}

function getThemeColors(isDark: boolean): GlobeColors {
  if (isDark) {
    return {
      dark: 1,
      mapBrightness: 4,
      baseColor: [0.32, 0.33, 0.4],
      markerColor: [0.2, 0.83, 0.6],
      glowColor: [0.2, 0.25, 0.45],
      arcColor: [0.2, 0.83, 0.6],
    }
  }
  return {
    dark: 0,
    mapBrightness: 6,
    baseColor: [1, 1, 1],
    markerColor: [0.02, 0.59, 0.41],
    glowColor: [1, 1, 1],
    arcColor: [0.06, 0.73, 0.51],
  }
}

function getRenderSize(ctx: GlobeCtx) {
  const width = ctx.latest.width || ctx.canvas?.clientWidth || 320
  const height = ctx.latest.height || ctx.canvas?.clientHeight || width
  return { width, height }
}

// iOS Safari 对 cobe 内部 marker anchor 的 DOM/style 行为不稳定，
// overlay 改为组件内自行投影定位，避免回落到容器左上角。
function syncClusterOverlayPosition(ctx: GlobeCtx, cluster: RegionCluster, el: HTMLDivElement) {
  const { width, height } = getRenderSize(ctx)
  if (width <= 0 || height <= 0) {
    el.style.opacity = '0'
    el.style.filter = 'blur(20px)'
    return
  }

  const aspect = width / height
  const cosTheta = Math.cos(ctx.theta)
  const sinTheta = Math.sin(ctx.theta)
  const cosPhi = Math.cos(ctx.phi)
  const sinPhi = Math.sin(ctx.phi)
  const markerRadius = GLOBE_RADIUS + MARKER_ELEVATION
  const visibleThreshold = GLOBE_RADIUS * GLOBE_RADIUS
  const [baseX, baseY, baseZ] = coordToGlobePoint(cluster.coord)
  const x = baseX * markerRadius
  const y = baseY * markerRadius
  const z = baseZ * markerRadius
  const screenX = cosPhi * x + sinPhi * z
  const screenY = sinPhi * sinTheta * x + cosTheta * y - cosPhi * sinTheta * z
  const visible =
    -sinPhi * cosTheta * x + sinTheta * y + cosPhi * cosTheta * z >= 0 ||
    screenX * screenX + screenY * screenY >= visibleThreshold
  const xPx = (((screenX / aspect) * GLOBE_SCALE + 1) * width) / 2
  const yPx = ((-screenY * GLOBE_SCALE + 1) * height) / 2

  el.style.transform = `translate3d(${xPx}px, ${yPx}px, 0)`
  el.style.opacity = visible ? '1' : '0'
  el.style.filter = visible ? 'blur(0px)' : 'blur(20px)'
}

function syncClusterOverlayPositions(ctx: GlobeCtx) {
  for (const cluster of ctx.latest.clusters) {
    const el = ctx.overlayEls.get(cluster.code)
    if (!el) continue
    syncClusterOverlayPosition(ctx, cluster, el)
  }
}

function updateGlobeFrame(ctx: GlobeCtx) {
  if (!ctx.globe) return
  const { width, height } = getRenderSize(ctx)
  ctx.globe.update({ phi: ctx.phi, theta: ctx.theta, width, height })
  syncClusterOverlayPositions(ctx)
}

function stepFrame(ctx: GlobeCtx) {
  if (!ctx.globe) return
  const prevPhi = ctx.phi
  const prevTheta = ctx.theta
  if (!ctx.isPointerDown && ctx.latest.autoRotate) ctx.targetPhi += 0.002
  ctx.phi += (ctx.targetPhi - ctx.phi) * 1
  ctx.theta += (ctx.targetTheta - ctx.theta) * 1
  if (
    Math.abs(ctx.phi - prevPhi) < ORIENTATION_IDLE_EPSILON &&
    Math.abs(ctx.theta - prevTheta) < ORIENTATION_IDLE_EPSILON
  ) {
    if (!ctx.latest.autoRotate && shouldKeepStaticRedraw(ctx)) updateGlobeFrame(ctx)
    return
  }
  updateGlobeFrame(ctx)
}

function pauseRaf(ctx: GlobeCtx) {
  if (ctx.rafId !== null) {
    cancelAnimationFrame(ctx.rafId)
    ctx.rafId = null
  }
}

function resumeRaf(ctx: GlobeCtx) {
  if (ctx.rafId !== null) return
  const tick = () => {
    ctx.rafId = requestAnimationFrame(tick)
    stepFrame(ctx)
  }
  ctx.rafId = requestAnimationFrame(tick)
}

function syncRafState(ctx: GlobeCtx) {
  if (!ctx.globe) return

  if (ctx.latest.shouldRender && (ctx.latest.autoRotate || ctx.isPointerDown)) {
    resumeRaf(ctx)
    return
  }

  pauseRaf(ctx)
  if (ctx.latest.shouldRender) updateGlobeFrame(ctx)
}

function startGlobe(ctx: GlobeCtx, earthViewMode: string) {
  const canvas = ctx.canvas
  if (!canvas) return
  if (earthViewMode === 'earth-stop') {
    resetStoppedView(ctx)
    triggerStaticRedrawWindow(ctx)
  }
  const { latest } = ctx
  const colors = latest.colors
  const { width, height } = getRenderSize(ctx)
  const options: COBEOptions = {
    devicePixelRatio: getCappedDpr(),
    width,
    height,
    phi: ctx.phi,
    theta: ctx.theta,
    dark: colors.dark,
    diffuse: 1.2,
    mapSamples: 10000, // 地图采样点数，默认 16000
    mapBrightness: colors.mapBrightness,
    baseColor: colors.baseColor,
    markerColor: colors.markerColor,
    glowColor: colors.glowColor,
    markers: latest.markers,
    arcs: latest.arcs,
    arcColor: colors.arcColor,
    arcWidth: 0.8,
    arcHeight: 0.4,
    markerElevation: MARKER_ELEVATION,
  }
  ctx.globe = createGlobe(canvas, options)
  syncClusterOverlayPositions(ctx)
  // 静止地球没有自转帧，首帧需要在实际尺寸稳定后主动重绘一次。
  requestAnimationFrame(() => {
    updateGlobeFrame(ctx)
  })
  // 先按"前台"启动，若实际不可见，shouldRender 的 effect 会在下一帧 pause
  syncRafState(ctx)
}

// cobe 不会清理自己创建的 wrapper，这里手动收尾：把 canvas 放回原位再移除 wrapper。
function stopGlobe(ctx: GlobeCtx) {
  pauseRaf(ctx)
  ctx.globe?.destroy()
  ctx.globe = null
  const { canvas, container } = ctx
  if (canvas && container) {
    const cobeWrapper = canvas.parentElement
    if (cobeWrapper && cobeWrapper !== container) {
      container.insertBefore(canvas, cobeWrapper)
      cobeWrapper.remove()
    }
  }
}

export default function NodeEarthGlobe({ nodes, className }: NodeEarthGlobeProps) {
  const earthNodes = useNodesStore(state => state.earthNodes)
  const earthViewMode = useAppStore(state => state.settings.earthViewMode)
  const visitorInfoCardEnabled = useAppStore(state => state.settings.visitorInfoCardEnabled)
  const visitorCountryCode = useAppStore(state => state.visitorCountryCode)
  const byteDecimals = useAppStore(state => state.byteDecimals)
  const isDark = useIsDark()
  const displayNodes = nodes ?? earthNodes

  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const ctxRef = useRef<GlobeCtx | null>(null)

  const [size, setSize] = useState({ width: 0, height: 0 })
  const [documentVisible, setDocumentVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState === 'visible',
  )
  const [elementVisible, setElementVisible] = useState(false)

  // 节点按地区聚合
  const clusterMap = new Map<string, RegionCluster>()
  const rateMap = new Map<string, RegionRate>()
  for (const node of displayNodes) {
    const code = getCountryCodeFromRegion(node.region)
    if (!code) continue
    const coord = getCoordByCode(code)
    if (coord) {
      let entry = clusterMap.get(code)
      if (!entry) {
        entry = { code, coord, servers: 0, onlineServers: 0 }
        clusterMap.set(code, entry)
      }
      entry.servers += 1
      if (node.online) entry.onlineServers += 1
    }
    if (node.online) {
      let rate = rateMap.get(code)
      if (!rate) {
        rate = { up: 0, down: 0 }
        rateMap.set(code, rate)
      }
      rate.up += node.net_out || 0
      rate.down += node.net_in || 0
    }
  }
  const regionClusters = Array.from(clusterMap.values()).sort((a, b) => b.servers - a.servers)

  const arcsEnabled = visitorInfoCardEnabled && visitorCountryCode != null
  const userCoord: [number, number] | null = visitorInfoCardEnabled ? getCoordByCode(visitorCountryCode) : null

  const markers: Marker[] = regionClusters.map(cluster => ({
    location: cluster.coord,
    size: 0, // 不渲染圆点
  }))

  // 从各地区汇聚到用户当前位置
  const arcs: Arc[] =
    !arcsEnabled || !userCoord || regionClusters.length === 0
      ? []
      : regionClusters.map(cluster => ({
          from: cluster.coord,
          to: userCoord,
        }))

  const shouldRender = documentVisible && elementVisible
  const shouldAutoRotate = earthViewMode !== 'earth-stop'
  const colors = getThemeColors(isDark)

  // 同步最新渲染数据给命令式循环（须排在其他 effect 之前）
  useEffect(() => {
    const ctx = getCtx(ctxRef)
    ctx.latest = {
      clusters: regionClusters,
      markers,
      arcs,
      colors,
      autoRotate: shouldAutoRotate,
      shouldRender,
      width: size.width,
      height: size.height,
    }
    ctx.container = containerRef.current
    ctx.canvas = canvasRef.current
  })

  // 容器尺寸 / 可见性
  useEffect(() => {
    const el = containerRef.current
    if (!el) return undefined
    const resizeObserver = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect
      if (rect) setSize({ width: rect.width, height: rect.height })
    })
    resizeObserver.observe(el)
    const intersectionObserver = new IntersectionObserver(entries => {
      const last = entries[entries.length - 1]
      if (last) setElementVisible(last.isIntersecting)
    })
    intersectionObserver.observe(el)
    const onVisibility = () => setDocumentVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      resizeObserver.disconnect()
      intersectionObserver.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  // 创建 / 销毁 globe；切换主题时重建。StrictMode 下 create → destroy → create 不会残留第二个循环
  useEffect(() => {
    const ctx = getCtx(ctxRef)
    startGlobe(ctx, useAppStore.getState().settings.earthViewMode)
    return () => stopGlobe(ctx)
  }, [ctxRef, isDark])

  useEffect(() => {
    const ctx = getCtx(ctxRef)
    if (!ctx.globe || size.width <= 0 || size.height <= 0) return
    updateGlobeFrame(ctx)
  }, [ctxRef, size.width, size.height])

  useEffect(() => {
    const ctx = getCtx(ctxRef)
    if (earthViewMode === 'earth-stop') resetStoppedView(ctx)
    triggerStaticRedrawWindow(ctx)
    syncRafState(ctx)
  }, [ctxRef, earthViewMode])

  // 地区 / 访客位置变化：只更新 markers 与 arcs，不重建 globe
  const clusterSignature = regionClusters.map(clusterKey).join(',')
  const userCoordSignature = userCoord ? `${userCoord[0]},${userCoord[1]}` : ''
  useEffect(() => {
    const ctx = getCtx(ctxRef)
    if (!ctx.globe) return
    ctx.globe.update({ markers: ctx.latest.markers, arcs: ctx.latest.arcs })
    syncClusterOverlayPositions(ctx)
    if (!ctx.latest.autoRotate) triggerStaticRedrawWindow(ctx, 600)
  }, [ctxRef, clusterSignature, userCoordSignature])

  useEffect(() => {
    const ctx = getCtx(ctxRef)
    if (!ctx.globe) return
    syncRafState(ctx)
  }, [ctxRef, shouldRender])

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = getCtx(ctxRef)
    ctx.isPointerDown = true
    ctx.lastPointerX = e.clientX
    ctx.lastPointerY = e.clientY
    e.currentTarget.setPointerCapture(e.pointerId)
    syncRafState(ctx)
  }
  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = getCtx(ctxRef)
    if (!ctx.isPointerDown) return
    const deltaX = e.clientX - ctx.lastPointerX
    const deltaY = e.clientY - ctx.lastPointerY
    ctx.lastPointerX = e.clientX
    ctx.lastPointerY = e.clientY
    ctx.targetPhi += deltaX / 200
    ctx.targetTheta = clampTheta(ctx.targetTheta + deltaY / 300)
  }
  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = getCtx(ctxRef)
    ctx.isPointerDown = false
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    syncRafState(ctx)
  }

  const totalServers = displayNodes.length
  const onlineServers = displayNodes.filter(node => node.online).length
  const offlineServers = totalServers - onlineServers

  function formatRate(bytesPerSec: number): string {
    const { value, unit } = formatBytesPerSecondSplit(bytesPerSec, byteDecimals)
    return `${value} ${unit}`
  }

  return (
    <div
      ref={containerRef}
      className={cn('relative aspect-square w-full max-w-md mx-auto -translate-y-6 md:-translate-y-12', className)}
    >
      <canvas
        ref={canvasRef}
        className="earth-globe-canvas absolute inset-0 w-full h-full select-none touch-none cursor-grab active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />

      {regionClusters.map(cluster => {
        const rate = rateMap.get(cluster.code) ?? { up: 0, down: 0 }
        return (
          <div
            key={cluster.code}
            ref={el => {
              if (!el) return undefined
              const ctx = getCtx(ctxRef)
              el.style.willChange = 'transform, opacity, filter'
              ctx.overlayEls.set(cluster.code, el)
              syncClusterOverlayPosition(ctx, cluster, el)
              return () => {
                if (ctx.overlayEls.get(cluster.code) === el) ctx.overlayEls.delete(cluster.code)
              }
            }}
            className="absolute -top-7.5 left-0 pointer-events-none rounded backdrop-blur transition-[opacity,filter] duration-500"
          >
            <img
              src={`/assets/flags/${cluster.code}.svg`}
              alt={cluster.code}
              className="size-4 block absolute -bottom-2 -left-2 z-1"
            />
            <div className="relative z-2 bg-background/60 rounded py-0.5 px-1 text-xs zoom-80 items-start justify-center text-nowrap">
              <div className="num flex flex-row items-center gap-0.5 text-emerald-700 dark:text-emerald-300">
                <Icon icon="tabler:arrow-up" width="12" height="12" /> {formatRate(rate.up)}
              </div>
              <div className="num flex flex-row items-center gap-0.5 text-sky-700 dark:text-sky-300">
                <Icon icon="tabler:arrow-down" width="12" height="12" /> {formatRate(rate.down)}
              </div>
            </div>
          </div>
        )
      })}

      {totalServers > 0 && (
        <div className="absolute top-6 md:top-12 left-0 text-[11px] text-muted-foreground pointer-events-none flex gap-2 items-center backdrop-blur-lg bg-background/60 rounded px-2 py-0.5">
          {onlineServers > 0 && (
            <div className="flex items-center gap-1">
              <span className="inline-block size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>在线</span>
              <span className="num font-medium text-emerald-700 dark:text-emerald-300">{onlineServers}</span>
            </div>
          )}
          {offlineServers > 0 && (
            <div className="flex items-center gap-1">
              <span className="inline-block size-1.5 rounded-full bg-red-500" />
              <span>离线</span>
              <span className="num font-medium text-red-600 dark:text-red-400">{offlineServers}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
