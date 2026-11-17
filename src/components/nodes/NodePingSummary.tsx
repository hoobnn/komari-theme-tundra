import type { NodeData } from '@/stores/nodes'
import { Icon } from '@iconify/react'
import { Fragment } from 'react'
import { DataTooltip } from '@/components/ui/data-tooltip'
import { useNodePingDisplay } from '@/hooks/useNodePingDisplay'
import { cn } from '@/lib/utils'

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
      label: '丢包',
      rows: pingRows.map(row => ({ key: `${row.stack}`, bars: row.lossBars })),
    },
  ]

  return (
    <button
      type="button"
      aria-haspopup="dialog"
      className="group/ping -mx-1.5 flex w-[calc(100%+0.75rem)] cursor-pointer flex-col gap-1.5 rounded-lg px-1.5 py-1 text-left text-2xs transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`${node.name} 延迟详情`}
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
                  {panel.label}
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

          <span
            className="num grid items-baseline gap-x-2 gap-y-0.5"
            style={{
              gridTemplateColumns: `1.1rem repeat(${pingTable.headers.length}, minmax(0, 1fr)) minmax(0, 1fr) minmax(0, 1fr)`,
            }}
          >
            <span />
            {pingTable.headers.map(header => (
              <span key={header} className="truncate text-right font-sans text-2xs text-muted-foreground">
                {header}
              </span>
            ))}
            <span className="text-right font-sans text-2xs text-muted-foreground">均值</span>
            <span className="text-right font-sans text-2xs text-muted-foreground">丢包</span>
            {pingTable.rows.map(row => (
              <Fragment key={`${row.stack}`}>
                <span className="text-2xs text-muted-foreground">{row.stack ?? ''}</span>
                {row.cells.map(cell => (
                  <DataTooltip
                    as="span"
                    key={cell.key}
                    placement="top"
                    content={cell.tooltip}
                    contentClass="whitespace-pre-wrap w-max"
                  >
                    <span className={cn('block text-right text-xs', cell.toneClass)}>{cell.latency}</span>
                  </DataTooltip>
                ))}
                <span className={cn('text-right text-xs font-semibold', row.latencyTone)}>
                  {row.latency}
                  {row.latency !== '--' && <span className="ml-px text-3xs font-normal text-muted-foreground">ms</span>}
                </span>
                <span className={cn('text-right text-xs', row.lossTone)}>{row.loss}</span>
              </Fragment>
            ))}
          </span>
        </>
      ) : (
        // 与「趋势条 + 单栈表」同高（标签 11px + 4px + 趋势 14px + 6px + 表 34px），空状态居中
        <span className="flex min-h-[4.3125rem] items-center justify-center gap-1.5 text-2xs text-muted-foreground">
          <Icon icon="lucide:activity" width="12" height="12" className="opacity-70" />
          {emptyText}
          <Icon icon="lucide:chevron-right" className="size-3" />
        </span>
      )}
    </button>
  )
}
