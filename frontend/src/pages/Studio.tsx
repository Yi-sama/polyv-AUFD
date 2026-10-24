import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ArrowDown, ArrowUp, Check, ExternalLink, Film, ImagePlus, LoaderCircle, LogOut, Plus, Save, Search, Star, Trash2, Upload, X,
} from 'lucide-react';
import { ApiError, logout, saveCreator, searchVideos, uploadImage } from '../api';
import { Link, navigate } from '../router';
import { invalidate, loadCreator, setSession, useSession } from '../store';
import { Ident, Img, Masthead, Notice, ch } from '../ui';
import { formatTime, parseTime } from '../format';
import { workTypeLabels } from '../types';
import type { Creator, VideoItem, VideoPage, Work, WorkType } from '../types';

const message = (e: unknown) => (e instanceof Error ? e.message : '操作未完成，请稍后重试。');
const newId = () => `w${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const blankWork = (type: WorkType, cover = ''): Work => ({
  id: newId(), type, title: '', subtitle: '', date: '', description: '', cover, images: cover ? [cover] : [],
  featured: false, videoId: '', isDemo: false, highlights: [],
});

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="field"><span>{label}{hint && <small>{hint}</small>}</span>{children}</label>;
}

function UploadButton({ label, multiple, disabled, onFiles, icon = <Upload size={16} aria-hidden="true" /> }: {
  label: string; multiple?: boolean; disabled?: boolean; onFiles: (files: File[]) => void; icon?: ReactNode;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return <>
    <input ref={ref} type="file" hidden accept="image/jpeg,image/png,image/webp" multiple={multiple}
      onChange={e => { const files = [...(e.target.files || [])]; e.target.value = ''; if (files.length) onFiles(files); }} />
    <button type="button" className="pill" disabled={disabled} onClick={() => ref.current?.click()}>{icon}{label}</button>
  </>;
}

function VideoPicker({ onPick, onClose }: { onPick: (item: VideoItem) => void; onClose: () => void }) {
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<VideoPage | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setBusy(true); setError('');
    searchVideos(keyword, page, controller.signal)
      .then(setResult, e => { if (!controller.signal.aborted) setError(message(e)); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, tick]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="picker-backdrop" role="dialog" aria-modal="true" aria-label="从保利威选择视频">
      <div className="picker">
        <header className="picker-head">
          <div>
            <p className="auth-kicker"><i className="tally" />保利威视频库</p>
            <h2>从保利威选入视频</h2>
            <p className="picker-lead">视频已经在保利威里，不用再上传一遍。选中后自动带入标题与时长。</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭"><X size={20} /></button>
        </header>
        <form className="picker-search" onSubmit={e => { e.preventDefault(); setPage(1); setTick(t => t + 1); }}>
          <label className="search"><Search size={16} aria-hidden="true" />
            <input type="search" value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="按标题搜索" aria-label="搜索视频" /></label>
          <button className="pill" type="submit">搜索</button>
        </form>
        <div className="picker-list" aria-busy={busy}>
          {busy && <p className="picker-state"><LoaderCircle className="spin" size={18} />正在读取保利威视频库…</p>}
          {!busy && error && <Notice title="视频库暂时不可用">{error}</Notice>}
          {!busy && !error && result?.items.length === 0 && <Notice title="没有找到视频">
            {keyword ? '换个关键词试试。' : '保利威账号里还没有视频，先在保利威后台上传一段。'}</Notice>}
          {!busy && !error && result?.items.map(item => (
            <button key={item.videoId} type="button" className="picker-item" disabled={!item.playable} onClick={() => onPick(item)}>
              <span className="picker-thumb">{item.cover ? <img src={item.cover} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <Film size={20} />}</span>
              <span className="picker-meta">
                <span className="picker-title">{item.title || item.videoId}</span>
                <span>{formatTime(item.duration)} · {item.playable ? '可播放' : '未发布，暂不可选'}{item.encrypted && ' · 加密'}</span>
              </span>
              {item.playable && <Plus size={18} aria-hidden="true" />}
            </button>
          ))}
        </div>
        {result && result.totalPages > 1 && (
          <footer className="picker-pages">
            <button type="button" className="pill" disabled={page <= 1 || busy} onClick={() => setPage(p => p - 1)}>上一页</button>
            <span>{page} / {result.totalPages}</span>
            <button type="button" className="pill" disabled={page >= result.totalPages || busy} onClick={() => setPage(p => p + 1)}>下一页</button>
          </footer>
        )}
      </div>
    </div>
  );
}

function WorkEditor({ work, media, onChange, onUpload, uploading, onPickVideo }: {
  work: Work; media: Creator['media']; uploading: boolean;
  onChange: (patch: Partial<Work>) => void; onUpload: (files: File[]) => Promise<string[]>; onPickVideo: () => void;
}) {
  const [time, setTime] = useState('');
  const [label, setLabel] = useState('');
  const [hlError, setHlError] = useState('');

  function addHighlight() {
    const seconds = parseTime(time);
    if (!label.trim()) { setHlError('请填写片段名称。'); return; }
    if (seconds === null) { setHlError('时间格式为 分:秒，例如 1:30。'); return; }
    onChange({ highlights: [...work.highlights, { title: label.trim(), seconds }].sort((a, b) => a.seconds - b.seconds) });
    setLabel(''); setTime(''); setHlError('');
  }

  return (
    <div className="work-editor">
      <div className="grid-2">
        <Field label="类型">
          <select value={work.type} onChange={e => onChange({ type: e.target.value as WorkType })}>
            {(['poster', 'photo', 'video'] as WorkType[]).map(t => <option key={t} value={t}>{workTypeLabels[t]}</option>)}
          </select>
        </Field>
        <Field label="日期" hint="可空"><input type="date" value={work.date} onChange={e => onChange({ date: e.target.value })} /></Field>
      </div>
      <Field label="标题"><input value={work.title} maxLength={80} onChange={e => onChange({ title: e.target.value })} /></Field>
      <Field label="副标题" hint="可空"><input value={work.subtitle} maxLength={80} onChange={e => onChange({ subtitle: e.target.value })} /></Field>
      <Field label="说明" hint="可空"><textarea rows={3} value={work.description} maxLength={1000} onChange={e => onChange({ description: e.target.value })} /></Field>

      {work.type === 'video' && (
        <div className="video-box">
          <div className="video-box-head">
            <span><Film size={16} aria-hidden="true" />保利威视频</span>
            <button type="button" className="pill pill-signal" onClick={onPickVideo}>从保利威选择</button>
          </div>
          <Field label="视频 VID"><input value={work.videoId} onChange={e => onChange({ videoId: e.target.value.trim() })} placeholder="选择后自动填入" /></Field>
          <div className="highlights">
            <p className="field-label">精彩片段 <small>访客点击即可跳到这里</small></p>
            {work.highlights.map((h, i) => (
              <div className="hl-row" key={`${i}-${h.seconds}`}>
                <span className="hl-time">{formatTime(h.seconds)}</span><span>{h.title}</span>
                <button type="button" className="icon-btn" aria-label={`删除片段 ${h.title}`}
                  onClick={() => onChange({ highlights: work.highlights.filter((_, j) => j !== i) })}><X size={16} /></button>
              </div>
            ))}
            <div className="hl-add">
              <input value={time} onChange={e => setTime(e.target.value)} placeholder="1:30" aria-label="片段时间" />
              <input value={label} onChange={e => setLabel(e.target.value)} placeholder="片段名称，例如“核心观点”" aria-label="片段名称" />
              <button type="button" className="pill" onClick={addHighlight}><Plus size={16} aria-hidden="true" />添加</button>
            </div>
            {hlError && <p className="form-error" role="alert">{hlError}</p>}
          </div>
        </div>
      )}

      <div className="images">
        <p className="field-label">{work.type === 'video' ? '封面' : '图片'} <small>{work.type === 'video' ? '视频播放前显示' : '第一张以外的图片会在详情中依次展示'}</small></p>
        <div className="image-grid">
          {work.images.map(src => (
            <figure key={src} className={src === work.cover ? 'is-cover' : ''}>
              <Img src={src} alt="" media={media} />
              <figcaption>
                {src === work.cover
                  ? <span className="cover-flag"><Check size={13} aria-hidden="true" />封面</span>
                  : <button type="button" onClick={() => onChange({ cover: src })}>设为封面</button>}
                <button type="button" aria-label="移除图片" onClick={() => {
                  const images = work.images.filter(x => x !== src);
                  onChange({ images, cover: work.cover === src ? images[0] || '' : work.cover });
                }}><Trash2 size={14} /></button>
              </figcaption>
            </figure>
          ))}
          <UploadButton label={uploading ? '上传中…' : '上传图片'} multiple disabled={uploading}
            icon={uploading ? <LoaderCircle className="spin" size={16} /> : <ImagePlus size={16} aria-hidden="true" />}
            onFiles={async files => {
              const urls = await onUpload(files);
              if (urls.length) onChange({ images: [...work.images, ...urls], cover: work.cover || urls[0] });
            }} />
        </div>
      </div>
    </div>
  );
}

export default function Studio() {
  const { session, ready } = useSession();
  const [draft, setDraft] = useState<Creator | null>(null);
  const [saved, setSaved] = useState('');
  const [loadError, setLoadError] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [picker, setPicker] = useState<null | { workId: string | null }>(null);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<{ tone: 'ok' | 'error'; text: string; conflict?: boolean } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (ready && !session) navigate('/login', { replace: true }); }, [ready, session]);

  function load(fresh = false) {
    if (!session) return;
    if (fresh) invalidate();
    setLoadError('');
    loadCreator(session.slug).then(c => { setDraft(c); setSaved(JSON.stringify(c)); }, e => setLoadError(message(e)));
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => load(), [session?.slug]);

  const dirty = draft !== null && JSON.stringify(draft) !== saved;
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  if (!ready || !session) return <div className="page"><Masthead /><div className="channel-skeleton" aria-busy="true" /></div>;
  if (loadError) return <div className="page"><Masthead /><Notice title="无法读取你的频道" action={<button type="button" className="pill" onClick={() => load(true)}>重试</button>}>{loadError}</Notice></div>;
  if (!draft) return <div className="page"><Masthead /><div className="channel-skeleton" aria-busy="true" /></div>;

  const p = draft.profile;
  const setProfile = (patch: Partial<Creator['profile']>) => setDraft(d => d && { ...d, profile: { ...d.profile, ...patch } });
  const setWork = (id: string, patch: Partial<Work>) =>
    setDraft(d => d && { ...d, works: d.works.map(w => (w.id === id ? { ...w, ...patch } : w)) });
  const move = (index: number, step: number) => setDraft(d => {
    if (!d) return d;
    const works = [...d.works]; const target = index + step;
    if (target < 0 || target >= works.length) return d;
    [works[index], works[target]] = [works[target], works[index]];
    return { ...d, works };
  });

  async function upload(files: File[]) {
    setUploading(true); setStatus(null);
    const urls: string[] = [];
    try {
      for (const file of files) {
        const r = await uploadImage(file);
        urls.push(r.url);
        setDraft(d => d && { ...d, media: { ...d.media, [r.url]: { width: r.width, height: r.height } } });
      }
    } catch (e) {
      setStatus({ tone: 'error', text: message(e) });
    } finally {
      setUploading(false);
    }
    return urls;
  }

  function pickVideo(item: VideoItem) {
    const target = picker?.workId;
    if (target) {
      const w = draft!.works.find(x => x.id === target);
      // Backend verifies and imports the exact Polyv cover on save, then returns a local copy.
      setWork(target, { videoId: item.videoId, type: 'video', title: w?.title || item.title,
        cover: item.cover || w?.cover || '', images: w?.images.length ? w.images : [] });
    } else {
      const work = { ...blankWork('video'), videoId: item.videoId, title: item.title, cover: item.cover || p.avatar, images: [] };
      setDraft(d => d && { ...d, works: [work, ...d.works] });
      setOpen(work.id);
    }
    setPicker(null);
  }

  async function save() {
    if (!draft) return;
    const problem = !p.name.trim() ? '请填写姓名。'
      : draft.works.find(w => !w.title.trim()) ? '每件作品都需要标题。'
      : draft.works.find(w => !w.cover) ? `“${draft.works.find(w => !w.cover)!.title || '未命名作品'}”还没有封面图片。`
      : draft.works.find(w => w.type === 'video' && !w.videoId) ? '视频作品需要选择保利威视频。' : '';
    if (problem) { setStatus({ tone: 'error', text: problem }); return; }
    setSaving(true); setStatus(null);
    try {
      const result = await saveCreator(draft);
      invalidate(result);
      setDraft(result); setSaved(JSON.stringify(result));
      setStatus({ tone: 'ok', text: '已保存，访客现在就能看到。' });
    } catch (e) {
      const conflict = e instanceof ApiError && e.status === 409;
      setStatus({ tone: 'error', conflict, text: conflict ? '频道已在别处更新（例如另一个窗口），为避免覆盖，本次没有保存。' : message(e) });
      if (e instanceof ApiError && e.status === 401) { setSession(null); }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page studio">
      <Masthead />
      <header className="studio-head">
        <div className="studio-who">
          <Ident name={p.name} avatar={p.avatar} channel={draft.channel} size={56} />
          <div>
            <p className="auth-kicker"><i className="tally" />编辑 CH {ch(draft.channel)}</p>
            <h1>{p.name || '我的频道'}</h1>
          </div>
        </div>
        <div className="studio-actions">
          <Link to={`/${draft.slug}`} className="pill"><ExternalLink size={16} aria-hidden="true" />查看我的频道</Link>
          <button type="button" className="pill" onClick={async () => { await logout(); setSession(null); navigate('/'); }}>
            <LogOut size={16} aria-hidden="true" />退出</button>
          <button type="button" className="pill pill-signal" onClick={save} disabled={saving || !dirty}>
            {saving ? <LoaderCircle className="spin" size={16} /> : <Save size={16} aria-hidden="true" />}{dirty ? '保存' : '已保存'}
          </button>
        </div>
      </header>
      {status && <div className={`studio-status is-${status.tone}`} role={status.tone === 'error' ? 'alert' : 'status'}>
        <span>{status.text}</span>
        {status.conflict && <button type="button" className="pill" onClick={() => { setStatus(null); load(true); }}>载入最新版本（放弃本次修改）</button>}
      </div>}

      <div className="studio-body">
        <section className="studio-panel">
          <h2>频道资料</h2>
          <div className="avatar-row">
            <Ident name={p.name} avatar={p.avatar} channel={draft.channel} size={72} />
            <UploadButton label="上传头像" disabled={uploading} onFiles={async files => {
              const [url] = await upload(files.slice(0, 1)); if (url) setProfile({ avatar: url, cover: p.cover || url });
            }} />
            {p.avatar && <button type="button" className="pill" onClick={() => setProfile({ avatar: '' })}>移除</button>}
          </div>
          <div className="grid-2">
            <Field label="姓名"><input value={p.name} maxLength={40} onChange={e => setProfile({ name: e.target.value })} /></Field>
            <Field label="英文名" hint="可空"><input value={p.alias} maxLength={40} onChange={e => setProfile({ alias: e.target.value })} /></Field>
          </div>
          <Field label="头衔"><input value={p.title} maxLength={40} placeholder="例如 直播运营讲师" onChange={e => setProfile({ title: e.target.value })} /></Field>
          <Field label="擅长领域" hint="用逗号分隔，最多 5 个">
            <input defaultValue={p.tags.join('，')} key={saved}
              onBlur={e => setProfile({ tags: [...new Set(e.target.value.split(/[,，、\s]+/).map(t => t.trim()).filter(Boolean))].slice(0, 5) })} />
          </Field>
          <Field label="一句话简介"><input value={p.bio} maxLength={120} onChange={e => setProfile({ bio: e.target.value })} /></Field>
          <Field label="详细介绍" hint="可空"><textarea rows={4} value={p.about} maxLength={2000} onChange={e => setProfile({ about: e.target.value })} /></Field>
          <Field label="公开联系方式" hint="邮箱或链接，可空"><input value={p.contact} maxLength={200} onChange={e => setProfile({ contact: e.target.value })} /></Field>
        </section>

        <section className="studio-panel">
          <div className="panel-head">
            <h2>节目单 <span>{draft.works.length}</span></h2>
            <div className="panel-actions">
              <button type="button" className="pill pill-signal" onClick={() => setPicker({ workId: null })}><Film size={16} aria-hidden="true" />添加保利威视频</button>
              <UploadButton label="添加图片作品" multiple disabled={uploading} icon={<ImagePlus size={16} aria-hidden="true" />}
                onFiles={async files => {
                  const urls = await upload(files);
                  if (!urls.length) return;
                  const work = { ...blankWork('photo', urls[0]), images: urls };
                  setDraft(d => d && { ...d, works: [work, ...d.works] });
                  setOpen(work.id);
                }} />
            </div>
          </div>
          {draft.works.length === 0 && <Notice title="还没有作品">上传海报或照片，或者直接从保利威选入一段视频。</Notice>}
          <ol className="work-list">
            {draft.works.map((w, i) => (
              <li key={w.id} className={open === w.id ? 'is-open' : ''}>
                <div className="work-row">
                  <button type="button" className="work-row-main" onClick={() => setOpen(open === w.id ? null : w.id)} aria-expanded={open === w.id}>
                    <span className="work-thumb">{w.cover ? <Img src={w.cover} alt="" media={draft.media} /> : <Film size={18} />}</span>
                    <span className="work-row-text">
                      <span className="work-row-title">{w.title || '未命名作品'}</span>
                      <span className="work-row-type">{workTypeLabels[w.type]}{w.isDemo && ' · 官方示例'}{w.highlights.length > 0 && ` · ${w.highlights.length} 个精彩片段`}</span>
                    </span>
                  </button>
                  <div className="work-row-tools">
                    <button type="button" className={`icon-btn${w.featured ? ' is-on' : ''}`} aria-pressed={w.featured}
                      title="设为代表作（频道首屏“正在播出”）" aria-label="设为代表作"
                      onClick={() => setDraft(d => d && { ...d, works: d.works.map(x => ({ ...x, featured: x.id === w.id ? !w.featured : false })) })}>
                      <Star size={16} /></button>
                    <button type="button" className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label="上移"><ArrowUp size={16} /></button>
                    <button type="button" className="icon-btn" disabled={i === draft.works.length - 1} onClick={() => move(i, 1)} aria-label="下移"><ArrowDown size={16} /></button>
                    <button type="button" className="icon-btn" aria-label="删除作品" onClick={() => {
                      if (confirm(`删除“${w.title || '未命名作品'}”？保存后生效。`)) setDraft(d => d && { ...d, works: d.works.filter(x => x.id !== w.id) });
                    }}><Trash2 size={16} /></button>
                  </div>
                </div>
                {open === w.id && <WorkEditor work={w} media={draft.media} uploading={uploading}
                  onChange={patch => setWork(w.id, patch)} onUpload={upload} onPickVideo={() => setPicker({ workId: w.id })} />}
              </li>
            ))}
          </ol>
        </section>
      </div>

      {picker && <VideoPicker onPick={pickVideo} onClose={() => setPicker(null)} />}
    </div>
  );
}
