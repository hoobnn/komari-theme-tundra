import { useEffect, useState } from 'react'
import { selectCurrentBackgroundUrl, useAppStore } from '@/stores/app'

// 淡入：对应原 Transition name="fade"（0.8s），离场动画省略
const FADE_IN = 'animate-in fade-in duration-[800ms]'

export default function Background() {
  const showBackground = useAppStore(state => state.settings.backgroundEnabled)
  const currentBackgroundUrl = useAppStore(selectCurrentBackgroundUrl)
  const backgroundType = useAppStore(state => state.settings.backgroundType)
  const backgroundBlur = useAppStore(state => state.settings.backgroundBlur)
  const backgroundOverlay = useAppStore(state => state.settings.backgroundOverlay)

  // 加载结果按「类型 + URL」记录，切换背景后旧结果自动失效，无需在 effect 里重置
  const [loadResult, setLoadResult] = useState<{ key: string; status: 'loaded' | 'error' } | null>(null)

  const currentUrl = showBackground ? currentBackgroundUrl : ''
  const sourceKey = `${backgroundType}|${currentUrl}`
  const isLoaded = loadResult?.key === sourceKey && loadResult.status === 'loaded'
  const hasError = loadResult?.key === sourceKey && loadResult.status === 'error'
  const hasCustomBackground = showBackground && !!currentUrl
  const showBackgroundOverlay = hasCustomBackground && backgroundOverlay > 0

  const backgroundStyle = {
    filter: backgroundBlur > 0 ? `blur(${backgroundBlur}px)` : 'none',
    opacity: backgroundType === 'video' && !isLoaded ? 0 : 1,
  }

  const backgroundContainerStyle =
    hasCustomBackground && backgroundOverlay < 0 ? { opacity: 1 - Math.abs(backgroundOverlay) / 100 } : {}

  const overlayStyle = backgroundOverlay > 0 ? { backgroundColor: `rgba(0, 0, 0, ${backgroundOverlay / 100})` } : {}

  const showLoadedBackground = hasCustomBackground && isLoaded && !hasError
  const showMediaBackground = hasCustomBackground && !hasError && (backgroundType === 'video' || showLoadedBackground)
  const showDefaultBackground = !hasCustomBackground
  const showLoadingBackground = hasCustomBackground && !isLoaded && !hasError
  const showFallbackBackground = hasCustomBackground && hasError

  useEffect(() => {
    if (!showBackground || !currentUrl || backgroundType !== 'image') return undefined
    const key = `${backgroundType}|${currentUrl}`
    const imageLoader = new Image()
    imageLoader.onload = () => setLoadResult({ key, status: 'loaded' })
    imageLoader.onerror = () => setLoadResult({ key, status: 'error' })
    imageLoader.src = currentUrl
    return () => {
      imageLoader.onload = null
      imageLoader.onerror = null
    }
  }, [showBackground, currentUrl, backgroundType])

  function handleVideoLoaded() {
    setLoadResult({ key: sourceKey, status: 'loaded' })
  }
  function handleVideoError() {
    setLoadResult({ key: sourceKey, status: 'error' })
  }

  return (
    <div className="fixed inset-0 -z-10 overflow-hidden" style={backgroundContainerStyle}>
      {showDefaultBackground && <div className={`absolute inset-0 bg-background ${FADE_IN}`} />}
      {showLoadingBackground && <div className={`absolute inset-0 bg-background ${FADE_IN}`} />}
      {showFallbackBackground && <div className={`absolute inset-0 bg-background ${FADE_IN}`} />}
      {showMediaBackground && (
        <div
          className={`absolute inset-0 scale-110 transition-opacity duration-[800ms] ease-in-out ${FADE_IN}`}
          style={backgroundStyle}
        >
          {backgroundType === 'image' ? (
            <div
              className="h-full w-full bg-cover bg-center bg-no-repeat"
              style={{ backgroundImage: `url(${currentUrl})` }}
            />
          ) : (
            <video
              className="h-full w-full object-cover"
              src={currentUrl || undefined}
              autoPlay
              loop
              muted
              preload="auto"
              playsInline
              onLoadedData={handleVideoLoaded}
              onCanPlay={handleVideoLoaded}
              onError={handleVideoError}
            />
          )}
        </div>
      )}
      {showBackgroundOverlay && <div className="pointer-events-none absolute inset-0" style={overlayStyle} />}
    </div>
  )
}
