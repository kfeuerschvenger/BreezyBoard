import { useSyncExternalStore } from 'react';

/**
 * Whether a CSS media query currently matches, kept in step as it changes.
 *
 * Use it only where a stylesheet cannot do the job, such as choosing which
 * property a JavaScript animation drives. Anything that is only a matter of
 * layout belongs in a breakpoint class, which needs no render to respond.
 *
 * An environment with no `matchMedia`, such as jsdom, reports `fallback`.
 *
 * @param query - A media query, such as `(min-width: 768px)`.
 * @param fallback - The answer where media queries are not available.
 */
export function useMediaQuery(query: string, fallback = false): boolean {
  return useSyncExternalStore(
    notify => {
      // Checked again here and not carried over from the render: React runs the
      // subscription in a passive effect, which can land after the environment
      // that had `matchMedia` at render time has been torn down.
      if (!isSupported()) return () => {};
      const list = window.matchMedia(query);
      list.addEventListener('change', notify);
      return () => list.removeEventListener('change', notify);
    },
    () => (isSupported() ? window.matchMedia(query).matches : fallback),
    () => fallback
  );
}

const isSupported = (): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function';
