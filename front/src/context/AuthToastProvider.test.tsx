import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthService } from '@/services';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/shared/hooks/useToast';
import { AuthProvider } from './AuthProvider';
import { AuthToastProvider } from './AuthToastProvider';

vi.mock('@/services', () => ({
  AuthService: { login: vi.fn(), logout: vi.fn(), me: vi.fn(), ping: vi.fn() },
}));

const mockedAuth = vi.mocked(AuthService);

const userNamed = (id: string) => ({ _id: id, firstName: id, lastName: 'Test', email: `${id}@example.com` });

const Panel = () => {
  const { login, logout } = useAuth();
  const toast = useToast();

  return (
    <>
      <button type="button" onClick={() => void login({ email: 'someone@example.com', password: 'x' })}>
        Sign in
      </button>
      <button type="button" onClick={() => void logout()}>
        Sign out
      </button>
      <button
        type="button"
        onClick={() => toast.show({ message: 'Deleted "Launch Plan"', action: { label: 'Undo', onAction: vi.fn() } })}
      >
        Raise a toast
      </button>
    </>
  );
};

const renderApp = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthProvider>
        <AuthToastProvider>
          <Panel />
        </AuthToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );

beforeEach(() => {
  localStorage.clear();
  mockedAuth.login.mockReset().mockResolvedValue({ token: 'token-one', user: userNamed('user-1') } as never);
  mockedAuth.logout.mockReset().mockResolvedValue(undefined);
});

describe('toasts and the session', () => {
  it('discards every toast, Undo included, when the person signs out', async () => {
    renderApp();
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(mockedAuth.login).toHaveBeenCalled());
    await userEvent.click(screen.getByRole('button', { name: 'Raise a toast' }));
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() => expect(screen.queryByText('Deleted "Launch Plan"')).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
  });

  it('discards them when somebody else signs in on the same screen', async () => {
    renderApp();
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(mockedAuth.login).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByRole('button', { name: 'Raise a toast' }));
    expect(screen.getByText('Deleted "Launch Plan"')).toBeInTheDocument();

    mockedAuth.login.mockResolvedValue({ token: 'token-two', user: userNamed('user-2') } as never);
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(mockedAuth.login).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText('Deleted "Launch Plan"')).not.toBeInTheDocument());
  });
});
