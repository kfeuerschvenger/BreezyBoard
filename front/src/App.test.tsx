import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import App from './App';
import { useAuth } from '@/hooks/useAuth';
import type { AuthContextType } from '@/context/AuthContext';

// ProtectedRoute lives inline inside App.tsx, is not exported, and the
// Router it guards is a hardcoded BrowserRouter (App accepts no router or
// initialEntries prop), so there is no seam to hand it a MemoryRouter with
// chosen initialEntries without editing App.tsx, which is out of scope
// here. Real BrowserRouter is also a poor fit for this suite even ignoring
// that: it is backed by the actual jsdom history/location, which persists
// across tests in this file, so a redirect performed by one test (a real
// history.replaceState to /login) would still be in effect for the next
// one. This test exercises the real, unmodified App/ProtectedRoute code
// against a MemoryRouter instead, by aliasing the 'BrowserRouter' export
// react-router-dom hands to App.tsx: each render gets a fresh in-memory
// history starting at '/', which is the protected root route. The auth
// state itself is provided directly by mocking useAuth (no
// AuthProvider/localStorage/network involved), and the page components are
// replaced with tiny stubs so this is not also, incidentally, a test of
// BoardDashboard/Login/etc.
const route = vi.hoisted(() => ({ path: '/' }));

vi.mock('react-router-dom', async importOriginal => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    BrowserRouter: ({ children }: { children: React.ReactNode }) => (
      <actual.MemoryRouter initialEntries={[route.path]}>{children}</actual.MemoryRouter>
    ),
  };
});

vi.mock('@/hooks/useAuth');

// The frame is tested on its own. Here it is a marker around whatever the
// router puts inside it, which is all this suite needs to know about it.
vi.mock('@/app/layouts/AppShell', async () => {
  const { Outlet } = await import('react-router-dom');
  return {
    AppShell: () => (
      <div data-testid="app-shell">
        <Outlet />
      </div>
    ),
  };
});

vi.mock('@/pages', () => ({
  Home: () => <div>Protected home content</div>,
  Board: () => <div>Board page</div>,
  Login: () => <div>Login page</div>,
  Profile: () => <div>Profile page</div>,
  Register: () => <div>Register page</div>,
  NotFound: () => <div>Not found page</div>,
  ResetPassword: () => <div>Reset password page</div>,
}));

const mockedUseAuth = vi.mocked(useAuth);

const authState = (overrides: Partial<AuthContextType>): AuthContextType => ({
  user: null,
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  clearSession: vi.fn(),
  isAuthenticated: false,
  loading: false,
  ...overrides,
});

describe('auth guard (ProtectedRoute)', () => {
  beforeEach(() => {
    mockedUseAuth.mockReset();
    route.path = '/';
  });

  it('redirects an unauthenticated visitor to /login', async () => {
    mockedUseAuth.mockReturnValue(authState({ isAuthenticated: false, loading: false }));

    render(<App />);

    expect(await screen.findByText('Login page')).toBeInTheDocument();
    expect(screen.queryByText('Protected home content')).not.toBeInTheDocument();
  });

  it('shows the protected content to an authenticated visitor', async () => {
    mockedUseAuth.mockReturnValue(authState({ isAuthenticated: true, loading: false }));

    render(<App />);

    expect(await screen.findByText('Protected home content')).toBeInTheDocument();
    expect(screen.queryByText('Login page')).not.toBeInTheDocument();
  });

  it('shows only the loading state while auth is still resolving', () => {
    mockedUseAuth.mockReturnValue(authState({ isAuthenticated: false, loading: true }));

    render(<App />);

    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(screen.queryByText('Login page')).not.toBeInTheDocument();
    expect(screen.queryByText('Protected home content')).not.toBeInTheDocument();
  });
});

describe('the application shell', () => {
  beforeEach(() => {
    mockedUseAuth.mockReset();
    route.path = '/';
  });

  it.each([
    ['/', 'Protected home content'],
    ['/board/abc', 'Board page'],
    ['/profile', 'Profile page'],
    ['/no/such/page', 'Not found page'],
  ])('frames %s for a signed in visitor', async (path, content) => {
    route.path = path;
    mockedUseAuth.mockReturnValue(authState({ isAuthenticated: true }));

    render(<App />);

    expect(await screen.findByText(content)).toBeInTheDocument();
    expect(within(screen.getByTestId('app-shell')).getByText(content)).toBeInTheDocument();
  });

  it('puts nothing around the not found page of a visitor with no session', async () => {
    route.path = '/no/such/page';
    mockedUseAuth.mockReturnValue(authState({ isAuthenticated: false }));

    render(<App />);

    expect(await screen.findByText('Not found page')).toBeInTheDocument();
    expect(screen.queryByTestId('app-shell')).not.toBeInTheDocument();
  });

  it.each([
    ['/login', 'Login page'],
    ['/register', 'Register page'],
    ['/reset-password', 'Reset password page'],
  ])('never frames %s, even for somebody who has a session', async (path, content) => {
    route.path = path;
    mockedUseAuth.mockReturnValue(authState({ isAuthenticated: true }));

    render(<App />);

    expect(await screen.findByText(content)).toBeInTheDocument();
    expect(screen.queryByTestId('app-shell')).not.toBeInTheDocument();
  });
});

describe('an unknown address', () => {
  beforeEach(() => {
    mockedUseAuth.mockReset();
    route.path = '/no/such/page';
  });

  it('shows the not found page to a signed in visitor instead of redirecting to the dashboard', async () => {
    mockedUseAuth.mockReturnValue(authState({ isAuthenticated: true }));

    render(<App />);

    expect(await screen.findByText('Not found page')).toBeInTheDocument();
    expect(screen.queryByText('Protected home content')).not.toBeInTheDocument();
  });

  it('shows the not found page to a signed out visitor instead of bouncing them to login', async () => {
    mockedUseAuth.mockReturnValue(authState({ isAuthenticated: false }));

    render(<App />);

    expect(await screen.findByText('Not found page')).toBeInTheDocument();
    expect(screen.queryByText('Login page')).not.toBeInTheDocument();
  });
});

describe('the password reset address', () => {
  beforeEach(() => {
    mockedUseAuth.mockReset();
    route.path = '/reset-password';
  });

  it('is reachable without a session, because the person arriving from the emailed link has none', async () => {
    mockedUseAuth.mockReturnValue(authState({ isAuthenticated: false }));

    render(<App />);

    expect(await screen.findByText('Reset password page')).toBeInTheDocument();
    expect(screen.queryByText('Login page')).not.toBeInTheDocument();
  });

  it('is reachable with a session too, and does not send the visitor to their boards', async () => {
    mockedUseAuth.mockReturnValue(authState({ isAuthenticated: true }));

    render(<App />);

    expect(await screen.findByText('Reset password page')).toBeInTheDocument();
    expect(screen.queryByText('Protected home content')).not.toBeInTheDocument();
  });
});
