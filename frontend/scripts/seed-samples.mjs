// Adds extra fictional sample channels through the public API (join → upload → save), like a real creator would.
// Usage: node scripts/seed-samples.mjs <downloadDir1> <downloadDir2>
import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BASE ?? 'http://127.0.0.1:5175';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const dirs = process.argv.slice(2);
const credits = {};
for (const dir of dirs) for (const name of ['food', 'pod', 'poster', 'travel']) {
  try { for (const c of JSON.parse(await readFile(path.join(dir, `${name}.json`), 'utf8'))) credits[c.file] = { ...c, dir }; } catch {}
}
const credit = file => { const c = credits[file]; return `图片：${c.artist || '佚名'}，${c.license}，Wikimedia Commons。`; };

const people = [
  { slug: 'su-wan', name: '苏晚', alias: 'Su Wan', title: '视觉设计讲师', tags: ['海报设计', '视觉设计'],
    bio: '用经典海报讲清楚版式、色彩与信息层级。', about: '示例大咖：人物与经历均为虚构。频道中的海报为公共领域馆藏作品，作为课程案例展示，并非本人创作。',
    works: [
      ['travel-2.jpg', 'poster', '案例拆解：一块岩石上的叙事', '国家公园系列海报 · 公共领域', '两只岩羊、一块岩石、一行标语：用最少的元素讲一个完整的故事。原作为 1930 年代美国 WPA 海报。'],
      ['travel-3.jpg', 'poster', '案例拆解：竖向构图的力量', '国家公园系列海报 · 公共领域', '喷泉的垂直动势把视线从标题一路引到底部信息区。原作为 1930 年代美国 WPA 海报。'],
      ['travel-1.jpg', 'poster', '案例拆解：色块与层次', '国家公园系列海报 · 公共领域', '有限的套色印刷，如何做出远近层次。原作为 1930 年代美国 WPA 海报。'],
      ['poster-2.jpg', 'poster', '案例拆解：字就是画面', '剧场海报 · 公共领域', '没有一张图，只靠字号对比完成信息层级。原作为美国联邦剧场计划海报。'],
    ] },
  { slug: 'he-tian', name: '何田', alias: 'He Tian', title: '美食直播主理人', tags: ['美食', '电商直播'],
    bio: '一道菜，一场直播，把好味道讲给屏幕前的人。', about: '示例大咖：人物与经历均为虚构。照片为 Wikimedia Commons 授权素材，不代表本人作品。',
    works: [
      ['food-2.jpg', 'photo', '直播封面：秋日菌菇', '直播间封面照', '用一张俯拍定住整场直播的气质。'],
      ['food-1.jpg', 'photo', '直播封面：慢烤肉卷', '直播间封面照', '白盘、留白、一点绿色，让镜头只看见菜。'],
      ['food-3.jpg', 'photo', '幕后：一锅咖喱', '直播幕后', '直播之前的试菜，也是一场小型拍摄。'],
    ] },
  { slug: 'jiang-he', name: '江河', alias: 'Jiang He', title: '播客主播', tags: ['播客', '音频内容'],
    bio: '每周一期，和不同行业的人聊聊他们正在做的事。', about: '示例大咖：人物与经历均为虚构。照片为 Wikimedia Commons 授权素材，不代表本人作品。',
    works: [
      ['pod-2.jpg', 'photo', '录音间', '工作现场', '四支麦克风，一张圆桌，一次没有剧本的对话。'],
      ['pod-4.jpg', 'photo', '剪辑台', '工作现场', '一期节目背后的三个小时。'],
      ['pod-1.jpg', 'photo', '新录音室落成', '工作现场', '吸音板换上了颜色，节目也换了一种心情。'],
    ] },
];

let cookie = '';
async function call(method, url, body, isForm = false) {
  const res = await fetch(BASE + url, { method, headers: {
    ...(isForm ? {} : body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), origin: BASE,
  }, body: isForm ? body : body ? JSON.stringify(body) : undefined });
  const set = res.headers.get('set-cookie'); if (set) cookie = set.split(';')[0];
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${JSON.stringify(data)}`);
  return data;
}

for (const p of people) {
  cookie = '';
  const loginFile = path.join(root, 'server/data/creators', p.slug, 'demo-login.local.json');
  let creator;
  try {
    const { password } = JSON.parse(await readFile(loginFile, 'utf8'));
    creator = (await call('POST', '/api/auth/login', { slug: p.slug, password })).creator;
    console.log('login', p.slug);
  } catch {
    const password = randomBytes(12).toString('base64url');
    creator = (await call('POST', '/api/auth/join', { slug: p.slug, name: p.name, password })).creator;
    await writeFile(loginFile, JSON.stringify({ slug: p.slug, password }, null, 2));
    console.log('joined', p.slug, 'channel', creator.channel);
  }
  const works = [];
  for (const [file, type, title, subtitle, description] of p.works) {
    const form = new FormData();
    form.append('file', new Blob([await readFile(path.join(credits[file].dir, file))], { type: 'image/jpeg' }), file);
    const up = await call('POST', '/api/upload', form, true);
    works.push({ id: file.replace('.jpg', ''), type, title, subtitle, date: '', description: `${description}\n${credit(file)}`,
      cover: up.url, images: [up.url], featured: works.length === 0, videoId: '', highlights: [] });
  }
  const saved = await call('PUT', `/api/creators/${p.slug}`, { revision: creator.revision, works, profile: {
    name: p.name, alias: p.alias, title: p.title, tags: p.tags, bio: p.bio, about: p.about, contact: '',
    avatar: works[0].cover, cover: works[0].cover } });
  console.log('saved', p.slug, 'rev', saved.revision, 'works', saved.works.length);
}

const lines = ['# 额外示例频道的图片来源（Claude 前端通过 API 添加）', '',
  '人物均为虚构。图片来自 Wikimedia Commons，许可如下；上传后由后端转为 WebP。', '',
  '| 文件 | 原标题 | 作者 | 许可 | 来源 |', '|---|---|---|---|---|',
  ...Object.values(credits).filter(c => people.some(p => p.works.some(w => w[0] === c.file)))
    .map(c => `| ${c.file} | ${c.title.replace('File:', '')} | ${c.artist || '佚名'} | ${c.license} | ${c.source} |`)];
await writeFile(path.join(root, 'docs/sample-media-credits.md'), lines.join('\n') + '\n');
console.log('credits written');
