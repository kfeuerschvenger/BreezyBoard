import { describe, it, expect, vi, beforeEach } from 'vitest';

const { markSessionRenewedMock, clearAuthMock, redirectToLoginMock } = vi.hoisted(() => ({
  markSessionRenewedMock: vi.fn(),
  clearAuthMock: vi.fn(),
  redirectToLoginMock: vi.fn(),
}));

vi.mock('../features/session/sessionActivity', () => ({
  markSessionRenewed: markSessionRenewedMock,
}));

vi.mock('../utils/auth.helper', () => ({
  clearAuth: clearAuthMock,
  redirectToLogin: redirectToLoginMock,
}));

import { handleResponseSuccess, handleResponseError } from './api.service';

// These interceptor handlers are exported specifically so they can be
// exercised directly here, without going through axios' internal
// interceptor dispatch machinery.
describe('api.service response interceptor', () => {
  beforeEach(() => {
    window.localStorage.clear();
    markSessionRenewedMock.mockClear();
    clearAuthMock.mockClear();
    redirectToLoginMock.mockClear();
  });

  it('stores the renewed token and marks the renewal on a success response carrying x-auth-token', () => {
    window.localStorage.setItem('token', 'old-token');
    const response = { headers: { 'x-auth-token': 'new-token' }, data: {} } as unknown as Parameters<
      typeof handleResponseSuccess
    >[0];

    const result = handleResponseSuccess(response);

    expect(result).toBe(response);
    expect(window.localStorage.getItem('token')).toBe('new-token');
    expect(markSessionRenewedMock).toHaveBeenCalledTimes(1);
  });

  it('leaves the stored token untouched when x-auth-token is absent on a success response', () => {
    window.localStorage.setItem('token', 'old-token');
    const response = { headers: {}, data: {} } as unknown as Parameters<typeof handleResponseSuccess>[0];

    handleResponseSuccess(response);

    expect(window.localStorage.getItem('token')).toBe('old-token');
    expect(markSessionRenewedMock).not.toHaveBeenCalled();
  });

  it('stores the renewed token and marks the renewal on an error response carrying x-auth-token', async () => {
    window.localStorage.setItem('token', 'old-token');
    const error = {
      response: { status: 400, headers: { 'x-auth-token': 'renewed-on-error' } },
      config: {},
    } as unknown as Parameters<typeof handleResponseError>[0];

    await expect(handleResponseError(error)).rejects.toBe(error);

    expect(window.localStorage.getItem('token')).toBe('renewed-on-error');
    expect(markSessionRenewedMock).toHaveBeenCalledTimes(1);
  });

  it('leaves the stored token untouched when x-auth-token is absent on an error response', async () => {
    window.localStorage.setItem('token', 'old-token');
    const error = {
      response: { status: 400, headers: {} },
      config: {},
    } as unknown as Parameters<typeof handleResponseError>[0];

    await expect(handleResponseError(error)).rejects.toBe(error);

    expect(window.localStorage.getItem('token')).toBe('old-token');
    expect(markSessionRenewedMock).not.toHaveBeenCalled();
  });

  it('still clears auth and redirects on a 401, independent of the renewal logic', async () => {
    window.localStorage.setItem('token', 'old-token');
    const error = {
      response: { status: 401, headers: {} },
      config: { _retry: false },
    } as unknown as Parameters<typeof handleResponseError>[0];

    await expect(handleResponseError(error)).rejects.toBe(error);

    expect(clearAuthMock).toHaveBeenCalledTimes(1);
    expect(redirectToLoginMock).toHaveBeenCalledTimes(1);
  });
});
