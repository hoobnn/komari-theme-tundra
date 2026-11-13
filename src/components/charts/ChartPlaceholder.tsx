import { Spinner } from '@/components/ui/spinner'

/** 懒加载和数据读取期间保留可见的图表区域。 */
export default function ChartPlaceholder() {
  return (
    <Spinner
      show
      className="min-h-60"
      contentClass="!bg-transparent !backdrop-blur-none"
      description="正在加载图表…"
      aria-label="正在加载图表"
    />
  )
}
