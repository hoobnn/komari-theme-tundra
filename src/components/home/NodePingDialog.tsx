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
  onExited,
}: {
  node: NodeData | null
  open: boolean
  onClose: () => void
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
            'flex h-[min(46rem,calc(100dvh-2rem))] max-w-6xl flex-col gap-0 overflow-hidden rounded-xl p-0 shadow-xl',
            pickSurfaceClass('bg-background', 'bg-background/60'),
          )}
          aria-describedby={undefined}
          onAnimationEnd={event => {
            if (event.target === event.currentTarget && event.currentTarget.dataset.state === 'closed') onExited()
          }}
        >
          <DialogHeader className="flex h-13 shrink-0 flex-row items-center border-b ps-4 pe-12">
            <DialogTitle className="truncate">{node.name} 延迟与丢包</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
            <Suspense fallback={<ChartPlaceholder />}>
              <PingChart uuid={node.uuid} />
            </Suspense>
          </div>
        </DialogContent>
      )}
    </Dialog>
  )
}
