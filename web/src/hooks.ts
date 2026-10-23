import { useSyncExternalStore } from 'react'

function media(query: string) {
  return {
    subscribe(cb: () => void) {
      const m = window.matchMedia(query)
      m.addEventListener('change', cb)
      return () => m.removeEventListener('change', cb)
    },
    get: () => window.matchMedia(query).matches,
  }
}

const wide = media('(min-width: 768px)')
const still = media('(prefers-reduced-motion: reduce)')

/** 桌面宽度：展墙用长廊，否则单列 */
export const useWide = () => useSyncExternalStore(wide.subscribe, wide.get)
export const useReducedMotion = () => useSyncExternalStore(still.subscribe, still.get)
