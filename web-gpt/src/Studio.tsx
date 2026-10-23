import { useEffect, useRef, useState } from 'react';
import type { ButtonHTMLAttributes, FormEvent } from 'react';
import {
  ArrowDown, ArrowLeft, ArrowUp, Camera, Check, ChevronLeft, ChevronRight,
  Download, Eye, Film, Image as ImageIcon, LoaderCircle, Plus, RotateCcw, Save, Search, Star, Trash2,
  Upload, UserRound,
} from 'lucide-react';
import { ApiError, getPortfolio, savePortfolio, searchVideos, uploadImage } from './api';
import { formatTime, moveWork } from './portfolio-utils';
import { workTypeLabels } from './types';
import type { Portfolio, VideoItem, VideoPage, Work } from './types';
import { decodeDraft, draftKey, draftSnapshot, encodeDraft, localImage, validateDraft } from './studio-state';
import ProjectView from './ProjectView';
import './studio.css';

interface StudioProps {
  portfolio: Portfolio;
  readOnly: boolean;
  onSaved: (data: Portfolio) => void;
  onClose: () => void;
}

const MAX_WORKS = 40;
const MAX_IMAGES = 20;
const MAX_HIGHLIGHTS = 12;
const typeIcons = { poster: ImageIcon, photo: Camera, video: Film };
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : '操作未完成，请稍后重试。';

function IconButton({ label, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
}) {
  return (
    <button {...props} type="button" className={`studio-icon-button ${props.className || ''}`}
      title={label} aria-label={label}>
      {children}
    </button>
  );
}

function UploadButton({ label, disabled, multiple = false, onFiles }: {
  label: string;
  disabled: boolean;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input ref={input} className="studio-file-input" type="file" accept="image/jpeg,image/png,image/webp"
        aria-label={label} disabled={disabled} multiple={multiple} onChange={event => {
          const files = Array.from(event.target.files || []);
          event.target.value = '';
          if (files.length) onFiles(files);
        }} />
      <button type="button" className="studio-button" title={label} aria-label={label}
        disabled={disabled} onClick={() => input.current?.click()}>
        <Upload size={16} aria-hidden="true" />{label}
      </button>
    </>
  );
}

function ImageField({ label, value, disabled, onChange, onFiles }: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onFiles: (files: File[]) => void;
}) {
  return (
    <div className="studio-image-field">
      <div className="studio-image-preview">
        {localImage(value)
          ? <img src={value} alt={label} />
          : <ImageIcon size={24} aria-hidden="true" />}
      </div>
      <div className="studio-image-controls">
        <label className="studio-field">
          <span>{label}</span>
          <input value={value} disabled={disabled} onChange={event => onChange(event.target.value)}
            placeholder="/uploads/..." spellCheck={false} required />
        </label>
        <UploadButton label={`上传${label}`} disabled={disabled} onFiles={onFiles} />
      </div>
    </div>
  );
}

export default function Studio({ portfolio, readOnly, onSaved, onClose }: StudioProps) {
  const [draft, setDraft] = useState<Portfolio>(() => structuredClone(portfolio));
  const [baseline, setBaseline] = useState(() => draftSnapshot(portfolio));
  const [recovery, setRecovery] = useState(() => {
    try {
      const cached = decodeDraft(sessionStorage.getItem(draftKey(portfolio.slug)), portfolio.slug);
      return cached && draftSnapshot(cached) !== draftSnapshot(portfolio) ? cached : null;
    } catch { return null; }
  });
  const [storageError, setStorageError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [preview, setPreview] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<'upload' | 'save' | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [query, setQuery] = useState('');
  const [videos, setVideos] = useState<VideoPage | null>(null);
  const [searchedQuery, setSearchedQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const mounted = useRef(true);
  const leaving = useRef(false);
  const operation = useRef<'upload' | 'save' | null>(null);
  const searchController = useRef<AbortController | null>(null);
  const selection = useRef<string | null>(null);
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;
  const dirty = draftSnapshot(draft) !== baseline;
  const disabled = readOnly || busy !== null || recovery !== null;
  const work = draft.works.find(item => item.id === selectedId);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      searchController.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!dirty && !busy) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (leaving.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty, busy]);

  useEffect(() => {
    if (readOnly) {
      searchController.current?.abort();
      setSearching(false);
    }
  }, [readOnly]);

  useEffect(() => {
    if (readOnly || recovery) return;
    try {
      if (dirty) sessionStorage.setItem(draftKey(draft.slug), encodeDraft(draft));
      else sessionStorage.removeItem(draftKey(draft.slug));
      setStorageError('');
    } catch {
      setStorageError('浏览器无法备份草稿。请保存或导出后再离开页面。');
    }
  }, [draft, dirty, readOnly, recovery]);

  function selectPanel(id: string | null) {
    searchController.current?.abort();
    searchController.current = null;
    selection.current = id;
    setSelectedId(id);
    setQuery('');
    setVideos(null);
    setSearching(false);
    setSearchError('');
  }

  function edit(change: (current: Portfolio) => Portfolio) {
    if (readOnlyRef.current || operation.current || recovery) return;
    setDraft(change);
    setError('');
    setSuccess('');
  }

  function updateProfile(patch: Partial<Portfolio['profile']>) {
    edit(current => ({ ...current, profile: { ...current.profile, ...patch } }));
  }

  function updateWork(id: string, patch: Partial<Work>) {
    edit(current => ({
      ...current, works: current.works.map(item => item.id === id ? { ...item, ...patch } : item),
    }));
  }

  function addWork() {
    if (readOnlyRef.current || operation.current || draft.works.length >= MAX_WORKS) return;
    const next: Work = {
      id: crypto.randomUUID(), type: 'photo', title: '', subtitle: '', date: '',
      description: '', cover: '', images: [], featured: false, videoId: '',
      isDemo: false, highlights: [],
    };
    edit(current => current.works.length < MAX_WORKS
      ? { ...current, works: [...current.works, next] } : current);
    selectPanel(next.id);
  }

  function removeWork(id: string) {
    if (readOnlyRef.current || operation.current) return;
    const item = draft.works.find(entry => entry.id === id);
    if (!item || !window.confirm(`移除「${item.title || '未命名作品'}」？保存后生效。`)) return;
    edit(current => ({ ...current, works: current.works.filter(entry => entry.id !== id) }));
    if (selectedId === id) selectPanel(null);
  }

  async function upload(files: File[], target: 'avatar' | 'profileCover' | 'cover' | 'images', workId?: string) {
    if (!files.length || readOnlyRef.current || operation.current) return;
    const targetWork = draft.works.find(item => item.id === workId);
    if ((target === 'cover' || target === 'images') && !targetWork) return;
    if (target === 'images' && targetWork && targetWork.images.length + files.length > MAX_IMAGES) {
      setError(`作品图片最多 20 张，目前还可添加 ${MAX_IMAGES - targetWork.images.length} 张。`);
      return;
    }
    operation.current = 'upload';
    setBusy('upload');
    setError('');
    setSuccess('');
    let completed = 0;
    try {
      for (const file of target === 'images' ? files : files.slice(0, 1)) {
        const image = await uploadImage(file);
        if (!mounted.current || readOnlyRef.current) return;
        // The destination belongs to the initiating work, never the current selection.
        setDraft(current => ({
          ...current,
          media: { ...current.media, [image.url]: { width: image.width, height: image.height } },
          profile: target === 'avatar' || target === 'profileCover'
            ? { ...current.profile, [target === 'avatar' ? 'avatar' : 'cover']: image.url }
            : current.profile,
          works: current.works.map(item => item.id === workId
            ? target === 'cover' ? { ...item, cover: image.url }
              : target === 'images' ? { ...item, cover: item.cover || image.url, images: [...item.images, image.url] } : item
            : item),
        }));
        completed++;
      }
    } catch (cause) {
      if (mounted.current) {
        setError(`${completed ? `已上传 ${completed} 张，其余未完成。` : ''}${errorMessage(cause)}`);
      }
    } finally {
      operation.current = null;
      if (mounted.current) setBusy(null);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const showAfterSave = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'view';
    if (readOnlyRef.current || operation.current || recovery || conflict) return;
    if (!dirty) {
      if (showAfterSave) {
        leaving.current = true;
        location.assign(selectedId ? `/#work=${encodeURIComponent(selectedId)}` : '/');
      }
      return;
    }
    const invalid = validateDraft(draft);
    if (invalid) {
      selectPanel(invalid.panel);
      setError(invalid.message);
      setSuccess('');
      return;
    }
    operation.current = 'save';
    setBusy('save');
    setError('');
    setSuccess('');
    let saved: Portfolio;
    try {
      saved = await savePortfolio(structuredClone(draft));
    } catch (cause) {
      if (mounted.current) {
        const collided = cause instanceof ApiError && (cause.status === 409 || cause.code === 'REVISION_CONFLICT');
        setConflict(collided);
        setError(collided
          ? '保存冲突：服务器已有更新，当前草稿未覆盖。可先导出草稿，再载入最新版核对。'
          : errorMessage(cause));
      }
      return;
    } finally {
      operation.current = null;
      if (mounted.current) setBusy(null);
    }
    if (!mounted.current) return;
    setDraft(structuredClone(saved));
    setBaseline(draftSnapshot(saved));
    setConflict(false);
    setSuccess('已保存，作品集已更新。');
    onSaved(saved);
    // Clear the refresh backup before navigating away from this mounted editor.
    try { sessionStorage.removeItem(draftKey(saved.slug)); } catch { /* Storage error is shown by the backup effect. */ }
    if (showAfterSave) {
      leaving.current = true;
      location.assign(selectedId ? `/#work=${encodeURIComponent(selectedId)}` : '/');
    }
  }

  async function findVideos(page = 1, keyword = query.trim()) {
    const id = selection.current;
    if (readOnlyRef.current || operation.current || !id) return;
    searchController.current?.abort();
    const controller = new AbortController();
    searchController.current = controller;
    setSearching(true);
    setSearchError('');
    setVideos(null);
    try {
      const result = await searchVideos(keyword, page, controller.signal);
      if (!mounted.current || controller.signal.aborted || selection.current !== id) return;
      setVideos(result);
      setSearchedQuery(keyword);
    } catch (cause) {
      if (mounted.current && !controller.signal.aborted && selection.current === id) {
        setSearchError(errorMessage(cause));
      }
    } finally {
      if (mounted.current && searchController.current === controller) setSearching(false);
    }
  }

  function chooseVideo(item: VideoItem) {
    if (!work || !item.playable) return;
    // Library covers are remote previews and must never replace a local work cover.
    updateWork(work.id, { videoId: item.videoId });
  }

  function close() {
    if (operation.current) return;
    if (!dirty || window.confirm('有尚未保存的修改，确定放弃并返回作品集？')) {
      leaving.current = true;
      if (dirty) {
        try { sessionStorage.removeItem(draftKey(draft.slug)); } catch { /* Navigation remains available without storage. */ }
      }
      onClose();
    }
  }

  function restoreDraft() {
    if (!recovery || readOnly) return;
    setDraft({ ...recovery, media: portfolio.media });
    setConflict(recovery.revision !== portfolio.revision);
    if (recovery.revision !== portfolio.revision) setError('这份草稿基于旧版本，不能直接覆盖服务器。可导出草稿后载入最新版核对。');
    setRecovery(null);
  }

  function exportDraft() {
    const url = URL.createObjectURL(new Blob([encodeDraft(recovery || draft)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `aufd-draft-${draft.slug}.json`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function reloadLatest() {
    if (disabled || !window.confirm('载入最新版会替换当前草稿。需要的内容请先导出，是否继续？')) return;
    operation.current = 'save';
    setBusy('save');
    try {
      const latest = await getPortfolio();
      if (!mounted.current) return;
      setDraft(structuredClone(latest));
      setBaseline(draftSnapshot(latest));
      setConflict(false);
      setError('');
      setSuccess('已载入服务器最新版本。');
      selectPanel(null);
      onSaved(latest);
    } catch (cause) { if (mounted.current) setError(errorMessage(cause)); }
    finally { operation.current = null; if (mounted.current) setBusy(null); }
  }

  return (
    <form className="studio-page" onSubmit={save} noValidate aria-label="作品集工作室" aria-busy={busy !== null}>
      <header className="studio-header">
        <div className="studio-heading">
          <IconButton label="返回作品集" onClick={close} disabled={busy !== null}>
            <ArrowLeft size={20} aria-hidden="true" />
          </IconButton>
          <span className="studio-brand">AUFD</span>
          <h1>工作室</h1>
        </div>
        <div className="studio-header-actions">
          <span className="studio-save-state" role="status">
            {busy === 'upload' ? '正在上传…' : busy === 'save' ? '正在保存…'
              : readOnly ? '只读' : dirty ? '草稿未发布' : '已保存'}
          </span>
          <IconButton label="预览项目" disabled={!work || busy !== null || recovery !== null} onClick={() => setPreview(true)}>
            <Eye size={18} aria-hidden="true" />
          </IconButton>
          <button type="submit" value="view" className="studio-button" disabled={disabled || conflict} aria-label="保存并查看">
            <Eye size={17} aria-hidden="true" />保存并查看
          </button>
          <button type="submit" className="studio-button studio-primary" title="保存作品集"
            aria-label="保存作品集" disabled={disabled || !dirty || conflict}>
            {busy ? <LoaderCircle className="studio-spinner" size={17} aria-hidden="true" />
              : <Save size={17} aria-hidden="true" />}
            保存并更新
          </button>
        </div>
      </header>

      <div className="studio-layout">
        <aside className="studio-sidebar" aria-label="编辑导航">
          <button type="button" className={`studio-profile-link ${selectedId === null ? 'studio-selected' : ''}`}
            aria-current={selectedId === null ? 'page' : undefined} onClick={() => selectPanel(null)}>
            <UserRound size={18} aria-hidden="true" />个人资料
          </button>
          <div className="studio-sidebar-heading">
            <h2>项目 <span>{draft.works.length}/{MAX_WORKS}</span></h2>
            <IconButton label="新建项目" disabled={disabled || draft.works.length >= MAX_WORKS} onClick={addWork}>
              <Plus size={18} aria-hidden="true" />
            </IconButton>
          </div>
          <ol className="studio-work-list">
            {draft.works.map((item, index) => {
              const TypeIcon = typeIcons[item.type];
              return (
                <li key={item.id} className={selectedId === item.id ? 'studio-selected' : undefined}>
                  <button type="button" className="studio-work-link"
                    aria-current={selectedId === item.id ? 'page' : undefined} onClick={() => selectPanel(item.id)}>
                    <TypeIcon size={17} aria-hidden="true" />
                    <span>{item.title || '未命名作品'}</span>
                    {item.featured && <Star size={13} className="studio-featured-icon" aria-label="精选" />}
                  </button>
                  <div className="studio-work-order">
                    <IconButton label={`上移 ${item.title || '未命名作品'}`} disabled={disabled || index === 0}
                      onClick={() => edit(current => ({ ...current, works: moveWork(current.works, index, index - 1) }))}>
                      <ArrowUp size={14} aria-hidden="true" />
                    </IconButton>
                    <IconButton label={`下移 ${item.title || '未命名作品'}`}
                      disabled={disabled || index === draft.works.length - 1}
                      onClick={() => edit(current => ({ ...current, works: moveWork(current.works, index, index + 1) }))}>
                      <ArrowDown size={14} aria-hidden="true" />
                    </IconButton>
                  </div>
                </li>
              );
            })}
          </ol>
          {!draft.works.length && <p className="studio-empty">暂无作品</p>}
        </aside>

        <main className="studio-main">
          {readOnly && <p className="studio-notice">当前为只读模式。</p>}
          {recovery && <section className="studio-notice" aria-label="恢复草稿">
            <p>发现此标签页未保存的草稿。</p>
            <div className="studio-row-actions">
              <button type="button" className="studio-button" disabled={readOnly} onClick={restoreDraft}>恢复草稿</button>
              <button type="button" className="studio-button" onClick={exportDraft}><Download size={16} />导出草稿</button>
              <button type="button" className="studio-button" disabled={readOnly} onClick={() => {
                if (window.confirm('丢弃此标签页的未保存草稿？')) setRecovery(null);
              }}>丢弃草稿</button>
            </div>
          </section>}
          {storageError && <p className="studio-notice studio-error" role="alert">{storageError}</p>}
          {error && <p className="studio-notice studio-error" role="alert">{error}</p>}
          {conflict && <div className="studio-row-actions">
            <button type="button" className="studio-button" onClick={exportDraft}><Download size={16} />导出草稿</button>
            <button type="button" className="studio-button" disabled={disabled} onClick={() => void reloadLatest()}><RotateCcw size={16} />载入最新版</button>
          </div>}
          {success && <p className="studio-notice studio-success" role="status"><Check size={17} aria-hidden="true" />{success}</p>}
          <fieldset className="studio-editor" disabled={disabled}>
            <legend className="studio-sr-only">{work ? '作品资料' : '个人资料'}</legend>
            {!work ? (
              <>
                <div className="studio-section-heading"><h2>个人资料</h2></div>
                <div className="studio-fields">
                  <label className="studio-field"><span>姓名</span>
                    <input value={draft.profile.name} autoComplete="name" required
                      onChange={event => updateProfile({ name: event.target.value })} />
                  </label>
                  <label className="studio-field"><span>别名</span>
                    <input value={draft.profile.alias} onChange={event => updateProfile({ alias: event.target.value })} />
                  </label>
                  <label className="studio-field studio-span"><span>身份</span>
                    <input value={draft.profile.role} onChange={event => updateProfile({ role: event.target.value })} />
                  </label>
                  <label className="studio-field studio-span"><span>简介</span>
                    <textarea rows={3} value={draft.profile.bio} onChange={event => updateProfile({ bio: event.target.value })} />
                  </label>
                  <label className="studio-field studio-span"><span>关于我</span>
                    <textarea rows={6} value={draft.profile.about} onChange={event => updateProfile({ about: event.target.value })} />
                  </label>
                  <label className="studio-field studio-span"><span>联系邮箱 <small>选填</small></span>
                    <input type="email" autoComplete="email" value={draft.profile.email ?? ''}
                      onChange={event => updateProfile({ email: event.target.value })} />
                  </label>
                </div>
                <section className="studio-section" aria-label="个人图片">
                  <ImageField label="头像" value={draft.profile.avatar} disabled={disabled}
                    onChange={avatar => updateProfile({ avatar })} onFiles={files => void upload(files, 'avatar')} />
                  <ImageField label="主页封面" value={draft.profile.cover} disabled={disabled}
                    onChange={cover => updateProfile({ cover })} onFiles={files => void upload(files, 'profileCover')} />
                </section>
              </>
            ) : (
              <>
                <div className="studio-section-heading">
                  <h2>项目内容</h2>
                  <IconButton label="移除作品" className="studio-danger" disabled={disabled} onClick={() => removeWork(work.id)}>
                    <Trash2 size={18} aria-hidden="true" />
                  </IconButton>
                </div>
                <div className="studio-work-settings">
                  <div className="studio-segments" role="group" aria-label="作品分类">
                    {(['poster', 'photo', 'video'] as const).map(type => {
                      const TypeIcon = typeIcons[type];
                      return (
                        <button type="button" key={type} aria-pressed={work.type === type} title={workTypeLabels[type]}
                          onClick={() => {
                            searchController.current?.abort();
                            setSearching(false);
                            setVideos(null);
                            setSearchError('');
                            updateWork(work.id, { type });
                          }}>
                          <TypeIcon size={16} aria-hidden="true" />{workTypeLabels[type]}
                        </button>
                      );
                    })}
                  </div>
                  <label className="studio-checkbox">
                    <input type="checkbox" checked={work.featured}
                      onChange={event => updateWork(work.id, { featured: event.target.checked })} />
                    <Star size={16} aria-hidden="true" />精选
                  </label>
                </div>
                <div className="studio-fields">
                  <label className="studio-field studio-span"><span>标题</span>
                    <input value={work.title} required onChange={event => updateWork(work.id, { title: event.target.value })} />
                  </label>
                  <label className="studio-field"><span>副标题</span>
                    <input value={work.subtitle} onChange={event => updateWork(work.id, { subtitle: event.target.value })} />
                  </label>
                  <label className="studio-field"><span>日期</span>
                    <input type="date" value={work.date} max="9999-12-31"
                      onChange={event => updateWork(work.id, { date: event.target.value })} />
                  </label>
                  <label className="studio-field studio-span"><span>项目说明</span>
                    <textarea rows={5} value={work.description}
                      onChange={event => updateWork(work.id, { description: event.target.value })} />
                  </label>
                </div>
                <section className="studio-section" aria-label="作品图片">
                  <ImageField label="作品封面" value={work.cover} disabled={disabled}
                    onChange={cover => updateWork(work.id, { cover })}
                    onFiles={files => void upload(files, 'cover', work.id)} />
                  <div className="studio-section-heading">
                    <h3>图片 <span>{work.images.length}/{MAX_IMAGES}</span></h3>
                    <UploadButton label="添加图片" disabled={disabled || work.images.length >= MAX_IMAGES} multiple
                      onFiles={files => void upload(files, 'images', work.id)} />
                  </div>
                  <ol className="studio-image-list">
                    {work.images.map((image, index) => (
                      <li key={`${work.id}-${index}`}>
                        <div className="studio-gallery-preview">
                          {localImage(image) ? <img src={image} alt={`作品图片 ${index + 1}`} loading="lazy" />
                            : <ImageIcon size={20} aria-hidden="true" />}
                        </div>
                        <label className="studio-field">
                          <span>图片 {index + 1}</span>
                          <input value={image} spellCheck={false} required onChange={event =>
                            updateWork(work.id, { images: work.images.map((url, i) => i === index ? event.target.value : url) })} />
                        </label>
                        <div className="studio-row-actions">
                          <IconButton label={`将图片 ${index + 1} 设为封面`} disabled={disabled || !localImage(image) || image === work.cover}
                            onClick={() => updateWork(work.id, { cover: image })}><ImageIcon size={16} aria-hidden="true" /></IconButton>
                          <IconButton label={`上移图片 ${index + 1}`} disabled={disabled || index === 0} onClick={() => {
                            const images = [...work.images];
                            [images[index - 1], images[index]] = [images[index], images[index - 1]];
                            updateWork(work.id, { images });
                          }}><ArrowUp size={16} aria-hidden="true" /></IconButton>
                          <IconButton label={`下移图片 ${index + 1}`} disabled={disabled || index === work.images.length - 1} onClick={() => {
                            const images = [...work.images];
                            [images[index], images[index + 1]] = [images[index + 1], images[index]];
                            updateWork(work.id, { images });
                          }}><ArrowDown size={16} aria-hidden="true" /></IconButton>
                          <IconButton label={`移除图片 ${index + 1}`} className="studio-danger" disabled={disabled}
                            onClick={() => {
                              if (window.confirm(`移除图片 ${index + 1}？`)) {
                                updateWork(work.id, { images: work.images.filter((_, i) => i !== index) });
                              }
                            }}><Trash2 size={16} aria-hidden="true" /></IconButton>
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>
                {(
                  <section className="studio-section" aria-label="视频">
                    <div className="studio-section-heading"><h3>关联影像{work.type !== 'video' && '（选填）'}</h3>
                      {work.videoId && <IconButton label="移除关联视频" disabled={disabled} onClick={() => {
                        if (window.confirm('移除关联视频及其精彩片段？')) updateWork(work.id, { videoId: '', highlights: [] });
                      }}><Trash2 size={17} /></IconButton>}
                    </div>
                    <label className="studio-field"><span>视频 VID</span>
                      <input value={work.videoId} required={work.type === 'video'} spellCheck={false}
                        onChange={event => updateWork(work.id, { videoId: event.target.value })} />
                    </label>
                    {portfolio.works.some(item => item.isDemo && item.videoId && item.videoId === work.videoId) &&
                      <p className="studio-notice">此视频为官方演示素材，保存后项目将标记为示例。</p>}
                    {portfolio.works.some(item => item.isDemo && item.videoId) && <button type="button" className="studio-button"
                      onClick={() => updateWork(work.id, { videoId: portfolio.works.find(item => item.isDemo && item.videoId)!.videoId })}>
                      <Film size={16} />使用官方示例视频
                    </button>}
                    <div className="studio-library">
                      <h4>视频库</h4>
                      <div className="studio-search">
                        <label className="studio-field">
                          <span className="studio-sr-only">搜索视频库</span>
                          <input type="search" value={query} maxLength={100} placeholder="搜索视频"
                            onChange={event => setQuery(event.target.value)} onKeyDown={event => {
                              if (event.key === 'Enter') { event.preventDefault(); void findVideos(); }
                            }} />
                        </label>
                        <button type="button" className="studio-button" title="搜索视频库" aria-label="搜索视频库"
                          disabled={disabled || searching} onClick={() => void findVideos()}>
                          {searching ? <LoaderCircle className="studio-spinner" size={17} aria-hidden="true" />
                            : <Search size={17} aria-hidden="true" />}搜索
                        </button>
                      </div>
                      {searching && <p className="studio-empty" role="status">正在搜索…</p>}
                      {searchError && <p className="studio-notice studio-error" role="alert">{searchError}</p>}
                      {videos && !videos.items.length && <p className="studio-empty" role="status">没有匹配的视频。</p>}
                      <ul className="studio-video-list">
                        {videos?.items.map(item => (
                          <li key={item.videoId}>
                            <div className="studio-video-preview">
                              {/^https?:\/\//i.test(item.cover)
                                ? <img src={item.cover} alt="" loading="lazy" referrerPolicy="no-referrer" />
                                : <Film size={20} aria-hidden="true" />}
                            </div>
                            <div className="studio-video-info">
                              <strong>{item.title || item.videoId}</strong>
                              <span>{formatTime(item.duration)} · {item.playable ? '可播放' : '未发布，暂不可选'}</span>
                              <small>{item.videoId}</small>
                            </div>
                            <button type="button" className="studio-button" title={`选择 ${item.title || item.videoId}`}
                              aria-label={`选择 ${item.title || item.videoId}`} disabled={disabled || !item.playable}
                              aria-pressed={work.videoId === item.videoId} onClick={() => chooseVideo(item)}>
                              {work.videoId === item.videoId ? <Check size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
                              {work.videoId === item.videoId ? '已选择' : '选择'}
                            </button>
                          </li>
                        ))}
                      </ul>
                      {videos && videos.totalPages > 1 && (
                        <div className="studio-pagination">
                          <IconButton label="视频上一页" disabled={disabled || searching || videos.page <= 1}
                            onClick={() => void findVideos(videos.page - 1, searchedQuery)}><ChevronLeft size={17} aria-hidden="true" /></IconButton>
                          <span>{videos.page} / {videos.totalPages}</span>
                          <IconButton label="视频下一页" disabled={disabled || searching || videos.page >= videos.totalPages}
                            onClick={() => void findVideos(videos.page + 1, searchedQuery)}><ChevronRight size={17} aria-hidden="true" /></IconButton>
                        </div>
                      )}
                    </div>
                    <div className="studio-section-heading">
                      <h3>高光时刻 <span>{work.highlights.length}/{MAX_HIGHLIGHTS}</span></h3>
                      <IconButton label="添加高光" disabled={disabled || !work.videoId.trim() || work.highlights.length >= MAX_HIGHLIGHTS}
                        onClick={() => updateWork(work.id, { highlights: [...work.highlights, { title: '', seconds: 0 }] })}>
                        <Plus size={18} aria-hidden="true" />
                      </IconButton>
                    </div>
                    <ol className="studio-highlight-list">
                      {work.highlights.map((highlight, index) => (
                        <li key={`${work.id}-${index}`}>
                          <label className="studio-field"><span>高光 {index + 1}</span>
                            <input value={highlight.title} required onChange={event => updateWork(work.id, {
                              highlights: work.highlights.map((entry, i) => i === index ? { ...entry, title: event.target.value } : entry),
                            })} />
                          </label>
                          <label className="studio-field"><span>时间 / 秒</span>
                            <input type="number" min={0} max={86400} step={1} value={highlight.seconds} required
                              onChange={event => updateWork(work.id, {
                                highlights: work.highlights.map((entry, i) => i === index
                                  ? { ...entry, seconds: Number(event.target.value) } : entry),
                              })} />
                          </label>
                          <IconButton label={`移除高光 ${index + 1}`} className="studio-danger" disabled={disabled}
                            onClick={() => {
                              if (window.confirm(`移除高光 ${index + 1}？`)) {
                                updateWork(work.id, { highlights: work.highlights.filter((_, i) => i !== index) });
                              }
                            }}><Trash2 size={16} aria-hidden="true" /></IconButton>
                        </li>
                      ))}
                    </ol>
                  </section>
                )}
              </>
            )}
          </fieldset>
        </main>
      </div>
      {preview && work && <ProjectView work={work} works={draft.works} preview
        canPlay={portfolio.works.some(item => item.videoId && item.videoId === work.videoId)}
        onSelect={id => selectPanel(id)} onClose={() => setPreview(false)} onShare={() => {}} notice="" />}
    </form>
  );
}
