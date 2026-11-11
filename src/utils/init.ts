/**
 * 应用初始化模块
 * 负责应用启动时的初始化流程和 WebSocket 连接管理
 */

import type { Client, KomariRpc, NodeStatus } from '@/utils/rpc'
import { useAppStore } from '@/stores/app'
import { useNodesStore } from '@/stores/nodes'
import { getSharedApi } from '@/utils/api'
import { getSharedRpc, RpcError } from '@/utils/rpc'

/** 初始化配置 */
interface InitConfig {
  /** WebSocket 重连间隔（毫秒） */
  wsReconnectInterval?: number
  /** WebSocket 最大重连次数（失败后回落 POST） */
  wsMaxReconnectAttempts?: number
  /** 轮询连续失败多少次才提示连接错误 */
  pollFailureThreshold?: number
  /** 首次加载失败后的重试间隔（毫秒） */
  initRetryInterval?: number
}

const DEFAULT_CONFIG: Required<InitConfig> = {
  wsReconnectInterval: 3000,
  wsMaxReconnectAttempts: 5,
  pollFailureThreshold: 3,
  initRetryInterval: 5000,
}

function isPageVisible(): boolean {
  return typeof document === 'undefined' || document.visibilityState === 'visible'
}

/** 初始化状态管理 */
class InitManager {
  private config: Required<InitConfig>
  private rpc: KomariRpc
  private appStore: ReturnType<typeof useAppStore>
  private nodesStore: ReturnType<typeof useNodesStore>
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private isPolling = false
  private isInitialized = false
  private useWebSocket: boolean | null = null // 根据主题配置决定
  private wsCloseUnsubscribe: (() => void) | null = null
  private wsErrorUnsubscribe: (() => void) | null = null
  private pollFailures = 0
  private initPromise: Promise<void> | null = null
  private initRetryTimer: ReturnType<typeof setTimeout> | null = null
  private lifecycleBound = false
  constructor(config: InitConfig = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    }
    this.rpc = getSharedRpc()
    this.appStore = useAppStore()
    this.nodesStore = useNodesStore()
  }

  /**
   * 获取轮询间隔（毫秒）
   * 从 publicSettings.theme_settings.dataUpdateInterval 读取，默认 3 秒
   */
  private getPollInterval(): number {
    const settings = this.appStore.publicSettings?.theme_settings
    const interval = settings?.dataUpdateInterval
    // 确保值在合理范围内（1-60秒）
    if (typeof interval === 'number' && interval >= 1 && interval <= 60) {
      return interval * 1000 // 转换为毫秒
    }
    return 3000 // 默认 3 秒
  }

  /**
   * 执行初始化流程
   */
  async init(): Promise<void> {
    if (this.isInitialized) {
      console.warn('[InitManager] Already initialized')
      return
    }
    // 重试与回到前台可能同时触发，共用同一次初始化
    if (this.initPromise)
      return this.initPromise

    this.initPromise = this.runInit()
    try {
      await this.initPromise
    }
    finally {
      this.initPromise = null
    }
  }

  private async runInit(): Promise<void> {
    try {
      // 1. 测试后端服务是否正常
      await this.healthCheck()

      // 2. 获取服务端公开属性
      await this.fetchPublicSettings()

      // 3. 获取用户信息
      await this.fetchUserInfo()

      // 4. 获取节点信息和最新状态
      await this.fetchNodesData()

      // 5. 解除加载状态
      this.appStore.loading = false

      // 6. 建立 WebSocket 连接并开始轮询
      this.startWebSocketAndPolling()

      this.isInitialized = true
    }
    catch (error) {
      console.error('[InitManager] Initialization failed:', error)
      // 即使失败也解除加载状态，显示错误页面；后台继续重试，恢复后自动加载
      this.appStore.loading = false
      this.appStore.connectionError = true
      this.scheduleInitRetry()
      throw error
    }
    finally {
      this.bindLifecycleEvents()
    }
  }

  /**
   * 首次加载失败（手机弱网、切后台时打开等）后定时重试，成功即清掉错误提示
   */
  private scheduleInitRetry(): void {
    if (this.initRetryTimer || this.isInitialized)
      return
    this.initRetryTimer = setTimeout(async () => {
      this.initRetryTimer = null
      if (this.isInitialized)
        return
      if (!isPageVisible()) {
        // 不在前台时不重试，回到前台由 resume() 触发
        return
      }
      try {
        await this.init()
        this.appStore.connectionError = false
      }
      catch {
        // init 内部已安排下一次重试
      }
    }, this.config.initRetryInterval)
  }

  /**
   * 监听页面前后台切换与网络恢复。手机切后台或锁屏时系统会掐断 WebSocket 并冻结定时器，
   * 回到前台后先恢复连接再立即刷新，而不是让旧连接上的请求超时报错。
   */
  private bindLifecycleEvents(): void {
    if (this.lifecycleBound || typeof window === 'undefined')
      return
    this.lifecycleBound = true
    document.addEventListener('visibilitychange', this.handleVisibilityChange)
    window.addEventListener('online', this.handleOnline)
    window.addEventListener('pageshow', this.handlePageShow)
  }

  private unbindLifecycleEvents(): void {
    if (!this.lifecycleBound)
      return
    this.lifecycleBound = false
    document.removeEventListener('visibilitychange', this.handleVisibilityChange)
    window.removeEventListener('online', this.handleOnline)
    window.removeEventListener('pageshow', this.handlePageShow)
  }

  private handleVisibilityChange = (): void => {
    if (isPageVisible())
      this.resume()
    else
      this.stopPolling()
  }

  private handleOnline = (): void => {
    this.resume()
  }

  private handlePageShow = (event: PageTransitionEvent): void => {
    // 从 bfcache 恢复的页面，连接早已失效
    if (event.persisted)
      this.resume()
  }

  /**
   * 回到前台 / 网络恢复：未初始化的继续初始化，已初始化的重连并立即刷新一次
   */
  private resume(): void {
    if (!isPageVisible())
      return

    if (!this.isInitialized) {
      this.clearInitRetryTimer()
      this.init()
        .then(() => {
          this.appStore.connectionError = false
        })
        .catch(() => {})
      return
    }

    // 旧的失败计数来自后台期间，不再作数
    this.pollFailures = 0

    if (this.useWebSocket === true && !this.rpc.getClient().isWebSocketOpen()) {
      // 回到前台是新的开始，不计入之前的重连次数，避免误回落到 POST
      this.clearReconnectTimer()
      this.nodesStore.updateWsState('reconnecting', 0)
      this.connectWebSocket()
    }

    this.startPolling()
    this.poll()
  }

  private clearInitRetryTimer(): void {
    if (this.initRetryTimer) {
      clearTimeout(this.initRetryTimer)
      this.initRetryTimer = null
    }
  }

  /**
   * 健康检查 - 测试后端服务是否正常
   */
  private async healthCheck(): Promise<void> {
    try {
      const result = await this.rpc.ping()
      if (result !== 'pong') {
        throw new RpcError(-32000, 'Unexpected health check response')
      }
    }
    catch (error) {
      if (error instanceof RpcError && error.code === 401) {
        console.warn('[InitManager] Private site detected, redirecting to /admin')
        this.appStore.updateLoginState(false)
        this.appStore.loading = false
        location.href = '/admin'
        return
      }
      console.error('[InitManager] Health check failed:', error)
      this.appStore.connectionError = true
      throw new Error('Backend service unavailable')
    }
  }

  /**
   * 获取服务端公开属性
   */
  private async fetchPublicSettings(): Promise<void> {
    try {
      const api = getSharedApi()
      const publicSettings = await api.getPublicSettings()
      this.appStore.publicSettings = publicSettings
    }
    catch (error) {
      console.error('[InitManager] Failed to fetch public settings:', error)
      // 非关键错误，继续初始化
    }
  }

  /**
   * 获取用户信息
   */
  private async fetchUserInfo(): Promise<void> {
    try {
      const api = getSharedApi()
      const userInfo = await api.getMe()
      this.appStore.updateLoginState(userInfo.logged_in)
    }
    catch (error) {
      this.appStore.updateLoginState(false)
      console.error('[InitManager] Failed to fetch user info:', error)
      // 非关键错误，继续初始化
    }
  }

  /**
   * 获取节点数据和最新状态
   */
  private async fetchNodesData(): Promise<void> {
    try {
      // 并行获取节点信息和最新状态
      const [clientsResult, statusesResult] = await Promise.all([
        this.rpc.getNodes() as Promise<Record<string, Client>>,
        this.rpc.getNodesLatestStatus() as Promise<Record<string, NodeStatus>>,
      ])

      // 初始化节点数据
      this.nodesStore.initNodes(clientsResult, statusesResult)
    }
    catch (error) {
      console.error('[InitManager] Failed to fetch nodes data:', error)
      throw error
    }
  }

  /**
   * 启动 WebSocket 连接和轮询
   */
  private startWebSocketAndPolling(): void {
    // 根据主题配置决定初始连接模式
    const configuredMode = this.appStore.rpcTransportMode
    this.useWebSocket = configuredMode === 'websocket'
    this.clearReconnectTimer()

    if (this.useWebSocket) {
      // 尝试建立 WebSocket 连接
      this.connectWebSocket()
    }
    else {
      // HTTP 模式：直接设置 RPC 客户端为 HTTP 模式
      const client = this.rpc.getClient()
      client.setTransport(false)
      this.nodesStore.updateWsState('disconnected', this.config.wsMaxReconnectAttempts)
    }

    // 开始轮询（作为 WebSocket 的补充或备选方案）
    this.startPolling()
  }

  /**
   * 建立 WebSocket 连接
   */
  private async connectWebSocket(): Promise<void> {
    // 如果已回落到 POST 模式或配置为 HTTP 模式，不再尝试 WebSocket
    if (this.useWebSocket === false) {
      return
    }

    const client = this.rpc.getClient()

    // 切换到 WebSocket 模式
    client.setTransport(true)
    this.nodesStore.updateWsState('connecting', this.nodesStore.wsReconnectAttempts)

    try {
      // 使用 ping 验证连接，10 秒超时
      await client.ensureWebSocketConnectedWithPing(10000)
      this.nodesStore.updateWsState('connected', 0)
      this.clearReconnectTimer()

      // 连接成功，重置错误状态
      this.appStore.connectionError = false

      // 监听连接状态变化
      this.monitorWebSocketConnection()
    }
    catch (error) {
      console.error('[InitManager] WebSocket connection failed:', error)
      this.nodesStore.updateWsState('disconnected')
      this.scheduleReconnect()
    }
  }

  /**
   * 监控 WebSocket 连接状态
   */
  private monitorWebSocketConnection(): void {
    const client = this.rpc.getClient()
    this.wsCloseUnsubscribe?.()
    this.wsErrorUnsubscribe?.()

    this.wsCloseUnsubscribe = client.onWebSocketClose(({ event, manuallyClosed, url }) => {
      console.warn('[InitManager] WebSocket closed:', {
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
        manuallyClosed,
        url,
      })

      if (this.useWebSocket !== true || manuallyClosed) {
        return
      }

      this.nodesStore.updateWsState('disconnected')
      this.scheduleReconnect()
    })

    this.wsErrorUnsubscribe = client.onWebSocketError(({ url }) => {
      console.error('[InitManager] WebSocket error:', url)
    })
  }

  /**
   * 安排重连
   */
  private scheduleReconnect(): void {
    if (this.useWebSocket !== true) {
      return
    }

    if (this.reconnectTimer) {
      return
    }

    // 后台时不重连（定时器会被冻结，白白消耗重连次数），回到前台由 resume() 处理
    if (!isPageVisible()) {
      this.nodesStore.updateWsState('disconnected')
      return
    }

    const attempts = this.nodesStore.wsReconnectAttempts

    // 达到最大重连次数，回落到 POST 模式
    if (attempts >= this.config.wsMaxReconnectAttempts) {
      console.error('[InitManager] Max reconnect attempts reached, falling back to POST mode')
      this.fallbackToPostMode()
      return
    }

    this.nodesStore.updateWsState('reconnecting', attempts + 1)

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null

      if (this.useWebSocket !== true) {
        return
      }

      try {
        const client = this.rpc.getClient()
        client.close()
        await this.connectWebSocket()
      }
      catch (error) {
        console.error('[InitManager] Reconnect failed:', error)
        this.scheduleReconnect()
      }
    }, this.config.wsReconnectInterval)
  }

  /**
   * 回落到 POST 模式
   */
  private fallbackToPostMode(): void {
    this.useWebSocket = false
    this.clearReconnectTimer()
    this.nodesStore.updateWsState('disconnected', this.config.wsMaxReconnectAttempts)

    // 关闭 WebSocket 连接
    const client = this.rpc.getClient()
    client.setTransport(false)
    client.close()

    // 显示提示
    window.$message?.warning('WebSocket 无法连接，尝试回落 POST 模式。')
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  /**
   * 开始轮询
   */
  private startPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
    if (!isPageVisible())
      return

    this.pollTimer = setInterval(() => {
      this.poll()
    }, this.getPollInterval())
  }

  /**
   * 执行轮询任务
   */
  private async poll(): Promise<void> {
    if (this.isPolling) {
      return
    }

    this.isPolling = true

    try {
      // 并行执行三个请求
      const [, clientsResult, statusesResult] = await Promise.all([
        // 1. Ping 测试服务器状态
        this.rpc.ping(),
        // 2. 获取节点信息
        this.rpc.getNodes() as Promise<Record<string, Client>>,
        // 3. 获取节点最新状态
        this.rpc.getNodesLatestStatus() as Promise<Record<string, NodeStatus>>,
      ])

      // 更新节点信息（会智能合并，不会重建数组）
      this.nodesStore.updateNodeClients(clientsResult)

      // 更新节点状态
      this.nodesStore.updateNodeStatuses(statusesResult)

      // 连接恢复正常，重置错误状态
      this.pollFailures = 0
      this.appStore.connectionError = false
    }
    catch (error) {
      if (error instanceof RpcError) {
        console.error('[InitManager] Poll RPC error:', error.message)
      }
      else {
        console.error('[InitManager] Poll error:', error)
      }

      // 后台或离线时的失败不算数，回到前台会重新拉取
      if (!isPageVisible() || (typeof navigator !== 'undefined' && navigator.onLine === false))
        return

      // 偶发失败（移动网络抖动、切换基站）不打扰用户，连续失败才提示
      this.pollFailures += 1
      if (this.pollFailures >= this.config.pollFailureThreshold)
        this.appStore.connectionError = true

      // WebSocket 已断开但还没触发重连时补一次
      if (this.useWebSocket === true && !this.rpc.getClient().isWebSocketOpen())
        this.scheduleReconnect()
    }
    finally {
      this.isPolling = false
    }
  }

  /**
   * 停止轮询
   */
  stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
  }

  /**
   * 销毁管理器
   */
  destroy(): void {
    this.stopPolling()
    this.clearReconnectTimer()
    this.clearInitRetryTimer()
    this.unbindLifecycleEvents()
    this.wsCloseUnsubscribe?.()
    this.wsErrorUnsubscribe?.()
    this.wsCloseUnsubscribe = null
    this.wsErrorUnsubscribe = null
    this.rpc.close()
    this.nodesStore.clearNodes()
    this.isInitialized = false
  }
}

// 单例实例
let initManager: InitManager | null = null

/**
 * 初始化应用
 */
export async function initApp(): Promise<void> {
  if (!initManager) {
    initManager = new InitManager()
  }

  await initManager.init()
}

/**
 * 销毁初始化管理器
 */
export function destroyInitManager(): void {
  if (initManager) {
    initManager.destroy()
    initManager = null
  }
}
