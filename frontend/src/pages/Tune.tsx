import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { ArrowRight, ChevronDown, ChevronUp, Film, X } from 'lucide-react';
import { Link, navigate, useLocation } from '../router';
import { prefetch, useCreators } from '../store';
import { Ident, Img, Notice, ch, identColor } from '../ui';

/** 刷台：full-screen vertical feed — swipe (or ↑/↓) through channels like short videos. */
export default function Tune() {
  const { data, error, retry } = useCreators();
  const { query } = useLocation();
  const feedRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const feed = feedRef.current;
    if (!feed || !data?.length) return;
    const start = Math.max(0, data.findIndex(c => c.slug === query.get('from')));
    feed.children[start]?.scrollIntoView({ block: 'start' });
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const i = Number((entry.target as HTMLElement).dataset.index);
          setActive(i);
          prefetch(data[i].slug);
        }
      });
    }, { root: feed, threshold: 0.6 });
    [...feed.children].forEach(child => observer.observe(child));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const step = (delta: number) => {
    const feed = feedRef.current;
    if (!feed || !data) return;
    const next = Math.max(0, Math.min(data.length - 1, active + delta));
    feed.children[next]?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown' || event.key === 'PageDown' || event.key === 'j') { event.preventDefault(); step(1); }
      if (event.key === 'ArrowUp' || event.key === 'PageUp' || event.key === 'k') { event.preventDefault(); step(-1); }
      if (event.key === 'Escape') navigate('/');
      if (event.key === 'Enter' && data?.[active]) navigate(`/${data[active].slug}`, { transition: 'tune' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (error && !data) return <div className="page"><Notice title="暂时无法刷台" action={<button className="pill" type="button" onClick={retry}>重试</button>}>{error.message}</Notice></div>;
  if (!data) return <div className="tune" aria-busy="true" />;

  return (
    <div className="tune">
      <div className="tune-top">
        <Link to="/" className="icon-btn" aria-label="回到节目表（Esc）" title="回到节目表（Esc）"><X size={22} /></Link>
      </div>

      <div className="tune-feed" ref={feedRef} tabIndex={-1}>
        {data.map((c, i) => {
          const cover = c.previews[0];
          return (
            <section key={c.slug} className={`tune-slide${i === active ? ' is-active' : ''}`} data-index={i}
              style={{ '--ident': identColor(c.channel) } as CSSProperties} aria-label={`CH ${ch(c.channel)} ${c.profile.name}`}>
              {cover && <Img src={cover.cover} alt="" media={cover} className="tune-backdrop" eager={Math.abs(i - active) < 2} />}
              <div className="tune-art">
                {cover
                  ? <Img src={cover.cover} alt={`${c.profile.name} 的代表作`} media={cover} eager={Math.abs(i - active) < 2} />
                  : <Ident name={c.profile.name} avatar={c.profile.avatar} channel={c.channel} size={160} />}
              </div>
              <div className="tune-card">
                <span className="tune-ch">{ch(c.channel)}</span>
                <h2>{c.profile.name}<span>{c.profile.alias}</span></h2>
                <p className="tune-title">{c.profile.title}{c.isSample && <i className="sample">示例</i>}</p>
                {c.profile.tags.length > 0 && <p className="station-tags">{c.profile.tags.map(t => <span key={t}>{t}</span>)}</p>}
                {c.profile.bio && <p className="tune-bio">{c.profile.bio}</p>}
                <div className="tune-row">
                  <Link to={`/${c.slug}`} transition="tune" className="pill pill-signal">进入频道<ArrowRight size={16} aria-hidden="true" /></Link>
                  <span className="tune-meta">{c.worksCount} 件作品{c.previewVideo && <><Film size={13} aria-hidden="true" />含影像</>}</span>
                </div>
                {(() => {
                  const rest = c.previews.filter((p, k, all) => p.cover !== cover?.cover && all.findIndex(x => x.cover === p.cover) === k).slice(0, 4);
                  return rest.length > 0 && <div className="tune-strip">{rest.map(p => <Img key={p.workId} src={p.cover} alt="" media={p} />)}</div>;
                })()}
              </div>
            </section>
          );
        })}
      </div>

      <nav className="tune-rail" aria-label="频道">
        <button type="button" className="icon-btn" onClick={() => step(-1)} disabled={active === 0} aria-label="上一台（↑）"><ChevronUp size={20} /></button>
        <ol>{data.map((c, i) => (
          <li key={c.slug}><button type="button" className={i === active ? 'is-on' : ''} aria-current={i === active}
            onClick={() => feedRef.current?.children[i]?.scrollIntoView({ behavior: 'smooth' })}
            style={{ '--ident': identColor(c.channel) } as CSSProperties}>{ch(c.channel)}</button></li>
        ))}</ol>
        <button type="button" className="icon-btn" onClick={() => step(1)} disabled={active === data.length - 1} aria-label="下一台（↓）"><ChevronDown size={20} /></button>
      </nav>
      <p className="tune-hint" aria-hidden="true">上下滑动换台</p>
    </div>
  );
}
