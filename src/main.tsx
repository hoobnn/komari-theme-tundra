import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { setupIconify } from '@/utils/iconify'
import { initApp } from '@/utils/init'
import { message } from '@/utils/message'
import App from './App'

import './styles/main.css'

window.$message = message

setupIconify().catch(err => {
  console.warn('[main] iconify init failed', err)
})

// 初始化随页面生命周期只跑一次，放在 React 之外，避免 StrictMode 重复挂载时建两条连接；
// 失败时 InitManager 会自行重试并更新 store
initApp().catch(error => {
  console.error('[main] Initialization failed:', error)
})

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
