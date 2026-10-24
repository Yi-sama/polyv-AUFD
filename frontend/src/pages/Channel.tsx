import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Film, LayoutList, Mail, Pencil, Play, Share2 } from 'lucide-react';
import { Link, navigate } from '../router';
import { prefetch, useCreator, useCreators, useSession } from '../store';
import { ownWorks } from '../api';
import { Ident, Img, Masthead, Notice, ch, identColor } from '../ui';
import { workTypeLabels } from '../types';
import type { Creator, Work, WorkType } from '../types';
import WorkView from './WorkView';

const vtName = (id: string) => `w-${id}`;

function share(creator: Creator, setToast: (t: string) => void) {
  const url = `${location.origin}/${creator.slug}`;
  const text = `${creator.profile.name} 的作品频道 · AUFD`;
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    navigator.share({ title: text, url }).catch(() => undefined);
    return;
  }
  navigator.clipboard?.writeText(url).then(() => setToast('频道链接已复制'), () => setToast(url));
}

function Feature({ creator, work, hidden }: { creator: Creator; work: Work; hidden: boolean }) {
  return (
    <Link to={`/${creator.slug}/w/${work.id}`} transition="open" className="feature" aria-label={`打开 ${work.title}`}>
      <Img src={work.cover} alt={work.title} media={creator.media} eager className="feature-img"
        style={hidden ? undefined : { viewTransitionName: vtName(work.id) } as CSSProperties} />
      {work.type === 'video' && <span className="feature-play"><Play size={22} aria-hidden="true" /></span>}
      <span className="feature-caption">
        <span>{work.title}</span>
        <span>{workTypeLabels[work.type]}{work.highlights.length > 0 && ` · ${work.highlights.length} 个精彩片段`}</span>
      </span>
    </Link>
  );
}

export default function Channel({ slug, workId }: { slug: string; workId: string | null }) {
  const { data: creator, error, retry } = useCreator(slug);
  const { data: list } = useCreators();
  const { session } = useSession();
  const [type, setType] = useState<WorkType | 'all'>('all');
  const [toast, setToast] = useState('');

  const neighbours = useMemo(() => {
    if (!list?.length) return { prev: null, next: null };
    const index = list.findIndex(c => c.slug === slug);
    if (index < 0) return { prev: null, next: list[0] };
    return { prev: list[(index - 1 + list.length) % list.length], next: list[(index + 1) % list.length] };
  }, [list, slug]);

  useEffect(() => {
    if (neighbours.prev) prefetch(neighbours.prev.slug);
    if (neighbours.next) prefetch(neighbours.next.slug);
  }, [neighbours]);

  useEffect(() => { setType('all'); }, [slug]);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(''), 2200);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (workId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      const target = event.key === 'ArrowRight' ? neighbours.next : event.key === 'ArrowLeft' ? neighbours.prev : null;
      if (target && target.slug !== slug) navigate(`/${target.slug}`, { transition: 'tune' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [neighbours, slug, workId]);

  useEffect(() => {
    if (creator) document.title = `${creator.profile.name} · CH ${ch(creator.channel)} · AUFD`;
  }, [creator]);

  if (error && !creator) {
    const missing = 'status' in error && (error as { status: number }).status === 404;
    return <div className="page"><Masthead />
      <Notice title={missing ? '没有这个频道' : '频道暂时无法加载'}
        action={missing ? <Link className="pill" to="/">回到节目表</Link> : <button className="pill" type="button" onClick={retry}>重试</button>}>
        {missing ? '链接可能有误，或这位大咖还没有入驻。' : error.message}
      </Notice></div>;
  }
  if (!creator) return <div className="page"><Masthead /><div className="channel-skeleton" aria-busy="true" /></div>;

  const { profile } = creator;
  const works = creator.works;
  const types = [...new Set(works.map(w => w.type))];
  const shown = type === 'all' ? works : works.filter(w => w.type === type);
  const feature = works.find(w => w.featured) ?? works[0];
  const owner = session?.slug === creator.slug;
  const count = ownWorks(works).length;
  const videos = works.filter(w => w.type === 'video').length;
  const ident = { '--ident': identColor(creator.channel) } as CSSProperties;

  return (
    <div className="page channel" style={ident}>
      <Masthead>
        <div className="rocker" aria-label="换台">
          {neighbours.prev && <Link to={`/${neighbours.prev.slug}`} transition="tune" className="rocker-btn" title="上一台（←）">
            <ChevronLeft size={16} aria-hidden="true" /><span>CH {ch(neighbours.prev.channel)}</span>
          </Link>}
          <span className="rocker-now">CH {ch(creator.channel)}</span>
          {neighbours.next && <Link to={`/${neighbours.next.slug}`} transition="tune" className="rocker-btn" title="下一台（→）">
            <span>CH {ch(neighbours.next.channel)}</span><ChevronRight size={16} aria-hidden="true" />
          </Link>}
        </div>
      </Masthead>

      <span className="osd" key={creator.slug} aria-hidden="true">CH {ch(creator.channel)}<small>{profile.name}</small></span>

      <section className="broadcast" aria-label={`${profile.name} 的频道`}>
        {feature?.cover && <Img src={feature.cover} alt="" className="broadcast-backdrop" eager />}
        <div className="broadcast-art">
          {feature
            ? <Feature creator={creator} work={feature} hidden={workId === feature.id} />
            : <div className="feature-empty"><Film size={28} /><span>这个频道还没有节目</span>
              {owner && <Link to="/studio" className="pill">添加第一件作品</Link>}</div>}
        </div>
        <span className="bug"><b>CH {ch(creator.channel)}</b><span><i className="tally" />{feature ? '正在播出' : '待开播'}</span></span>
        <div className="lower-third">
          <div className="station-id">
            <Ident name={profile.name} avatar={profile.avatar} channel={creator.channel} size={60} />
            <div>
              <h1>{profile.name}{profile.alias && <span>{profile.alias}</span>}</h1>
              <p className="station-title">{profile.title}{creator.isSample && <i className="sample">示例大咖</i>}</p>
            </div>
          </div>
          {profile.bio && <p className="station-bio">{profile.bio}</p>}
          <p className="station-tags">
            {profile.tags.map(t => <span key={t}>{t}</span>)}
            <span className="station-count">{count} 件作品{videos > 0 && ` · ${videos} 段影像`}</span>
          </p>
          <div className="station-actions">
            <button type="button" className="pill pill-signal" onClick={() => share(creator, setToast)}>
              <Share2 size={16} aria-hidden="true" />分享频道
            </button>
            {profile.contact && (/^\S+@\S+$/.test(profile.contact)
              ? <a className="pill" href={`mailto:${profile.contact}`}><Mail size={16} aria-hidden="true" />联系</a>
              : <span className="pill pill-static">{profile.contact}</span>)}
            {owner && <Link to="/studio" className="pill"><Pencil size={16} aria-hidden="true" />编辑我的频道</Link>}
          </div>
        </div>
      </section>

      {works.length > 0 && (
        <section className="programme" aria-labelledby="programme-title">
          <div className="programme-head">
            <h2 id="programme-title">节目单 <span>{shown.length}</span></h2>
            {types.length > 1 && (
              <div className="tabs" role="group" aria-label="按类型筛选">
                {(['all', ...types] as const).map(t => (
                  <button key={t} type="button" aria-pressed={type === t} className={`tab${type === t ? ' is-on' : ''}`}
                    onClick={() => setType(t)}>{t === 'all' ? '全部' : workTypeLabels[t]}</button>
                ))}
              </div>
            )}
          </div>
          <ol className="wall">
            {shown.map(work => {
              const index = works.indexOf(work) + 1;
              return (
                <li key={work.id} className={`wall-item wall-${work.type}`}>
                  <Link to={`/${creator.slug}/w/${work.id}`} transition="open" className="wall-link">
                    <span className="wall-media">
                      <Img src={work.cover} alt={work.title} media={creator.media}
                        style={workId === work.id || work === feature
                          ? undefined : { viewTransitionName: vtName(work.id) } as CSSProperties} />
                      {work.type === 'video' && <span className="wall-play"><Play size={18} aria-hidden="true" /></span>}
                    </span>
                    <span className="wall-caption">
                      <span className="wall-no">{String(index).padStart(2, '0')}</span>
                      <span className="wall-title">{work.title}</span>
                      <span className="wall-type">{workTypeLabels[work.type]}{work.isDemo && ' · 官方示例'}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {profile.about && (
        <section className="about">
          <h2>关于 {profile.name}</h2>
          <p>{profile.about}</p>
        </section>
      )}

      {neighbours.next && neighbours.next.slug !== slug && (
        <Link to={`/${neighbours.next.slug}`} transition="tune" className="next-channel"
          style={{ '--ident': identColor(neighbours.next.channel) } as CSSProperties}>
          <span className="next-label">下一台</span>
          <span className="next-ch">CH {ch(neighbours.next.channel)}</span>
          <span className="next-name">{neighbours.next.profile.name}<em>{neighbours.next.profile.title}</em></span>
          <ArrowRight size={28} aria-hidden="true" />
        </Link>
      )}

      <nav className="mobile-rocker" aria-label="换台">
        {neighbours.prev ? <Link to={`/${neighbours.prev.slug}`} transition="tune"><ArrowLeft size={18} aria-hidden="true" />上一台</Link> : <span />}
        <Link to="/"><LayoutList size={18} aria-hidden="true" />节目表</Link>
        {neighbours.next ? <Link to={`/${neighbours.next.slug}`} transition="tune">下一台<ArrowRight size={18} aria-hidden="true" /></Link> : <span />}
      </nav>

      {toast && <p className="toast" role="status">{toast}</p>}

      {workId && <WorkView creator={creator} workId={workId} />}
    </div>
  );
}
