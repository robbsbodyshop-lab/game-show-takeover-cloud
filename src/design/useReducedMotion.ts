import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

const getQuery = (): MediaQueryList | null =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(QUERY) : null;

const subscribe = (notify: () => void): (() => void) => {
  const mql = getQuery();
  if (!mql) return () => undefined;
  mql.addEventListener('change', notify);
  return () => {
    mql.removeEventListener('change', notify);
  };
};

const getSnapshot = (): boolean => getQuery()?.matches ?? false;

/** True when the viewer asked for reduced motion. Safe where matchMedia is missing (false). */
export const useReducedMotion = (): boolean => useSyncExternalStore(subscribe, getSnapshot, () => false);
