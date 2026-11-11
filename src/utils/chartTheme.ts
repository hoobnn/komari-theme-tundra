/**
 * 负载图与延迟图共用的配色和 ECharts 外观，保证两个图表看起来是同一套。
 * 规则：翡翠绿是主色；红色只用来表示「差」（丢包标记），不当普通系列色。
 */

/** Tailwind 500 档基础色 */
export const CHART_COLORS = {
  emerald: '#10B981',
  amber: '#F59E0B',
  cyan: '#06B6D4',
  violet: '#8B5CF6',
  blue: '#3B82F6',
  sky: '#0EA5E9',
  neutral: '#94A3B8',
  loss: '#EF4444',
} as const

/** 上行 / 下行全站统一：上行翡翠绿、下行天蓝 */
export const TRAFFIC_COLORS = {
  up: CHART_COLORS.emerald,
  down: CHART_COLORS.sky,
} as const

/** 多系列（延迟各线路）调色板：从主色开始，不含红、粉 */
export const SERIES_PALETTE = [
  '#10B981', // emerald-500
  '#3B82F6', // blue-500
  '#8B5CF6', // violet-500
  '#F59E0B', // amber-500
  '#06B6D4', // cyan-500
  '#84CC16', // lime-500
  '#D946EF', // fuchsia-500
  '#64748B', // slate-500
] as const

/**
 * 双栈时 v6 用同色系的另一档，与 v4 拉开明度差（顺序与 SERIES_PALETTE 对应）。
 * 亮色取 700–800 深色；暗色取 600 饱和色（浅色在深底上发白，线路分不清）。
 */
export const SERIES_PALETTE_V6_LIGHT = [
  '#065F46',
  '#1E40AF',
  '#5B21B6',
  '#B45309',
  '#155E75',
  '#4D7C0F',
  '#86198F',
  '#334155',
] as const

export const SERIES_PALETTE_V6_DARK = [
  '#059669',
  '#2563EB',
  '#7C3AED',
  '#D97706',
  '#0891B2',
  '#65A30D',
  '#C026D3',
  '#475569',
] as const

export interface ChartThemeColors {
  text: string
  textSecondary: string
  textTertiary: string
  borderColor: string
  splitLineColor: string
  tooltipBg: string
  tooltipShadow: string
  crosshairColor: string
  pointerLabelBg: string
  pointerLabelText: string
}

export function getChartThemeColors(isDark: boolean): ChartThemeColors {
  return isDark
    ? {
        text: 'rgba(255, 255, 255, 0.85)',
        textSecondary: 'rgba(255, 255, 255, 0.55)',
        textTertiary: 'rgba(255, 255, 255, 0.35)',
        borderColor: 'rgba(255, 255, 255, 0.1)',
        splitLineColor: 'rgba(255, 255, 255, 0.06)',
        tooltipBg: 'rgba(28, 30, 36, 0.95)',
        tooltipShadow: 'rgba(0, 0, 0, 0.4)',
        crosshairColor: 'rgba(255, 255, 255, 0.15)',
        pointerLabelBg: '#E4E4E7',
        pointerLabelText: '#18181B',
      }
    : {
        text: 'rgba(0, 0, 0, 0.85)',
        textSecondary: 'rgba(0, 0, 0, 0.55)',
        textTertiary: 'rgba(0, 0, 0, 0.35)',
        borderColor: 'rgba(0, 0, 0, 0.1)',
        splitLineColor: 'rgba(0, 0, 0, 0.06)',
        tooltipBg: 'rgba(255, 255, 255, 0.96)',
        tooltipShadow: 'rgba(0, 0, 0, 0.08)',
        crosshairColor: 'rgba(0, 0, 0, 0.1)',
        pointerLabelBg: '#18181B',
        pointerLabelText: '#FAFAFA',
      }
}

/** 坐标轴指示器标签（十字准星上的时间 / 数值块），替代 ECharts 默认的蓝紫色块 */
export function pointerLabelStyle(colors: ChartThemeColors) {
  return {
    backgroundColor: colors.pointerLabelBg,
    color: colors.pointerLabelText,
    fontSize: 11,
    borderRadius: 4,
    padding: [3, 6],
  }
}

/** 两个图表共用的 axis tooltip 外观 */
export function buildBaseTooltip(colors: ChartThemeColors, blur: boolean) {
  return {
    trigger: 'axis' as const,
    confine: false,
    backgroundColor: colors.tooltipBg,
    borderColor: 'transparent',
    borderWidth: 0,
    borderRadius: 8,
    textStyle: {
      color: colors.text,
      fontSize: 12,
      lineHeight: 20,
    },
    extraCssText: `${blur ? 'backdrop-filter: blur(5px);' : ''}z-index:9;box-shadow:0 0 0 1px ${colors.tooltipShadow}, 0 4px 16px ${colors.tooltipShadow}`,
    axisPointer: {
      type: 'cross' as const,
      crossStyle: {
        color: colors.textTertiary,
      },
      lineStyle: {
        color: colors.crosshairColor,
        width: 1,
        type: 'dashed' as const,
      },
      shadowStyle: {
        color: colors.crosshairColor,
      },
      label: pointerLabelStyle(colors),
    },
  }
}

/** 渐变面积的起止色 */
export function areaStops(hex: string) {
  const n = Number.parseInt(hex.slice(1), 16)
  const rgb = `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`
  return [
    { offset: 0, color: `rgba(${rgb}, 0.22)` },
    { offset: 1, color: `rgba(${rgb}, 0.02)` },
  ]
}
