import type { Client, NodeStatus, NodeStatusGpu, NodeStatusPing } from '@/utils/rpc'
import { useMemo } from 'react'
import { create } from 'zustand'
import { parseNodeGroups } from '@/utils/groupHelper'

/** 流量限制类型 */
export type TrafficLimitType = 'up' | 'down' | 'min' | 'max' | 'sum'

/** 节点完整信息（合并 Client 和 Status） */
export interface NodeData {
  uuid: string
  // Client 信息
  name: string
  cpu_name: string
  virtualization: string
  arch: string
  cpu_cores: number
  os: string
  kernel_version: string
  gpu_name?: string
  ipv4?: string
  ipv6?: string
  region: string
  remark?: string
  public_remark: string
  mem_total: number
  swap_total: number
  disk_total: number
  version?: string
  weight: number
  price: number
  billing_cycle: number
  auto_renewal: boolean
  currency: string
  expired_at: string
  group: string
  tags: string
  hidden: boolean
  traffic_limit: number
  traffic_limit_type: TrafficLimitType
  created_at: string
  updated_at: string
  // Status 信息
  online: boolean
  time: string
  cpu: number
  gpu: number
  gpu_detailed_info?: NodeStatusGpu[]
  ram: number
  swap: number
  load: number
  load5: number
  load15: number
  temp: number
  disk: number
  net_in: number
  net_out: number
  net_total_up: number
  net_total_down: number
  process: number
  connections: number
  connections_udp: number
  uptime: number
  ping?: Record<string, NodeStatusPing>
}

/** WebSocket 连接状态 */
type WsConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'

/** 状态数据（用于更新） */
interface StatusData {
  online: boolean
  time: string
  cpu: number
  gpu: number
  gpu_detailed_info?: NodeStatusGpu[]
  ram: number
  swap: number
  load: number
  load5: number
  load15: number
  temp: number
  disk: number
  net_in: number
  net_out: number
  net_total_up: number
  net_total_down: number
  process: number
  connections: number
  connections_udp: number
  uptime: number
  ping?: Record<string, NodeStatusPing>
}

const EARTH_SNAPSHOT_INTERVAL_MS = 60_000

/**
 * 从 Client 对象创建节点数据
 */
function createNodeFromClient(client: Client): NodeData {
  return {
    uuid: client.uuid,
    name: client.name,
    cpu_name: client.cpu_name,
    virtualization: client.virtualization,
    arch: client.arch,
    cpu_cores: client.cpu_cores,
    os: client.os,
    kernel_version: client.kernel_version,
    gpu_name: client.gpu_name,
    ipv4: client.ipv4,
    ipv6: client.ipv6,
    region: client.region,
    remark: client.remark,
    public_remark: client.public_remark,
    mem_total: client.mem_total,
    swap_total: client.swap_total,
    disk_total: client.disk_total,
    version: client.version,
    weight: client.weight,
    price: client.price,
    billing_cycle: client.billing_cycle,
    auto_renewal: client.auto_renewal,
    currency: client.currency,
    expired_at: client.expired_at,
    group: client.group,
    tags: client.tags,
    hidden: client.hidden,
    traffic_limit: client.traffic_limit,
    traffic_limit_type: client.traffic_limit_type as TrafficLimitType,
    created_at: client.created_at,
    updated_at: client.updated_at,
    // Status 默认值
    online: false,
    time: '',
    cpu: 0,
    gpu: 0,
    ram: 0,
    swap: 0,
    load: 0,
    load5: 0,
    load15: 0,
    temp: 0,
    disk: 0,
    net_in: 0,
    net_out: 0,
    net_total_up: 0,
    net_total_down: 0,
    process: 0,
    connections: 0,
    connections_udp: 0,
    uptime: 0,
    ping: undefined,
  }
}
/**
 * 更新节点的状态数据
 */
function updateNodeStatus(node: NodeData, status: StatusData): NodeData {
  return {
    ...node,
    online: status.online,
    time: status.time,
    cpu: status.cpu,
    gpu: status.gpu,
    gpu_detailed_info: status.gpu_detailed_info,
    ram: status.ram,
    swap: status.swap,
    load: status.load,
    load5: status.load5,
    load15: status.load15,
    temp: status.temp,
    disk: status.disk,
    net_in: status.net_in,
    net_out: status.net_out,
    net_total_up: status.net_total_up,
    net_total_down: status.net_total_down,
    process: status.process,
    connections: status.connections,
    connections_udp: status.connections_udp,
    uptime: status.uptime,
    ping: status.ping,
  }
}
/**
 * 从 NodeStatus 提取状态数据
 */
function extractStatusData(status: NodeStatus): StatusData {
  return {
    online: status.online,
    time: status.time,
    cpu: status.cpu,
    gpu: status.gpu,
    gpu_detailed_info: status.gpu_detailed_info,
    ram: status.ram,
    swap: status.swap,
    load: status.load,
    load5: status.load5,
    load15: status.load15,
    temp: status.temp,
    disk: status.disk,
    net_in: status.net_in,
    net_out: status.net_out,
    net_total_up: status.net_total_up,
    net_total_down: status.net_total_down,
    process: status.process,
    connections: status.connections,
    connections_udp: status.connections_udp,
    uptime: status.uptime,
  }
}

function statusOf(node: NodeData): StatusData {
  return {
    online: node.online,
    time: node.time,
    cpu: node.cpu,
    gpu: node.gpu,
    gpu_detailed_info: node.gpu_detailed_info,
    ram: node.ram,
    swap: node.swap,
    load: node.load,
    load5: node.load5,
    load15: node.load15,
    temp: node.temp,
    disk: node.disk,
    net_in: node.net_in,
    net_out: node.net_out,
    net_total_up: node.net_total_up,
    net_total_down: node.net_total_down,
    process: node.process,
    connections: node.connections,
    connections_udp: node.connections_udp,
    uptime: node.uptime,
    ping: node.ping,
  }
}

/** 按 weight 升序排序（weight 越小越靠前） */
function sortByWeight(nodes: NodeData[]): NodeData[] {
  return nodes.toSorted((a, b) => a.weight - b.weight)
}

interface NodesState {
  nodes: NodeData[]
  /** 按 UUID 索引；未变化的节点保持引用不变，卡片可按 uuid 精确订阅 */
  nodesByUuid: Map<string, NodeData>
  /** Earth 视图共享的采样快照，最多每分钟刷新一次，避免 globe / maps 各自维护定时器 */
  earthNodes: NodeData[]
  wsConnectionState: WsConnectionState
  wsReconnectAttempts: number

  /** 首次加载：合并 client 与 status，移除已删除的节点 */
  initNodes: (clients: Record<string, Client>, statuses: Record<string, NodeStatus>) => void
  /** 实时更新状态 */
  updateNodeStatuses: (statuses: Record<string, NodeStatus>) => void
  /** 更新节点基本信息，保留已有状态 */
  updateNodeClients: (clients: Record<string, Client>) => void
  updateWsState: (state: WsConnectionState, attempts?: number) => void
  clearNodes: () => void
}

let lastEarthSnapshotAt = 0

function withNodes(nodes: NodeData[], prevEarth: NodeData[], forceEarth: boolean) {
  const now = Date.now()
  const refreshEarth = forceEarth || now - lastEarthSnapshotAt >= EARTH_SNAPSHOT_INTERVAL_MS
  if (refreshEarth) lastEarthSnapshotAt = now
  return {
    nodes,
    nodesByUuid: new Map(nodes.map(node => [node.uuid, node])),
    earthNodes: refreshEarth ? nodes : prevEarth,
  }
}

export const useNodesStore = create<NodesState>()((set, get) => ({
  nodes: [],
  nodesByUuid: new Map(),
  earthNodes: [],
  wsConnectionState: 'disconnected',
  wsReconnectAttempts: 0,

  initNodes: (clients, statuses) => {
    const next: NodeData[] = []
    for (const [uuid, client] of Object.entries(clients)) {
      if (!client) continue
      const base = createNodeFromClient(client)
      const status = statuses[uuid]
      next.push(status ? updateNodeStatus(base, extractStatusData(status)) : base)
    }
    set(withNodes(sortByWeight(next), get().earthNodes, true))
  },

  updateNodeStatuses: statuses => {
    const { nodes, earthNodes } = get()
    let changed = false
    const next = nodes.map(node => {
      const status = statuses[node.uuid]
      if (!status) return node
      changed = true
      return updateNodeStatus(node, extractStatusData(status))
    })
    if (changed) set(withNodes(next, earthNodes, false))
  },

  updateNodeClients: clients => {
    const { nodesByUuid, earthNodes } = get()
    const next = Object.entries(clients).map(([uuid, client]) => {
      const base = createNodeFromClient(client)
      const current = nodesByUuid.get(uuid)
      return current ? updateNodeStatus(base, statusOf(current)) : base
    })
    set(withNodes(sortByWeight(next), earthNodes, true))
  },

  updateWsState: (wsConnectionState, attempts) => {
    set(attempts === undefined ? { wsConnectionState } : { wsConnectionState, wsReconnectAttempts: attempts })
  },

  clearNodes: () => set(withNodes([], [], true)),
}))

/** 所有分组（按节点顺序去重） */
export function useNodeGroups(): string[] {
  const nodes = useNodesStore(state => state.nodes)
  return useMemo(() => {
    const groupSet = new Set<string>()
    for (const node of nodes) parseNodeGroups(node.group).forEach(group => groupSet.add(group))
    return Array.from(groupSet)
  }, [nodes])
}

export function useOnlineCount(): number {
  return useNodesStore(state => state.nodes.filter(node => node.online).length)
}

export function useNode(uuid: string): NodeData | undefined {
  return useNodesStore(state => state.nodesByUuid.get(uuid))
}
