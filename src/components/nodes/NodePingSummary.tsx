import type { NodeData } from '@/stores/nodes'
import { Icon } from '@iconify/react'
import { Fragment } from 'react'
import PingValue from '@/components/PingValue'
import { DataTooltip } from '@/components/ui/data-tooltip'
import { useNodePingDisplay } from '@/hooks/useNodePingDisplay'
import { cn } from '@/lib/utils'
import { describePing } from '@/utils/pingDisplay'
import { pingStackLabel } from '@/utils/pingStack'

export default function NodePingSummary({
  node,
  onClick,
}: {
  node: NodeData
  onClick?: (node: NodeData, trigger: HTMLElement) => void
}) {
  const { pingTable, emptyText } = useNodePingDisplay(node.uuid)
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
      label: '丢包率',
      rows: pingRows.map(row => ({ key: `${row.stack}`, bars: row.lossBars })),
    },
  ]

  return (
    <button
      type="button"
      aria-haspopup="dialog"
      className="group/ping -mx-1.5 flex min-h-[5.75rem] w-[calc(100%+0.75rem)] cursor-pointer flex-col gap-1.5 rounded-lg px-1.5 py-1 text-left text-2xs transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`${node.name} 延迟详情`}
      aria-description={pingTable?.description ?? emptyText}
      onClick={event => {
        event.stopPropagation()
        onClick?.(node, event.currentTarget)
      }}
    >
      {pingTable ? (
        <>
          <span className="grid grid-cols-2 gap-x-5">
            {trendPanels.map(panel => (
              <span key={panel.metric} className="flex flex-col gap-1">
                <span className="flex items-center justify-between text-2xs leading-none text-muted-foreground">
                  <span>
                    {panel.label}
                    {panel.metric === 'latency' && <span className="ml-1 text-3xs">ms</span>}
                  </span>
                  {panel.metric === 'loss' && (
                    <span className="inline-flex items-center gap-0.5 text-3xs group-hover/ping:text-foreground group-focus-visible/ping:text-foreground">
                      图表
                      <Icon icon="lucide:chevron-right" className="size-3" />
                    </span>
                  )}
                </span>
                <span className="flex h-3.5 flex-col gap-[2px]">
                  {panel.rows.length ? (
                    panel.rows.map(row => (
                      <span
                        key={row.key}
                        className="grid min-h-0 flex-1 gap-[2px]"
                        style={{ gridTemplateColumns: `repeat(${row.bars.length || 1}, minmax(0, 1fr))` }}
                      >
                        {row.bars.map(bar => (
                          <DataTooltip
                            as="span"
                            key={bar.key}
                            placement="top"
                            content={bar.tooltip}
                            className="h-full w-full"
                            contentClass="whitespace-pre-wrap w-max"
                          >
                            <span className={cn('block h-full w-full rounded-[2px]', bar.className)} />
                          </DataTooltip>
                        ))}
                      </span>
                    ))
                  ) : (
                    <span className="flex-1 rounded-[2px] bg-muted" />
                  )}
                </span>
              </span>
            ))}
          </span>

          <span className="num grid min-h-[3.125rem] auto-rows-[1rem] grid-cols-[1.75rem_repeat(4,minmax(0,1fr))_minmax(5ch,1fr)] content-start items-baseline gap-x-1.5 gap-y-px text-end text-xs">
            <span />
            {pingTable.headers.map((header, index) => (
              <span
                key={`${index}-${header}`}
                title={header}
                className="truncate font-sans text-2xs text-muted-foreground"
              >
                {header}
              </span>
            ))}
            <span className="col-start-5 font-sans text-2xs text-muted-foreground">均值</span>
            <span className="font-sans text-2xs text-muted-foreground">丢包率</span>
            {pingTable.rows.map(row => (
              <Fragment key={`${row.stack}`}>
                <span className="col-start-1 text-start text-2xs text-muted-foreground">
                  {pingStackLabel(row.stack)}
                </span>
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
                <DataTooltip as="span" className="col-start-5" content={`平均延迟 ${describePing(row.latency)}`}>
                  <PingValue value={row.latency} className="font-semibold" />
                </DataTooltip>
                <span className={row.lossTone}>{row.loss ?? <PingValue value="missing" />}</span>
              </Fragment>
            ))}
          </span>
        </>
      ) : (
        <span className="flex flex-1 items-center justify-center gap-1.5 text-2xs text-muted-foreground">
          <Icon icon="lucide:activity" width="12" height="12" className="opacity-70" />
          {emptyText}
          <Icon icon="lucide:chevron-right" className="size-3" />
        </span>
      )}
    </button>
  )
}
