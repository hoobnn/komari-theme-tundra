import type { NodeData } from '@/stores/nodes'
import { Fragment } from 'react'
import { DataTooltip } from '@/components/ui/data-tooltip'
import { useNodePingDisplay } from '@/hooks/useNodePingDisplay'
import { cn } from '@/lib/utils'

export default function NodePingSummary({ node, onClick }: { node: NodeData; onClick?: (node: NodeData) => void }) {
  const { pingTable } = useNodePingDisplay(node.uuid)
  // 延迟 / 丢包趋势：固定高度，单栈一行占满、双栈上下两行，保证各卡片对齐
  const pingRows = pingTable?.rows ?? []
  const trendPanels = [
    {
      metric: 'latency',
      label: '延迟',
      rows: pingRows.map(row => ({ key: `${row.stack}`, bars: row.latencyBars })),
    },
    {
      metric: 'loss',
      label: '丢包',
      rows: pingRows.map(row => ({ key: `${row.stack}`, bars: row.lossBars })),
    },
  ]

  return (
    <div
      role="button"
      tabIndex={0}
      className="-mx-1.5 flex flex-col gap-2 rounded-md px-1.5 py-1 text-[11px] transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`${node.name} 延迟详情`}
      onClick={event => {
        event.stopPropagation()
        onClick?.(node)
      }}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.stopPropagation()
          event.preventDefault()
          onClick?.(node)
        }
      }}
    >
      <div className="grid grid-cols-2 gap-x-4">
        {trendPanels.map(panel => (
          <div key={panel.metric} className="flex flex-col gap-1">
            <span className="text-[10px] leading-none text-muted-foreground">{panel.label}</span>
            <div className="flex h-4 flex-col gap-[2px]">
              {panel.rows.length ? (
                panel.rows.map(row => (
                  <div
                    key={row.key}
                    className="grid min-h-0 flex-1 gap-[2px]"
                    style={{ gridTemplateColumns: `repeat(${row.bars.length || 1}, minmax(0, 1fr))` }}
                  >
                    {row.bars.map(bar => (
                      <DataTooltip
                        key={bar.key}
                        placement="top"
                        content={bar.tooltip}
                        className="h-full w-full"
                        contentClass="whitespace-pre-wrap w-max"
                      >
                        <span className={cn('block h-full w-full rounded-[2px]', bar.className)} />
                      </DataTooltip>
                    ))}
                  </div>
                ))
              ) : (
                <div className="flex-1 rounded-[2px] bg-muted" />
              )}
            </div>
          </div>
        ))}
      </div>

      {pingTable ? (
        <div
          className="num grid items-baseline gap-x-2 gap-y-0.5"
          style={{
            gridTemplateColumns: `1.1rem repeat(${pingTable.headers.length}, minmax(0, 1fr)) minmax(0, 1fr) minmax(0, 1fr)`,
          }}
        >
          <span />
          {pingTable.headers.map(header => (
            <span key={header} className="truncate text-right font-sans text-[11px] text-muted-foreground">
              {header}
            </span>
          ))}
          <span className="text-right font-sans text-[11px] text-muted-foreground">延迟</span>
          <span className="text-right font-sans text-[11px] text-muted-foreground">丢包</span>
          {pingTable.rows.map(row => (
            <Fragment key={`${row.stack}`}>
              <span className="text-[10px] text-muted-foreground/80">{row.stack ?? ''}</span>
              {row.cells.map(cell => (
                <DataTooltip
                  key={cell.key}
                  placement="top"
                  content={cell.tooltip}
                  contentClass="whitespace-pre-wrap w-max"
                >
                  <span className={cn('block text-right text-xs', cell.toneClass)}>{cell.latency}</span>
                </DataTooltip>
              ))}
              <span className={cn('text-right text-xs font-medium', row.latencyTone)}>
                {row.latency}
                {row.latency !== '--' && <span className="text-[10px] font-normal text-muted-foreground">ms</span>}
              </span>
              <span className={cn('text-right text-xs', row.lossTone)}>{row.loss}</span>
            </Fragment>
          ))}
        </div>
      ) : (
        <div className="text-[11px] text-muted-foreground/70">未配置延迟监测</div>
      )}
    </div>
  )
}
