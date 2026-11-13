import type { NodeData } from '@/stores/nodes'
import { parseNodeGroups } from '@/utils/groupHelper'
import { isRegionMatch } from '@/utils/regionHelper'

export function isNodeMatchSearch(node: NodeData, search: string): boolean {
  if (!search.trim()) return true
  const lowerSearch = search.toLowerCase().trim()
  if (node.name.toLowerCase().includes(lowerSearch)) return true
  if (node.region && isRegionMatch(node.region, search)) return true
  if (node.os && node.os.toLowerCase().includes(lowerSearch)) return true
  if (parseNodeGroups(node.group).some(group => group.toLowerCase().includes(lowerSearch))) return true
  if (node.tags && node.tags.toLowerCase().includes(lowerSearch)) return true
  if (node.remark && node.remark.toLowerCase().includes(lowerSearch)) return true
  return false
}
