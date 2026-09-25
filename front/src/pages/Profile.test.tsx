import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { renderWithQuery } from '@/test/renderWithQuery';
import Profile from './Profile';
import { UserService } from '@/services';
import type { User } from '@/models';

// Characterization, written against the page as it stands before section
// 12.5 takes it apart. Every case pins behaviour a user can see today, so the
// decomposition is judged by these staying green.
vi.mock('@/services', () => ({
  UserService: { getById: vi.fn(), update: vi.fn(), uploadAvatar: vi.fn() },
}));

// The page reads the signed-in user from the auth context. Stubbing the hook
// rather than wrapping in a provider keeps the fixture to the one field the
// page actually uses.
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { _id: 'user-ada' } }),
  default: () => ({ user: { _id: 'user-ada' } }),
}));

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
      <Profile />
    </MemoryRouter>
  );

const firstNameInput = () => screen.getByPlaceholderText('Enter first name');
const lastNameInput = () => screen.getByPlaceholderText('Enter last name');
const emailInput = () => screen.getByPlaceholderText('Enter email address');
const saveButtons = () => screen.getAllByRole('button', { name: /Save/ });

beforeEach(() => {
  mockedUserService.getById.mockReset().mockResolvedValue(PROFILE);
  mockedUserService.update.mockReset().mockResolvedValue(PROFILE);
  mockedUserService.uploadAvatar.mockReset().mockResolvedValue('/uploads/avatars/ada.png');
});

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

  it('summarises the person beside the form', async () => {
    renderProfile();

    expect(await screen.findByRole('heading', { name: 'Ada Lovelace' })).toBeInTheDocument();
    expect(screen.getByText('Engineer')).toBeInTheDocument();
    expect(screen.getByText('Analytical Engine')).toBeInTheDocument();
    expect(screen.getByText('London')).toBeInTheDocument();
  });

  it('shows the initials when there is no avatar image', async () => {
    renderProfile();

    expect(await screen.findByText('AL')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Profile' })).not.toBeInTheDocument();
  });

  it('shows the avatar image once the profile has one', async () => {
    mockedUserService.getById.mockResolvedValue({ ...PROFILE, avatar: '/uploads/avatars/ada.png' });

    renderProfile();

    const image = await screen.findByRole('img', { name: 'Profile' });
    expect(image).toHaveAttribute('src', '/uploads/avatars/ada.png');
  });

  // A record with no createdAt reached `new Date('')`, which formats as the
  // literal string "Invalid Date". Every other missing field on this page has
  // a fallback; this one printed the error to the person instead.
  it('says nothing rather than Invalid Date when no joined date is stored', async () => {
    mockedUserService.getById.mockResolvedValue({ ...PROFILE, createdAt: undefined });

    renderProfile();
    await waitFor(() => expect(firstNameInput()).toHaveValue('Ada'));

    expect(screen.queryByText(/Invalid Date/)).not.toBeInTheDocument();
    expect(screen.getByText(/^Joined /)).toHaveTextContent('Joined Unknown');
  });

  it('says Unknown rather than nothing when no location is stored', async () => {
    mockedUserService.getById.mockResolvedValue({ ...PROFILE, location: '' });

    renderProfile();

    expect(await screen.findByText('Unknown')).toBeInTheDocument();
  });
});

describe('Profile editing', () => {
  it('offers nothing to save until something is changed', async () => {
    renderProfile();
    await waitFor(() => expect(firstNameInput()).toHaveValue('Ada'));

    saveButtons().forEach(button => expect(button).toBeDisabled());
  });

  it('sends only the editable fields, and not the joined date', async () => {
    const user = userEvent.setup();
    renderProfile();
    await waitFor(() => expect(firstNameInput()).toHaveValue('Ada'));

    await user.clear(firstNameInput());
    await user.type(firstNameInput(), 'Augusta');
    await user.click(screen.getAllByRole('button', { name: /Save Changes/ })[0]);

    await waitFor(() => expect(mockedUserService.update).toHaveBeenCalled());
    const [, payload] = mockedUserService.update.mock.calls[0];
    expect(payload).toEqual({
      firstName: 'Augusta',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      location: 'London',
      role: 'Engineer',
      department: 'Analytical Engine',
      avatar: '',
    });
    expect(payload).not.toHaveProperty('createdAt');
  });

  it('confirms the save happened', async () => {
    const user = userEvent.setup();
    renderProfile();
    await waitFor(() => expect(firstNameInput()).toHaveValue('Ada'));

    await user.clear(firstNameInput());
    await user.type(firstNameInput(), 'Augusta');
    await user.click(screen.getAllByRole('button', { name: /Save Changes/ })[0]);

    expect(await screen.findByText('Your profile has been updated successfully.')).toBeInTheDocument();
  });

  it('says so and keeps the edit when the save is refused', async () => {
    const user = userEvent.setup();
    mockedUserService.update.mockRejectedValue(new Error('refused'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderProfile();
    await waitFor(() => expect(firstNameInput()).toHaveValue('Ada'));

    await user.clear(firstNameInput());
    await user.type(firstNameInput(), 'Augusta');
    await user.click(screen.getAllByRole('button', { name: /Save Changes/ })[0]);

    expect(await screen.findByText('Failed to update profile. Please try again.')).toBeInTheDocument();
    expect(firstNameInput()).toHaveValue('Augusta');
    // Without this, a save that answers "it worked" after being refused
    // shows the confirmation and the failure side by side, and only the
    // failure half is asserted anywhere.
    expect(screen.queryByText('Your profile has been updated successfully.')).not.toBeInTheDocument();
  });

  // Cancel resets from the cache rather than refetching, because the cached
  // record is the last thing the server confirmed. A previous version rebuilt
  // the form from a second copy of the field mapping that was missing the
  // joined date, so cancelling silently blanked it.
  it('puts every field back to what is stored, including the joined date', async () => {
    const user = userEvent.setup();
    renderProfile();
    await waitFor(() => expect(firstNameInput()).toHaveValue('Ada'));

    await user.clear(firstNameInput());
    await user.type(firstNameInput(), 'Augusta');
    await user.click(screen.getAllByRole('button', { name: 'Cancel' })[0]);

    await waitFor(() => expect(firstNameInput()).toHaveValue('Ada'));
    // Asserted as the real date rather than as unchanged from before the
    // cancel. Comparing it to itself passes just as happily when the mapping
    // drops the field entirely and both readings say "Invalid Date", which is
    // what a mutation of exactly that shape proved.
    //
    // The day is left out because the page formats in the runner's own time
    // zone, and a timestamp at 10:00 UTC lands on a different day either side
    // of the world. The month and year do not move.
    expect(screen.getByText(/^Joined /)).toHaveTextContent(/^Joined January \d{1,2}, 2026$/);
  });

  it('refuses to save an email that is not one', async () => {
    const user = userEvent.setup();
    renderProfile();
    await waitFor(() => expect(emailInput()).toHaveValue('ada@example.com'));

    await user.clear(emailInput());
    await user.type(emailInput(), 'not-an-email');

    expect(await screen.findByText('Email is invalid')).toBeInTheDocument();
    await waitFor(() => saveButtons().forEach(button => expect(button).toBeDisabled()));
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
    const image = await screen.findByRole('img', { name: 'Profile' });
    expect(image).toHaveAttribute('src', '/uploads/avatars/ada.png');
  });

  // The input was hidden with Tailwind's `hidden`, which compiles to
  // display:none, and a display:none control is out of the focus order
  // entirely. Changing your avatar was therefore mouse-only.
  //
  // Asserted as a class rather than by tabbing, for the same reason P4-7 is:
  // jsdom loads no stylesheet, so `hidden` has no effect here and a focus
  // test would pass against the broken version. The compiled stylesheet is
  // where the two techniques actually differ, and sr-only is the one that
  // hides an element while leaving it focusable.
  it('hides the file input without taking it out of the focus order', async () => {
    renderProfile();
    await waitFor(() => expect(firstNameInput()).toHaveValue('Ada'));

    const input = screen.getByLabelText('Change avatar');
    // The name has to be on the control, not on the label drawn around it.
    // It was on the label, so the input itself had no accessible name, which
    // did not matter while it could not be focused and does now.
    expect(input.tagName).toBe('INPUT');
    expect(input).toHaveClass('sr-only');
    expect(input).not.toHaveClass('hidden');
  });

  it('says so when the upload is refused', async () => {
    const user = userEvent.setup();
    mockedUserService.uploadAvatar.mockRejectedValue(new Error('too large'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderProfile();
    await waitFor(() => expect(firstNameInput()).toHaveValue('Ada'));

    await user.upload(
      screen.getByLabelText('Change avatar'),
      new File(['bytes'], 'ada.png', { type: 'image/png' })
    );

    expect(await screen.findByText('Avatar upload failed. Please try again.')).toBeInTheDocument();
  });
});
