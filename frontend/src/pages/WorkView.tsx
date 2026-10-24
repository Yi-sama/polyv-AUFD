import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { cameFrom, navigate } from '../router';
import { Img, ch } from '../ui';
import { imageList } from '../format';
import { workTypeLabels } from '../types';
import type { Creator } from '../types';
import PolyvPlayer from '../PolyvPlayer';

export default function WorkView({ creator, workId }: { creator: Creator; workId: string }) {
  const works = creator.works;
  const index = works.findIndex(w => w.id === workId);
  const work = works[index];
  const [image, setImage] = useState(0);
  const [zoom, setZoom] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const base = `/${creator.slug}`;

  const close = () => (cameFrom(base) ? history.back() : navigate(base, { replace: true, transition: 'close' }));
  const go = (step: number) => {
    if (works.length < 2) return;
    const next = works[(index + step + works.length) % works.length];
    navigate(`${base}/w/${next.id}`, { replace: true });
  };

  useEffect(() => { setImage(0); setZoom(false); }, [workId]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = previous;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); if (zoom) setZoom(false); else close(); }
      else if (event.key === 'ArrowRight' && !zoom) go(1);
      else if (event.key === 'ArrowLeft' && !zoom) go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!work) {
    return (
      <div className="viewer" role="dialog" aria-modal="true" aria-label="作品不存在">
        <div className="viewer-missing"><p>这件作品已不在节目单里。</p>
          <button ref={closeRef} type="button" className="pill" onClick={close}>回到频道</button></div>
      </div>
    );
  }

  const images = imageList(work);
  const current = images[Math.min(image, images.length - 1)];
  const named = { viewTransitionName: `w-${work.id}` } as CSSProperties;

  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-label={work.title}>
      <header className="viewer-bar">
        <span className="viewer-ch"><i className="tally" />CH {ch(creator.channel)} · {creator.profile.name}</span>
        <span className="viewer-count">{String(index + 1).padStart(2, '0')} / {String(works.length).padStart(2, '0')}</span>
        <button ref={closeRef} type="button" className="icon-btn" onClick={close} aria-label="关闭（Esc）" title="关闭（Esc）">
          <X size={22} />
        </button>
      </header>

      <div className="viewer-body">
        <div className="viewer-stage"
          onTouchStart={e => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
          onTouchEnd={e => {
            const start = touch.current; touch.current = null;
            if (!start || zoom || work.type === 'video') return;
            const dx = e.changedTouches[0].clientX - start.x, dy = e.changedTouches[0].clientY - start.y;
            if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
          }}>
          {work.type === 'video' && work.videoId
            ? <div className="viewer-video" style={named}><PolyvPlayer work={work} /></div>
            : <>
              <button type="button" className={`viewer-image${zoom ? ' is-zoomed' : ''}`} onClick={() => setZoom(z => !z)}
                aria-label={zoom ? '退出原尺寸' : '查看原尺寸'} title={zoom ? '退出原尺寸' : '点击查看原尺寸'}>
                <Img src={current} alt={work.title} media={creator.media} eager style={image === 0 ? named : undefined} />
              </button>
              {images.length > 1 && (
                <div className="viewer-thumbs" role="group" aria-label="切换图片">
                  {images.map((src, i) => (
                    <button key={src} type="button" aria-pressed={i === image} className={i === image ? 'is-on' : ''}
                      onClick={() => { setImage(i); setZoom(false); }} aria-label={`第 ${i + 1} 张`}>
                      <Img src={src} alt="" media={creator.media} />
                    </button>
                  ))}
                </div>
              )}
            </>}
        </div>

        <aside className="viewer-info">
          <p className="viewer-type">{workTypeLabels[work.type]}{work.date && ` · ${work.date}`}</p>
          <h2>{work.title}</h2>
          {work.subtitle && <p className="viewer-sub">{work.subtitle}</p>}
          {work.isDemo && !`${work.subtitle}${work.description}`.includes('示例') && <p className="viewer-demo">保利威官方示例视频，用于演示播放能力，不是本人作品。</p>}
          {work.description && <p className="viewer-desc">{work.description}</p>}
          {works.length > 1 && (
            <div className="viewer-nav">
              <button type="button" className="pill" onClick={() => go(-1)}><ChevronLeft size={16} aria-hidden="true" />上一件</button>
              <button type="button" className="pill" onClick={() => go(1)}>下一件<ChevronRight size={16} aria-hidden="true" /></button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
