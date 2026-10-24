import type { Creator, Work } from './types';

/*
 * Dev-only preview data, shown only while the backend still serves the old single-creator contract.
 * Fictional sample creators; photos are credited Unsplash images (public/demo-media/SOURCES.md).
 */
const img = (name: string) => `/demo-media/${name}.jpg`;
const heights: Record<string, number> = {
  stage: 1377, audience: 1200, panel: 1350, architecture: 2700,
  facade: 2700, structure: 2700, conversation: 1200, workshop: 1202,
};
const media = Object.fromEntries(Object.entries(heights).map(([k, h]) => [img(k), { width: 1800, height: h }]));

const work = (id: string, type: Work['type'], title: string, cover: string, extra: Partial<Work> = {}): Work => ({
  id, type, title, subtitle: '', date: '', description: '', cover, images: [cover],
  featured: false, videoId: '', isDemo: false, highlights: [], ...extra,
});

const base = (slug: string, channel: number, profile: Partial<Creator['profile']>, works: Work[]): Creator => ({
  slug, channel, revision: 0, isSample: true, media,
  profile: {
    name: '', alias: '', title: '', tags: [], bio: '', about: '', contact: '',
    avatar: '', cover: '', updatedAt: '2026-10-24', ...profile,
  },
  works,
});

export const mockCreators: Creator[] = [
  base('zoe-lin', 2, {
    name: '林知夏', alias: 'Zoe Lin', title: '直播运营讲师', tags: ['直播运营', '私域增长'],
    bio: '把一场直播拆成可复用的方法。', about: '示例大咖，人物与经历均为虚构，用于演示平台效果。',
  }, [
    work('stage', 'photo', '一场关于直播复盘的分享', img('stage'), {
      featured: true, subtitle: '现场照片', images: [img('stage'), img('audience'), img('panel')],
      description: '示例作品：现场照片来自 Unsplash（Product School）。',
    }),
    work('clip', 'video', '直播间开场三十秒', img('audience'), {
      videoId: '88083abbf5bcf1356e05d39666be527a_8', isDemo: true, subtitle: '保利威官方示例视频',
      highlights: [{ title: '开场', seconds: 0 }, { title: '要点', seconds: 6 }],
    }),
    work('panel', 'photo', '圆桌对谈', img('panel')),
  ]),
  base('yu-zhou', 3, {
    name: '周屿', alias: 'Yu Zhou', title: '建筑摄影师', tags: ['建筑摄影', '视觉设计'],
    bio: '在城市里寻找秩序与留白。', about: '示例大咖，人物与经历均为虚构，用于演示平台效果。',
  }, [
    work('arch', 'photo', '曲线', img('architecture'), { featured: true, description: '示例作品：Unsplash（Joel Filipe）。' }),
    work('facade', 'photo', '重复', img('facade')),
    work('structure', 'photo', '结构', img('structure')),
  ]),
  base('hera-chen', 4, {
    name: '陈一禾', alias: 'Hera Chen', title: '企业培训讲师', tags: ['企业培训', '沟通表达'],
    bio: '让每一次培训都有人真正听进去。', about: '示例大咖，人物与经历均为虚构，用于演示平台效果。',
  }, [
    work('talk', 'photo', '工作坊现场', img('workshop'), { featured: true }),
    work('conv', 'photo', '一对一辅导', img('conversation')),
  ]),
];
