/**
 * 跨组件复用的交互状态类名，保证分组标签、范围标签、开关按钮的选中态在各处一致。
 */

/** 分组 / 时间范围标签（配合 TabsTrigger 使用）；视觉 26px，命中区上下各扩 4px */
export const TAB_TRIGGER_CLASS = 'relative h-6.5 flex-none shrink-0 rounded-sm border-none text-xs shadow-none before:absolute before:-inset-y-1 before:inset-x-0 before:content-[""] data-[state=active]:text-emerald-700 dark:data-[state=active]:text-emerald-300'

/** 开关按钮的基础样式（配合 Button variant="ghost" size="xs"） */
export const TOGGLE_BASE_CLASS = 'relative h-7 before:absolute before:-inset-y-1 before:inset-x-0 before:content-[""] rounded-md border-none px-2.5 text-xs font-medium shadow-none'

/** 开关按钮：选中有浅绿底，未选中退为次要文字，避免未选中项比选中项更醒目 */
export function toggleClass(active: boolean): string {
  return active
    ? 'bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 hover:text-emerald-700 dark:text-emerald-300 dark:hover:text-emerald-300'
    : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
}

/** 分段控件里的单项：选中项浮起成白块 */
export function segmentClass(active: boolean): string {
  return active
    ? 'bg-card text-emerald-700 shadow-xs hover:bg-card dark:bg-input/40 dark:text-emerald-300'
    : 'text-muted-foreground hover:bg-transparent hover:text-foreground'
}

/** 内容卡片表面（与首页节点卡一致） */
export const CARD_SURFACE_CLASS = 'rounded-xl border bg-card shadow-xs'
