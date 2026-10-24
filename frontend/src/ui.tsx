import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { ImageOff } from 'lucide-react';
import { Link } from './router';
import { useSession } from './store';
import type { Media } from './types';

export const ch = (n: number) => String(n).padStart(2, '0');

/* Each channel gets a stable ident colour, so monogram avatars and tally marks stay recognisable. */
const IDENT = ['#e8553a', '#3d7bd9', '#d9a43d', '#3fae8c', '#a46be0', '#e0679b', '#5fb0d6', '#9bb03f'];
export const identColor = (channel: number) => IDENT[(Math.max(1, channel) - 1) % IDENT.length];

export function Ident({ name, avatar, channel, size = 48, className = '' }: {
  name: string; avatar: string; channel: number; size?: number; className?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [avatar]);
  const style = { '--ident': identColor(channel), width: size, height: size } as CSSProperties;
  return avatar && !failed
    ? <img className={`ident ${className}`} style={style} src={avatar} alt="" onError={() => setFailed(true)} />
    : <span className={`ident ident-mono ${className}`} style={{ ...style, fontSize: size * 0.46 }} aria-hidden="true">
      {[...(name || '?')][0]}
    </span>;
}

export function Img({ src, alt, media, className = '', eager = false, style }: {
  src: string; alt: string; media?: Media | { width: number; height: number }; className?: string;
  eager?: boolean; style?: CSSProperties;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const dims = media && 'width' in media && typeof media.width === 'number'
    ? media as { width: number; height: number }
    : (media as Media | undefined)?.[src];
  if (failed || !src) {
    return <span className={`img-missing ${className}`} style={style}><ImageOff size={22} /><span>图片暂不可用</span></span>;
  }
  return <img className={className} style={style} src={src} alt={alt} loading={eager ? 'eager' : 'lazy'} decoding="async" referrerPolicy="no-referrer"
    width={dims?.width || undefined} height={dims?.height || undefined} onError={() => setFailed(true)} />;
}

export function Masthead({ children }: { children?: ReactNode }) {
  const { session } = useSession();
  return (
    <header className="masthead">
      <Link to="/" className="wordmark" aria-label="AUFD 节目表">
        <span className="wordmark-mark">AUFD</span>
        <span className="wordmark-sub">大咖作品频道</span>
      </Link>
      <div className="masthead-mid">{children}</div>
      <nav className="masthead-nav">
        {session
          ? <Link to="/studio" className="pill">我的频道 · 编辑</Link>
          : <>
            <Link to="/login" className="masthead-link">登录</Link>
            <Link to="/join" className="pill">入驻</Link>
          </>}
      </nav>
    </header>
  );
}

export function Notice({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="notice" role="status">
      <p className="notice-title">{title}</p>
      {children && <p className="notice-body">{children}</p>}
      {action}
    </div>
  );
}

export function TuneStatic() {
  return <div className="tune-static" aria-hidden="true" />;
}
