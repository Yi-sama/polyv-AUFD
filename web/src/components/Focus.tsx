import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, type PanInfo } from 'motion/react'
import { ratio } from '../data/api'
import { TYPE_LABEL, type Creator, type Work } from '../types'
import PolyvPlayer, { type PlayerApi, type PlayerState } from './PolyvPlayer'

const ease = [0.16, 1, 0.3, 1] as const

interface Props {
  creator: Creator
  work: Work
  index: number
  total: number
  onClose(): void
  onPrev?: () => void
  onNext?: () => void
}

// 聚焦：展厅灯光暗下，只照亮这一件作品
export default function Focus({ creator, work, index, total, onClose, onPrev, onNext }: Props) {
  const dialog = useRef<HTMLDivElement>(null)
  const [page, setPage] = useState(0)
  const [zoom, setZoom] = useState(false)
  const [direction, setDirection] = useState(0)
  const [player, setPlayer] = useState<{ state: PlayerState; api?: PlayerApi }>({ state: 'loading' })
  // 共享过渡飞行结束后再挂播放器，避免 SDK 在缩放中的容器里初始化
  const [settled, setSettled] = useState(false)

  // 视频画面的真实比例，播放器加载后才知道；之前先按封面比例，保证从墙上飞来时形状一致
  const [videoRatio, setVideoRatio] = useState<number | null>(null)

  const isVideo = work.type === 'video' && Boolean(work.videoId)
  const images = work.images.length ? work.images : [work.cover]
  const src = isVideo ? work.cover : images[Math.min(page, images.length - 1)]
  const r = isVideo ? (videoRatio ?? ratio(creator, work.cover)) : ratio(creator, src)
  // 舞台在视口内尽量大，同时完整显示作品；展签与舞台同宽、左对齐
  const tall = r < 0.9
  const stageWidth = `min(92vw, 74vh * ${r}, 1400px)`

  useEffect(() => {
    const t = setTimeout(() => setSettled(true), 650)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    // 焦点放在对话框本身：读屏能读到标题，也不会给关闭按钮套上焦点框
    dialog.current?.focus({ preventScroll: true })
    const html = document.documentElement
    const prev = { overflow: html.style.overflow, bg: html.style.backgroundColor }
    html.style.overflow = 'hidden'
    // 滚动条槽位露出的是 html 背景，聚焦时一并调暗
    html.style.backgroundColor = '#0d0d0b'
    return () => {
      html.style.overflow = prev.overflow
      html.style.backgroundColor = prev.bg
    }
  }, [])

  // 切换作品时重置本件的查看状态
  const move = (dir: number, to?: () => void) =>
    to &&
    (() => {
      setDirection(dir)
      setPage(0)
      setZoom(false)
      setPlayer({ state: 'loading' })
      setVideoRatio(null)
      to()
    })
  const prev = move(-1, onPrev)
  const next = move(1, onNext)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (zoom) setZoom(false)
        else onClose()
      }
      else if (e.key === 'ArrowLeft' && !zoom) prev?.()
      else if (e.key === 'ArrowRight' && !zoom) next?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const onSwipe = (_: unknown, info: PanInfo) => {
    if (Math.abs(info.offset.x) < 60 || Math.abs(info.offset.x) < Math.abs(info.offset.y)) return
    if (info.offset.x < 0) next?.()
    else prev?.()
  }

  return (
    <motion.div
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-label={work.title}
      tabIndex={-1}
      className="fixed inset-0 z-40 overflow-y-auto text-white outline-none"
      initial={{ backgroundColor: 'rgba(13,13,11,0)' }}
      animate={{ backgroundColor: 'rgba(13,13,11,1)' }}
      exit={{ backgroundColor: 'rgba(13,13,11,0)', transition: { duration: 0.45, ease } }}
      transition={{ duration: 0.45, ease }}
    >
      <Chrome>
        <div className="flex items-center justify-between px-[4vw] py-5 text-sm">
          <span className="label-num text-base text-white/75">
            {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
          </span>
          <span className="hidden text-white/70 md:block">{creator.profile.name}</span>
          <button type="button" onClick={onClose} className="text-white/80 hover:text-white">
            关闭 <span aria-hidden>✕</span>
          </button>
        </div>
      </Chrome>

      {/* 竖幅作品：桌面上展签挂在作品右侧，作品与信息一屏看完；横幅作品：展签在下方，与作品左缘对齐 */}
      <div
        className={`relative flex flex-col items-center px-[4vw] ${
          tall ? 'md:flex-row md:items-end md:justify-center md:gap-[3vw]' : ''
        }`}
      >

        <motion.div
          layoutId={`stage-${work.id}`}
          transition={{ duration: 0.6, ease }}
          className={`relative overflow-hidden ${isVideo ? 'bg-black' : ''}`}
          style={{ aspectRatio: r, width: stageWidth }}
          drag={isVideo || zoom ? false : 'x'}
          dragSnapToOrigin
          dragElastic={0.2}
          onDragEnd={onSwipe}
        >
          <AnimatePresence initial={false} custom={direction} mode="popLayout">
            <motion.img
              key={src}
              src={src}
              alt={work.title}
              draggable={false}
              custom={direction}
              initial={{ opacity: 0, x: direction * 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction * -40 }}
              transition={{ duration: 0.35, ease }}
              onClick={() => !isVideo && setZoom(true)}
              className={`h-full w-full object-contain ${isVideo ? '' : 'cursor-zoom-in'}`}
            />
          </AnimatePresence>
          {isVideo && settled && (
            <PolyvPlayer
              key={work.videoId}
              vid={work.videoId}
              cover={work.cover}
              onState={(state, api) => setPlayer({ state, api })}
              onRatio={setVideoRatio}
            />
          )}
        </motion.div>


      <Chrome>
        <div
          className={`pt-8 pb-16 ${tall ? 'w-full md:w-[24rem] md:pt-0 md:pb-0' : ''}`}
          style={tall ? undefined : { width: stageWidth }}
        >
          {images.length > 1 && !isVideo && (
            <div className="mb-8 flex gap-3" role="group" aria-label="这组作品的其他图片">
              {images.map((img, i) => (
                <button
                  key={img}
                  type="button"
                  onClick={() => setPage(i)}
                  aria-label={`第 ${i + 1} 张`}
                  aria-current={i === page}
                  className={`h-14 overflow-hidden transition-opacity ${i === page ? 'opacity-100' : 'opacity-40 hover:opacity-80'}`}
                  style={{ aspectRatio: ratio(creator, img) }}
                >
                  <img src={img} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}

          <h2 className="text-2xl font-medium [text-wrap:balance] md:text-3xl">{work.title}</h2>
          <p className="mt-2 text-sm text-white/65">
            {[TYPE_LABEL[work.type], work.subtitle, work.date].filter(Boolean).join(' · ')}
          </p>

          {isVideo && work.isDemo && (
            <p className="mt-4 inline-block border border-white/30 px-2 py-1 text-xs text-white/70">
              保利威官方示例视频，非作者本人作品
            </p>
          )}

          {isVideo && work.highlights.length > 0 && (
            <ol className="mt-8 border-t border-white/15">
              {work.highlights.map((h) => (
                <li key={`${h.seconds}-${h.title}`} className="border-b border-white/15">
                  <button
                    type="button"
                    disabled={player.state !== 'ready'}
                    onClick={() => player.api?.seek(h.seconds)}
                    className="flex w-full items-baseline gap-4 py-3 text-left text-sm hover:text-white disabled:text-white/40"
                  >
                    <span className="label-num w-14 text-base text-white/60">{clock(h.seconds)}</span>
                    <span>{h.title}</span>
                  </button>
                </li>
              ))}
            </ol>
          )}

          {work.description && (
            <p className="mt-8 whitespace-pre-line text-[15px] leading-loose text-white/80">{work.description}</p>
          )}

          {(prev || next) && (
            <nav aria-label="切换作品" className="mt-10 flex gap-8 text-sm">
              <StepButton onClick={prev}>← 上一件</StepButton>
              <StepButton onClick={next}>下一件 →</StepButton>
            </nav>
          )}
        </div>
      </Chrome>
      </div>

      <AnimatePresence>
        {zoom && <Zoom src={src} alt={work.title} onClose={() => setZoom(false)} />}
      </AnimatePresence>
    </motion.div>
  )
}

/** 舞台以外的界面在作品飞入后再出现，离开时先退场 */
function Chrome({ children }: { children: React.ReactNode }) {
  return (
    // 入场用 CSS（不依赖 JS 动画也能显示），离场交给 Motion
    <motion.div className="chrome-in" exit={{ opacity: 0, transition: { duration: 0.15 } }}>
      {children}
    </motion.div>
  )
}

function StepButton({ onClick, children }: { onClick?: () => void; children: string }) {
  return (
    <button type="button" onClick={onClick} disabled={!onClick} className="text-white/80 hover:text-white disabled:text-white/25">
      {children}
    </button>
  )
}

/** 原尺寸查看细节，可滚动 */
function Zoom({ src, alt, onClose }: { src: string; alt: string; onClose(): void }) {
  return (
    <motion.div
      className="fixed inset-0 z-50 cursor-zoom-out overflow-auto bg-dark"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      role="presentation"
    >
      <img src={src} alt={alt} className="mx-auto block max-w-none" />
    </motion.div>
  )
}

function clock(s: number) {
  const m = Math.floor(s / 60)
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
