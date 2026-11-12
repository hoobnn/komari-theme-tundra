import { Activity, lazy, Suspense } from 'react'
import { Route, Routes, useLocation } from 'react-router'
import Background from '@/components/Background'
import Footer from '@/components/Footer'
import Header from '@/components/Header'
import LoadingCover from '@/components/LoadingCover'
import Provider from '@/components/Provider'
import { Toaster } from '@/components/ui/sonner'
import { useAppStore, useIsDark } from '@/stores/app'

const HomeView = lazy(() => import('@/views/HomeView'))
const InstanceDetail = lazy(() => import('@/views/InstanceDetail'))

export default function App() {
  const loading = useAppStore(state => state.loading)
  const isDark = useIsDark()
  const { pathname } = useLocation()
  const isHome = pathname === '/'

  return (
    <Provider>
      <Background />
      {loading && <LoadingCover />}
      <Header />
      {!loading && (
        <main className="flex-1">
          <div className="max-w-[1280px] mx-auto">
            <Suspense>
              {/* 首页离开后保持挂载但隐藏，返回时保留搜索、分组和滚动位置 */}
              <Activity mode={isHome ? 'visible' : 'hidden'}>
                <HomeView />
              </Activity>
              <Routes>
                <Route path="/" element={null} />
                <Route path="/instance/:id" element={<InstanceDetail />} />
              </Routes>
            </Suspense>
          </div>
        </main>
      )}
      {!loading && <Footer />}
      <Toaster richColors closeButton position="top-center" theme={isDark ? 'dark' : 'light'} />
    </Provider>
  )
}
