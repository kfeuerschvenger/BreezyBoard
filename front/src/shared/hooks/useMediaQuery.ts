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
  const supported = typeof window !== 'undefined' && typeof window.matchMedia === 'function';

  return useSyncExternalStore(
    notify => {
      if (!supported) return () => {};
      const list = window.matchMedia(query);
      list.addEventListener('change', notify);
      return () => list.removeEventListener('change', notify);
    },
    () => (supported ? window.matchMedia(query).matches : fallback),
    () => fallback
  );
}
