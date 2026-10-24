// Gives the backend's fictional seed channels readable titles via the owner API. Keeps every "fictional" notice.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const BASE = process.env.BASE ?? 'http://127.0.0.1:5175';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const credit = '图片来自 Unsplash 授权图库。';
const plan = {
  'lin-mo': { bio: '在城市里寻找秩序与留白。', works: {
    'lin-mo-1': ['螺旋', '建筑观察 · 竖幅', '抬头时，一段楼梯变成了一道曲线。'],
    'lin-mo-2': ['重复', '建筑观察 · 竖幅', '同一个窗格重复一百次，就成了节奏。'],
    'lin-mo-3': ['结构', '建筑观察 · 竖幅', '把杂物都裁掉，只留下骨架。'],
  } },
  'chen-yu': { bio: '把职场技能讲成每个人都用得上的方法。', works: {
    'chen-yu-1': ['开课前十分钟', '线下课现场', '签到台前的十分钟，决定了一堂课的气氛。'],
    'chen-yu-2': ['一对一答疑', '线下课现场', '课后的问题，往往比课上的更真实。'],
    'chen-yu-3': ['坐满的教室', '线下课现场', '从台上往下看，每一个座位都是一个具体的人。'],
  } },
  'zhou-ning': { bio: '教团队把一场直播做得专业又有温度。', works: {
    'zhou-ning-1': ['直播复盘大会', '年度分享 · 主讲', '一年的直播数据，浓缩成台上的四十分钟。'],
    'zhou-ning-2': ['圆桌：直播间里的信任', '行业论坛 · 嘉宾', '和三位同行聊，观众为什么愿意留下来。'],
    'zhou-ning-3': ['主播训练营', '企业内训', '两天时间，从开场白练到下播。'],
  } },
};
for (const [slug, p] of Object.entries(plan)) {
  let cookie = '';
  const call = async (method, url, body) => {
    const res = await fetch(BASE + url, { method, headers: { 'Content-Type': 'application/json', origin: BASE, ...(cookie ? { cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.get('set-cookie'); if (set) cookie = set.split(';')[0];
    const data = await res.json(); if (!res.ok) throw new Error(`${url} ${res.status} ${JSON.stringify(data)}`); return data;
  };
  const { password } = JSON.parse(await readFile(path.join(root, 'server/data/creators', slug, 'demo-login.local.json'), 'utf8'));
  const { creator } = await call('POST', '/api/auth/login', { slug, password });
  const works = creator.works.map(({ isDemo, duration, ...w }) => {
    const t = p.works[w.id]; if (!t) return w;
    return { ...w, title: t[0], subtitle: t[1], description: `${t[2]}\n示例作品，${credit}` };
  });
  const { role, email, updatedAt, ...profile } = creator.profile;
  const saved = await call('PUT', `/api/creators/${slug}`, { revision: creator.revision, profile: { ...profile, bio: p.bio }, works });
  console.log('polished', slug, 'rev', saved.revision);
}
