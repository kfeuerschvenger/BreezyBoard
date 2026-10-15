import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
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

describe('AuthProvider updateUser', () => {
  it('replaces the person in this tab and in the stored session', async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId('name')).toHaveTextContent('Ada'));

    act(() => context.updateUser({ ...ADA, firstName: 'Augusta' }));

    expect(screen.getByTestId('name')).toHaveTextContent('Augusta');
    expect(JSON.parse(localStorage.getItem('user') ?? '{}')).toMatchObject({ _id: 'user-ada', firstName: 'Augusta' });
  });

  it('keeps the copy in this tab when the stored session cannot be written', async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
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
