import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const pingMock = vi.fn();
vi.mock('../../services/auth.service', () => ({
  AuthService: { ping: (...args: unknown[]) => pingMock(...args) },
}));

import { useSessionExpiry } from './useSessionExpiry';
import { markSessionRenewed } from './sessionActivity';

/** Builds a JWT-shaped string with a controlled `exp` claim (seconds since epoch). */
function makeToken(expSeconds: number): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ exp: expSeconds, sessionStartedAt: Date.now() }));
  return `${header}.${payload}.signature`;
}

describe('useSessionExpiry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    pingMock.mockReset();
    // Baseline: nothing tested here should depend on a stale renewal tick
    // left over from a previous test in this file.
    markSessionRenewed();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does nothing when there is no token', () => {
    const { result } = renderHook(() => useSessionExpiry(true, vi.fn()));

    expect(result.current.warning).toBe(false);
    expect(result.current.secondsRemaining).toBeNull();
  });

  it('shows the warning once inside the 60 second window before expiry', () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    window.localStorage.setItem('token', makeToken(nowSeconds + 65));

    const { result } = renderHook(() => useSessionExpiry(true, vi.fn()));

    expect(result.current.warning).toBe(false);

    act(() => {
      vi.advanceTimersByTime(7_000);
    });

    expect(result.current.warning).toBe(true);
  });

  it('calls onExpire once the deadline is reached', () => {
    const onExpire = vi.fn();
    const nowSeconds = Math.floor(Date.now() / 1000);
    window.localStorage.setItem('token', makeToken(nowSeconds + 3));

    renderHook(() => useSessionExpiry(true, onExpire));

    act(() => {
      vi.advanceTimersByTime(3_100);
    });

    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('extend() pings the server, and the warning clears once the renewal lands', async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    window.localStorage.setItem('token', makeToken(nowSeconds + 65));

    pingMock.mockImplementation(async () => {
      // Simulate the server issuing a fresh token far from expiry, and the
      // response interceptor (api.service.ts) picking up the renewal.
      window.localStorage.setItem('token', makeToken(Math.floor(Date.now() / 1000) + 600));
      markSessionRenewed();
    });

    const { result } = renderHook(() => useSessionExpiry(true, vi.fn()));

    act(() => {
      vi.advanceTimersByTime(7_000);
    });
    expect(result.current.warning).toBe(true);

    await act(async () => {
      await result.current.extend();
    });

    expect(pingMock).toHaveBeenCalledTimes(1);
    expect(result.current.warning).toBe(false);
  });
});
