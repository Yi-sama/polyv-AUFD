import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight, Check, Copy, Maximize2, Minimize2, X } from 'lucide-react';
import type { Work } from './types';
import { workTypeLabels } from './types';
import { imageList } from './portfolio-utils';
import { attribution, getStory } from './demo-content';
import { Artwork, Modal, number, Tool } from './ui';
import PolyvPlayer from './PolyvPlayer';

function Lightbox({ images, initial, title, onClose }: {
  images: string[]; initial: number; title: string; onClose: () => void;
}) {
  const [index, setIndex] = useState(initial);
  const [zoomed, setZoomed] = useState(false);
  const area = useRef<HTMLDivElement>(null);
  function move(next: number) {
    setIndex(next); setZoomed(false); area.current?.scrollTo(0, 0);
  }
  return <Modal label={`${title} 原图`} onClose={onClose} className="lightbox">
    <header className="lightbox-header"><span>{number(index + 1)} / {number(images.length)}</span>
      <div className="tools">
        <Tool label={zoomed ? '适合窗口' : '放大原图'} aria-pressed={zoomed} onClick={() => setZoomed(!zoomed)}>
          {zoomed ? <Minimize2 size={19} /> : <Maximize2 size={19} />}
        </Tool><Tool label="关闭原图" onClick={onClose}><X size={23} /></Tool>
      </div>
    </header>
    <div ref={area} className={`lightbox-image ${zoomed ? 'zoomed' : ''}`}>
      <Artwork src={images[index]} alt={`${title}，图片 ${index + 1}`} eager />
    </div>
    <footer className="lightbox-footer">
      <Tool label="上一张图片" disabled={!index} onClick={() => move(index - 1)}><ArrowLeft size={22} /></Tool>
      <span>{title}</span>
      <Tool label="下一张图片" disabled={index === images.length - 1} onClick={() => move(index + 1)}><ArrowRight size={22} /></Tool>
    </footer>
  </Modal>;
}

export default function ProjectView({ work, works, video, onSelect, onClose, onShare, notice, preview = false, canPlay = true }: {
  work: Work; works: Work[]; video?: Work; onSelect: (id: string, replace?: boolean) => void;
  onClose: () => void; onShare: () => void; notice: string;
  preview?: boolean; canPlay?: boolean;
}) {
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [playRelated, setPlayRelated] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const story = getStory(work);
  const images = imageList(work);
  const position = works.indexOf(work);
  const next = works[(position + 1) % works.length];
  useEffect(() => {
    setLightbox(null); setPlayRelated(false);
    scrollRef.current?.scrollTo(0, 0);
  }, [work.id]);

  const figure = (src: string, index: number) => <figure className={`project-figure ${work.type === 'poster' ? 'poster-figure' : ''}`} key={src}>
    <button type="button" className="project-image-button" onClick={() => setLightbox(index)} aria-label={`放大 ${work.title} 图片 ${index + 1}`}>
      <Artwork src={src} alt={story?.images[index]?.caption || `${work.title}，图片 ${index + 1}`} eager={index === 0} />
      <span className="image-expand"><Maximize2 size={18} /></span>
    </button>
    <figcaption><span>{story?.images[index]?.caption || `${number(index + 1)} / ${work.title}`}</span>
      {story && <a href={story.images[index].source} target="_blank" rel="noreferrer">摄影 / {story.credit}<ArrowUpRight size={13} /></a>}
    </figcaption>
  </figure>;

  return <Modal label={`作品：${work.title}`} onClose={onClose} className="project-dialog">
    <header className="project-header">
      <button type="button" className="text-command" onClick={onClose}><ArrowLeft size={18} />{preview ? '返回编辑' : '返回作品集'}</button>
      <span className="project-breadcrumb">{number(position + 1)} / {number(works.length)}<span>{work.title}</span></span>
      <div className="tools">{!preview && <Tool label="复制作品链接" onClick={onShare}><Copy size={18} /></Tool>}
        <Tool label="关闭作品" onClick={onClose}><X size={23} /></Tool></div>
    </header>
    <div className="project-scroll" ref={scrollRef}>
      <article className="project-body">
        <div className="project-heading">
          {preview && <p className="source-note" role="status">草稿预览 · 尚未保存到公开作品集</p>}
          <p className="eyebrow">{story?.english || (work.type === 'video' ? 'MOTION PICTURE' : 'SELECTED PROJECT')}
            {attribution(work) && <span className="demo-label">{attribution(work)}</span>}</p>
          <h1>{work.title}</h1>
          <div className="project-intro">
            <p>{work.description}</p>
            <dl><div><dt>类别</dt><dd>{story?.label || workTypeLabels[work.type]}</dd></div>
              <div><dt>{story ? '摄影' : '时间'}</dt><dd>{story?.credit || work.date?.replaceAll('-', '.') || '未填写'}</dd></div>
              <div><dt>内容</dt><dd>{number(images.length)} 幅图像{work.videoId && ' + 影像'}</dd></div>
            </dl>
          </div>
          {story && <p className="source-note">授权图片的演示编排，非刘润森本人作品或活动经历。</p>}
          {work.isDemo && !story && <p className="source-note">保利威官方示例，非个人作品。</p>}
        </div>

        {work.videoId
          ? <section className="project-video">{canPlay ? <PolyvPlayer work={work} />
            : <p className="source-note">该视频尚未保存到公开作品集，保存后可验证播放权限。</p>}</section>
          : null}
        {images.length > 0 && <>
          {images[0] && figure(images[0], 0)}
          {story && <div className="project-thought"><span className="eyebrow">A CLOSER LOOK</span>
            <h2>{story.thought}</h2><ArrowDown size={28} strokeWidth={1} /></div>}
          <div className={`project-sequence ${story?.english === 'SPACE BETWEEN' ? 'portrait-sequence' : ''}`}>
            {images.slice(1).map((src, index) => figure(src, index + 1))}
          </div>
        </>}
        {story && <div className="project-credits"><h2>关于这组影像</h2>
          <p>摄影：{story.credit} / Unsplash<br />专题标题与图文编排：AUFD 演示内容</p>
          <a href="https://unsplash.com/license" target="_blank" rel="noreferrer" className="text-command">素材使用许可<ArrowUpRight size={16} /></a>
        </div>}
        {story?.english === 'IN GOOD COMPANY' && video && <section className="related-film">
          <div><p className="eyebrow">MOVING IMAGE / POLYV</p><h2>从静帧，到影像。</h2>
            <p className="source-note">以下为独立的保利威官方播放示例，与上述活动无关。</p></div>
          {playRelated ? <PolyvPlayer work={video} /> : <button type="button" className="text-command" onClick={() => setPlayRelated(true)}>观看示例<ArrowUpRight size={22} /></button>}
        </section>}
      </article>
      <footer className="project-next">
        <button type="button" className="text-command" onClick={onClose}><ArrowLeft size={18} />{preview ? '返回编辑' : '全部作品'}</button>
        {next && next !== work && <button type="button" className="next-project-button" onClick={() => onSelect(next.id, true)}>
          <span><small>下一个项目 / {attribution(next) || workTypeLabels[next.type]}</small>{next.title}</span><ArrowRight size={38} strokeWidth={1} />
        </button>}
      </footer>
    </div>
    {lightbox !== null && <Lightbox images={images} initial={lightbox} title={work.title} onClose={() => setLightbox(null)} />}
    {notice && <div className="toast" role="status"><Check size={17} />{notice}</div>}
  </Modal>;
}
