import { useEffect, useState, useSyncExternalStore } from 'react';
import { getCreator, getSession, listCreators } from './api';
import type { Creator, CreatorSummary, Session } from './types';

/* Tiny cache so channel switches render from memory and transitions never snapshot a spinner. */

const creators = new Map<string, Promise<Creator>>();
const resolved = new Map<string, Creator>();
let list: Promise<CreatorSummary[]> | null = null;
let listValue: CreatorSummary[] | null = null;

export function loadCreator(slug: string) {
  let promise = creators.get(slug);
  if (!promise) {
    promise = getCreator(slug).then(c => { resolved.set(slug, c); return c; });
    promise.catch(() => creators.delete(slug));
    creators.set(slug, promise);
  }
  return promise;
}
export const prefetch = (slug: string) => { void loadCreator(slug).catch(() => undefined); };

export function loadList() {
  if (!list) {
    list = listCreators().then(v => { listValue = v; return v; });
    list.catch(() => { list = null; });
  }
  return list;
}

export function invalidate(creator?: Creator) {
  list = null; listValue = null;
  if (creator) {
    resolved.set(creator.slug, creator);
    creators.set(creator.slug, Promise.resolve(creator));
  } else {
    creators.clear(); resolved.clear();
  }
}

type State<T> = { data: T | null; error: Error | null; retry: () => void };

function useAsync<T>(key: string, load: () => Promise<T>, initial: T | null): State<T> {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ key: string; data: T | null; error: Error | null }>(
    { key, data: initial, error: null });
  useEffect(() => {
    let live = true;
    if (!(state.key === key && state.data)) setState({ key, data: initial, error: null });
    load().then(data => { if (live) setState({ key, data, error: null }); },
      error => { if (live) setState({ key, data: null, error }); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);
  const current = state.key === key ? state : { data: initial, error: null };
  return { data: current.data, error: current.error, retry: () => setAttempt(a => a + 1) };
}

export const useCreators = () => useAsync('list', loadList, listValue);
export const useCreator = (slug: string) => useAsync(`c:${slug}`, () => loadCreator(slug), resolved.get(slug) || null);

/* ---------- session ---------- */

let session: Session | null = null;
let sessionReady = false;
const sessionListeners = new Set<() => void>();
export function setSession(value: Session | null) {
  session = value; sessionReady = true;
  sessionListeners.forEach(l => l());
}
export function refreshSession() {
  return getSession().then(setSession, () => setSession(null));
}
export function useSession() {
  const value = useSyncExternalStore(
    l => { sessionListeners.add(l); return () => sessionListeners.delete(l); },
    () => session,
  );
  const ready = useSyncExternalStore(
    l => { sessionListeners.add(l); return () => sessionListeners.delete(l); },
    () => sessionReady,
  );
  return { session: value, ready };
}
