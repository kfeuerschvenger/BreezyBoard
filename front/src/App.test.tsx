import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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

vi.mock('@/pages', () => ({
  Home: () => <div>Protected home content</div>,
  Board: () => <div>Board page</div>,
  Login: () => <div>Login page</div>,
  Profile: () => <div>Profile page</div>,
  Register: () => <div>Register page</div>,
  NotFound: () => <div>Not found page</div>,
}));

const mockedUseAuth = vi.mocked(useAuth);

const authState = (overrides: Partial<AuthContextType>): AuthContextType => ({
  user: null,
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
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

    // The loading spinner, like the ones in Board and TaskDrawer, has no
    // role="status" or accessible name, so it has to be located by class.
    const { container } = render(<App />);

    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
    expect(screen.queryByText('Login page')).not.toBeInTheDocument();
    expect(screen.queryByText('Protected home content')).not.toBeInTheDocument();
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
