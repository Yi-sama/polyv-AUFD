import { createContext, useContext, useEffect, useState } from 'react'
import { Link, Route, Routes } from 'react-router-dom'
import type { Creator } from './types'
import { loadCreators } from './data/api'
import Home from './pages/Home'
import CreatorPage from './pages/CreatorPage'

interface Gallery {
  creators: Creator[]
  mock: boolean
}

const GalleryContext = createContext<Gallery>({ creators: [], mock: false })
export const useGallery = () => useContext(GalleryContext)

export default function App() {
  const [gallery, setGallery] = useState<Gallery | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    loadCreators().then(setGallery, () => setError(true))
  }, [])

  if (error) return <Notice text="展馆暂时无法打开，请稍后刷新。" />
  if (!gallery) return <Notice text="正在开灯…" />

  return (
    <GalleryContext.Provider value={gallery}>
      <Routes>
        <Route path="/" element={<Home />} />
        {/* 同一个路由承载展墙与聚焦：切换作品时展墙不卸载，滚动位置自然保留 */}
        <Route path="/:slug/:workId?" element={<CreatorPage />} />
        <Route path="*" element={<Notice text="这里没有展厅。" back />} />
      </Routes>
      {gallery.mock && (
        <p className="fixed bottom-3 left-3 z-50 text-[11px] text-muted">示例数据 · 后端未连接</p>
      )}
    </GalleryContext.Provider>
  )
}

export function Notice({ text, back }: { text: string; back?: boolean }) {
  return (
    <main className="grid min-h-svh place-items-center px-6 text-center text-muted">
      <div>
        <p>{text}</p>
        {back && (
          <Link to="/" className="mt-4 inline-block text-ink underline underline-offset-4">
            回到展馆
          </Link>
        )}
      </div>
    </main>
  )
}
