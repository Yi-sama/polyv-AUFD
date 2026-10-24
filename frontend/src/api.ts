import type {
  Creator, CreatorSummary, Media, PlaybackToken, Preview, Profile, Session, VideoPage, Work, WorkType,
} from './types';
import { mockCreators } from './mock';

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(message: string, status: number, code = '') {
    super(message); this.status = status; this.code = code;
  }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    const timeout = AbortSignal.timeout(25000);
    response = await fetch(url, {
      credentials: 'include', ...options,
      signal: options?.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError('暂时无法连接服务，请稍后重试。', 0, 'NETWORK_ERROR');
  }
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const error = result?.error;
    throw new ApiError(typeof error === 'string' ? error : error?.message || '请求未完成，请稍后重试。',
      response.status, result?.code || error?.code || '');
  }
  if (result === null) throw new ApiError('服务器返回了无法识别的数据。', 502, 'INVALID_RESPONSE');
  return result as T;
}

const json = (method: string, body: unknown): RequestInit => ({
  method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

/* ---------- normalization: tolerate small differences in the backend contract ---------- */

type Raw = Record<string, any>;
const str = (value: unknown) => (typeof value === 'string' ? value : '');
const TYPES: WorkType[] = ['poster', 'photo', 'video'];

function normWork(raw: Raw): Work {
  return {
    id: str(raw.id),
    type: TYPES.includes(raw.type) ? raw.type : 'photo',
    title: str(raw.title), subtitle: str(raw.subtitle), date: str(raw.date),
    description: str(raw.description), cover: str(raw.cover),
    images: Array.isArray(raw.images) ? raw.images.filter((x: unknown) => typeof x === 'string') : [],
    featured: Boolean(raw.featured), videoId: str(raw.videoId), isDemo: Boolean(raw.isDemo),
    highlights: Array.isArray(raw.highlights)
      ? raw.highlights.map((h: Raw) => ({ title: str(h?.title), seconds: Number(h?.seconds) || 0 }))
      : [],
  };
}

function normProfile(p: Raw = {}): Profile {
  return {
    name: str(p.name), alias: str(p.alias), title: str(p.title) || str(p.role),
    tags: Array.isArray(p.tags) ? p.tags.filter((t: unknown) => typeof t === 'string') : [],
    bio: str(p.bio), about: str(p.about), contact: str(p.contact) || str(p.email),
    avatar: str(p.avatar), cover: str(p.cover) || str(p.avatar), updatedAt: str(p.updatedAt),
  };
}

export function normCreator(raw: Raw, fallbackChannel = 1): Creator {
  return {
    slug: str(raw.slug),
    channel: Number.isInteger(raw.channel) ? raw.channel : fallbackChannel,
    revision: Number.isInteger(raw.revision) ? raw.revision : 0,
    isSample: fictional(raw),
    profile: normProfile(raw.profile),
    works: Array.isArray(raw.works) ? raw.works.map(normWork) : [],
    media: (raw.media && typeof raw.media === 'object' ? raw.media : {}) as Media,
  };
}

/** Sample channels are fictional; channels created later through join carry the notice in their about text. */
const fictional = (raw: Raw) => Boolean(raw.isSample) || str(raw.profile?.about).includes('人物与经历均为虚构');

/** Official sample clips are labelled, never counted as the creator's own work. */
export const ownWorks = (works: Work[]) => works.filter(work => !work.isDemo);

export function summarize(creator: Creator): CreatorSummary {
  const ordered = [...creator.works.filter(w => w.featured), ...creator.works.filter(w => !w.featured)];
  const previews: Preview[] = ordered.filter(w => w.cover).slice(0, 6).map(w => ({
    workId: w.id, type: w.type, cover: w.cover,
    width: creator.media[w.cover]?.width || 0, height: creator.media[w.cover]?.height || 0,
  }));
  const video = creator.works.find(w => w.type === 'video' && w.videoId);
  const { name, alias, title, tags, avatar, bio } = creator.profile;
  return {
    slug: creator.slug, channel: creator.channel, isSample: creator.isSample,
    profile: { name, alias, title, tags, avatar, bio },
    worksCount: ownWorks(creator.works).length, previews,
    previewVideo: video
      ? { workId: video.id, videoId: video.videoId, seconds: video.highlights[0]?.seconds || 0, isDemo: video.isDemo }
      : null,
  };
}

function normSummary(raw: Raw, index: number): CreatorSummary {
  const p = normProfile(raw.profile);
  return {
    slug: str(raw.slug),
    channel: Number.isInteger(raw.channel) ? raw.channel : index + 1,
    isSample: fictional(raw),
    profile: { name: p.name, alias: p.alias, title: p.title, tags: p.tags, avatar: p.avatar, bio: p.bio },
    worksCount: Number.isInteger(raw.worksCount) ? raw.worksCount : 0,
    previews: Array.isArray(raw.previews) ? raw.previews.map((x: Raw) => ({
      workId: str(x.workId), type: TYPES.includes(x.type) ? x.type : 'photo', cover: str(x.cover),
      width: Number(x.width) || 0, height: Number(x.height) || 0,
    })) : [],
    previewVideo: raw.previewVideo?.videoId ? {
      workId: str(raw.previewVideo.workId), videoId: str(raw.previewVideo.videoId),
      seconds: Number(raw.previewVideo.seconds) || 0, isDemo: Boolean(raw.previewVideo.isDemo),
    } : null,
  };
}

/* ---------- public reads ---------- */

/** True while the backend still serves the single-creator v1 contract (dev-only preview data fills in). */
export let usingPreviewData = false;

export async function listCreators(signal?: AbortSignal): Promise<CreatorSummary[]> {
  const result = await request<{ items: Raw[] }>('/api/creators', { signal });
  const items = Array.isArray(result.items) ? result.items : [];
  const legacy = items.length > 0 && items.every(item => !('previews' in item));
  let summaries: CreatorSummary[];
  if (legacy) {
    const full = await Promise.all(items.map((item, i) => getCreator(str(item.slug), signal, i + 1)));
    summaries = full.map(summarize);
  } else {
    summaries = items.map(normSummary);
  }
  if (import.meta.env.DEV && legacy && summaries.length <= 1) {
    usingPreviewData = true;
    summaries = [...summaries, ...mockCreators.map(summarize)];
  }
  return summaries.sort((a, b) => a.channel - b.channel);
}

export async function getCreator(slug: string, signal?: AbortSignal, fallbackChannel = 1): Promise<Creator> {
  const mock = import.meta.env.DEV ? mockCreators.find(c => c.slug === slug) : undefined;
  try {
    return normCreator(await request<Raw>(`/api/creators/${encodeURIComponent(slug)}`, { signal }), fallbackChannel);
  } catch (error) {
    if (mock && error instanceof ApiError && error.status === 404) return mock;
    throw error;
  }
}

/* ---------- session ---------- */

function normSession(raw: Raw | null): Session | null {
  const source = raw?.creator ?? raw?.user ?? raw;
  const slug = str(source?.slug);
  return slug ? { slug, name: str(source?.name) || str(source?.profile?.name) || slug } : null;
}

export async function getSession(): Promise<Session | null> {
  try {
    return normSession(await request<Raw>('/api/auth/me'));
  } catch (error) {
    if (error instanceof ApiError && [401, 403, 404].includes(error.status)) return null;
    throw error;
  }
}
export const login = async (slug: string, password: string) =>
  normSession(await request<Raw>('/api/auth/login', json('POST', { slug, password })));
export const join = async (slug: string, name: string, password: string) =>
  normSession(await request<Raw>('/api/auth/join', json('POST', { slug, name, password })));
export const logout = () => request<Raw>('/api/auth/logout', { method: 'POST' }).catch(() => null);

/* ---------- owner writes ---------- */

export async function saveCreator(creator: Creator): Promise<Creator> {
  const { name, alias, title, tags, bio, about, contact, avatar, cover } = creator.profile;
  const raw = await request<Raw>(`/api/creators/${encodeURIComponent(creator.slug)}`, json('PUT', {
    revision: creator.revision,
    profile: { name, alias, title, tags, bio, about, contact, avatar, cover },
    works: creator.works.map(({ isDemo: _isDemo, ...work }) => work),
  }));
  return normCreator(raw, creator.channel);
}

export async function uploadImage(file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new ApiError('请选择 JPG、PNG 或 WebP 图片。', 415);
  }
  if (file.size > 10 * 1024 * 1024) throw new ApiError('图片不能超过 10MB。', 413);
  const form = new FormData(); form.append('file', file);
  return request<{ url: string; width: number; height: number }>('/api/upload', { method: 'POST', body: form });
}

export const searchVideos = (keyword: string, page = 1, signal?: AbortSignal) =>
  request<VideoPage>(`/api/polyv/videos?keyword=${encodeURIComponent(keyword)}&page=${page}&pageSize=12`, { signal });
export const getPlaybackToken = (videoId: string, signal?: AbortSignal) =>
  request<PlaybackToken>(`/api/polyv/play-token?vid=${encodeURIComponent(videoId)}`, { signal });
