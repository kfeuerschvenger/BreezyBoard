import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthService } from '@/services';
import { useAuth } from '@/hooks/useAuth';
import type { User } from '@/models';
import { AuthProvider } from './AuthProvider';

vi.mock('@/services', () => ({ AuthService: { me: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn() } }));
vi.mock('@/features/session/SessionManager', () => ({ default: () => null }));

const ADA: User = { _id: 'user-ada', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', avatar: '' };

let context: ReturnType<typeof useAuth>;
const Probe = () => {
  context = useAuth();
  return <p data-testid="name">{context.user?.firstName ?? 'nobody'}</p>;
};

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('token', 'token');
  localStorage.setItem('user', JSON.stringify(ADA));
  vi.mocked(AuthService.me).mockReset().mockResolvedValue(ADA);
});

let queryClient: QueryClient;

const mountProvider = () => {
  queryClient = new QueryClient();
  queryClient.setQueryData(['boards'], [{ _id: 'board-ada' }]);

  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </QueryClientProvider>
  );
};

describe('AuthProvider clearSession', () => {
  const mount = async () => {
    mountProvider();
    await waitFor(() => expect(screen.getByTestId('name')).toHaveTextContent('Ada'));
  };

  it('empties the query cache, so the next person on this tab sees none of this one', async () => {
    await mount();

    act(() => context.clearSession('password-changed'));

    expect(queryClient.getQueryData(['boards'])).toBeUndefined();
  });

  it('drops the person and the stored session, and remembers why', async () => {
    await mount();

    act(() => context.clearSession('password-changed'));

    expect(screen.getByTestId('name')).toHaveTextContent('nobody');
    expect(context.isAuthenticated).toBe(false);
    expect(context.sessionEndReason).toBe('password-changed');
    expect(localStorage.getItem('token')).toBeNull();
  });

  it('has no reason when none is given', async () => {
    await mount();

    act(() => context.clearSession());

    expect(context.sessionEndReason).toBeNull();
  });

  it('forgets the reason once somebody signs in again', async () => {
    await mount();
    act(() => context.clearSession('password-changed'));
    vi.mocked(AuthService.login).mockResolvedValue({ token: 't2', user: ADA } as never);

    await act(() => context.login({ email: 'ada@example.com', password: 'x' }));

    expect(context.sessionEndReason).toBeNull();
    expect(context.isAuthenticated).toBe(true);
  });
});

describe('AuthProvider logout', () => {
  it('empties the query cache once the server has been told', async () => {
    mountProvider();
    await waitFor(() => expect(screen.getByTestId('name')).toHaveTextContent('Ada'));
    vi.mocked(AuthService.logout).mockResolvedValue(undefined);

    await act(() => context.logout());

    expect(queryClient.getQueryData(['boards'])).toBeUndefined();
    expect(context.isAuthenticated).toBe(false);
  });

  it('empties the query cache when another tab signs out', async () => {
    mountProvider();
    await waitFor(() => expect(screen.getByTestId('name')).toHaveTextContent('Ada'));

    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'token', newValue: null }));
    });

    expect(queryClient.getQueryData(['boards'])).toBeUndefined();
    expect(context.isAuthenticated).toBe(false);
  });
});

describe('AuthProvider updateUser', () => {
  it('replaces the person in this tab and in the stored session', async () => {
    mountProvider();
    await waitFor(() => expect(screen.getByTestId('name')).toHaveTextContent('Ada'));

    act(() => context.updateUser({ ...ADA, firstName: 'Augusta' }));

    expect(screen.getByTestId('name')).toHaveTextContent('Augusta');
    expect(JSON.parse(localStorage.getItem('user') ?? '{}')).toMatchObject({ _id: 'user-ada', firstName: 'Augusta' });
  });

  it('keeps the copy in this tab when the stored session cannot be written', async () => {
    mountProvider();
    await waitFor(() => expect(screen.getByTestId('name')).toHaveTextContent('Ada'));
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    act(() => context.updateUser({ ...ADA, firstName: 'Augusta' }));

    expect(screen.getByTestId('name')).toHaveTextContent('Augusta');
    setItem.mockRestore();
  });
});
