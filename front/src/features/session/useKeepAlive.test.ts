import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const pingMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../../services/auth.service', () => ({
  AuthService: { ping: (...args: unknown[]) => pingMock(...args) },
}));

const millisSinceSessionRenewalMock = vi.fn();
vi.mock('./sessionActivity', () => ({
  millisSinceSessionRenewal: (...args: unknown[]) => millisSinceSessionRenewalMock(...args),
}));

// useKeepAlive keeps a module-scope `lastPingAt` that is not exported, so
// each test re-imports the module fresh (vi.resetModules) to get its own
// clean throttle state rather than leaking one test's ping into the next.
describe('useKeepAlive', () => {
  beforeEach(() => {
    vi.resetModules();
    pingMock.mockClear();
    millisSinceSessionRenewalMock.mockReset().mockReturnValue(120_000);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fires a ping on an allowed event (keydown) when both throttles are satisfied', async () => {
    const { useKeepAlive } = await import('./useKeepAlive');
    renderHook(() => useKeepAlive(true));

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown'));
    });

    expect(pingMock).toHaveBeenCalledTimes(1);
  });

  it('does not fire on mousemove', async () => {
    const { useKeepAlive } = await import('./useKeepAlive');
    renderHook(() => useKeepAlive(true));

    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove'));
    });

    expect(pingMock).not.toHaveBeenCalled();
  });

  it('does nothing when disabled', async () => {
    const { useKeepAlive } = await import('./useKeepAlive');
    renderHook(() => useKeepAlive(false));

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown'));
    });

    expect(pingMock).not.toHaveBeenCalled();
  });

  it('suppresses a ping when less than 60s have passed since this hook last pinged', async () => {
    const { useKeepAlive } = await import('./useKeepAlive');
    renderHook(() => useKeepAlive(true));

    act(() => window.dispatchEvent(new KeyboardEvent('keydown')));
    expect(pingMock).toHaveBeenCalledTimes(1);

    act(() => window.dispatchEvent(new KeyboardEvent('keydown')));
    expect(pingMock).toHaveBeenCalledTimes(1);
  });

  it('suppresses a ping when less than 60s have passed since the last real renewal', async () => {
    millisSinceSessionRenewalMock.mockReturnValue(1_000);
    const { useKeepAlive } = await import('./useKeepAlive');
    renderHook(() => useKeepAlive(true));

    act(() => window.dispatchEvent(new KeyboardEvent('keydown')));

    expect(pingMock).not.toHaveBeenCalled();
  });
});
