import type { ComponentProps } from 'react'
import PingValue from '@/components/PingValue'
import { cn } from '@/lib/utils'
import { DataTooltip } from '@/components/ui/data-tooltip'
import { useNodePingDisplay } from '@/hooks/useNodePingDisplay'
import { pingStatusLabel } from '@/utils/pingDisplay'
import { pingStackLabel } from '@/utils/pingStack'

interface NodePingListCellProps extends ComponentProps<'button'> {
  uuid: string
}

export default function NodePingListCell({ uuid, className, ...rest }: NodePingListCellProps) {
  const { pingTable, emptyText } = useNodePingDisplay(uuid)

  // 与卡片同一张网络表的紧凑版：每个协议栈一行，固定 3 个线路延迟 + 丢包 + 趋势条
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      {...rest}
      aria-description={pingTable?.description ?? emptyText}
      className={cn(
        'num grid min-h-8 w-full cursor-pointer content-center gap-1 rounded-md px-1 text-left text-2xs hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring',
        className,
      )}
    >
      {!pingTable && <span className="text-muted-foreground">{emptyText}</span>}
      {pingTable?.rows.map(row => (
        <span
          key={`${row.stack}`}
          className="grid grid-cols-[1.75rem_repeat(3,1.75rem)_2.5rem_minmax(0,1fr)] items-center gap-x-1.5 text-end"
        >
          <span className="text-start font-sans text-3xs text-muted-foreground">{pingStackLabel(row.stack)}</span>
          {row.cells.map(cell => (
            <DataTooltip
              as="span"
              key={cell.key}
              placement="top"
              content={cell.tooltip}
              contentClass="whitespace-pre-wrap w-max"
            >
              <PingValue value={cell.latency} />
            </DataTooltip>
          ))}
          <DataTooltip
            as="span"
            className="col-start-5"
            placement="top"
            content={`丢包率 ${row.loss ?? pingStatusLabel.missing}`}
            contentClass="whitespace-nowrap"
          >
            <span className={row.lossTone}>{row.loss ?? <PingValue value="missing" />}</span>
          </DataTooltip>
          <span className="ml-1 grid gap-0.5">
            {[
              { label: '延迟', bars: row.latencyBars },
              { label: '丢包率', bars: row.lossBars },
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
