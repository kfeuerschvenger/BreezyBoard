import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NotFound from './NotFound';
import { useAuth } from '@/hooks/useAuth';
import type { AuthContextType } from '@/context/AuthContext';

vi.mock('@/hooks/useAuth');

const mockedUseAuth = vi.mocked(useAuth);

const authState = (overrides: Partial<AuthContextType>): AuthContextType => ({
  user: null,
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  clearSession: vi.fn(),
  sessionEndReason: null,
  updateUser: vi.fn(),
  isAuthenticated: false,
  loading: false,
  ...overrides,
});

const renderPage = (props: Parameters<typeof NotFound>[0] = {}) =>
  render(
    <MemoryRouter>
      <NotFound {...props} />
    </MemoryRouter>
  );

describe('NotFound', () => {
  beforeEach(() => {
    mockedUseAuth.mockReset();
    document.title = 'Boards';
  });

  it('says what happened under a single h1 and sends a signed in visitor back to their boards', () => {
    mockedUseAuth.mockReturnValue(authState({ isAuthenticated: true }));

    renderPage();

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByText(/nothing at this address/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to my boards' })).toHaveAttribute('href', '/');
    expect(screen.queryByRole('link', { name: 'Go to sign in' })).not.toBeInTheDocument();
  });

  // The title is not in a strip above the screen with its sentence far below
  // it: the h1, the sentence and the way out are one block, in both cases.
  it.each([
    ['signed in', true],
    ['signed out', false],
  ])('keeps the h1, the sentence and the link in one block when %s', (_label, isAuthenticated) => {
    mockedUseAuth.mockReturnValue(authState({ isAuthenticated }));

    renderPage();

    const block = screen.getByRole('heading', { level: 1 }).parentElement as HTMLElement;
    expect(block).toHaveTextContent(/nothing at this address/i);
    expect(block.querySelector('a')).not.toBeNull();
  });

  it('sends a signed out visitor to sign in, and does not redirect them', () => {
    mockedUseAuth.mockReturnValue(authState({ isAuthenticated: false }));

    renderPage();

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to sign in' })).toHaveAttribute('href', '/login');
    expect(screen.queryByRole('link', { name: 'Back to my boards' })).not.toBeInTheDocument();
  });

  // A signed in visitor is inside the application shell, which owns the page's
  // main landmark. A second one inside it would be nested landmarks.
  it('is its own main landmark only when there is no shell around it', () => {
    mockedUseAuth.mockReturnValue(authState({ isAuthenticated: true }));
    const { unmount } = renderPage();
    expect(screen.queryByRole('main')).not.toBeInTheDocument();
    expect(screen.getByText(/nothing at this address/i)).toBeInTheDocument();
    unmount();

    mockedUseAuth.mockReturnValue(authState({ isAuthenticated: false }));
    renderPage();
    expect(screen.getByRole('main')).toHaveTextContent(/nothing at this address/i);
  });

  it('shows only the loading state while the session is still being resolved', () => {
    mockedUseAuth.mockReturnValue(authState({ loading: true }));

    renderPage();

    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('names the tab after what was not found', () => {
    mockedUseAuth.mockReturnValue(authState({ isAuthenticated: true }));

    renderPage({ title: 'Board not found', description: 'Gone.' });

    expect(document.title).toBe('Board not found | BreezyBoard');
    expect(screen.getByRole('heading', { level: 1, name: 'Board not found' })).toBeInTheDocument();
    expect(screen.getByText('Gone.')).toBeInTheDocument();
  });
});
