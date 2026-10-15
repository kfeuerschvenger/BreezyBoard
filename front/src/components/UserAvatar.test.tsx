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
  AuthService: { logout: vi.fn() },
}));

// The person comes from the auth context, which is what lets a change made on
// the profile page reach this control.
const auth = vi.hoisted(() => ({ user: null as unknown }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: auth.user }) }));

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
  auth.user = ADA;
  mockedAuthService.logout.mockReset().mockResolvedValue(undefined);
});

describe('UserAvatar when there is nobody signed in', () => {
  it('renders nothing at all rather than an empty avatar', () => {
    auth.user = null;

    const { container } = renderMenu();

    expect(container).toBeEmptyDOMElement();
  });
});

describe('UserAvatar when the person changes', () => {
  it('shows the new name and picture without being remounted', () => {
    const { rerender } = renderMenu();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();

    auth.user = { ...ADA, firstName: 'Augusta', avatar: '/uploads/augusta.png' };
    rerender(
      <MemoryRouter>
        <UserAvatar />
      </MemoryRouter>
    );

    expect(screen.getByText('Augusta Lovelace')).toBeInTheDocument();
    expect(document.querySelector('img')).toHaveAttribute('src', '/uploads/augusta.png');
  });
});

describe('UserAvatar menu', () => {
  it('shows the signed in person and their initials', () => {
    renderMenu();

    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('AL')).toBeInTheDocument();
  });

  it('shows the avatar image instead of initials when there is one', () => {
    auth.user = { ...ADA, avatar: '/uploads/ada.png' };

    const { container } = renderMenu();

    // Queried as an element rather than by role: the shared avatar wraps the
    // image in a `role="img"` of its own, whose children are presentational,
    // so the inner image is not in the accessibility tree to be found.
    expect(container.querySelector('img')).toHaveAttribute('src', '/uploads/ada.png');
    expect(screen.queryByText('AL')).not.toBeInTheDocument();
  });

  // The trigger's visible contents are an avatar and a name that is hidden
  // below the medium breakpoint, so a name taken from them disappears on a
  // phone. Measured at 390 pixels before the fix, where the button read as
  // the two initials and nothing else, and as nothing at all once an avatar
  // image replaced them.
  it('names itself without depending on text that a narrow screen hides', () => {
    renderMenu();

    expect(screen.getByRole('button', { name: 'Account menu for Ada Lovelace' })).toBeInTheDocument();
  });

  it('points the menu back at the control that opened it', async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(trigger());

    const menu = screen.getByRole('menu');
    expect(menu).toHaveAttribute('aria-labelledby', screen.getByRole('button', { expanded: true }).id);
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

  // The outside-click handler listens on mousedown and the toggle runs on
  // click, so without the guard that ignores presses on the trigger itself,
  // the first event closes the menu and the second reopens it. The menu then
  // cannot be dismissed by the control that opened it, and nothing about
  // opening it looks wrong.
  it('closes again when the control that opened it is pressed a second time', async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(trigger());
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { expanded: true }));

    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
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
