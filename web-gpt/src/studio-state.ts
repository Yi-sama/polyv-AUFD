import type { Portfolio } from './types.ts';

export const localImage = (url: string) =>
  url === '/assets/poster.jpg' || /^\/uploads\/[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(url);

export const draftSnapshot = (data: Portfolio) => JSON.stringify({
  profile: data.profile, works: data.works,
});
export const draftKey = (slug: string) => `aufd:studio-draft:v1:${slug}`;
export const encodeDraft = (data: Portfolio) => JSON.stringify({ version: 1, data });

// Drafts permit incomplete form values, but never trust storage as typed API data.
export function decodeDraft(raw: string | null, slug: string): Portfolio | null {
  if (!raw || raw.length > 1_000_000) return null;
  try {
    const { version, data } = JSON.parse(raw);
    const strings = (object: Record<string, unknown>, keys: string[]) =>
      keys.every(key => typeof object?.[key] === 'string');
    if (version !== 1 || data?.slug !== slug || !Number.isInteger(data.revision) || data.revision < 0 ||
      !strings(data.profile, ['name', 'alias', 'role', 'bio', 'about', 'email', 'cover', 'avatar', 'updatedAt']) ||
      !Array.isArray(data.works) || data.works.length > 40) return null;
    const ids = new Set<string>();
    for (const work of data.works) {
      if (!strings(work, ['id', 'type', 'title', 'subtitle', 'date', 'description', 'cover', 'videoId']) ||
        !/^[a-zA-Z0-9_-]{1,60}$/.test(work.id) || ids.has(work.id) ||
        !['poster', 'photo', 'video'].includes(work.type) ||
        typeof work.featured !== 'boolean' || typeof work.isDemo !== 'boolean' ||
        !Array.isArray(work.images) || work.images.length > 20 || work.images.some((image: unknown) => typeof image !== 'string') ||
        !Array.isArray(work.highlights) || work.highlights.length > 12 ||
        work.highlights.some((item: { title?: unknown; seconds?: unknown }) =>
          !item || typeof item.title !== 'string' || typeof item.seconds !== 'number' || !Number.isFinite(item.seconds))) return null;
      ids.add(work.id);
    }
    return { ...data, media: {} } as Portfolio;
  } catch {
    return null;
  }
}

export function validateDraft(data: Portfolio): { panel: string | null; message: string } | null {
  const profileError = (message: string) => ({ panel: null, message });
  if (!data.profile.name.trim()) return profileError('请填写姓名。');
  const email = (data.profile.email ?? '').trim();
  if (email && !/^[^\s@]+@[^\s@]+$/.test(email)) return profileError('请填写有效邮箱，或将邮箱留空。');
  if (!localImage(data.profile.avatar) || !localImage(data.profile.cover)) {
    return profileError('请为头像和主页封面选择已上传的本地图片。');
  }
  if (data.works.length > 40) return profileError('项目最多 40 个。');
  for (const work of data.works) {
    const invalid = (message: string) => ({ panel: work.id, message: `${work.title.trim() || '未命名项目'}：${message}` });
    if (!work.title.trim()) return invalid('请填写标题。');
    if (work.date && (!/^\d{4}-\d{2}-\d{2}$/.test(work.date) ||
      Number.isNaN(Date.parse(`${work.date}T00:00:00Z`)) ||
      new Date(`${work.date}T00:00:00Z`).toISOString().slice(0, 10) !== work.date)) return invalid('请选择有效日期。');
    if (!localImage(work.cover)) return invalid('请上传图片或选择封面。');
    if (work.images.length > 20 || work.images.some(image => !localImage(image))) return invalid('项目图片最多 20 张，且必须是已上传的本地图片。');
    if (work.type === 'video' && !work.videoId.trim()) return invalid('请填写视频 VID，或改为海报 / 照片分类。');
    if (work.highlights.length && !work.videoId.trim()) return invalid('请关联视频，或移除精彩片段。');
    if (work.highlights.length > 12 || work.highlights.some(highlight =>
      !highlight.title.trim() || !Number.isInteger(highlight.seconds) ||
      highlight.seconds < 0 || highlight.seconds > 86400)) return invalid('精彩片段最多 12 个，标题不能为空，时间须为 0 至 86400 的整数秒。');
  }
  return null;
}
