export const DEMO_VID = '88083abbf5bcf1356e05d39666be527a_8';

export function seedPortfolio() {
  return {
    revision: 0,
    profile: {
      name: '刘润森',
      alias: 'Yisama',
      role: '创作者 / 产品探索者',
      bio: '喜欢有意思的想法，也喜欢把它们做出来。在这里，收集我的作品、影像与正在发生的探索。',
      about: '关注产品、设计与技术之间的可能性。从一个灵感开始，尝试、打磨，再把它变成可以被看见、被使用的作品。',
      email: '',
      cover: '/assets/cover.jpg',
      avatar: '/assets/poster.jpg',
      updatedAt: '2026-10-23'
    },
    works: [
      {
        id: 'aufd', type: 'poster', title: 'AUFD，让作品被看见',
        subtitle: '保利威黑客松 / 参赛海报', date: '2026-10-23',
        description: '作品，不该只躺在文件夹里。\n\n把分散的照片、海报和视频整理成一个属于自己的作品空间。这张海报记录了 AUFD 最初的想法，也成为这个作品集的第一件作品。\n\n海报署名：刘润森 Yisama、王健 Soulmate。',
        cover: '/assets/poster.jpg', images: ['/assets/poster.jpg'],
        featured: true, videoId: '', isDemo: false, highlights: []
      },
      {
        id: 'together', type: 'photo', title: '一起，把想法做出来',
        subtitle: '人物影像 / 海报局部', date: '2026-10-23',
        description: '从参赛海报中保留的一段双人画面。\n\n创作的过程，也是让想法逐渐清晰的过程。这是一次探索的开始。',
        cover: '/assets/cover.jpg', images: ['/assets/cover.jpg', '/assets/poster.jpg'],
        featured: true, videoId: '', isDemo: false, highlights: []
      },
      {
        id: 'film', type: 'video', title: '影像，也是一种表达',
        subtitle: '保利威官方样例 / 接入演示', date: '2026-10-23',
        description: '当前使用保利威开发文档中的公开示例视频验证播放器接入，不是刘润森本人的作品。\n\n个人视频准备好后，可在编辑页替换为自己账号的视频 VID。',
        cover: '/assets/video-cover.jpg', images: [],
        featured: true, videoId: DEMO_VID, isDemo: true,
        highlights: [{ title: '从这里开始', seconds: 0 }, { title: '精彩片段', seconds: 15 }]
      }
    ]
  };
}

const text = (value, name, max, required = false) => {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) {
    throw new Error(`${name}格式不正确`);
  }
  return value.trim();
};

export function validImage(value) {
  return typeof value === 'string' && /^\/(?:assets|uploads)\/[a-zA-Z0-9._-]+\.(?:jpg|jpeg|png|webp)$/i.test(value);
}

export function validatePortfolio(input) {
  if (!input || !Number.isSafeInteger(input.revision) || input.revision < 0 ||
      !input.profile || !Array.isArray(input.works) || input.works.length > 40) {
    throw new Error('作品集数据格式不正确');
  }
  const p = input.profile;
  const profile = {
    name: text(p.name, '姓名', 40, true),
    alias: text(p.alias, '英文名', 40),
    role: text(p.role, '身份', 80),
    bio: text(p.bio, '简介', 300),
    about: text(p.about, '关于我', 2000),
    email: text(p.email, '邮箱', 120),
    cover: p.cover,
    avatar: p.avatar,
    updatedAt: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
  };
  if (!validImage(profile.cover) || !validImage(profile.avatar)) throw new Error('图片地址不正确');
  if (profile.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) throw new Error('邮箱格式不正确');
  const seen = new Set();
  const works = input.works.map(w => {
    if (!w || typeof w.id !== 'string' || !/^[a-zA-Z0-9_-]{1,60}$/.test(w.id) ||
        seen.has(w.id) || !['poster', 'photo', 'video'].includes(w.type)) throw new Error('作品标识不正确');
    seen.add(w.id);
    if (!validImage(w.cover) || !Array.isArray(w.images) || w.images.length > 20 || !w.images.every(validImage)) {
      throw new Error('作品图片格式不正确');
    }
    const videoId = text(w.videoId, '视频 VID', 100);
    if (videoId && !/^[a-zA-Z0-9_-]{5,100}$/.test(videoId)) throw new Error('视频 VID 格式不正确');
    if (w.type === 'video' && !videoId) throw new Error('视频作品需要填写保利威 VID');
    if (!Array.isArray(w.highlights) || w.highlights.length > 12) throw new Error('精彩片段格式不正确');
    const highlights = w.highlights.map(h => {
      if (!h || !Number.isInteger(h.seconds) || h.seconds < 0 || h.seconds > 86400) {
        throw new Error('片段时间必须是 0 到 86400 之间的整数秒');
      }
      return { title: text(h.title, '片段标题', 60, true), seconds: h.seconds };
    });
    const date = text(w.date, '日期', 10);
    if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)))) throw new Error('日期格式不正确');
    return {
      id: w.id, type: w.type, title: text(w.title, '作品标题', 100, true),
      subtitle: text(w.subtitle, '作品分类说明', 160),
      date, description: text(w.description, '作品说明', 6000),
      cover: w.cover, images: w.images,
      featured: Boolean(w.featured), videoId,
      isDemo: videoId === DEMO_VID, highlights
    };
  });
  return { revision: input.revision, profile, works };
}
