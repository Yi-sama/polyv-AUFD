import type { Work } from './types.ts';

export interface Story {
  label: string;
  english: string;
  introduction: string;
  thought: string;
  credit: string;
  images: { src: string; caption: string; source: string }[];
}

const media = (name: string) => `/demo-media/${name}.jpg`;
export const demoDimensions: Record<string, { width: number; height: number }> = Object.fromEntries(
  Object.entries({
    stage: 1377, audience: 1200, panel: 1350, architecture: 2700,
    facade: 2700, structure: 2700, conversation: 1200, workshop: 1202,
  }).map(([name, height]) => [media(name), { width: 1800, height }]),
);
const photo = (name: string, caption: string, id: string) => ({
  src: media(name), caption, source: `https://unsplash.com/photos/${id}`,
});

const stories: Story[] = [
  {
    label: '现场记录', english: 'IN GOOD COMPANY',
    introduction: '一次分享，不只发生在舞台上。目光、提问与回响，让抽象的想法有了真实的温度。',
    thought: '从一个人的表达，\n到一群人的共鸣。',
    credit: 'Product School',
    images: [
      photo('stage', '01 / 表达：从一个想法开始', 'GhAFNoNc1vk'),
      photo('audience', '02 / 聆听：镜头转向台下', 'phlc0v-lcvw'),
      photo('panel', '03 / 交汇：不同视角，在同一个现场', 'dJICd7b_LlE'),
    ],
  },
  {
    label: '视觉观察', english: 'SPACE BETWEEN',
    introduction: '抬头之后，城市呈现出另一种秩序。曲线、重复与留白，构成一组关于空间的视觉笔记。',
    thought: '在日常里，\n留一点观察的余地。',
    credit: 'Joel Filipe',
    images: [
      photo('architecture', '01 / 曲线：向上延伸的秩序', '7kjeW-xwArI'),
      photo('facade', '02 / 消隐：建筑与天空的边界', 'GI_-TWgI5ao'),
      photo('structure', '03 / 重复：立面里的节奏', 'Z8-32lPNGpY'),
    ],
  },
  {
    label: '交流切片', english: 'AFTER THE TALK',
    introduction: '灯光之外，还有值得记录的瞬间。走近一些，看见交流如何从正式的表达，变成轻松的对话。',
    thought: '好的对话，\n不止于散场。',
    credit: 'Product School',
    images: [
      photo('conversation', '01 / 幕后：放松下来的片刻', 'cLY8gZwGdmY'),
      photo('workshop', '02 / 相遇：从现场继续延伸', 'VRbfqglJbcE'),
    ],
  },
];

export const demoWorks: Work[] = stories.map((story, index) => ({
  id: ['demo-in-company', 'demo-space-between', 'demo-after-talk'][index],
  type: 'photo',
  title: ['同频，在现场', '城市的留白', '对话，仍在继续'][index],
  subtitle: story.label,
  date: '',
  description: story.introduction,
  cover: story.images[0].src,
  images: story.images.map(image => image.src),
  featured: index < 2,
  videoId: '',
  isDemo: true,
  highlights: [],
}));

// Demo stories are presentation-only. Never merge them into the editable API document.
export function getStory(work: Work) {
  const index = demoWorks.indexOf(work);
  return index < 0 ? undefined : stories[index];
}

export function exhibitionWorks(savedWorks: Work[]) {
  return [...savedWorks, ...demoWorks.filter(demo => !savedWorks.some(work => work.id === demo.id))];
}

export const attribution = (work: Work) => getStory(work) ? '演示专题' : work.isDemo ? '官方示例' : '';
