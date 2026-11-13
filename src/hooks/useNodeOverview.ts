import type { NodeData } from '@/stores/nodes'
import { useAppStore } from '@/stores/app'
import { formatBytesPerSecondSplit, formatBytesSplit } from '@/utils/helper'

/** 汇总只负责统计和格式化，不持有页面、分组或弹层状态。 */
export function useNodeOverview(nodes: NodeData[]) {
  const decimals = useAppStore(state => state.byteDecimals)
  const totals = nodes.reduce(
    (sum, node) => ({
      memory: sum.memory + (node.ram || 0),
      memoryTotal: sum.memoryTotal + (node.mem_total || 0),
      disk: sum.disk + (node.disk || 0),
      diskTotal: sum.diskTotal + (node.disk_total || 0),
      trafficUp: sum.trafficUp + (node.net_total_up || 0),
      trafficDown: sum.trafficDown + (node.net_total_down || 0),
      speedUp: sum.speedUp + (node.online ? node.net_out || 0 : 0),
      speedDown: sum.speedDown + (node.online ? node.net_in || 0 : 0),
    }),
    { memory: 0, memoryTotal: 0, disk: 0, diskTotal: 0, trafficUp: 0, trafficDown: 0, speedUp: 0, speedDown: 0 },
  )
  const bytes = (value: number) => formatBytesSplit(value, decimals)
  const full = (value: number) => {
    const part = bytes(value)
    return `${part.value} ${part.unit}`
  }
  return {
    memory: { label: '内存用量', ...bytes(totals.memory), total: `共 ${full(totals.memoryTotal)}` },
    disk: { label: '硬盘用量', ...bytes(totals.disk), total: `共 ${full(totals.diskTotal)}` },
    traffic: {
      label: '累计流量',
      ...bytes(totals.trafficUp + totals.trafficDown),
      tooltip: `↑ ${full(totals.trafficUp)}\n↓ ${full(totals.trafficDown)}`,
    },
    speedUp: { label: '实时上行', ...formatBytesPerSecondSplit(totals.speedUp, decimals) },
    speedDown: { label: '实时下行', ...formatBytesPerSecondSplit(totals.speedDown, decimals) },
  }
}
