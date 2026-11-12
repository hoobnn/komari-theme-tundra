import type { MessageApi } from '@/utils/message'

declare global {
  /** 构建时由 vite.config.ts 注入 */
  const __BUILD_VERSION__: string
  const __BUILD_GIT_HASH__: string

  interface Window {
    $message: MessageApi
  }
}
