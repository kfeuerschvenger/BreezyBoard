import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';
import type { AxiosResponse } from 'axios';
import { MemoryRouter } from 'react-router-dom';
import { axe } from 'vitest-axe';
import { renderWithQuery } from '@/test/renderWithQuery';
import { restoreMatchMedia, stubMatchMedia } from '@/test/matchMedia';
import { BreezeProvider } from '@/features/breeze';
import Profile from './Profile';
import { UserService } from '@/services';
import type { User } from '@/models';

vi.mock('@/services', () => ({
  UserService: { getById: vi.fn(), update: vi.fn(), uploadAvatar: vi.fn() },
  AuthService: { changePassword: vi.fn() },
}));

// The page reads the signed-in user and the two session actions from the auth
// context. Stubbing the hook rather than wrapping in a provider keeps the
// fixture to the fields the page actually uses.
const auth = vi.hoisted(() => ({
  logout: vi.fn(),
  clearSession: vi.fn(),
  updateUser: vi.fn(),
  user: { _id: 'user-ada', breeze: 'breezy' } as Record<string, unknown>,
}));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => auth,
  default: () => auth,
}));

const navigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

const mockedUserService = vi.mocked(UserService);

const PROFILE: User = {
  _id: 'user-ada',
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  avatar: '',
  location: 'London',
  role: 'Engineer',
  department: 'Analytical Engine',
  createdAt: '2026-01-15T10:00:00.000Z',
};

const renderProfile = () =>
  renderWithQuery(
    <MemoryRouter>
      <BreezeProvider>
        <Profile />
      </BreezeProvider>
    </MemoryRouter>
  );

const firstNameInput = () => screen.getByPlaceholderText('Enter first name');
const lastNameInput = () => screen.getByPlaceholderText('Enter last name');
const emailInput = () => screen.getByPlaceholderText('Enter email address');
const saveButton = () => screen.getByRole('button', { name: /Save changes/ });
const aboutPanel = () => screen.getByRole('region', { name: 'About you' });

beforeEach(() => {
  stubMatchMedia({ '(prefers-reduced-motion: reduce)': false });
  navigate.mockReset();
  auth.logout.mockReset().mockResolvedValue(undefined);
  auth.clearSession.mockReset();
  auth.updateUser.mockReset();
  auth.user = { _id: 'user-ada', breeze: 'breezy' };
  mockedUserService.getById.mockReset().mockResolvedValue(PROFILE);
  mockedUserService.update.mockReset().mockResolvedValue(PROFILE);
  mockedUserService.uploadAvatar.mockReset().mockResolvedValue('/uploads/avatars/ada.png');
});

afterEach(restoreMatchMedia);

describe('Profile rendering', () => {
  it('fills the form from the stored profile', async () => {
    renderProfile();

    await waitFor(() => expect(firstNameInput()).toHaveValue('Ada'));
    expect(lastNameInput()).toHaveValue('Lovelace');
    expect(emailInput()).toHaveValue('ada@example.com');
    expect(screen.getByPlaceholderText('Enter location')).toHaveValue('London');
    expect(screen.getByPlaceholderText('Enter your role')).toHaveValue('Engineer');
    expect(screen.getByPlaceholderText('Enter department')).toHaveValue('Analytical Engine');
  });

  it('names the tab Profile', async () => {
    renderProfile();

    await screen.findByRole('heading', { level: 1, name: 'Ada Lovelace' });
    expect(document.title).toBe('Profile | BreezyBoard');
  });

  it('names the page with the person, as its one h1, and says who and where they are', async () => {
    renderProfile();

    const heading = await screen.findByRole('heading', { level: 1, name: 'Ada Lovelace' });
    const header = heading.closest('header') as HTMLElement;
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(within(header).getByText('Engineer · Analytical Engine')).toBeInTheDocument();
    expect(within(header).getByText('London')).toBeInTheDocument();
  });

  it('shows the initials when there is no avatar image', async () => {
    renderProfile();

    expect(await screen.findByText('AL')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  // Queried as an element rather than by role. The avatar is decorative here
  // on purpose: the person's name is written directly beside it, so naming the
  // picture as well announces them twice.
  it('shows the avatar image once the profile has one', async () => {
    mockedUserService.getById.mockResolvedValue({ ...PROFILE, avatar: '/uploads/avatars/ada.png' });

    const { container } = renderProfile();

    await waitFor(() => expect(container.querySelector('img')).toHaveAttribute('src', '/uploads/avatars/ada.png'));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('says when the person joined, as the month and the year', async () => {
    renderProfile();

    expect(await screen.findByText('Breezing since January 2026')).toBeInTheDocument();
  });

  // A record with no createdAt reached `new Date('')`, which formats as the
  // literal string "Invalid Date".
  it('says nothing rather than Invalid Date when no joined date is stored', async () => {
    mockedUserService.getById.mockResolvedValue({ ...PROFILE, createdAt: undefined });

    renderProfile();
    await waitFor(() => expect(firstNameInput()).toHaveValue('Ada'));

    expect(screen.queryByText(/Invalid Date/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Breezing since/)).not.toBeInTheDocument();
  });

  it('says nothing rather than a placeholder when the joined date does not parse', async () => {
    mockedUserService.getById.mockResolvedValue({ ...PROFILE, createdAt: 'yesterday-ish' });

    renderProfile();
    await waitFor(() => expect(firstNameInput()).toHaveValue('Ada'));

    expect(screen.queryByText(/Invalid Date/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Breezing since/)).not.toBeInTheDocument();
  });

  it('leaves the place out of the line when none is stored, and keeps the joined date', async () => {
    mockedUserService.getById.mockResolvedValue({ ...PROFILE, location: '' });

    renderProfile();

    const line = (await screen.findByText('Breezing since January 2026')).closest('p') as HTMLElement;
    expect(screen.queryByText('London')).not.toBeInTheDocument();
    expect(screen.queryByText('Unknown')).not.toBeInTheDocument();
    // No dangling separator where the place would have been.
    expect(line).toHaveTextContent(/^Breezing since January 2026$/);
  });

  it('keeps the cover as decoration, hidden from assistive technology', async () => {
    const { container } = renderProfile();
    await screen.findByRole('heading', { level: 1 });

    const cover = container.querySelector('header > [aria-hidden="true"]');
    expect(cover).toHaveClass('h-55', 'rounded-hero');
    expect(cover?.querySelector('img')).toBeNull();
  });

  it('offers the panels in order: about, breeze, password, sign out', async () => {
    renderProfile();
    await screen.findByRole('heading', { level: 1 });

    expect(screen.getAllByRole('heading', { level: 2 }).map(heading => heading.textContent)).toEqual([
      'About you',
      'Your breeze',
      'Password',
      'Sign out',
    ]);
  });

  it('has no accessibility violations', async () => {
    const { container } = renderProfile();
    await waitFor(() => expect(firstNameInput()).toHaveValue('Ada'));

    expect(await axe(container, { rules: { region: { enabled: false } } })).toHaveNoViolations();
  });
});

describe('Profile editing', () => {
  it('offers nothing to save until something is changed', async () => {
    renderProfile();
    await waitFor(() => expect(firstNameInput()).toHaveValue('Ada'));

    expect(saveButton()).toBeDisabled();
    expect(within(aboutPanel()).getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  it('sends only the editable fields, and not the joined date', async () => {
    const user = userEvent.setup();
    renderProfile();
    await waitFor(() => expect(firstNameInput()).toHaveValue('Ada'));

    await user.clear(firstNameInput());
    await user.type(firstNameInput(), 'Augusta');
    await user.click(saveButton());

    await waitFor(() => expect(mockedUserService.update).toHaveBeenCalled());
    const [, payload] = mockedUserService.update.mock.calls[0];
    expect(payload).toEqual({
      firstName: 'Augusta',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      location: 'London',
      role: 'Engineer',
      department: 'Analytical Engine',
    });
    expect(payload).not.toHaveProperty('createdAt');
    // The upload stores the picture; the address the form holds for drawing it
    // is absolute and must never replace the stored path.
    expect(payload).not.toHaveProperty('avatar');
  });

  // The sidebar and the greeting read the session's copy of the person, not
  // the profile's cache, so a save has to reach it or they keep the old name.
  it('hands the saved record to the session, so the sidebar shows it without a reload', async () => {
    const user = userEvent.setup();
    mockedUserService.update.mockResolvedValue({ ...PROFILE, firstName: 'Augusta' });
    renderProfile();
    await waitFor(() => expect(firstNameInput()).toHaveValue('Ada'));

    await user.clear(firstNameInput());
    await user.type(firstNameInput(), 'Augusta');
    await user.click(saveButton());

    await waitFor(() =>
      expect(auth.updateUser).toHaveBeenCalledWith(expect.objectContaining({ _id: 'user-ada', firstName: 'Augusta' }))
    );
  });

  it('does not touch the session when the save is refused', async () => {
    const user = userEvent.setup();
    mockedUserService.update.mockRejectedValue(new Error('refused'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderProfile();
    await waitFor(() => expect(firstNameInput()).toHaveValue('Ada'));

    await user.clear(firstNameInput());
    await user.type(firstNameInput(), 'Augusta');
    await user.click(saveButton());
    await screen.findByText('Failed to update profile. Please try again.');

    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it('updates the name above as the field is typed in', async () => {
    const user = userEvent.setup();
    renderProfile();
    await waitFor(() => expect(firstNameInput()).toHaveValue('Ada'));

    await user.clear(firstNameInput());
    await user.type(firstNameInput(), 'Augusta');

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Augusta Lovelace');
  });

  it('confirms the save happened, in a toast and not in a dialog', async () => {
    const user = userEvent.setup();
    renderProfile();
    await waitFor(() => expect(firstNameInput()).toHaveValue('Ada'));

    await user.clear(firstNameInput());
    await user.type(firstNameInput(), 'Augusta');
    await user.click(saveButton());

    expect(await screen.findByText('Profile saved.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('says so and keeps the edit when the save is refused', async () => {
    const user = userEvent.setup();
    mockedUserService.update.mockRejectedValue(new Error('refused'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderProfile();
    await waitFor(() => expect(firstNameInput()).toHaveValue('Ada'));

    await user.clear(firstNameInput());
    await user.type(firstNameInput(), 'Augusta');
    await user.click(saveButton());

    expect(await screen.findByText('Failed to update profile. Please try again.')).toBeInTheDocument();
    expect(firstNameInput()).toHaveValue('Augusta');
    // Without this, a save that answers "it worked" after being refused shows
    // the confirmation and the failure side by side, and only the failure half
    // is asserted anywhere.
    expect(screen.queryByText('Profile saved.')).not.toBeInTheDocument();
  });

  // Cancel resets from the cache rather than refetching, because the cached
  // record is the last thing the server confirmed. The form is rebuilt from the
  // one field mapping, so the joined date comes back with the rest.
  it('puts every field back to what is stored, including the joined date', async () => {
    const user = userEvent.setup();
    renderProfile();
    await waitFor(() => expect(firstNameInput()).toHaveValue('Ada'));

    await user.clear(firstNameInput());
    await user.type(firstNameInput(), 'Augusta');
    await user.click(within(aboutPanel()).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(firstNameInput()).toHaveValue('Ada'));
    // Asserted as the real date rather than as unchanged from before the
    // cancel: comparing it to itself passes just as happily when the mapping
    // drops the field entirely and both readings say nothing. The day is not
    // in the line, so the runner's time zone cannot move it; the month and
    // year do not move either, with 10:00 UTC in the middle of the month.
    expect(screen.getByText('Breezing since January 2026')).toBeInTheDocument();
  });

  it('refuses to save an email that is not one', async () => {
    const user = userEvent.setup();
    renderProfile();
    await waitFor(() => expect(emailInput()).toHaveValue('ada@example.com'));

    await user.clear(emailInput());
    await user.type(emailInput(), 'not-an-email');

    expect(await screen.findByText('Email is invalid')).toBeInTheDocument();
    await waitFor(() => expect(saveButton()).toBeDisabled());
    expect(mockedUserService.update).not.toHaveBeenCalled();
  });
});

describe('Profile avatar', () => {
  it('uploads the chosen file and shows what came back', async () => {
    const user = userEvent.setup();
    renderProfile();
    await waitFor(() => expect(firstNameInput()).toHaveValue('Ada'));

    const file = new File(['bytes'], 'ada.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('Change avatar'), file);

    await waitFor(() => expect(mockedUserService.uploadAvatar).toHaveBeenCalledWith('user-ada', file));
    await waitFor(() => expect(document.querySelector('img')).toHaveAttribute('src', '/uploads/avatars/ada.png'));
  });

  it('leaves nothing to save once the picture is stored', async () => {
    const user = userEvent.setup();
    renderProfile();
    await waitFor(() => expect(firstNameInput()).toHaveValue('Ada'));

    await user.upload(screen.getByLabelText('Change avatar'), new File(['bytes'], 'ada.png', { type: 'image/png' }));
    await waitFor(() => expect(document.querySelector('img')).toHaveAttribute('src', '/uploads/avatars/ada.png'));

    expect(saveButton()).toBeDisabled();
  });

  it('keeps what was typed in the form while the picture is uploaded', async () => {
    const user = userEvent.setup();
    mockedUserService.getById
      .mockResolvedValueOnce(PROFILE)
      .mockResolvedValue({ ...PROFILE, avatar: '/uploads/avatars/ada.png' });
    renderProfile();
    await waitFor(() => expect(firstNameInput()).toHaveValue('Ada'));

    await user.clear(firstNameInput());
    await user.type(firstNameInput(), 'Augusta');
    await user.upload(screen.getByLabelText('Change avatar'), new File(['bytes'], 'ada.png', { type: 'image/png' }));

    // The upload refreshes the stored record, which is the moment a plain reset
    // would have put the old name back.
    await waitFor(() => expect(document.querySelector('img')).toHaveAttribute('src', '/uploads/avatars/ada.png'));
    expect(firstNameInput()).toHaveValue('Augusta');
    expect(saveButton()).toBeEnabled();
  });

  it('hands the new picture to the session as soon as it is stored', async () => {
    const user = userEvent.setup();
    renderProfile();
    await waitFor(() => expect(firstNameInput()).toHaveValue('Ada'));

    await user.upload(screen.getByLabelText('Change avatar'), new File(['bytes'], 'ada.png', { type: 'image/png' }));

    await waitFor(() =>
      expect(auth.updateUser).toHaveBeenCalledWith(expect.objectContaining({ avatar: '/uploads/avatars/ada.png' }))
    );
  });

  // The input was hidden with Tailwind's `hidden`, which compiles to
  // display:none, and a display:none control is out of the focus order
  // entirely, so changing your avatar was mouse-only.
  //
  // Asserted as a class rather than by tabbing: jsdom loads no stylesheet, so
  // `hidden` has no effect here and a focus test would pass against the broken
  // version. The compiled stylesheet is where the two techniques actually
  // differ, and sr-only is the one that hides an element while leaving it
  // focusable.
  it('hides the file input without taking it out of the focus order', async () => {
    renderProfile();
    await waitFor(() => expect(firstNameInput()).toHaveValue('Ada'));

    const input = screen.getByLabelText('Change avatar');
    // The name has to be on the control, not on the label drawn around it.
    expect(input.tagName).toBe('INPUT');
    expect(input).toHaveClass('sr-only');
    expect(input).not.toHaveClass('hidden');
  });

  it('says so while the upload runs', async () => {
    const user = userEvent.setup();
    let finish: (url: string) => void = () => undefined;
    mockedUserService.uploadAvatar.mockReturnValue(new Promise<string>(resolve => (finish = resolve)));
    renderProfile();
    await waitFor(() => expect(firstNameInput()).toHaveValue('Ada'));

    await user.upload(screen.getByLabelText('Change avatar'), new File(['bytes'], 'ada.png', { type: 'image/png' }));

    expect(await screen.findByText('Uploading avatar...')).toBeInTheDocument();
    finish('/uploads/avatars/ada.png');
    await waitFor(() => expect(screen.queryByText('Uploading avatar...')).not.toBeInTheDocument());
  });

  it('says so when the upload is refused', async () => {
    const user = userEvent.setup();
    mockedUserService.uploadAvatar.mockRejectedValue(new Error('too large'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderProfile();
    await waitFor(() => expect(firstNameInput()).toHaveValue('Ada'));

    await user.upload(screen.getByLabelText('Change avatar'), new File(['bytes'], 'ada.png', { type: 'image/png' }));

    expect(await screen.findByText('Avatar upload failed. Please try again.')).toBeInTheDocument();
  });

  it.each([
    ['FILE_TOO_LARGE', 'That image is too large. Choose one under 6 MB.'],
    ['INVALID_FILE_TYPE', 'That file is not an image. Choose a PNG, JPEG, WebP or GIF.'],
  ])('names the reason when the server refuses with %s', async (code, message) => {
    const user = userEvent.setup();
    const response = { status: 400, statusText: 'Bad Request', headers: {}, config: {}, data: { code } };
    mockedUserService.uploadAvatar.mockRejectedValue(
      new AxiosError('refused', 'ERR_BAD_REQUEST', undefined, undefined, response as AxiosResponse)
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderProfile();
    await waitFor(() => expect(firstNameInput()).toHaveValue('Ada'));

    await user.upload(screen.getByLabelText('Change avatar'), new File(['bytes'], 'ada.png', { type: 'image/png' }));

    expect(await screen.findByText(message)).toBeInTheDocument();
  });
});

describe('Profile, Your breeze', () => {
  const breezePanel = () => screen.getByRole('region', { name: 'Your breeze' });

  it('offers the four levels as one group, with the stored one chosen', async () => {
    auth.user = { _id: 'user-ada', breeze: 'calm' };
    renderProfile();
    await screen.findByRole('heading', { level: 1 });

    const group = within(breezePanel()).getByRole('radiogroup', { name: 'Breeze level' });
    const radios = within(group).getAllByRole('radio') as HTMLInputElement[];
    expect(radios.map(radio => radio.value)).toEqual(['still', 'calm', 'breezy', 'gusty']);
    expect(radios.filter(radio => radio.checked).map(radio => radio.value)).toEqual(['calm']);
  });

  it.each([
    ['Still', 'still'],
    ['Calm', 'calm'],
    ['Gusty', 'gusty'],
  ])('saves %s for the person as %s', async (label, level) => {
    const user = userEvent.setup();
    renderProfile();
    await screen.findByRole('heading', { level: 1 });

    await user.click(within(breezePanel()).getByRole('radio', { name: label }));

    await waitFor(() => expect(mockedUserService.update).toHaveBeenCalledWith('user-ada', { breeze: level }));
    expect(mockedUserService.update).toHaveBeenCalledTimes(1);
  });

  it('says that sway is the Gusty level and nothing else, and has no switch of its own for it', async () => {
    renderProfile();
    await screen.findByRole('heading', { level: 1 });

    expect(within(breezePanel()).getByText(/Cards on a board sway at Gusty\. Any lower level keeps them still/)).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: /sway/i })).not.toBeInTheDocument();
  });

  it('shows the two coming preferences as off switches that cannot be turned on', async () => {
    const user = userEvent.setup();
    renderProfile();
    await screen.findByRole('heading', { level: 1 });

    const switches = within(breezePanel()).getAllByRole('switch');
    expect(switches.map(item => item.getAttribute('aria-labelledby') && document.getElementById(item.getAttribute('aria-labelledby') ?? '')?.textContent)).toEqual([
      'Due-date nudges',
      'Weekly digest',
    ]);
    for (const item of switches) {
      expect(item).toBeDisabled();
      expect(item).toHaveAttribute('aria-checked', 'false');
      expect(item).toHaveAccessibleDescription(/^Coming soon/);
      await user.click(item);
      expect(item).toHaveAttribute('aria-checked', 'false');
    }
  });

  it('says the wind is held still, and keeps the choice, when the system asks for reduced motion', async () => {
    stubMatchMedia({ '(prefers-reduced-motion: reduce)': true });
    renderProfile();
    await screen.findByRole('heading', { level: 1 });

    expect(within(breezePanel()).getByText('Reduced motion')).toBeInTheDocument();
    expect(
      within(breezePanel()).getByRole('radiogroup', {
        name: 'Breeze level, held still because your system asks for reduced motion',
      })
    ).toBeInTheDocument();
    expect(within(breezePanel()).getByRole('radio', { name: 'Breezy' })).toBeChecked();
  });
});

describe('Profile, signing out', () => {
  it('signs out from the header and from the card, and goes to the sign in screen each time', async () => {
    const user = userEvent.setup();
    renderProfile();
    await screen.findByRole('heading', { level: 1 });

    const buttons = screen.getAllByRole('button', { name: 'Sign out' });
    expect(buttons).toHaveLength(2);

    for (const button of buttons) {
      auth.logout.mockClear();
      navigate.mockClear();
      await user.click(button);

      await waitFor(() => expect(navigate).toHaveBeenCalledWith('/login', { replace: true }));
      expect(auth.logout).toHaveBeenCalledTimes(1);
    }
  });

  it('asks the server to end the session before it navigates', async () => {
    const user = userEvent.setup();
    const order: string[] = [];
    auth.logout.mockImplementation(async () => {
      order.push('logout');
    });
    navigate.mockImplementation(() => order.push('navigate'));
    renderProfile();
    await screen.findByRole('heading', { level: 1 });

    await user.click(screen.getAllByRole('button', { name: 'Sign out' })[0]);

    await waitFor(() => expect(order).toEqual(['logout', 'navigate']));
  });
});
