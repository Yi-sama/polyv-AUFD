import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Film, LoaderCircle, Play, RotateCcw } from 'lucide-react';
import { ApiError, getPlaybackToken } from './api';
import { formatTime } from './portfolio-utils';
import type { Work } from './types';
import './player.css';

interface Player {
  on(event: string, listener: () => void): void;
  destroy(): void;
  j2s_seekVideo(seconds: number): void;
  j2s_resumeVideo(): void;
  j2s_getDuration(): number;
}

type PlayerFactory = (options: {
  wrap: HTMLElement;
  width: '100%';
  height: '100%';
  vid: string;
  playsafe?: string;
  forceH5: true;
  autoplay: false;
  ban_history_time: 'on';
}) => Player;

const sdkWindow = () => window as Window & { polyvPlayer?: PlayerFactory };
let sdkPromise: Promise<PlayerFactory> | undefined;

function loadPolyvSdk(): Promise<PlayerFactory> {
  const existing = sdkWindow().polyvPlayer;
  if (typeof existing === 'function') return Promise.resolve(existing);
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise<PlayerFactory>((resolve, reject) => {
    const script = document.createElement('script');
    let settled = false;
    const finish = (factory?: PlayerFactory) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      script.onload = null;
      script.onerror = null;
      if (typeof factory === 'function') {
        resolve(factory);
      } else {
        script.remove();
        reject(new Error('保利威播放器加载失败。'));
      }
    };
    const timeout = window.setTimeout(() => finish(), 15000);
    script.src = 'https://player.polyv.net/resp/vod-player/latest/player.js';
    script.async = true;
    script.onload = () => finish(sdkWindow().polyvPlayer);
    script.onerror = () => finish();
    document.head.appendChild(script);
  }).catch(error => {
    // A failed load must not poison later, user-initiated retries.
    sdkPromise = undefined;
    throw error;
  });
  return sdkPromise;
}

type Status = 'loading' | 'ready' | 'playing' | 'paused' | 'ended' | 'error';
const statusLabels: Record<Status, string> = {
  loading: '正在加载影像',
  ready: '已就绪',
  playing: '正在播放',
  paused: '已暂停',
  ended: '播放结束',
  error: '影像暂不可用',
};

function PlayerSession({ work }: { work: Work }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Player | null>(null);
  const readyRef = useRef(false);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<Status>('loading');
  const [ready, setReady] = useState(false);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState('');
  const [seekError, setSeekError] = useState('');

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const controller = new AbortController();
    let cancelled = false;
    let failed = false;
    let instance: Player | null = null;
    let initTimeout: number | undefined;
    readyRef.current = false;
    setReady(false);
    setStatus('loading');
    setDuration(0);
    setError('');
    setSeekError('');

    // Give each effect its own SDK-owned DOM, including StrictMode replays.
    const wrap = document.createElement('div');
    wrap.className = 'polyv-sdk';
    mount.appendChild(wrap);

    const dispose = () => {
      const current = instance;
      instance = null;
      if (playerRef.current === current) playerRef.current = null;
      mount.querySelectorAll<HTMLMediaElement>('video, audio').forEach(media => media.pause());
      try {
        current?.destroy();
      } catch {
        console.warn('Polyv player cleanup failed.');
      } finally {
        mount.replaceChildren();
      }
    };

    const fail = (message: string) => {
      if (cancelled || failed) return;
      failed = true;
      controller.abort();
      window.clearTimeout(initTimeout);
      readyRef.current = false;
      setReady(false);
      setStatus('error');
      setError(message);
      dispose();
    };

    const updateDuration = () => {
      if (cancelled || failed || !readyRef.current || !instance) return;
      try {
        const value = instance.j2s_getDuration();
        if (Number.isFinite(value) && value > 0) setDuration(value);
      } catch {
        // Metadata may not be available until playback starts; seek rechecks it.
      }
    };

    initTimeout = window.setTimeout(
      () => fail('影像加载超时，请检查网络后重试。'),
      45000,
    );

    async function initialize() {
      let failureMessage = '暂时无法验证播放权限，请重试。';
      try {
        if (!work.videoId.trim()) {
          fail('这件作品尚未设置视频 VID。');
          return;
        }
        const playback = await getPlaybackToken(work.videoId, controller.signal);
        if (cancelled || failed) return;
        const validToken = typeof playback.token === 'string' && playback.token.trim().length > 0;
        if (
          playback.videoId !== work.videoId ||
          typeof playback.required !== 'boolean' ||
          (!validToken && !(playback.token === null && playback.required === false))
        ) {
          fail('播放凭证不完整，请重试。');
          return;
        }

        failureMessage = '播放器加载失败，请检查网络后重试。';
        const factory = await loadPolyvSdk();
        if (cancelled || failed) return;
        if (
          playback.expiresAt !== null &&
          (!Number.isFinite(playback.expiresAt) || playback.expiresAt <= Date.now())
        ) {
          fail('播放凭证已过期，请重试获取新凭证。');
          return;
        }

        failureMessage = '播放器无法启动，请重试。';
        instance = factory({
          wrap,
          width: '100%',
          height: '100%',
          vid: work.videoId,
          ...(playback.token === null ? {} : { playsafe: playback.token }),
          forceH5: true,
          autoplay: false,
          ban_history_time: 'on',
        });
        playerRef.current = instance;
        instance.on('s2j_onPlayerInitOver', () => {
          if (cancelled || failed) return;
          window.clearTimeout(initTimeout);
          readyRef.current = true;
          setReady(true);
          setStatus(previous => previous === 'loading' ? 'ready' : previous);
          updateDuration();
        });
        instance.on('s2j_onVideoPlay', () => {
          if (cancelled || failed) return;
          setStatus('playing');
          updateDuration();
        });
        instance.on('s2j_onVideoPause', () => {
          if (!cancelled && !failed) setStatus('paused');
        });
        instance.on('s2j_onPlayOver', () => {
          if (!cancelled && !failed) setStatus('ended');
        });
        instance.on('s2j_onReadyPlay', updateDuration);
        instance.on('s2j_onPlayerError', () => fail('播放失败，请重试。'));
        instance.on('serverError', () => fail(
          '播放授权或域名验证未通过，请重试或联系作者。',
        ));
      } catch (cause) {
        if (!cancelled && !failed) fail(cause instanceof ApiError ? cause.message : failureMessage);
      }
    }

    void initialize();
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(initTimeout);
      readyRef.current = false;
      dispose();
    };
  }, [work.videoId, attempt]);

  function seek(seconds: number) {
    const player = playerRef.current;
    if (!readyRef.current || !player) return;
    try {
      const total = player.j2s_getDuration();
      if (!Number.isFinite(total) || total <= 0) {
        setSeekError('暂未获取到视频时长，请开始播放后重试。');
        return;
      }
      setDuration(total);
      if (!Number.isFinite(seconds) || seconds < 0 || seconds >= total) {
        setSeekError('这个片段的时间超出了视频长度。');
        return;
      }
      setSeekError('');
      player.j2s_seekVideo(seconds);
      player.j2s_resumeVideo();
    } catch {
      setSeekError('暂时无法跳转到这个片段，请重试。');
    }
  }

  return (
    <section className="polyv-player" aria-label={`影像：${work.title}`}>
      <div className="polyv-stage" aria-busy={status === 'loading'}>
        <div ref={mountRef} className="polyv-mount" />
        {(status === 'loading' || status === 'error') && (
          <div className="polyv-overlay">
            {status === 'loading' ? (
              <div className="polyv-message" role="status">
                <LoaderCircle className="polyv-spinner" size={24} aria-hidden="true" />
                <p className="polyv-message-title">正在加载影像</p>
              </div>
            ) : (
              <div className="polyv-message">
                <AlertCircle size={24} aria-hidden="true" />
                <p className="polyv-message-title">影像暂不可用</p>
                <p className="polyv-error" role="alert">{error}</p>
                <button className="polyv-retry" type="button" onClick={() => setAttempt(value => value + 1)}>
                  <RotateCcw size={16} aria-hidden="true" />
                  重新加载
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="polyv-meta">
        <span className="polyv-playback" role="status" aria-live="polite">
          {statusLabels[status]}
        </span>
        {work.isDemo && (
          <span className="polyv-demo">
            <Film size={15} aria-hidden="true" />
            保利威官方示例
          </span>
        )}
      </div>
      {work.highlights.length > 0 && (
        <div className="polyv-highlights">
          <h3 className="polyv-heading">精彩片段</h3>
          <ul className="polyv-highlight-list">
            {work.highlights.map((highlight, index) => {
              const valid = Number.isFinite(highlight.seconds) && highlight.seconds >= 0;
              const outside = !valid || (duration > 0 && highlight.seconds >= duration);
              const time = valid ? formatTime(highlight.seconds) : '--:--';
              return (
                <li className="polyv-highlight-item" key={`${index}:${highlight.seconds}`}>
                  <button
                    className="polyv-highlight"
                    type="button"
                    disabled={!ready || outside}
                    aria-label={`播放 ${highlight.title} ${time}`}
                    title={outside ? '片段时间超出视频长度' : `播放 ${highlight.title} ${time}`}
                    onClick={() => seek(highlight.seconds)}
                  >
                    <Play size={15} aria-hidden="true" />
                    <span className="polyv-time">{time}</span>
                    <span className="polyv-highlight-title">{highlight.title}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {seekError && <p className="polyv-seek-error" role="alert">{seekError}</p>}
        </div>
      )}
    </section>
  );
}

export default function PolyvPlayer({ work }: { work: Work }) {
  return <PlayerSession key={`${work.id}:${work.videoId}`} work={work} />;
}
