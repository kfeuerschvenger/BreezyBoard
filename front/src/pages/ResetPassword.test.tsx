import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import ResetPassword from './ResetPassword';

const resetPassword = vi.fn();
const clearSession = vi.fn();

vi.mock('@/services', () => ({
  AuthService: { resetPassword: (token: string, password: string) => resetPassword(token, password) },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ clearSession }),
  default: () => ({ clearSession }),
}));

// Stands in for the sign in page and shows what the router handed it.
const LoginProbe = () => {
  const state = useLocation().state as { passwordReset?: boolean; forgotPassword?: boolean } | null;

  return (
    <p>
      Login page, reset notice {state?.passwordReset ? 'on' : 'off'}, new link requested {state?.forgotPassword ? 'yes' : 'no'}
    </p>
  );
};

// A real browser router over jsdom's real history: removing the token from
// the address bar is a fact about window.location, which a memory router
// cannot show.
const openAt = (url: string) => {
  window.history.pushState({}, '', url);

  return render(
    <BrowserRouter>
      <Routes>
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/login" element={<LoginProbe />} />
      </Routes>
    </BrowserRouter>
  );
};

const refusedWith = (code: string) =>
  new AxiosError('failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    status: 400,
    statusText: '',
    headers: {},
    config: {} as never,
    data: { success: false, code },
  });

const fillAndSubmit = async (user: ReturnType<typeof userEvent.setup>, password = 'Password123') => {
  await user.type(screen.getByLabelText('New password'), password);
  await user.type(screen.getByLabelText('Confirm new password'), password);
  await user.click(screen.getByRole('button', { name: 'Set new password' }));
};

beforeEach(() => {
  resetPassword.mockReset().mockResolvedValue(undefined);
  clearSession.mockReset();
  document.title = 'Boards';
});

describe('ResetPassword with a token', () => {
  it('asks for a new password and names the tab', () => {
    openAt('/reset-password#token=abc123');

    expect(screen.getByRole('heading', { level: 1, name: 'Choose a new password' })).toBeInTheDocument();
    expect(document.title).toBe('Reset password | BreezyBoard');
  });

  it('removes the token from the address bar and the history entry', async () => {
    openAt('/reset-password#token=abc123');

    await waitFor(() => expect(window.location.hash).toBe(''));
    expect(window.location.pathname).toBe('/reset-password');
    expect(window.location.href).not.toContain('abc123');
  });

  it('still sends the token it read after it is gone from the address bar', async () => {
    const user = userEvent.setup();
    openAt('/reset-password#token=abc123');
    await waitFor(() => expect(window.location.hash).toBe(''));

    await fillAndSubmit(user);

    await waitFor(() => expect(resetPassword).toHaveBeenCalledWith('abc123', 'Password123'));
  });

  it('ends the local session and goes to sign in with the confirmation on success', async () => {
    const user = userEvent.setup();
    openAt('/reset-password#token=abc123');

    await fillAndSubmit(user);

    expect(await screen.findByText(/Login page, reset notice on/)).toBeInTheDocument();
    expect(clearSession).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe('/login');
  });

  it('replaces the form with a way to ask for a new link when the token is refused', async () => {
    const user = userEvent.setup();
    resetPassword.mockRejectedValue(refusedWith('INVALID_RESET_TOKEN'));
    openAt('/reset-password#token=abc123');

    await fillAndSubmit(user);

    expect(await screen.findByRole('heading', { level: 1, name: 'This link cannot be used' })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Request a new link' }));
    expect(await screen.findByText(/Login page, reset notice off, new link requested yes/)).toBeInTheDocument();
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();
    expect(clearSession).not.toHaveBeenCalled();
  });

  it('keeps the form and what was typed when the failure is not about the token', async () => {
    const user = userEvent.setup();
    resetPassword.mockRejectedValue(new Error('network'));
    openAt('/reset-password#token=abc123');

    await fillAndSubmit(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('We could not reset your password. Please try again.');
    expect(screen.getByLabelText('New password')).toHaveValue('Password123');
    expect(screen.queryByRole('heading', { name: 'This link cannot be used' })).not.toBeInTheDocument();
    expect(clearSession).not.toHaveBeenCalled();
  });
});

describe('ResetPassword without a token', () => {
  it('explains that the link cannot be used instead of showing a form that cannot work', () => {
    openAt('/reset-password');

    expect(screen.getByRole('heading', { level: 1, name: 'This link cannot be used' })).toBeInTheDocument();
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it('does not read a token from the query string', () => {
    openAt('/reset-password?token=abc123');

    expect(screen.getByRole('heading', { level: 1, name: 'This link cannot be used' })).toBeInTheDocument();
  });

  it('treats an empty token the same as a missing one', () => {
    openAt('/reset-password#token=');

    expect(screen.getByRole('heading', { level: 1, name: 'This link cannot be used' })).toBeInTheDocument();
  });
});
