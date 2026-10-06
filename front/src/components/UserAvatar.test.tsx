import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import UserAvatar from './UserAvatar';
import { AuthService } from '@/services';
import type { User } from '@/models';

// Characterization, written against the component as it stands before
// section 12.5 turns it into users/UserMenu.
vi.mock('@/services', () => ({
  AuthService: { getCurrentUser: vi.fn(), logout: vi.fn() },
}));

const navigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

const mockedAuthService = vi.mocked(AuthService);

const ADA: User = {
  _id: 'user-ada',
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  avatar: '',
};

const renderMenu = () =>
  render(
    <MemoryRouter>
      <UserAvatar />
    </MemoryRouter>
  );

const trigger = () => screen.getByRole('button', { expanded: false });

beforeEach(() => {
  navigate.mockReset();
  mockedAuthService.getCurrentUser.mockReset().mockReturnValue(ADA);
  mockedAuthService.logout.mockReset().mockResolvedValue(undefined);
});

describe('UserAvatar when there is nobody signed in', () => {
  it('renders nothing at all rather than an empty avatar', () => {
    mockedAuthService.getCurrentUser.mockReturnValue(null);

    const { container } = renderMenu();

    expect(container).toBeEmptyDOMElement();
  });

  it('survives an auth store that throws instead of answering', () => {
    mockedAuthService.getCurrentUser.mockImplementation(() => {
      throw new Error('corrupt');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { container } = renderMenu();

    expect(container).toBeEmptyDOMElement();
  });
});

describe('UserAvatar menu', () => {
  it('shows the signed in person and their initials', () => {
    renderMenu();

    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('AL')).toBeInTheDocument();
  });

  it('shows the avatar image instead of initials when there is one', () => {
    mockedAuthService.getCurrentUser.mockReturnValue({ ...ADA, avatar: '/uploads/ada.png' });

    renderMenu();

    expect(screen.getAllByRole('img', { hidden: true })[0]).toHaveAttribute('src', '/uploads/ada.png');
  });

  it('announces itself as a collapsed menu until it is opened', async () => {
    const user = userEvent.setup();
    renderMenu();

    expect(trigger()).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');

    await user.click(trigger());

    expect(screen.getByRole('button', { expanded: true })).toBeInTheDocument();
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('offers the profile and the way out, as menu items', async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(trigger());

    expect(screen.getByRole('menuitem', { name: /Profile/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Log out/ })).toBeInTheDocument();
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
  });

  it('closes on Escape and gives focus back to what opened it', async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(trigger());
    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    expect(trigger()).toHaveFocus();
  });

  it('closes when the click lands anywhere else', async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(trigger());
    await user.click(document.body);

    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });
});

describe('UserAvatar actions', () => {
  it('goes to the profile and closes', async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(trigger());
    await user.click(screen.getByRole('menuitem', { name: /Profile/ }));

    expect(navigate).toHaveBeenCalledWith('/profile');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });

  it('signs out and goes to the login page', async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(trigger());
    await user.click(screen.getByRole('menuitem', { name: /Log out/ }));

    await waitFor(() => expect(mockedAuthService.logout).toHaveBeenCalled());
    expect(navigate).toHaveBeenCalledWith('/login');
  });

  // Being unable to reach the server is the one moment a person most needs
  // to be let out, so a failed logout still has to land on the login page.
  it('goes to the login page even when signing out fails', async () => {
    const user = userEvent.setup();
    mockedAuthService.logout.mockRejectedValue(new Error('offline'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderMenu();

    await user.click(trigger());
    await user.click(screen.getByRole('menuitem', { name: /Log out/ }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/login'));
  });
});
