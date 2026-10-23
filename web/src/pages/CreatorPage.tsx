import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AnimatePresence, LayoutGroup, motion, useMotionValue, useTransform } from 'motion/react'
import { useGallery, Notice } from '../App'
import { ratio } from '../data/api'
import { useReducedMotion, useWide } from '../hooks'
import { TYPE_LABEL, type Creator, type Work, type WorkType } from '../types'
import Focus from '../components/Focus'

const ease = [0.16, 1, 0.3, 1] as const
const pad = (n: number) => String(n).padStart(2, '0')

export default function CreatorPage() {
  const { slug, workId } = useParams()
  const { creators } = useGallery()
  const creator = creators.find((c) => c.slug === slug)
  if (!creator) return <Notice text="这里没有展厅。" back />
  return <Hall creator={creator} workId={workId} />
}

/**
 * 一间展厅。桌面是一条长廊：竖向滚动推动作品沿同一条视线横向经过；
 * 手机是单列。两种布局共享筛选、聚焦与“回到原位”。
 */
function Hall({ creator, workId }: { creator: Creator; workId?: string }) {
  const navigate = useNavigate()
  const wide = useWide()
  const [params, setParams] = useSearchParams()
  const filter = (params.get('type') as WorkType | null) ?? null
  const { profile, works } = creator

  const types = useMemo(() => [...new Set(works.map((w) => w.type))], [works])
  const shown = filter ? works.filter((w) => w.type === filter) : works
  // 直接打开的链接可能指向被筛掉的作品，此时在全部作品里聚焦
  const list = workId && !shown.some((w) => w.id === workId) ? works : shown
  const index = list.findIndex((w) => w.id === workId)
  const focused = index >= 0 ? list[index] : null

  const [justSeen, setJustSeen] = useState<string | null>(null)
  const lastFocused = useRef<string | null>(null)
  const reveal = useRef<(id: string) => void>(() => {})

  useEffect(() => {
    if (focused) {
      lastFocused.current = focused.id
      return
    }
    // 关闭聚焦：焦点与“刚看过”回到墙上那件作品
    const id = lastFocused.current
    if (!id) return
    lastFocused.current = null
    document.getElementById(`work-${id}`)?.focus({ preventScroll: true })
    setJustSeen(id)
    const t = setTimeout(() => setJustSeen(null), 2400)
    return () => clearTimeout(t)
  }, [focused])

  useEffect(() => {
    document.title = focused ? `${focused.title} · ${profile.name}` : `${profile.name} · AUFD`
  }, [focused, profile.name])

  const search = params.toString() ? `?${params}` : ''
  const go = (id: string | null, replace = false) =>
    navigate(`/${creator.slug}${id ? `/${id}` : ''}${search}`, { replace, preventScrollReset: true })

  const setFilter = (t: WorkType | null) => {
    const next = new URLSearchParams(params)
    if (t) next.set('type', t)
    else next.delete('type')
    setParams(next, { replace: true, preventScrollReset: true })
  }

  const filters =
    types.length > 1 ? (
      <div role="group" aria-label="按类型筛选" className="flex gap-5 text-sm">
        <FilterButton active={!filter} onClick={() => setFilter(null)}>全部</FilterButton>
        {types.map((t) => (
          <FilterButton key={t} active={filter === t} onClick={() => setFilter(t)}>
            {TYPE_LABEL[t]}
          </FilterButton>
        ))}
      </div>
    ) : null

  const items = shown.map((work) => ({
    work,
    n: works.indexOf(work) + 1,
    hidden: focused?.id === work.id,
    seen: justSeen === work.id,
    onOpen: () => go(work.id),
  }))

  const layoutProps = { creator, items, filters, filter, reveal }

  return (
    <LayoutGroup>
      <div inert={focused ? true : undefined}>
        {wide ? <Corridor {...layoutProps} /> : <Column {...layoutProps} />}
      </div>

      <AnimatePresence>
        {focused && (
          <Focus
            key="focus"
            creator={creator}
            work={focused}
            index={index}
            total={list.length}
            onClose={() => {
              // 聚焦期间切换过作品时，先把这一件带回视野，让它飞回看得见的位置
              reveal.current(focused.id)
              go(null)
            }}
            onPrev={index > 0 ? () => go(list[index - 1].id, true) : undefined}
            onNext={index < list.length - 1 ? () => go(list[index + 1].id, true) : undefined}
          />
        )}
      </AnimatePresence>
    </LayoutGroup>
  )
}

interface Item {
  work: Work
  n: number
  hidden: boolean
  seen: boolean
  onOpen(): void
}

interface LayoutProps {
  creator: Creator
  items: Item[]
  filters: React.ReactNode
  filter: WorkType | null
  reveal: React.RefObject<(id: string) => void>
}

/* ---------- 桌面：长廊 ---------- */

// 所有作品的底边落在同一条线上（距顶 76vh），下方留给展签与进度
const LINE = '76vh'
const heightOf = (r: number) => `min(58vh, calc(40vw / ${r}))`

function Corridor({ creator, items, filters, filter, reveal }: LayoutProps) {
  const { profile } = creator
  const section = useRef<HTMLElement>(null)
  const track = useRef<HTMLDivElement>(null)
  const [distance, setDistance] = useState(0)
  const [current, setCurrent] = useState(0)
  const still = useReducedMotion()

  // 长廊需要的竖向滚动距离 = 轨道宽度 − 视口宽度
  useLayoutEffect(() => {
    const el = track.current
    if (!el) return
    const measure = () => setDistance(Math.max(0, el.scrollWidth - window.innerWidth))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  // 竖向滚过本段的比例 0–1，直接驱动长廊横移（不加弹簧，保证共享过渡测量准确）
  const scrollYProgress = useMotionValue(0)
  useEffect(() => {
    const update = () => {
      const sec = section.current
      if (!sec) return
      scrollYProgress.set(distance ? Math.min(1, Math.max(0, (window.scrollY - sec.offsetTop) / distance)) : 0)
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    return () => window.removeEventListener('scroll', update)
  }, [distance, scrollYProgress])
  const x = useTransform(scrollYProgress, (p) => -p * distance)
  const progress = useTransform(scrollYProgress, (p) => `${Math.round(p * 100)}%`)

  // 触控板横向轻扫也能推动长廊
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) window.scrollBy({ top: e.deltaX })
    }
    window.addEventListener('wheel', onWheel, { passive: true })
    return () => window.removeEventListener('wheel', onWheel)
  }, [])

  // 把某件作品滚到视线中央（键盘聚焦、关闭聚焦时使用）
  useEffect(() => {
    reveal.current = (id: string) => {
      const el = document.getElementById(`hang-${id}`)
      const sec = section.current
      if (!el || !sec || !distance) return
      const box = el.getBoundingClientRect()
      if (box.left >= 0 && box.right <= window.innerWidth) return
      // 以作品画面（不含右侧间距）居中
      const stage = el.querySelector('button')!
      const target = el.offsetLeft + stage.offsetWidth / 2 - window.innerWidth / 2
      const p = Math.min(1, Math.max(0, target / distance))
      window.scrollTo({ top: sec.offsetTop + p * distance })
    }
  }, [distance, reveal])

  // 当前经过的是第几件：画面中心离视口中线最近的那件。用布局位置计算，不受本帧变换影响
  useEffect(() => {
    return scrollYProgress.on('change', (p) => {
      const mid = p * distance + window.innerWidth / 2
      let best = 0
      let bestD = Infinity
      items.forEach((it, i) => {
        const el = document.getElementById(`hang-${it.work.id}`)
        const stage = el?.querySelector('button')
        if (!el || !stage) return
        const d = Math.abs(el.offsetLeft + stage.offsetWidth / 2 - mid)
        if (d < bestD) [best, bestD] = [i, d]
      })
      setCurrent(best)
    })
  }, [scrollYProgress, items, distance])

  // 换筛选：回到长廊起点，让访客从头看到新的一组
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const sec = section.current
    if (sec && window.scrollY > sec.offsetTop) window.scrollTo({ top: sec.offsetTop, behavior: still ? 'auto' : 'smooth' })
  }, [filter, still])

  return (
    <>
      <section ref={section} style={{ height: `calc(100vh + ${distance}px)` }} aria-label={`${profile.name} 的作品`}>
        {/* overflow-clip 而非 hidden：hidden 的容器仍会被浏览器为“让焦点可见”而横向滚动，导致长廊错位 */}
        <div className="sticky top-0 h-svh overflow-clip">
          <nav className="absolute inset-x-0 top-0 z-10 flex items-baseline gap-10 px-[4vw] pt-7 text-sm">
            <Link to="/" className="tracking-[0.3em]">AUFD</Link>
            <span className="text-muted">{profile.name}</span>
            <span className="ml-auto">{filters}</span>
            <a href="#about" className="text-muted hover:text-ink">关于 · 联系</a>
          </nav>

          <motion.div ref={track} style={{ x }} className="flex h-full w-max items-start">
            {/* 入口墙文：作者的“展厅前言” */}
            <header className="flex w-[28vw] min-w-[22rem] shrink-0 flex-col justify-end pl-[4vw] pr-[3vw]" style={{ height: LINE }}>
              <h1 className="text-5xl font-medium">{profile.name}</h1>
              {profile.alias && <p className="label-num mt-1 text-4xl italic text-muted">{profile.alias}</p>}
              <p className="mt-6 text-sm text-muted">{profile.role}</p>
              {profile.bio && <p className="mt-2 max-w-[20em] text-sm leading-relaxed">{profile.bio}</p>}
              <p className="mt-6 text-xs text-muted">{items.length} 件作品 · 向下滚动浏览 →</p>
            </header>

            <AnimatePresence mode="popLayout" initial={false}>
              {items.map((it) => (
                <Hung
                  key={it.work.id}
                  creator={creator}
                  item={it}
                  variant="corridor"
                  onReveal={() => reveal.current(it.work.id)}
                />
              ))}
            </AnimatePresence>

            <div aria-hidden className="w-[8vw] shrink-0" />
          </motion.div>

          {/* 进度：第几件 / 共几件，与走过的长度 */}
          <div className="absolute inset-x-[4vw] bottom-7 flex items-center gap-5 text-xs text-muted" aria-hidden>
            <span className="label-num text-sm text-ink">
              {pad(Math.min(current + 1, items.length))} / {pad(items.length)}
            </span>
            <span className="relative h-px flex-1 bg-line">
              <motion.span className="absolute inset-y-0 left-0 bg-ink" style={{ width: progress }} />
            </span>
          </div>
        </div>
      </section>

      <About creator={creator} />
    </>
  )
}

/* ---------- 手机：单列 ---------- */

function Column({ creator, items, filters }: LayoutProps) {
  const { profile } = creator
  return (
    <>
      <nav className="flex items-baseline justify-between px-5 pt-6 text-sm">
        <Link to="/" className="tracking-[0.3em]">AUFD</Link>
        <a href="#about" className="text-muted">关于 · 联系</a>
      </nav>
      <header className="px-5 pt-8">
        <h1 className="flex flex-wrap items-baseline gap-x-3">
          <span className="text-3xl font-medium">{profile.name}</span>
          {profile.alias && <span className="label-num text-2xl italic text-muted">{profile.alias}</span>}
        </h1>
        <p className="mt-2 text-sm text-muted">{profile.role} · {items.length} 件作品</p>
        {filters && <div className="mt-5">{filters}</div>}
      </header>
      <main className="flex flex-col gap-14 px-5 pt-8 pb-20">
        <AnimatePresence mode="popLayout" initial={false}>
          {items.map((it) => (
            <Hung key={it.work.id} creator={creator} item={it} variant="column" />
          ))}
        </AnimatePresence>
      </main>
      <About creator={creator} />
    </>
  )
}

/* ---------- 一件挂在墙上的作品 ---------- */

interface HungProps {
  creator: Creator
  item: Item
  variant: 'corridor' | 'column'
  onReveal?: () => void
}

function Hung({ creator, item, variant, onReveal }: HungProps) {
  const { work, n, hidden, seen, onOpen } = item
  const r = ratio(creator, work.cover)
  const corridor = variant === 'corridor'
  // 长廊：高度统一受限、宽度随比例；单列：宽度占满、竖幅限制高度
  const h = heightOf(r)
  const size: React.CSSProperties = corridor
    ? { height: h, aspectRatio: r }
    : { width: `min(100%, calc(70svh * ${r}))`, aspectRatio: r }

  return (
    <motion.figure
      id={`hang-${work.id}`}
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.2 } }}
      transition={{ layout: { duration: 0.7, ease }, opacity: { duration: 0.4 } }}
      className={corridor ? 'm-0 flex shrink-0 flex-col pr-[6vw]' : 'm-0 flex flex-col items-center'}
      // 长廊里所有作品的底边落在同一条线上
      style={corridor ? { marginTop: `calc(${LINE} - ${h})` } : undefined}
    >
      <button
        id={`work-${work.id}`}
        type="button"
        onClick={onOpen}
        onFocus={onReveal}
        className="group block cursor-zoom-in text-left"
        aria-label={`查看作品：${work.title}`}
      >
        {/* 外层占位保持版式；内层与聚焦视图共享 layoutId，聚焦时被“取下”，关闭时挂回 */}
        <div className="relative" style={size}>
          {!hidden && (
            <motion.div
              layoutId={`stage-${work.id}`}
              transition={{ duration: 0.6, ease }}
              className="absolute inset-0 overflow-hidden bg-line"
            >
              <img src={work.cover} alt="" className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.015]" />
              {work.type === 'video' && (
                <span className="absolute bottom-3 left-3 bg-dark/70 px-2 py-1 text-[11px] text-white">▶ 影像</span>
              )}
            </motion.div>
          )}
        </div>
      </button>
      <figcaption className="mt-4 text-sm" style={{ width: corridor ? `max(calc(${h} * ${r}), 14rem)` : size.width }}>
        <p className="flex items-baseline gap-3">
          <span className="label-num text-base text-muted">No.{pad(n)}</span>
          <span className="[text-wrap:balance]">{work.title}</span>
          <AnimatePresence>
            {seen && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.8 } }}
                className="ml-auto shrink-0 text-xs text-ink"
              >
                刚看过
              </motion.span>
            )}
          </AnimatePresence>
        </p>
        <p className="mt-1 pl-[3.1rem] text-xs text-muted">
          {[TYPE_LABEL[work.type], work.images.length > 1 && `${work.images.length} 张`, work.date.slice(0, 4)]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </figcaption>
    </motion.figure>
  )
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`relative pb-1 transition-colors ${active ? 'text-ink' : 'text-muted hover:text-ink'}`}
    >
      {children}
      {active && <motion.span layoutId="filter-line" className="absolute inset-x-0 bottom-0 h-px bg-ink" />}
    </button>
  )
}

function About({ creator }: { creator: Creator }) {
  const { profile } = creator
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(profile.email)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }
  return (
    <footer id="about" className="grid gap-10 border-t border-line px-5 py-[12vh] md:grid-cols-12 md:px-[4vw]">
      <h2 className="label-num text-3xl italic md:col-span-4">About</h2>
      <div className="md:col-span-6">
        <p className="whitespace-pre-line leading-loose">{profile.about || profile.bio}</p>
        {profile.email && (
          <p className="mt-10 flex flex-wrap items-center gap-4 text-sm">
            <a href={`mailto:${profile.email}`} className="underline underline-offset-4">{profile.email}</a>
            <button type="button" onClick={copy} className="text-muted hover:text-ink">
              {copied ? '已复制' : '复制'}
            </button>
          </p>
        )}
        <p className="mt-16 text-xs text-muted">影像播放由保利威 POLYV 提供</p>
      </div>
    </footer>
  )
}
