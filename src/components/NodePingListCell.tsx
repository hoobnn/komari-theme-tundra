import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'
import { DataTooltip } from '@/components/ui/data-tooltip'
import { useNodePingDisplay } from '@/hooks/useNodePingDisplay'

// 列表各行线路数不同（2 条或 3 条），固定 3 格并补位，保证丢包列和趋势条起点上下对齐
const CELL_SLOTS = 3

interface NodePingListCellProps extends ComponentProps<'button'> {
  uuid: string
}

export default function NodePingListCell({ uuid, className, ...rest }: NodePingListCellProps) {
  const { pingTable, emptyText } = useNodePingDisplay(uuid)

  const rows =
    pingTable?.rows.map(row => {
      const cells = row.cells.slice(0, CELL_SLOTS)
      while (cells.length < CELL_SLOTS) {
        cells.push({
          key: `pad-${cells.length}`,
          latency: '',
          toneClass: '',
          tooltip: '',
        })
      }
      return { ...row, cells }
    }) ?? []

  // 与卡片同一张网络表的紧凑版：每个协议栈一行，固定 3 个线路延迟 + 丢包 + 趋势条
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      {...rest}
      className={cn(
        'num grid min-h-8 w-full cursor-pointer content-center gap-1 rounded-md px-1 text-left text-2xs hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring',
        className,
      )}
    >
      {!pingTable && <span className="text-muted-foreground">{emptyText}</span>}
      {rows.map(row => (
        <span
          key={`${row.stack}`}
          className="grid items-center gap-x-1.5"
          style={{ gridTemplateColumns: '1.1rem repeat(3, 1.75rem) 2.5rem minmax(0, 1fr)' }}
        >
          <span className="font-sans text-3xs text-muted-foreground">{row.stack ?? ''}</span>
          {row.cells.map(cell => (
            <DataTooltip
              as="span"
              key={cell.key}
              placement="top"
              content={cell.tooltip}
              contentClass="whitespace-pre-wrap w-max"
            >
              <span className={`block text-right text-2xs ${cell.toneClass}`}>{cell.latency}</span>
            </DataTooltip>
          ))}
          <DataTooltip as="span" placement="top" content={`平均丢包 ${row.loss}`} contentClass="whitespace-nowrap">
            <span className={`block text-right text-2xs ${row.lossTone}`}>{row.loss}</span>
          </DataTooltip>
          <span className="ml-1 grid gap-0.5">
            {[
              { label: '延迟', bars: row.latencyBars },
              { label: '丢包', bars: row.lossBars },
            ].map(({ label, bars }) => (
              <span key={label} className="grid h-1 auto-cols-fr grid-flow-col gap-px" title={`${label}趋势`}>
                {bars.map(bar => (
                  <DataTooltip
                    as="span"
                    key={bar.key}
                    placement="top"
                    content={`${label} ${bar.tooltip}`}
                    className="h-full w-full"
                    contentClass="whitespace-pre-wrap w-max"
                  >
                    <span className={`block h-full w-full rounded-[1px] ${bar.className}`} />
                  </DataTooltip>
                ))}
              </span>
            ))}
          </span>
        </span>
      ))}
    </button>
  )
}
