import type { NodeStatusGpu, StatusRecord } from '@/utils/rpc'

/**
 * Komari API 客户端 SDK
 * 基于 REST API 的 Komari 客户端
 * @see https://www.komari.wiki/dev/api.html
 */

// ==================== 类型定义 ====================

/** API 响应基础结构 */
interface ApiResponse<T = unknown> {
  status: 'success' | 'error'
  message: string
  data: T
}

/** 用户信息 */
export interface MeInfo {
  logged_in: boolean
  username: string
  '2fa_enabled'?: boolean
  sso_id?: string
  sso_type?: string
  uuid?: string
}

/** 公开站点属性 */
export interface PublicSettings {
  allow_cors: boolean
  custom_body: string
  custom_head: string
  description: string
  disable_password_login: boolean
  oauth_enable: boolean
  oauth_provider: string | null
  ping_record_preserve_time: number
  private_site: boolean
  record_enabled: boolean
  record_preserve_time: number
  sitename: string
  theme: string
  theme_settings?: Record<string, unknown> | null
  /** 数据更新间隔（秒），主题配置项 */
  dataUpdateInterval?: number
}

/** 版本信息 */
export interface VersionInfo {
  hash: string
  version: string
}

/** 实时状态数据（嵌套结构） */
export interface RealtimeStatus {
  cpu: {
    usage: number
  }
  ram: {
    total: number
    used: number
  }
  swap: {
    total: number
    used: number
  }
  load: {
    load1: number
    load5: number
    load15: number
  }
  disk: {
    total: number
    used: number
  }
  network: {
    up: number
    down: number
    totalUp: number
    totalDown: number
  }
  connections: {
    tcp: number
    udp: number
  }
  uptime: number
  process: number
  message: string
  updated_at: string
  /** agent 开启 --gpu 时存在；每个点都带各卡详情（含温度） */
  gpu?: {
    count: number
    average_usage: number
    detailed_info: NodeStatusGpu[]
  }
}

/** 负载历史记录响应 */
export interface LoadRecordsResponse {
  count: number
  records: StatusRecord[]
}

/** API 客户端配置 */
export interface ApiClientOptions {
  /** 基础路径，默认 '/api' */
  baseUrl?: string
  /** 超时时间（毫秒），默认 30000 */
  timeout?: number
}

/** API 错误 */
class ApiError extends Error {
  status: string
  code?: number

  constructor(message: string, status: string = 'error', code?: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

// ==================== API 客户端 ====================

/** Komari API 客户端 */
export class KomariApi {
  private baseUrl: string
  private timeout: number

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = options.baseUrl || import.meta.env.VITE_API_BASE || '/api'
    this.timeout = options.timeout || 30000
  }

  /**
   * 发送 GET 请求
   */
  private async get<T>(path: string, params?: Record<string, string | number>): Promise<T> {
    let url = `${this.baseUrl}${path}`
    if (params) {
      const searchParams = new URLSearchParams()
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value))
        }
      })
      const queryString = searchParams.toString()
      if (queryString) {
        url += `?${queryString}`
      }
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    try {
      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include', // 携带 Cookie
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      const result: ApiResponse<T> = await response.json()

      if (result.status === 'error') {
        throw new ApiError(result.message || 'Unknown error', 'error', response.status)
      }

      return result.data
    } catch (error) {
      clearTimeout(timeoutId)
      if (error instanceof ApiError) throw error
      throw new ApiError(`Network error: ${error instanceof Error ? error.message : String(error)}`, 'error')
    }
  }

  /**
   * 发送 GET 请求（直接返回响应，不解析 ApiResponse 结构）
   */
  private async getRaw<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}${path}`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    try {
      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new ApiError(`HTTP error: ${response.status}`, 'error', response.status)
      }

      return await response.json()
    } catch (error) {
      clearTimeout(timeoutId)
      if (error instanceof ApiError) throw error
      throw new ApiError(`Network error: ${error instanceof Error ? error.message : String(error)}`, 'error')
    }
  }

  // ===== 用户信息接口 =====

  /**
   * 获取当前用户信息
   * 注意：此接口返回的是直接的 MeInfo 对象，不是包裹在 { status, message, data } 中
   */
  async getMe(): Promise<MeInfo> {
    return this.getRaw<MeInfo>('/me')
  }

  // ===== 服务端公开属性 =====

  /**
   * 获取站点的公开设置属性
   */
  async getPublicSettings(): Promise<PublicSettings> {
    return this.get<PublicSettings>('/public')
  }

  /**
   * 获取服务端版本信息
   */
  async getVersion(): Promise<VersionInfo> {
    return this.get<VersionInfo>('/version')
  }

  /**
   * 获取指定节点最近1分钟的历史数据
   * @param uuid 节点 UUID
   */
  async getNodeRecentStatus(uuid: string): Promise<RealtimeStatus[]> {
    return this.get<RealtimeStatus[]>(`/recent/${uuid}`)
  }

  // ===== 历史记录 =====

  /**
   * 获取指定节点的负载历史记录
   * @param uuid 节点 UUID
   * @param hours 查询时间范围（小时）
   */
  async getLoadRecords(uuid: string, hours: number): Promise<LoadRecordsResponse> {
    return this.get<LoadRecordsResponse>('/records/load', { uuid, hours })
  }
}

// ==================== 单例实例 ====================

let sharedApiInstance: KomariApi | null = null

/**
 * 获取共享的 KomariApi 实例
 */
export function getSharedApi(options?: ApiClientOptions): KomariApi {
  if (!sharedApiInstance) {
    sharedApiInstance = new KomariApi(options)
  }
  return sharedApiInstance
}
