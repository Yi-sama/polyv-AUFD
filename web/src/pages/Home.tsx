import { useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useGallery } from '../App'
import { ratio } from '../data/api'
import { useWide } from '../hooks'
import { TYPE_LABEL, type Creator } from '../types'

const pad = (n: number) => String(n).padStart(2, '0')

// 展馆索引：每位创作者一间展厅。第一屏即可看到第一间展厅的作者与作品。
export default function Home() {
  const { creators } = useGallery()

  return (
    <div className="min-h-svh">
      <header className="flex items-baseline justify-between px-5 pt-6 pb-10 text-sm md:px-[4vw] md:pt-7 md:pb-[7vh]">
        <span className="tracking-[0.3em]">AUFD</span>
        <span className="text-muted">作品展馆 · {creators.length} 间展厅</span>
      </header>

      <main className="flex flex-col gap-[16vh]">
        {creators.map((creator, i) => (
          <Hall key={creator.slug} creator={creator} index={i} />
        ))}
      </main>

      <footer className="px-5 py-16 text-xs text-muted md:px-[4vw]">影像播放由保利威 POLYV 提供</footer>
    </div>
  )
}

const GAP = 24

function Hall({ creator, index }: { creator: Creator; index: number }) {
  const { profile, works } = creator
  const wide = useWide()
  const row = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  // 代表作排在最前，其余保持主人设定的顺序；一排最多放 4 件（手机 2 件）
  const ordered = [...works].sort((a, b) => Number(b.featured) - Number(a.featured))
  const shown = ordered.slice(0, wide ? 4 : 2)
  const rest = works.length - shown.length

  useLayoutEffect(() => {
    const el = row.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // 整排同一高度，宽度按原始比例分配，恰好放满一行，不裁切任何作品
  const ratios = shown.map((w) => ratio(creator, w.cover))
  const fit = (width - GAP * (shown.length - 1)) / ratios.reduce((a, b) => a + b, 0)
  const height = Math.min(fit, window.innerHeight * (wide ? 0.56 : 0.42))

  return (
    <section aria-labelledby={`hall-${creator.slug}`} className="px-5 md:px-[4vw]">
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 border-b border-line pb-4">
        <span className="label-num text-lg text-muted">{pad(index + 1)}</span>
        <h2 id={`hall-${creator.slug}`} className="text-3xl font-medium md:text-5xl">
          <Link to={`/${creator.slug}`} className="hover:underline hover:decoration-1 hover:underline-offset-8">
            {profile.name}
          </Link>
        </h2>
        {profile.alias && <span className="label-num text-2xl italic text-muted md:text-4xl">{profile.alias}</span>}
        <span className="text-sm text-muted">{profile.role}</span>
        <Link to={`/${creator.slug}`} className="w-full text-sm underline-offset-4 hover:underline md:ml-auto md:w-auto">
          {works.length} 件作品 · 进入展厅 →
        </Link>
      </div>

      <div ref={row} className="mt-6 flex items-end" style={{ gap: GAP, minHeight: width ? undefined : '40vh' }}>
        {width > 0 &&
          shown.map((work, i) => (
            <Link key={work.id} to={`/${creator.slug}/${work.id}`} className="group block min-w-0">
              <div className="overflow-hidden bg-line" style={{ height, width: height * ratios[i] }}>
                <img
                  src={work.cover}
                  alt={work.title}
                  className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.02]"
                />
              </div>
              <p className="mt-3 flex items-baseline gap-2 text-sm" style={{ maxWidth: height * ratios[i] }}>
                <span className="label-num text-muted">No.{pad(works.indexOf(work) + 1)}</span>
                <span className="truncate group-hover:underline group-hover:underline-offset-4">{work.title}</span>
              </p>
              <p className="mt-0.5 text-xs text-muted">
                {[TYPE_LABEL[work.type], work.date.slice(0, 4)].filter(Boolean).join(' · ')}
              </p>
            </Link>
          ))}
      </div>
      {rest > 0 && (
        <Link to={`/${creator.slug}`} className="mt-5 inline-block text-sm text-muted hover:text-ink">
          还有 {rest} 件 →
        </Link>
      )}
    </section>
  )
}
