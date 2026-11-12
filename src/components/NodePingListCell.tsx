import type { ComponentProps } from 'react'
import { DataTooltip } from '@/components/ui/data-tooltip'
import { useNodePingDisplay } from '@/hooks/useNodePingDisplay'

// 列表各行线路数不同（2 条或 3 条），固定 3 格并补位，保证丢包列和趋势条起点上下对齐
const CELL_SLOTS = 3

interface NodePingListCellProps extends ComponentProps<'div'> {
  uuid: string
  online?: boolean
}

export default function NodePingListCell({ uuid, online: _online, className, ...rest }: NodePingListCellProps) {
  const { pingTable } = useNodePingDisplay(uuid)

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
  if (!pingTable) {
    return (
      <div
        {...rest}
        className={className ? `text-[11px] text-muted-foreground ${className}` : 'text-[11px] text-muted-foreground'}
      >
        未配置延迟监测
      </div>
    )
  }

  return (
    <div
      {...rest}
      className={className ? `num flex w-full flex-col gap-1 pr-3 ${className}` : 'num flex w-full flex-col gap-1 pr-3'}
    >
      {rows.map(row => (
        <div
          key={`${row.stack}`}
          className="grid items-center gap-x-1.5"
          style={{ gridTemplateColumns: '1.1rem repeat(3, 1.75rem) 2.5rem minmax(0, 1fr)' }}
        >
          <span className="font-sans text-[10px] text-muted-foreground">{row.stack ?? ''}</span>
          {row.cells.map(cell => (
            <DataTooltip key={cell.key} placement="top" content={cell.tooltip} contentClass="whitespace-pre-wrap w-max">
              <span className={`block text-right text-[11px] ${cell.toneClass}`}>{cell.latency}</span>
            </DataTooltip>
          ))}
          <DataTooltip placement="top" content={`平均丢包 ${row.loss}`} contentClass="whitespace-nowrap">
            <span className={`block text-right text-[11px] ${row.lossTone}`}>{row.loss}</span>
          </DataTooltip>
          <div
            className="ml-1 grid h-1.5 gap-[1px]"
            style={{ gridTemplateColumns: `repeat(${row.latencyBars.length || 1}, minmax(0, 1fr))` }}
          >
            {row.latencyBars.map(bar => (
              <DataTooltip
                key={bar.key}
                placement="top"
                content={bar.tooltip}
                className="h-full w-full"
                contentClass="whitespace-pre-wrap w-max"
              >
                <span className={`block h-full w-full rounded-[1px] ${bar.className}`} />
              </DataTooltip>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
