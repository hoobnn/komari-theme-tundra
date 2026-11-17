import { Icon } from '@iconify/react'
import { Popover } from 'radix-ui'
import { Button } from '@/components/ui/button'
import type { PingTaskInfo } from '@/utils/rpc'

const latency = (value?: number) => (value === undefined ? undefined : `${Math.round(value)} ms`)

export default function PingTaskDetails({ task }: { task: PingTaskInfo }) {
  const metrics = [
    ['最新', latency(task.latest)],
    ['平均', latency(task.avg)],
    ['最小', latency(task.min)],
    ['最大', latency(task.max)],
    ['P50', latency(task.p50)],
    ['P99', latency(task.p99)],
    ['波动率', task.p99_p50_ratio?.toFixed(2)],
    ['丢包', `${task.loss.toFixed(2)}%`],
    ['间隔', task.interval === undefined ? undefined : `${task.interval} s`],
    ['类型', task.type?.toUpperCase()],
    ['样本数', task.total],
  ] as const
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`${task.name} 线路详情`}
          title="线路详情"
          className="size-7 text-muted-foreground"
        >
          <Icon icon="lucide:info" className="size-3.5" />
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="end"
          sideOffset={5}
          collisionPadding={12}
          aria-label={`${task.name} 线路详情`}
          className="z-50 w-64 max-w-[calc(100vw-1.5rem)] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto rounded-xl border bg-popover p-3 text-popover-foreground shadow-lg"
        >
          <div className="mb-2 flex items-center justify-between gap-2 border-b pb-2">
            <h3 className="min-w-0 wrap-anywhere text-compact font-semibold">{task.name}</h3>
            <Popover.Close asChild>
              <Button type="button" size="icon-sm" variant="ghost" aria-label="关闭线路详情" className="size-7">
                <Icon icon="lucide:x" />
              </Button>
            </Popover.Close>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            {metrics.map(
              ([label, value]) =>
                value != null && (
                  <div key={label} className="flex items-baseline justify-between gap-1">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="num font-medium">{value}</dd>
                  </div>
                ),
            )}
          </dl>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
