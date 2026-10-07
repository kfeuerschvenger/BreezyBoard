import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useMediaQuery } from './useMediaQuery';

type Listener = () => void;

/** A `matchMedia` whose answer a test can change, reporting to whoever subscribed. */
const stubMatchMedia = (initial: boolean) => {
  let matches = initial;
  const listeners = new Set<Listener>();

  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      get matches() {
        return matches;
      },
      addEventListener: (_type: string, listener: Listener) => listeners.add(listener),
      removeEventListener: (_type: string, listener: Listener) => listeners.delete(listener),
    }))
  );

  return {
    listeners,
    set: (next: boolean) => {
      matches = next;
      listeners.forEach(listener => listener());
    },
  };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useMediaQuery', () => {
  it('reports whether the query matches right now', () => {
    stubMatchMedia(true);

    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));

    expect(result.current).toBe(true);
  });

  it('follows the query when the viewport crosses it', () => {
    const media = stubMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));
    expect(result.current).toBe(false);

    act(() => media.set(true));
    expect(result.current).toBe(true);

    act(() => media.set(false));
    expect(result.current).toBe(false);
  });

  it('stops listening when the component goes away', () => {
    const media = stubMatchMedia(false);
    const { unmount } = renderHook(() => useMediaQuery('(min-width: 768px)'));
    expect(media.listeners.size).toBe(1);

    unmount();

    expect(media.listeners.size).toBe(0);
  });

  it('reports the fallback where media queries do not exist', () => {
    vi.stubGlobal('matchMedia', undefined);

    expect(renderHook(() => useMediaQuery('(min-width: 768px)')).result.current).toBe(false);
    expect(renderHook(() => useMediaQuery('(min-width: 768px)', true)).result.current).toBe(true);
  });
});
