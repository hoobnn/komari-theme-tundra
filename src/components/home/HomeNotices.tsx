import MarkdownRenderer from '@/components/MarkdownRenderer'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { useBackgroundSurface } from '@/hooks/useBackgroundSurface'
import { useAppStore } from '@/stores/app'

export default function HomeNotices() {
  const { pickSurfaceClass } = useBackgroundSurface()
  const connectionError = useAppStore(state => state.connectionError)
  const { alertEnabled, alertTitle, alertContent } = useAppStore(state => state.settings)
  if (!connectionError && !(alertEnabled && alertContent)) return null
  return (
    <div className="space-y-3">
      {connectionError && (
        <div className="alert px-4">
          <Alert
            variant="destructive"
            className={pickSurfaceClass(
              'border-none bg-red-400/10 rounded-md',
              'border-none bg-red-400/10 backdrop-blur-xs rounded-md',
            )}
          >
            <AlertTitle>暂时连不上服务器</AlertTitle>
            <AlertDescription>正在自动重连，恢复后数据会自动刷新。</AlertDescription>
          </Alert>
        </div>
      )}

      {alertEnabled && alertContent && (
        <div className="alert px-4">
          <Alert
            className={pickSurfaceClass(
              'border-none bg-background rounded-md',
              'border-none bg-background/60 backdrop-blur-xs rounded-md',
            )}
          >
            {alertTitle && <AlertTitle>{alertTitle}</AlertTitle>}
            <AlertDescription>
              <MarkdownRenderer content={alertContent} />
            </AlertDescription>
          </Alert>
        </div>
      )}
    </div>
  )
}
