import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useDraft } from './useDraft';

describe('useDraft', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null when nothing has been stored', () => {
    const { result } = renderHook(() => useDraft<{ title: string }>('task:1'));
    expect(result.current.read()).toBeNull();
  });

  it('stores a value and reads it back', () => {
    const { result } = renderHook(() => useDraft<{ title: string }>('task:1'));

    act(() => result.current.write({ title: 'half written' }));

    expect(result.current.read()).toEqual({ title: 'half written' });
  });

  it('keeps drafts for different keys apart', () => {
    const first = renderHook(() => useDraft<string>('task:1'));
    const second = renderHook(() => useDraft<string>('task:2'));

    act(() => first.result.current.write('one'));
    act(() => second.result.current.write('two'));

    expect(first.result.current.read()).toBe('one');
    expect(second.result.current.read()).toBe('two');
  });

  it('clears a stored draft', () => {
    const { result } = renderHook(() => useDraft<string>('task:1'));
    act(() => result.current.write('something'));

    act(() => result.current.clear());

    expect(result.current.read()).toBeNull();
  });

  it('does nothing at all when the key is null', () => {
    const { result } = renderHook(() => useDraft<string>(null));

    act(() => result.current.write('ignored'));

    expect(result.current.read()).toBeNull();
    expect(window.localStorage.length).toBe(0);
  });

  it('throttles rapid writes but never drops the last one', () => {
    const { result } = renderHook(() => useDraft<string>('task:1', 500));

    act(() => result.current.write('a'));
    expect(result.current.read()).toBe('a');

    // Everything in the same window is deferred, not written immediately.
    act(() => {
      result.current.write('ab');
      result.current.write('abc');
    });
    expect(result.current.read()).toBe('a');

    // The trailing write lands, and it is the newest value, not the first
    // one that was deferred.
    act(() => vi.advanceTimersByTime(600));
    expect(result.current.read()).toBe('abc');
  });

  // The component can be gone before the trailing write is due, as when a modal
  // closes half a second after the last keystroke. The held back value is
  // stored at that moment, so the write neither waits on a timer that outlives
  // its owner nor fires into a storage somebody else has since emptied.
  it('stores the value it is holding back when it unmounts, and leaves no timer behind', () => {
    const { result, unmount } = renderHook(() => useDraft<string>('task:1', 500));
    act(() => result.current.write('a'));
    act(() => result.current.write('abc'));
    expect(window.localStorage.getItem('breezyboard:draft:task:1')).toContain('"a"');

    unmount();

    expect(window.localStorage.getItem('breezyboard:draft:task:1')).toContain('"abc"');

    window.localStorage.removeItem('breezyboard:draft:task:1');
    act(() => vi.advanceTimersByTime(600));
    expect(window.localStorage.getItem('breezyboard:draft:task:1')).toBeNull();
  });

  it('does not bring a draft back by unmounting after it was cleared', () => {
    const { result, unmount } = renderHook(() => useDraft<string>('task:1', 500));
    act(() => result.current.write('a'));
    act(() => result.current.write('abc'));
    act(() => result.current.clear());

    unmount();

    expect(window.localStorage.getItem('breezyboard:draft:task:1')).toBeNull();
  });

  it('survives localStorage throwing on write', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });

    const { result } = renderHook(() => useDraft<string>('task:1'));

    expect(() => act(() => result.current.write('value'))).not.toThrow();

    setItem.mockRestore();
  });

  it('survives a corrupted stored value', () => {
    window.localStorage.setItem('breezyboard:draft:task:1', 'not json at all');

    const { result } = renderHook(() => useDraft<string>('task:1'));

    expect(result.current.read()).toBeNull();
  });
});
