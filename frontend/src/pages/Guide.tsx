import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Film, Search, Shuffle, Tv } from 'lucide-react';
import { Link, navigate } from '../router';
import { prefetch, useCreators } from '../store';
import { usingPreviewData } from '../api';
import { Ident, Img, Masthead, Notice, ch, identColor } from '../ui';
import type { CreatorSummary } from '../types';
import { formatTime } from '../format';

function Monitor({ creator }: { creator: CreatorSummary | null }) {
  const [frame, setFrame] = useState(0);
  const previews = creator?.previews ?? [];
  useEffect(() => {
    setFrame(0);
    if (previews.length < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => setFrame(f => (f + 1) % previews.length), 2200);
    return () => window.clearInterval(timer);
  }, [creator?.slug, previews.length]);

  if (!creator) return <div className="monitor monitor-empty"><Tv size={28} /><span>无信号</span></div>;
  return (
    <figure className="monitor" style={{ '--ident': identColor(creator.channel) } as React.CSSProperties}>
      <div className="monitor-screen" key={creator.slug}>
        {previews.length === 0 && <div className="monitor-blank">
          <Ident name={creator.profile.name} avatar={creator.profile.avatar} channel={creator.channel} size={96} />
        </div>}
        {previews[frame] && <Img src={previews[frame].cover} alt="" className="monitor-backdrop" />}
        {previews.map((p, i) => (
          <Img key={p.workId} src={p.cover} alt="" media={p} eager={i === 0}
            className={`monitor-frame is-${p.type}${i === frame ? ' is-on' : ''}`} />
        ))}
        <span className="monitor-osd">CH {ch(creator.channel)}</span>
        {creator.previewVideo && <span className="monitor-badge">
          <Film size={14} aria-hidden="true" />含影像{creator.previewVideo.seconds > 0 && ` · 精彩片段 ${formatTime(creator.previewVideo.seconds)}`}
        </span>}
        <div className="monitor-static" aria-hidden="true" />
      </div>
      <figcaption className="monitor-caption">
        <div>
          <p className="monitor-name">{creator.profile.name}<span>{creator.profile.alias}</span></p>
          <p className="monitor-bio">{creator.profile.bio || creator.profile.title}</p>
        </div>
        <Link to={`/${creator.slug}`} transition="tune" className="pill pill-signal">
          进入频道 <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </figcaption>
      {previews.length > 1 && (
        <div className="monitor-reel" aria-label="频道节目预览">
          {previews.map((p, i) => (
            <button type="button" key={p.workId} className={i === frame ? 'is-on' : ''} aria-label={`预览第 ${i + 1} 件`}
              onClick={() => setFrame(i)} onMouseEnter={() => setFrame(i)}>
              <Img src={p.cover} alt="" media={p} />
            </button>
          ))}
        </div>
      )}
    </figure>
  );
}

export default function Guide() {
  const { data, error, retry } = useCreators();
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState('');
  const [tuned, setTuned] = useState<string>('');
  const listRef = useRef<HTMLOListElement>(null);

  const tags = useMemo(() => {
    const count = new Map<string, number>();
    data?.forEach(c => c.profile.tags.forEach(t => count.set(t, (count.get(t) || 0) + 1)));
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  }, [data]);

  const shown = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return (data ?? []).filter(c => (!tag || c.profile.tags.includes(tag)) && (!term ||
      `${c.profile.name} ${c.profile.alias} ${c.profile.title} ${c.profile.tags.join(' ')}`.toLocaleLowerCase().includes(term)));
  }, [data, query, tag]);

  const current = shown.find(c => c.slug === tuned) ?? shown[0] ?? null;

  function surf() {
    const pool = (data ?? []).filter(c => c.slug !== current?.slug);
    const pick = pool[Math.floor(Math.random() * pool.length)] ?? current;
    if (pick) navigate(`/${pick.slug}`, { transition: 'tune' });
  }

  function onKey(event: React.KeyboardEvent) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const links = [...(listRef.current?.querySelectorAll<HTMLAnchorElement>('.epg-row') ?? [])];
    const index = links.indexOf(document.activeElement as HTMLAnchorElement);
    const next = links[Math.max(0, Math.min(links.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))];
    if (next) { event.preventDefault(); next.focus(); }
  }

  return (
    <div className="page guide">
      <Masthead>
        <label className="search">
          <Search size={16} aria-hidden="true" />
          <input type="search" placeholder="搜索大咖、头衔或领域" value={query}
            onChange={e => setQuery(e.target.value)} aria-label="搜索大咖" />
        </label>
      </Masthead>

      <div className="guide-body">
      <div className="guide-main">
      <section className="guide-intro">
        <div>
          <h1>每一位大咖，都是一个频道。</h1>
          <p>海报、照片和保利威里的视频，在这里成为可以被看见、被分享的作品集。</p>
        </div>
        <div className="guide-actions">
          <Link to="/tune" className="pill pill-signal"><Tv size={16} aria-hidden="true" />开始刷台</Link>
          <button type="button" className="pill" onClick={surf} disabled={!data?.length}>
            <Shuffle size={16} aria-hidden="true" />随便换台
          </button>
        </div>
      </section>

      {tags.length > 0 && (
        <div className="tags" role="group" aria-label="按领域筛选">
          <button type="button" className={`tag${tag === '' ? ' is-on' : ''}`} aria-pressed={tag === ''} onClick={() => setTag('')}>全部频道</button>
          {tags.map(t => <button type="button" key={t} className={`tag${tag === t ? ' is-on' : ''}`}
            aria-pressed={tag === t} onClick={() => setTag(tag === t ? '' : t)}>{t}</button>)}
        </div>
      )}

      {error && !data && <Notice title="节目表暂时无法加载" action={<button className="pill" type="button" onClick={retry}>重试</button>}>{error.message}</Notice>}
      {!data && !error && <div className="epg-skeleton" aria-busy="true">{[0, 1, 2, 3].map(i => <span key={i} />)}</div>}

      {data && (
          <div className="epg">
            <div className="epg-head" aria-hidden="true">
              <span>频道</span><span>大咖</span><span>领域</span><span>节目</span>
            </div>
            {shown.length === 0 && <Notice title="没有找到匹配的频道">换个关键词，或清除领域筛选。</Notice>}
            <ol className="epg-list" ref={listRef} onKeyDown={onKey}>
              {shown.map(c => (
                <li key={c.slug}>
                  <Link to={`/${c.slug}`} transition="tune"
                    className={`epg-row${current?.slug === c.slug ? ' is-tuned' : ''}`}
                    style={{ '--ident': identColor(c.channel) } as React.CSSProperties}
                    onMouseEnter={() => { setTuned(c.slug); prefetch(c.slug); }}
                    onFocus={() => { setTuned(c.slug); prefetch(c.slug); }}>
                    <span className="epg-ch">{ch(c.channel)}</span>
                    <span className="epg-who">
                      <Ident name={c.profile.name} avatar={c.profile.avatar} channel={c.channel} size={44} />
                      <span>
                        <span className="epg-name">{c.profile.name}<em>{c.profile.alias}</em></span>
                        <span className="epg-title">{c.profile.title}{c.isSample && <i className="sample">示例</i>}</span>
                      </span>
                    </span>
                    <span className="epg-tags">{c.profile.tags.slice(0, 3).map(t => <span key={t}>{t}</span>)}</span>
                    <span className="epg-strip">
                      {[0, 1, 2].map(i => c.previews[i]
                        ? <Img key={c.previews[i].workId} src={c.previews[i].cover} alt="" media={c.previews[i]} />
                        : <span key={i} className="epg-slot" />)}
                      <span className="epg-count">{c.previewVideo && <Film size={13} aria-label="含影像" />}{c.worksCount} 件</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </div>
      )}
      </div>
      <aside className="guide-monitor" aria-label="频道预览">
        <Monitor creator={data ? current : null} />
      </aside>
      </div>

      {usingPreviewData && <p className="dev-flag">前端预览数据：后端多大咖接口就绪后自动切换</p>}
    </div>
  );
}
