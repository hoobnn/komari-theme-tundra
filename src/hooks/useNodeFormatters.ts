import type { UptimeFormat } from '@/utils/helper'
import { useAppStore } from '@/stores/app'
import { formatBytesPerSecondWithConfig, formatBytesWithConfig, formatUptimeWithFormat } from '@/utils/helper'

export function useNodeFormatters() {
  const byteDecimals = useAppStore(state => state.byteDecimals)

  const formatBytes = (bytes: number) => formatBytesWithConfig(bytes, byteDecimals)
  const formatBytesPerSecond = (bytes: number) => formatBytesPerSecondWithConfig(bytes, byteDecimals)
  const formatUptime = (seconds: number, precision: UptimeFormat = 'hour') => formatUptimeWithFormat(seconds, precision)

  return { formatBytes, formatBytesPerSecond, formatUptime }
}
