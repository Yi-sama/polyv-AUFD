import { useEffect, useRef, useState } from 'react'

// 保利威 Web 点播播放器 SDK 的最小类型
interface PolyvInstance {
  on(event: string, cb: () => void): void
  destroy(): void
  j2s_seekVideo(seconds: number): void
  j2s_resumeVideo(): void
  j2s_getDuration(): number
}
declare global {
  interface Window {
    polyvPlayer?: (options: Record<string, unknown>) => PolyvInstance
  }
}

const SDK = 'https://player.polyv.net/resp/vod-player/latest/player.js'
let sdk: Promise<void> | null = null

function loadSdk(): Promise<void> {
  if (window.polyvPlayer) return Promise.resolve()
  sdk ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    const fail = (msg: string) => {
      clearTimeout(timer)
      script.remove()
      sdk = null
      reject(new Error(msg))
    }
    const timer = setTimeout(() => fail('播放器加载超时'), 20000)
    script.src = SDK
    script.onload = () => {
      clearTimeout(timer)
      resolve()
    }
    script.onerror = () => fail('无法加载保利威播放器')
    document.head.append(script)
  })
  return sdk
}

export type PlayerState = 'loading' | 'ready' | 'error'

export interface PlayerApi {
  seek(seconds: number): void
}

interface Props {
  vid: string
  cover: string
  playsafe?: string | null
  onState(state: PlayerState, api?: PlayerApi): void
  /** 视频真实宽高比，用来让舞台贴合画面，不出现黑边 */
  onRatio?(ratio: number): void
}

export default function PolyvPlayer({ vid, cover, playsafe, onState, onRatio }: Props) {
  const mount = useRef<HTMLDivElement>(null)
  const [attempt, setAttempt] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const onStateRef = useRef(onState)
  const onRatioRef = useRef(onRatio)
  useEffect(() => {
    onStateRef.current = onState
    onRatioRef.current = onRatio
  })

  useEffect(() => {
    let player: PolyvInstance | null = null
    let alive = true
    const report = (s: PlayerState, api?: PlayerApi) => alive && onStateRef.current(s, api)
    setError(null)
    report('loading')

    const fail = (msg: string) => {
      if (!alive) return
      setError(msg)
      report('error')
    }
    const slow = setTimeout(() => fail('视频加载时间较长，请检查网络或视频权限'), 25000)

    loadSdk()
      .then(() => {
        if (!alive || !mount.current || !window.polyvPlayer) return
        player = window.polyvPlayer({
          wrap: mount.current,
          width: '100%',
          height: '100%',
          vid,
          ...(playsafe ? { playsafe } : {}),
          autoplay: false,
          forceH5: true,
          ban_history_time: 'on',
          hideSwitchPlayer: true,
          screenshot: false,
          loading_bg_img: new URL(cover, location.origin).href,
          cover_display: 'scaleAspectFit',
        })
        const p = player
        p.on('s2j_onPlayerInitOver', () => {
          clearTimeout(slow)
          const video = mount.current?.querySelector('video')
          const measure = () => {
            if (alive && video?.videoWidth) onRatioRef.current?.(video.videoWidth / video.videoHeight)
          }
          if (video?.videoWidth) measure()
          else video?.addEventListener('loadedmetadata', measure, { once: true })
          report('ready', {
            seek(seconds) {
              const duration = Number(p.j2s_getDuration())
              p.j2s_seekVideo(duration > 0 ? Math.min(seconds, duration) : seconds)
              p.j2s_resumeVideo()
            },
          })
        })
        const failed = () => {
          clearTimeout(slow)
          fail('播放失败，请检查视频 VID 或授权')
        }
        p.on('s2j_onPlayerError', failed)
        p.on('serverError', failed)
      })
      .catch((e: Error) => {
        clearTimeout(slow)
        fail(e.message)
      })

    return () => {
      alive = false
      clearTimeout(slow)
      try {
        player?.destroy()
      } catch {
        /* 播放器已被移除 */
      }
    }
  }, [vid, cover, playsafe, attempt])

  return (
    <div className="absolute inset-0">
      <div ref={mount} className="h-full w-full" />
      {error && (
        <div className="absolute inset-0 grid place-items-center bg-dark/80 text-center text-sm text-white/80">
          <div>
            <p>{error}</p>
            <button
              type="button"
              onClick={() => setAttempt((n) => n + 1)}
              className="mt-3 underline underline-offset-4"
            >
              重试
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
