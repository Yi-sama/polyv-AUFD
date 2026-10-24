import { useEffect, useRef, useState } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { ImageOff } from 'lucide-react';
import { demoDimensions } from './demo-content';

export const number = (value: number) => String(value).padStart(2, '0');
let openModals = 0;
let previousOverflow = '';

export function Tool({ label, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button {...props} type="button" title={label} aria-label={label}
    className={`tool ${props.className || ''}`}>{children}</button>;
}

export function Artwork({ src, alt, className = '', eager = false }: {
  src: string; alt: string; className?: string; eager?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return failed || !src
    ? <span className={`missing-image ${className}`}><ImageOff size={28} /><span>图片暂不可用</span></span>
    : <img className={className} src={src} alt={alt} loading={eager ? 'eager' : 'lazy'}
      {...demoDimensions[src]}
      decoding="async" onError={() => setFailed(true)} />;
}

export function Modal({ children, label, onClose, className = '' }: {
  children: ReactNode; label: string; onClose: () => void; className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    // A browser-back navigation can unmount both the project and its lightbox together.
    if (openModals === 0) previousOverflow = document.body.style.overflow;
    openModals += 1;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    return () => {
      dialog.close();
      openModals -= 1;
      if (openModals === 0) document.body.style.overflow = previousOverflow;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  return <dialog ref={ref} aria-label={label} className={className}
    onCancel={event => { event.preventDefault(); onClose(); }}>{children}</dialog>;
}
