import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TaskDrawer from './TaskDrawer';
import { ColorService, UserService } from '@/services';
import type { Color, User } from '@/models';

// TaskDrawer is the highest value target here: a year-long regression made
// task creation impossible because the submit gate counted error object
// keys instead of error values. Selecting an owner cleared the owner error
// by writing `undefined` over the existing key, which kept the key around,
// which kept the gate permanently closed. These tests pin the fixed
// behavior so that regression cannot come back unnoticed.

vi.mock('@/services', () => ({
  ColorService: { getByType: vi.fn() },
  UserService: { getBoardMembers: vi.fn(), getById: vi.fn() },
}));

const mockedColorService = vi.mocked(ColorService);
const mockedUserService = vi.mocked(UserService);

const COLORS: Color[] = [
  { _id: 'color-blue', name: 'Blue', value: '#3B82F6' },
  { _id: 'color-red', name: 'Red', value: '#EF4444' },
];

const MEMBERS: User[] = [
  { _id: 'user-ada', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', avatar: '' },
  { _id: 'user-grace', firstName: 'Grace', lastName: 'Hopper', email: 'grace@example.com', avatar: '' },
];

// Both text fields show a visible "Title *" / "Description *" label, but
// neither label carries an htmlFor/id pointing at its input, and neither
// input has an aria-label either, so the input has no accessible name at
// all. getByRole with a name would fail here; placeholder text is the only
// reliable query. This is an accessibility gap in TaskDrawer worth fixing.
const getTitleInput = () => screen.getByPlaceholderText('Enter task title');
const getDescriptionInput = () => screen.getByPlaceholderText('Enter task description');
const getSaveButton = () => screen.getByRole('button', { name: 'Save Changes' });

// The color fetch populates `taskColors`, and a second effect (keyed on
// [task, taskColors]) reacts to that change by rebuilding the whole
// formData object from `task`. That second effect is scheduled slightly
// after the color swatches themselves paint, so a test that starts typing
// the moment the swatches appear can still get its keystrokes wiped out an
// instant later. Waiting for the swatches plus one extra real tick gives
// that second effect a chance to finish before any typing starts.
const waitForColorsLoaded = async () => {
  const button = await screen.findByRole('button', { name: 'Blue' });
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 50));
  });
  return button;
};

const renderDrawer = (onSave = vi.fn()) => {
  const onClose = vi.fn();
  render(<TaskDrawer open task={{ boardId: 'board-1' }} onClose={onClose} onSave={onSave} />);
  return { onSave, onClose };
};

const selectOwner = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
  const ownerSearch = screen.getByLabelText('Search team members');
  await user.type(ownerSearch, name);
  await user.click(await screen.findByText('Ada Lovelace'));
};

describe('TaskDrawer submit gating', () => {
  beforeEach(() => {
    mockedColorService.getByType.mockReset().mockResolvedValue(COLORS);
    mockedUserService.getBoardMembers.mockReset().mockResolvedValue(MEMBERS);
    mockedUserService.getById.mockReset();
  });

  it('disables Save when the drawer opens with an empty form', async () => {
    renderDrawer();

    await waitForColorsLoaded();

    expect(getSaveButton()).toBeDisabled();
  });

  it('enables Save once title, description, owner and color are all provided', async () => {
    const user = userEvent.setup();
    renderDrawer();
    await waitForColorsLoaded();

    await user.type(getTitleInput(), 'Ship the release notes');
    await user.type(getDescriptionInput(), 'Write and publish the notes for this cycle.');
    await user.click(screen.getByRole('button', { name: 'Blue' }));

    expect(getSaveButton()).toBeDisabled();

    // Selecting an owner is the exact path that used to break the gate: it
    // writes `errors.owner = undefined` over an existing key. If the gate
    // ever regresses back to counting keys instead of values, this is where
    // it fails.
    await selectOwner(user, 'Ada');

    // The owner selection triggers two chained state updates (TaskDrawer's
    // formData/errors, then UserSearchInput's own effect reacting to the
    // new `value` prop); waitFor absorbs that extra render tick instead of
    // asserting against a single, possibly-stale, render.
    await waitFor(() => expect(getSaveButton()).toBeEnabled());
  });

  it('disables Save again after selecting an owner and then clearing it', async () => {
    const user = userEvent.setup();
    renderDrawer();
    await waitForColorsLoaded();

    await user.type(getTitleInput(), 'Ship the release notes');
    await user.type(getDescriptionInput(), 'Write and publish the notes for this cycle.');
    await user.click(screen.getByRole('button', { name: 'Blue' }));
    await selectOwner(user, 'Ada');
    await waitFor(() => expect(getSaveButton()).toBeEnabled());

    await user.click(screen.getByRole('button', { name: 'Clear selected user' }));

    await waitFor(() => expect(getSaveButton()).toBeDisabled());
  });

  it('shows an error message and keeps the drawer open when onSave rejects', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockRejectedValue(new Error('network down'));
    const { onClose } = renderDrawer(onSave);
    await waitForColorsLoaded();

    await user.type(getTitleInput(), 'Ship the release notes');
    await user.type(getDescriptionInput(), 'Write and publish the notes for this cycle.');
    await user.click(screen.getByRole('button', { name: 'Blue' }));
    await selectOwner(user, 'Ada');
    await waitFor(() => expect(getSaveButton()).toBeEnabled());

    await user.click(getSaveButton());

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/could not be saved/i)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
