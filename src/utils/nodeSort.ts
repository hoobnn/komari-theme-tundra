import type { NodeData } from '@/stores/nodes'
import { getTrafficUsedPercentage } from '@/utils/nodeHelpers'

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export function sortNodes(source: NodeData[], key: string, dir: 1 | -1): NodeData[] {
  const nodes = [...source]
  if (!key) return nodes
  return nodes.sort((a, b) => {
    switch (key) {
      case 'status':
        return dir * ((a.online ? 1 : 0) - (b.online ? 1 : 0))
      case 'region':
        return dir * compareText((a.region || '').toLowerCase(), (b.region || '').toLowerCase())
      case 'name':
        return dir * compareText((a.name || '').toLowerCase(), (b.name || '').toLowerCase())
      case 'os':
        return dir * compareText((a.os || '').toLowerCase(), (b.os || '').toLowerCase())
      case 'cpu':
        return dir * ((a.cpu ?? 0) - (b.cpu ?? 0))
      case 'mem':
        return dir * ((a.ram ?? 0) / (a.mem_total || 1) - (b.ram ?? 0) / (b.mem_total || 1))
      case 'disk':
        return dir * ((a.disk ?? 0) / (a.disk_total || 1) - (b.disk ?? 0) / (b.disk_total || 1))
      case 'traffic':
        return dir * (getTrafficUsedPercentage(a) - getTrafficUsedPercentage(b))
      case 'rate':
        return dir * ((a.net_out ?? 0) + (a.net_in ?? 0) - ((b.net_out ?? 0) + (b.net_in ?? 0)))
      default:
        return 0
    }
  })
}
