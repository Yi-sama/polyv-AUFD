export const SLUG = 'lin-mo';
export const SLUG_PATTERN = /^[a-z0-9-]{2,40}$/;
export const RESERVED_SLUGS = new Set(['api', 'assets', 'uploads', 'join', 'login', 'logout', 'studio', 'auth', 'tags', 'liurunsen']);
export const DEMO_VID = '88083abbf5bcf1356e05d39666be527a_8';
export const POSTER = '/assets/samples/architecture.jpg';
export const VID_PATTERN = /^[a-zA-Z0-9_-]{5,100}$/;
export const IMAGE_PATTERN = /^\/(?:assets\/samples\/[a-z0-9-]+\.(?:jpg|webp)|uploads\/[a-f0-9-]{36}\.webp)$/;

export class ApiError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    Object.assign(this, { status, code, extra });
  }
}

export function seedPortfolio() {
  return {
    slug: SLUG, revision: 0, channel: 1, isSample: true,
    profile: {
      name: '林墨', alias: 'Lin Mo', role: '空间摄影',
      title: '空间摄影', tags: ['摄影', '建筑'],
      bio: '示例大咖：观察空间、光线与城市结构。',
      about: '虚构示例人物。照片为授权图库素材，不代表本人作品、肖像或真实经历。',
      email: '', contact: '', cover: POSTER, avatar: POSTER, updatedAt: '2026-10-24'
    },
    works: [
      {
        id: 'space', type: 'photo', title: '空间观察',
        subtitle: '图库示例', date: '',
        description: '示例摄影作品。图片来源和作者见素材 SOURCES.md。',
        cover: POSTER, images: [POSTER], featured: true, videoId: '', isDemo: false, highlights: []
      },
      {
        id: 'polyv-demo', type: 'video', title: '保利威播放器接入演示',
        subtitle: '官方示例，非个人作品', date: '',
        description: '保利威官方示例视频，不代表比赛账号已接入。',
        cover: POSTER, images: [], featured: false, videoId: DEMO_VID, isDemo: true,
        highlights: [{ title: '开始播放', seconds: 0 }]
      }
    ]
  };
}

export function seedCreators() {
  const first = seedPortfolio();
  const definitions = [
    [SLUG, '林墨', 'Lin Mo', '空间摄影', ['摄影', '建筑'], ['architecture', 'facade', 'structure']],
    ['chen-yu', '陈语', 'Chen Yu', '职业教育', ['职业教育', '沟通'], ['workshop', 'conversation', 'audience']],
    ['zhou-ning', '周宁', 'Zhou Ning', '直播培训', ['直播', '企业培训'], ['stage', 'panel', 'workshop']]
  ];
  return definitions.map(([slug, name, alias, title, tags, images], index) => {
    const cover = `/assets/samples/${images[0]}.jpg`;
    return {
      slug, revision: 0, channel: index + 1, isSample: true,
      profile: {
        ...first.profile, name, alias, role: title, title, tags, avatar: cover, cover,
        bio: `示例大咖：${title}。人物与经历均为虚构。`
      },
      works: [
        ...images.map((image, i) => ({
          ...first.works[0], id: `${slug}-${i + 1}`, title: `${title} · ${i + 1}`,
          cover: `/assets/samples/${image}.jpg`, images: [`/assets/samples/${image}.jpg`],
          featured: i === 0
        })),
        ...(index === 0 ? [first.works[1]] : [])
      ]
    };
  });
}

export function validateSlug(slug) {
  if (typeof slug !== 'string' || !SLUG_PATTERN.test(slug) || RESERVED_SLUGS.has(slug)) invalid('创作者标识');
  return slug;
}

export function emptyCreator(slug, name, channel) {
  const p = seedPortfolio();
  return {
    slug, revision: 0, channel, isSample: false, works: [],
    profile: {
      ...p.profile, name, alias: '', title: '', role: '', tags: [], bio: '', about: '',
      avatar: '', cover: '', updatedAt: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date())
    }
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

export function validatePortfolio(input, slug = SLUG) {
  validateSlug(slug);
  if (!object(input) || !Number.isSafeInteger(input.revision) || input.revision < 0 ||
      input.revision === Number.MAX_SAFE_INTEGER || !object(input.profile) ||
      !Array.isArray(input.works) || input.works.length > 40) invalid('作品集');
  if (input.slug !== undefined && input.slug !== slug) invalid('创作者标识');
  const p = input.profile;
  const title = text(p.title ?? p.role ?? '', '身份', 80);
  const tags = p.tags ?? [];
  if (!Array.isArray(tags) || tags.length > 5) invalid('领域');
  const profile = {
    name: text(p.name, '姓名', 40, true), alias: text(p.alias ?? '', '别名', 40),
    role: title, title, tags: [...new Set(tags.map(t => text(t, '领域', 30, true)))], bio: text(p.bio ?? '', '简介', 300),
    about: text(p.about ?? '', '关于', 2000), email: text(p.email ?? '', '邮箱', 120),
    contact: text(p.contact ?? p.email ?? '', '联系方式', 200),
    avatar: p.avatar === '' ? '' : image(p.avatar),
    cover: (p.cover ?? p.avatar) === '' ? '' : image(p.cover ?? p.avatar),
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
      videoId, isDemo: w.type === 'video' && videoId === DEMO_VID,
      duration: w.type === 'video' && Number.isFinite(w.duration) && w.duration >= 0 && w.duration <= 86400 ? w.duration : null,
      highlights
    };
  });
  return { slug, revision: input.revision, profile, works };
}
