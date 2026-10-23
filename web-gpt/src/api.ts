import type { Health, Portfolio, VideoPage, PlaybackToken } from './types';

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
    response = await fetch(url, { ...options,
      signal: options?.signal ? AbortSignal.any([options.signal, timeout]) : timeout });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError('暂时无法连接服务，请稍后重试。', 0, 'NETWORK_ERROR');
  }
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const error = result?.error;
    throw new ApiError(typeof error === 'string' ? error : error?.message || '请求未完成，请稍后重试。', response.status, result?.code || error?.code);
  }
  if (!result) throw new ApiError('服务器返回了无法识别的数据。', 502, 'INVALID_RESPONSE');
  return result as T;
}
export const getPortfolio = (signal?: AbortSignal) => request<Portfolio>('/api/portfolio', { signal });
export const getHealth = () => request<Health>('/api/health');
export const savePortfolio = (data: Portfolio) => request<Portfolio>('/api/portfolio', {
  method: 'PUT', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ revision: data.revision, profile: data.profile, works: data.works })
});
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
