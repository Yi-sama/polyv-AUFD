import { useEffect, useRef, useState } from 'react';
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight, Check, CircleAlert, Columns2, Copy,
  Film, List, LoaderCircle, Mail, Play, RotateCcw, Search, SlidersHorizontal, X,
} from 'lucide-react';
import { getHealth, getPortfolio } from './api';
import { filterWorks, imageList } from './portfolio-utils';
import { attribution, demoWorks, exhibitionWorks, getStory } from './demo-content';
import { workTypeLabels } from './types';
import type { Portfolio, Work } from './types';
import { Artwork, Modal, number, Tool } from './ui';
import ProjectView from './ProjectView';
import Studio from './Studio';

const readLocation = () => new URLSearchParams(location.hash.slice(1)).get('work');

function WorkCover({ work, eager = false }: { work: Work; eager?: boolean }) {
  return work.type === 'video'
    ? <div className="film-cover"><Film size={25} strokeWidth={1} /><span>POLYV<br /><strong>影像档案</strong></span><span className="play-symbol"><Play size={24} fill="currentColor" /></span></div>
    : <Artwork src={work.cover} alt={work.title} eager={eager} />;
}

export default function App() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [readOnly, setReadOnly] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'wall' | 'index'>('index');
  const [includeDemo, setIncludeDemo] = useState(true);
  const [selected, setSelected] = useState(readLocation);
  const [about, setAbout] = useState(false);
  const [toast, setToast] = useState('');
  const rail = useRef<HTMLDivElement>(null);
  const isStudio = location.pathname.replace(/\/$/, '') === '/studio';
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);

  useEffect(() => {
    const controller = new AbortController();
    setError('');
    void getPortfolio(controller.signal).then(setPortfolio).catch(cause => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '暂时无法读取作品集。');
    });
    void getHealth().then(health => { if (!controller.signal.aborted) setReadOnly(health.readOnly); }).catch(() => {});
    return () => controller.abort();
  }, [attempt]);
  useEffect(() => {
    const update = () => setSelected(readLocation());
    window.addEventListener('popstate', update);
    window.addEventListener('hashchange', update);
    return () => { window.removeEventListener('popstate', update); window.removeEventListener('hashchange', update); };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (portfolio) document.title = `${portfolio.profile.name}的作品 | AUFD`;
  }, [portfolio]);

  function openWork(id: string, replace = false) {
    const hash = `#${new URLSearchParams({ work: id })}`;
    if (replace) history.replaceState(history.state, '', hash);
    else history.pushState({ galleryFocus: true }, '', hash);
    setSelected(id);
  }
  function closeWork() {
    if (history.state?.galleryFocus) history.back();
    else { history.replaceState(null, '', location.pathname + location.search); setSelected(null); }
  }
  async function share() {
    try { await navigator.clipboard.writeText(location.href); setToast('链接已复制'); }
    catch { setToast('复制未成功，请从浏览器地址栏复制链接。'); }
  }
  function scrollFeatured(direction: number) {
    const element = rail.current;
    if (element) element.scrollBy({
      left: direction * element.clientWidth * .85,
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    });
  }

  if (!portfolio) return <main className="load-page">
    <span className="wordmark">AUFD<span className="brand-dot" /></span>
    {error ? <><CircleAlert size={30} /><h1>作品集暂未打开</h1><p role="alert">{error}</p>
      <button className="text-command" onClick={() => setAttempt(value => value + 1)}><RotateCcw size={17} />重新加载</button></>
      : <><LoaderCircle className="spinner" size={28} /><p role="status">正在打开作品集</p></>}
  </main>;

  if (isStudio) return <Studio portfolio={portfolio} readOnly={readOnly || !local} onSaved={setPortfolio}
    onClose={() => location.assign('/')} />;

  const allWorks = exhibitionWorks(portfolio.works);
  const visibleWorks = includeDemo ? allWorks : allWorks.filter(work => !work.isDemo);
  const works = filterWorks(visibleWorks, filter, query);
  const originals = portfolio.works.filter(item => !item.isDemo);
  const featured = visibleWorks.filter(work => work.featured).slice(0, 3);
  const work = allWorks.find(item => item.id === selected);
  const video = visibleWorks.find(item => item.videoId);
  const topic = visibleWorks.find(item => item === demoWorks[2]);
  const { profile } = portfolio;
  return <>
    <a href="#archive" className="skip-link">跳到作品索引</a>
    <header className="site-header">
      <a className="wordmark" href="/" aria-label="AUFD 作品集首页">AUFD<span className="brand-dot" /></a>
      <span className="header-caption">个人作品集<span>PORTFOLIO</span></span>
      <nav aria-label="主页导航">
        <a href="#selected">精选</a><a href="#archive">全部作品</a>
        <button onClick={() => setAbout(true)}>关于</button>
      </nav>
      <Tool label="复制作品集链接" onClick={() => void share()}><Copy size={18} /></Tool>
    </header>
    <main>
      <section className="identity page-width">
        <div><p className="eyebrow">A PERSONAL COLLECTION / 2026</p>
          <h1>{profile.name}<span>{profile.alias}</span></h1></div>
        <div className="identity-note"><p>{profile.bio}</p><a href="#selected" className="text-command">作品在这里<ArrowDown size={17} /></a></div>
      </section>
      <section id="selected" className="selected-section page-width">
        <div className="section-heading"><h2>精选作品<span>SELECTED WORK</span></h2>
          <div className="tools rail-tools">
            <Tool label="向前浏览精选" onClick={() => scrollFeatured(-1)}><ArrowLeft size={18} /></Tool>
            <Tool label="向后浏览精选" onClick={() => scrollFeatured(1)}><ArrowRight size={18} /></Tool>
          </div><span className="section-number">{number(featured.length)} PROJECTS</span>
        </div>
        <div ref={rail} className={`featured-grid ${featured.length < 3 ? 'compact-featured' : ''}`}>
          {featured.map((item, index) => <article className={`featured-work feature-${index + 1}`} key={item.id}>
            <div className="feature-top"><span>{number(index + 1)}</span><span>{attribution(item) || '个人作品'}</span></div>
            <button className="featured-image" aria-label={`查看 ${item.title}`} onClick={() => openWork(item.id)}>
              <WorkCover work={item} eager />
              <span className="image-expand"><ArrowUpRight size={22} /></span>
            </button>
            <div className="feature-caption"><p className="eyebrow">{getStory(item)?.english || `PROJECT / ${workTypeLabels[item.type]}`}</p>
              <button className="work-title" onClick={() => openWork(item.id)}>{item.title}<ArrowUpRight size={19} /></button>
              <p className="feature-type">{item.subtitle}<span>{number(imageList(item).length)} 幅图像</span></p>
            </div>
            {index === 1 && <p className="feature-excerpt">{item.description}</p>}
          </article>)}
        </div>
        {!featured.length && <p className="empty-featured">精选作品正在整理中。</p>}
        <div className="selection-footnote"><span>作品、片段，以及背后的故事。</span><a href="#archive">完整索引<ArrowDown size={15} /></a></div>
      </section>

      {topic && <section className="story-band" aria-label="专题：对话，仍在继续">
        <div className="page-width story-band-inner">
          <div className="story-band-heading"><p className="eyebrow">PHOTO ESSAY / 演示专题</p>
            <h2>对话，<br />仍在继续<span>After the talk.</span></h2>
            <p>{topic.description}</p>
            <button className="text-command" onClick={() => openWork(topic.id)}>打开专题<ArrowUpRight size={21} /></button>
          </div>
          <button className="story-band-photo" onClick={() => openWork(topic.id)} aria-label="查看 对话，仍在继续">
            <Artwork src={topic.cover} alt="Product School 活动幕后的交流场景" />
            <span>摄影 / Product School · 演示素材<ArrowUpRight size={18} /></span>
          </button>
          <div className="story-band-note"><span>02 FRAMES</span><span>关于表达，也关于相遇。</span></div>
        </div>
      </section>}

      <section id="archive" className="archive-section page-width">
        <div className="section-heading"><h2>作品索引<span>THE COLLECTION</span></h2>
          <label className="demo-toggle"><input type="checkbox" checked={includeDemo} onChange={event => setIncludeDemo(event.target.checked)} />包含演示内容</label></div>
        <div className="collection-toolbar">
          <div className="filters" role="group" aria-label="筛选作品">
            {(['all', 'poster', 'photo', 'video'] as const).map(type => <button key={type} aria-pressed={filter === type} onClick={() => setFilter(type)}>
              {type === 'all' ? '全部' : workTypeLabels[type]}<sup>{number(visibleWorks.filter(work => type === 'all' || work.type === type).length)}</sup>
            </button>)}
          </div>
          <div className="toolbar-end">
            <label className="search-field"><Search size={17} /><input type="search" placeholder="寻找作品"
              aria-label="搜索作品" value={query} onChange={event => setQuery(event.target.value)} /></label>
            <div className="view-toggle" role="group" aria-label="浏览方式">
              <Tool label="展墙视图" aria-pressed={view === 'wall'} onClick={() => setView('wall')}><Columns2 size={18} /></Tool>
              <Tool label="索引视图" aria-pressed={view === 'index'} onClick={() => setView('index')}><List size={19} /></Tool>
            </div>
          </div>
        </div>
        {!works.length ? <div className="empty-state"><Search size={28} /><h3>没有找到作品</h3>
          <p>{query ? `没有与“${query}”匹配的内容。` : '这个分类暂时为空。'}</p>
          <button className="text-command" onClick={() => { setFilter('all'); setQuery(''); }}>查看全部<ArrowRight size={17} /></button></div>
          : <div className={`works-${view}`} aria-label="作品列表">
            {works.map((item, index) => <article key={item.id} className={`exhibit exhibit-${item.type}`}>
              <span className="exhibit-number">{number(index + 1)}</span>
              <button className="artwork-button" aria-label={`打开 ${item.title}`} onClick={() => openWork(item.id)}><WorkCover work={item} /></button>
              <div className="exhibit-label"><button className="work-title" onClick={() => openWork(item.id)}>{item.title}<ArrowUpRight size={20} /></button>
                <p>{item.subtitle || workTypeLabels[item.type]}<span>{getStory(item) ? `${imageList(item).length} 幅图像` : item.date?.slice(0, 4)}</span></p></div>
              <span className={`exhibit-status ${attribution(item) ? 'is-demo' : ''}`}>{attribution(item) || '个人作品'}</span>
              <span className="exhibit-category">{workTypeLabels[item.type]}</span>
            </article>)}
          </div>}
        <p className="archive-footnote">{originals.length} 件个人作品{includeDemo && ' · 授权图片专题与官方视频均已标注为演示内容'}</p>
      </section>

      {video && <section className="film-section">
        <div className="page-width film-inner">
          <div className="film-copy"><p className="eyebrow">MOTION / POWERED BY POLYV</p><h2>有些表达，<br />值得按下播放。</h2>
            <p>{video.isDemo ? '保利威官方播放示例，非个人作品。' : video.subtitle}</p></div>
          <button className="film-entry" aria-label={`播放 ${video.title}`} onClick={() => openWork(video.id)}>
            <span className="film-entry-top"><Film size={21} /><span>{video.isDemo ? 'OFFICIAL SAMPLE' : 'MOVING IMAGE'}</span></span>
            <span className="film-play"><Play size={33} fill="currentColor" strokeWidth={1} /></span>
            <span className="film-entry-bottom"><span>{video.title}</span><ArrowUpRight size={24} /></span>
          </button>
        </div>
      </section>}

      <section className="contact-section page-width" id="contact">
        <div><p className="eyebrow">THE PERSON BEHIND THE WORK</p><h2>下一次，<br />一起创造点什么。</h2>
          {profile.email && <a className="contact-email" href={`mailto:${profile.email}`}>{profile.email}<ArrowUpRight size={25} /></a>}</div>
        <div className="contact-person"><p className="signature">{profile.alias || profile.name}</p><h3>{profile.name}</h3><p>{profile.bio}</p>
          <button className="text-command" onClick={() => setAbout(true)}>关于我<ArrowUpRight size={17} /></button></div>
      </section>
    </main>
    <footer className="site-footer"><span>AUFD / 让作品被看见</span><div><span>视频由保利威点播提供</span>
      <a href="/demo-media/SOURCES.md" target="_blank" rel="noreferrer">素材来源<ArrowUpRight size={12} /></a>
      {local && <a href="/studio"><SlidersHorizontal size={13} />工作室</a>}</div></footer>

    {selected && (work ? <ProjectView work={work} works={allWorks} video={portfolio.works.find(item => item.type === 'video' && item.isDemo)}
      onSelect={openWork} onClose={closeWork} onShare={() => void share()} notice={toast} />
      : <Modal label="作品不存在" onClose={closeWork} className="about-dialog"><Tool label="关闭" onClick={closeWork}><X /></Tool>
        <h2>这件作品已不在作品集中</h2><button className="text-command" onClick={closeWork}>返回作品集<ArrowRight size={17} /></button></Modal>)}
    {about && <Modal label="关于作者" onClose={() => setAbout(false)} className="about-dialog">
      <div className="about-top"><span className="eyebrow">ABOUT THE CREATOR</span><Tool label="关闭关于作者" onClick={() => setAbout(false)}><X size={22} /></Tool></div>
      <h2>{profile.name}<span>{profile.alias}</span></h2><p className="about-role">{profile.role}</p>
      <p className="about-bio">{profile.bio}</p><p className="about-copy">{profile.about}</p>
      {profile.email && <a className="text-command" href={`mailto:${profile.email}`}><Mail size={18} />{profile.email}<ArrowUpRight size={16} /></a>}
    </Modal>}
    {toast && !selected && <div className="toast" role="status"><Check size={17} />{toast}</div>}
  </>;
}
