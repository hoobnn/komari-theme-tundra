/**
 * 图表时间范围选项：按主控的记录保留时长裁剪预设，超出预设时追加一个「全部保留时长」选项。
 */

export interface ChartView {
  label: string
  hours: number
}

const BASE_VIEWS: readonly ChartView[] = [
  { label: '1 小时', hours: 1 },
  { label: '6 小时', hours: 6 },
  { label: '1 天', hours: 24 },
  { label: '7 天', hours: 168 },
  { label: '30 天', hours: 720 },
  { label: '60 天', hours: 1440 },
  { label: '90 天', hours: 2160 },
]

export const LOAD_CHART_VIEWS = BASE_VIEWS

// 延迟图多一个 12 小时
export const PING_CHART_VIEWS: readonly ChartView[] = [
  ...BASE_VIEWS.slice(0, 2),
  { label: '12 小时', hours: 12 },
  ...BASE_VIEWS.slice(2),
]

function formatHoursLabel(hours: number): string {
  return hours % 24 === 0
    ? `${Math.floor(hours / 24)} 天`
    : `${hours} 小时`
}

export function buildChartViews(presets: readonly ChartView[], maxHours: number): ChartView[] {
  const views = presets.filter(view => maxHours >= view.hours)
  const maxPreset = presets.at(-1)
  const exceedsPresets = maxPreset !== undefined && maxHours > maxPreset.hours
  if (exceedsPresets || (maxHours > 1 && !presets.some(view => view.hours === maxHours))) {
    views.push({
      label: formatHoursLabel(maxHours),
      hours: maxHours,
    })
  }
  return views
}
