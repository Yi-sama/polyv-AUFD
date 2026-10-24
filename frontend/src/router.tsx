import { useSyncExternalStore } from 'react';
import type { AnchorHTMLAttributes, MouseEvent } from 'react';
import { flushSync } from 'react-dom';

const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());
let shownPath = window.location.pathname;
listeners.add(() => { shownPath = window.location.pathname; });

// Back/forward into or out of a work keeps the shared-element animation.
window.addEventListener('popstate', () => {
  const was = /\/w\//.test(shownPath), now = /\/w\//.test(window.location.pathname);
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } };
  if (was === now || !doc.startViewTransition || reducedMotion()) { emit(); return; }
  document.documentElement.dataset.transition = now ? 'open' : 'close';
  doc.startViewTransition(() => flushSync(emit)).finished.finally(() => { delete document.documentElement.dataset.transition; });
});

const subscribe = (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); };
const snapshot = () => window.location.pathname + window.location.search;

export function useLocation() {
  const href = useSyncExternalStore(subscribe, snapshot);
  const url = new URL(href, window.location.origin);
  return { path: url.pathname, query: url.searchParams, href };
}

/** True when the previous history entry is `path`, so closing can simply go back. */
export const cameFrom = (path: string) => (history.state as { from?: string } | null)?.from === path;

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

type Transition = 'none' | 'tune' | 'open' | 'close';

/** Navigate, optionally wrapped in a View Transition so shared elements and channel switches animate. */
export function navigate(to: string, { replace = false, transition = 'none' as Transition } = {}) {
  if (to === snapshot()) return;
  const commit = () => {
    if (replace) history.replaceState(history.state, '', to); else history.pushState({ from: snapshot() }, '', to);
    flushSync(emit);
  };
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } };
  if (transition === 'none' || !doc.startViewTransition || reducedMotion()) {
    commit();
    if (transition !== 'close' && transition !== 'open') window.scrollTo(0, 0);
    return;
  }
  document.documentElement.dataset.transition = transition;
  const vt = doc.startViewTransition(() => {
    commit();
    if (transition === 'tune') window.scrollTo(0, 0);
  });
  vt.finished.finally(() => { delete document.documentElement.dataset.transition; });
}

export function Link({ to, transition, replace, onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & {
  to: string; transition?: Transition; replace?: boolean;
}) {
  return <a {...props} href={to} onClick={(event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(to, { transition, replace });
  }} />;
}
