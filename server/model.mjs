export const SLUG = 'liurunsen';
export const DEMO_VID = '88083abbf5bcf1356e05d39666be527a_8';
export const POSTER = '/assets/poster.jpg';
export const VID_PATTERN = /^[a-zA-Z0-9_-]{5,100}$/;
export const IMAGE_PATTERN = /^\/(?:assets\/poster\.jpg|uploads\/[a-f0-9-]{36}\.webp)$/;

export class ApiError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    Object.assign(this, { status, code, extra });
  }
}

export function seedPortfolio() {
  return {
    slug: SLUG, revision: 0,
    profile: {
      name: '刘润森', alias: 'Yisama', role: '创作者',
      bio: '把想法做成可以被看见的作品。',
      about: '这里收集我的海报、照片与影像。这段简介为演示文案，可在编辑页修改。',
      email: '', cover: POSTER, avatar: POSTER, updatedAt: '2026-10-23'
    },
    works: [
      {
        id: 'aufd', type: 'poster', title: 'AUFD，让作品被看见',
        subtitle: '参赛海报', date: '2026-10-23',
        description: '一张记录创作起点的海报。海报署名：刘润森 Yisama、王健 Soulmate。',
        cover: POSTER, images: [POSTER], featured: true, videoId: '', isDemo: false, highlights: []
      },
      {
        id: 'polyv-demo', type: 'video', title: '保利威播放器接入演示',
        subtitle: '官方示例，非个人作品', date: '',
        description: '目前使用保利威官方示例视频占位，封面沿用参赛海报。准备个人视频后可替换 VID。',
        cover: POSTER, images: [], featured: false, videoId: DEMO_VID, isDemo: true,
        highlights: [{ title: '开始播放', seconds: 0 }]
      }
    ]
  };
}

function invalid(name) {
  throw new ApiError(400, 'VALIDATION_ERROR', `${name}格式不正确`);
}
const object = value => value && typeof value === 'object' && !Array.isArray(value);
function text(value, name, max, required = false) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) invalid(name);
  return value.trim();
}
function image(value) {
  if (typeof value !== 'string' || !IMAGE_PATTERN.test(value)) invalid('图片地址');
  return value;
}

export function validatePortfolio(input) {
  if (!object(input) || !Number.isSafeInteger(input.revision) || input.revision < 0 ||
      input.revision === Number.MAX_SAFE_INTEGER || !object(input.profile) ||
      !Array.isArray(input.works) || input.works.length > 40) invalid('作品集');
  if (input.slug !== undefined && input.slug !== SLUG) invalid('创作者标识');
  const p = input.profile;
  const profile = {
    name: text(p.name, '姓名', 40, true), alias: text(p.alias, '别名', 40),
    role: text(p.role, '身份', 80), bio: text(p.bio, '简介', 300),
    about: text(p.about, '关于', 2000), email: text(p.email, '邮箱', 120),
    avatar: image(p.avatar), cover: image(p.cover ?? p.avatar),
    updatedAt: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date())
  };
  if (profile.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) invalid('邮箱');
  const ids = new Set();
  const works = input.works.map(w => {
    if (!object(w) || typeof w.id !== 'string' || !/^[a-zA-Z0-9_-]{1,60}$/.test(w.id) ||
        ids.has(w.id) || !['poster', 'photo', 'video'].includes(w.type)) invalid('作品标识');
    ids.add(w.id);
    if (!Array.isArray(w.images) || w.images.length > 20 || typeof w.featured !== 'boolean') invalid('作品图片或精选状态');
    const videoId = text(w.videoId, '视频 VID', 100);
    if ((videoId && !VID_PATTERN.test(videoId)) || (w.type === 'video' && !videoId)) invalid('视频 VID');
    if (!Array.isArray(w.highlights) || w.highlights.length > 12) invalid('精彩片段');
    const highlights = w.highlights.map(h => {
      if (!object(h) || !Number.isInteger(h.seconds) || h.seconds < 0 || h.seconds > 86400) invalid('片段时间');
      return { title: text(h.title, '片段标题', 60, true), seconds: h.seconds };
    });
    const date = text(w.date, '日期', 10);
    if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) ||
        new Date(date).toISOString().slice(0, 10) !== date)) invalid('日期');
    return {
      id: w.id, type: w.type, title: text(w.title, '作品标题', 100, true),
      subtitle: text(w.subtitle, '副标题', 160), date,
      description: text(w.description, '作品说明', 6000),
      cover: image(w.cover), images: w.images.map(image), featured: w.featured,
      videoId, isDemo: videoId === DEMO_VID, highlights
    };
  });
  return { slug: SLUG, revision: input.revision, profile, works };
}
