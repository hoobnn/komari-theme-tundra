import type { NodeData } from '@/stores/nodes'
import { Icon } from '@iconify/react'
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
      className="-mx-1.5 flex flex-col gap-1.5 rounded-lg px-1.5 py-1 text-2xs transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
      {pingTable ? (
        <>
          <div className="grid grid-cols-2 gap-x-5">
            {trendPanels.map(panel => (
              <div key={panel.metric} className="flex flex-col gap-1">
                <span className="text-2xs leading-none text-muted-foreground">{panel.label}</span>
                <div className="flex h-3.5 flex-col gap-[2px]">
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

          {/* 固定为表头加两行（双栈）的高度，单栈卡片和双栈卡片底部对齐 */}
          <div
            className="num grid min-h-13 content-start items-baseline gap-x-2 gap-y-0.5"
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
          </div>
        </>
      ) : (
        // 与「趋势条 + 双栈表」同高（标签 11px + 4px + 趋势 14px + 6px + 表 52px），空状态居中，不留大块空白
        <div className="flex min-h-[5.4375rem] items-center justify-center gap-1.5 text-2xs text-muted-foreground">
          <Icon icon="lucide:activity" width="12" height="12" className="opacity-70" />
          未配置延迟监测
        </div>
      )}
    </div>
  )
}
