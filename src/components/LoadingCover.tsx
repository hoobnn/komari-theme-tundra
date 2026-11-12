import { useIsDark } from '@/stores/app'

export default function LoadingCover() {
  const isDark = useIsDark()
  return (
    <div
      className={`loading-cover fixed inset-0 z-20 flex items-center justify-center ${isDark ? 'bg-black/50' : 'bg-white/80'}`}
    >
      <div className="flex flex-col items-center gap-3 text-foreground">
        <span
          className="inline-block size-7 animate-spin rounded-full border-2"
          style={{ borderColor: 'color-mix(in srgb, currentColor 18%, transparent)', borderTopColor: 'currentColor' }}
        />
        <span className="text-sm text-muted-foreground">加载中…</span>
      </div>
    </div>
  )
}
