import { act } from '@testing-library/react';

type MediaWindow = { matchMedia?: typeof window.matchMedia };

export interface MediaStub {
  /** Changes whether a query matches and tells everything listening to it. */
  set: (query: string, matches: boolean) => void;
}

/**
 * Gives jsdom a `matchMedia`, which it does not have, that answers from a table
 * the test controls.
 *
 * A query that is not in the table does not match. Setting one notifies every
 * listener inside `act`, which is what a browser does when a window is resized
 * or a system preference is flipped, so a component that follows the query
 * re-renders as it would there.
 *
 * Call `restoreMatchMedia` after the test so the next one sees jsdom's own
 * behaviour, where components fall back to their default answer.
 */
export const stubMatchMedia = (initial: Record<string, boolean>): MediaStub => {
  const answers = { ...initial };
  const listeners = new Set<() => void>();

  (window as MediaWindow).matchMedia = ((query: string) => ({
    get matches() {
      return answers[query] ?? false;
    },
    media: query,
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  })) as unknown as typeof window.matchMedia;

  return {
    set: (query, matches) => {
      answers[query] = matches;
      act(() => listeners.forEach(listener => listener()));
    },
  };
};

export const restoreMatchMedia = () => {
  delete (window as MediaWindow).matchMedia;
};
