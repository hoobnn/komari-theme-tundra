import type { NodeData } from '@/stores/nodes'
import ChartPlaceholder from '@/components/charts/ChartPlaceholder'
import { lazy, Suspense } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useBackgroundSurface } from '@/hooks/useBackgroundSurface'
import { cn } from '@/lib/utils'

const PingChart = lazy(() => import('@/components/PingChart'))

export default function NodePingDialog({
  node,
  open,
  onClose,
  onRestoreFocus,
  onExited,
}: {
  node: NodeData | null
  open: boolean
  onClose: () => void
  onRestoreFocus: () => void
  onExited: () => void
}) {
  const { pickSurfaceClass } = useBackgroundSurface()
  return (
    <Dialog
      open={open && node !== null}
      onOpenChange={nextOpen => {
        if (!nextOpen) onClose()
      }}
    >
      {node && (
        <DialogContent
          className={cn(
            'flex h-auto max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-6xl sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden rounded-xl p-0 shadow-xl',
            pickSurfaceClass('bg-background', 'bg-background/60'),
          )}
          aria-describedby={undefined}
          onCloseAutoFocus={event => {
            event.preventDefault()
            onRestoreFocus()
          }}
          onAnimationEnd={event => {
            if (event.target === event.currentTarget && event.currentTarget.dataset.state === 'closed') onExited()
          }}
        >
          <DialogHeader className="flex h-13 shrink-0 flex-row items-center border-b ps-4 pe-12">
            <DialogTitle className="flex min-w-0 flex-col gap-0.5 text-left sm:flex-row sm:items-baseline sm:gap-2">
              <span className="shrink-0 font-atlas text-value font-semibold">延迟与丢包</span>
              <span className="truncate text-xs font-normal text-muted-foreground" title={node.name}>
                {node.name}
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="min-h-0 overflow-y-auto overscroll-contain p-2 sm:p-4">
            <Suspense fallback={<ChartPlaceholder />}>
              <PingChart uuid={node.uuid} />
            </Suspense>
          </div>
        </DialogContent>
      )}
    </Dialog>
  )
}
