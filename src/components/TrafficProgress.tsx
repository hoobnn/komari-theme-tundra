import { formatBytes } from '@/utils/helper'
import { calculateTrafficUsed } from '@/utils/nodeHelpers'

interface TrafficProgressProps {
  upload: number
  download: number
  trafficLimit: number
  trafficLimitType: 'up' | 'down' | 'min' | 'max' | 'sum'
  uploadColor?: string
  downloadColor?: string
  singleColor?: string
  height?: number | string
  showIndicator?: boolean
}

const RAIL_CLASS = 'relative flex h-2 overflow-hidden rounded-[5px] transition-colors duration-300 bg-muted'
const FILL_CLASS = 'relative h-full transition-[width,max-width,background-color] duration-200'
const FILL_LAST_CLASS = 'rounded-r-[5px]'

export default function TrafficProgress({
  upload,
  download,
  trafficLimit,
  trafficLimitType,
  height,
  showIndicator = false,
}: TrafficProgressProps) {
  const showProgress = trafficLimit > 0
  const usedTraffic = calculateTrafficUsed(upload, download, trafficLimitType)
  const pct = (v: number) => (trafficLimit <= 0 ? 0 : Math.min((v / trafficLimit) * 100, 100))
  const totalPercentage = pct(usedTraffic)
  const uploadPercentage = pct(upload)
  const downloadPercentage = pct(download)
  const isDualColorMode = trafficLimitType === 'sum'
  const progressHeight = height === undefined ? undefined : typeof height === 'number' ? `${height}px` : height

  return (
    <div className="flex w-full flex-col gap-1">
      {isDualColorMode ? (
        <div className={RAIL_CLASS} style={{ height: progressHeight }}>
          <div className={`${FILL_CLASS} bg-green-600`} style={{ width: `${uploadPercentage}%` }} />
          <div className={`${FILL_CLASS} ${FILL_LAST_CLASS} bg-blue-600`} style={{ width: `${downloadPercentage}%` }} />
        </div>
      ) : (
        <div className={RAIL_CLASS} style={{ height: progressHeight }}>
          <div className={`${FILL_CLASS} ${FILL_LAST_CLASS} bg-green-600`} style={{ width: `${totalPercentage}%` }} />
        </div>
      )}

      {showIndicator && showProgress && (
        <div className="flex items-center justify-between text-xs text-foreground/80">
          <span>{totalPercentage.toFixed(1)}%</span>
          <span className="text-muted-foreground">
            {formatBytes(usedTraffic)} / {formatBytes(trafficLimit)}
          </span>
        </div>
      )}
    </div>
  )
}
