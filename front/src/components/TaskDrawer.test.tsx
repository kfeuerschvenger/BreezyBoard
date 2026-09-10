import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

// TaskDrawer now autosaves a draft to localStorage as the user types (see the
// draft-persistence describe block below). Without this, a draft written by
// one test would leak into the next test that opens the drawer for the same
// task/boardId and get restored, silently changing that test's starting form
// state.
afterEach(() => {
  window.localStorage.clear();
});

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

// Waits for the color swatches to paint before a test starts interacting.
// This used to be load bearing: the reset effect depended on taskColors, so
// it rebuilt the whole form when the request resolved and wiped any typing
// that happened first. That is fixed, and the test at the bottom of this
// file pins it. The helper stays because tests that need a color to click
// have to wait for one to exist anyway.
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
  // The suggestion list is behind a 220ms debounce on a real timer, stacked on
  // top of the colour settle above. The default 5s was close enough to the edge
  // that this timed out under CPU load from an unrelated build.
  await user.click(await screen.findByText('Ada Lovelace', {}, { timeout: 15_000 }));
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


describe('TaskDrawer form state versus the async color fetch', () => {
  beforeEach(() => {
    mockedColorService.getByType.mockReset();
    mockedUserService.getBoardMembers.mockReset().mockResolvedValue(MEMBERS);
    mockedUserService.getById.mockReset();
  });

  // Regression guard. The reset effect listed taskColors as a dependency, so
  // it ran a second time when the colors request resolved and rebuilt formData
  // from the task, silently discarding anything typed in the meantime. On a
  // slow connection that is a user losing a sentence they just wrote.
  it('keeps what the user typed when the colors resolve after mount', async () => {
    let releaseColors: (colors: Color[]) => void = () => {};
    mockedColorService.getByType.mockReturnValue(
      new Promise<Color[]>(resolve => {
        releaseColors = resolve;
      })
    );

    const user = userEvent.setup();
    render(<TaskDrawer open task={{ boardId: 'board-1' }} onClose={vi.fn()} onSave={vi.fn()} />);

    // Let the mount effects settle. The colors request is still pending on
    // purpose: this test types into the form before it resolves.
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
    });

    await user.type(getTitleInput(), 'Typed before the colors arrived');
    await user.type(getDescriptionInput(), 'And so was this');

    await act(async () => {
      releaseColors(COLORS);
      await new Promise(resolve => setTimeout(resolve, 50));
    });
    await screen.findByRole('button', { name: 'Blue' });

    expect(getTitleInput()).toHaveValue('Typed before the colors arrived');
    expect(getDescriptionInput()).toHaveValue('And so was this');
  });

  it('still resolves the color of an existing task once the colors arrive', async () => {
    let releaseColors: (colors: Color[]) => void = () => {};
    mockedColorService.getByType.mockReturnValue(
      new Promise<Color[]>(resolve => {
        releaseColors = resolve;
      })
    );

    render(
      <TaskDrawer
        open
        task={{ _id: 'task-1', boardId: 'board-1', title: 'Existing', description: 'Existing', color: '#EF4444' }}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );

    await act(async () => {
      releaseColors(COLORS);
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    // The raw hex resolves to the matching swatch rather than being kept as is.
    const red = await screen.findByRole('button', { name: 'Red' });
    expect(red.className).toContain('ring-2');
  });
});

describe('TaskDrawer draft persistence', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockedColorService.getByType.mockReset().mockResolvedValue(COLORS);
    mockedUserService.getBoardMembers.mockReset().mockResolvedValue(MEMBERS);
    mockedUserService.getById.mockReset();
  });

  const DRAFT_STORAGE_KEY = 'breezyboard:draft:task:new:board-1';

  it('restores a draft into the form when one exists in storage for a new task', async () => {
    window.localStorage.setItem(
      DRAFT_STORAGE_KEY,
      JSON.stringify({
        savedAt: Date.now(),
        value: {
          title: 'Draft title',
          description: 'Draft description',
          priority: 'high',
          color: 'color-red',
          owner: 'user-grace',
          checklist: [],
        },
      })
    );

    render(<TaskDrawer open task={{ boardId: 'board-1' }} onClose={vi.fn()} onSave={vi.fn()} />);
    await waitForColorsLoaded();

    expect(getTitleInput()).toHaveValue('Draft title');
    expect(getDescriptionInput()).toHaveValue('Draft description');
  });

  it('clears the stored draft after a successful save', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<TaskDrawer open task={{ boardId: 'board-1' }} onClose={onClose} onSave={onSave} />);
    await waitForColorsLoaded();

    await user.type(getTitleInput(), 'Ship the release notes');
    await user.type(getDescriptionInput(), 'Write and publish the notes for this cycle.');
    await user.click(screen.getByRole('button', { name: 'Blue' }));
    await selectOwner(user, 'Ada');
    await waitFor(() => expect(getSaveButton()).toBeEnabled());

    // Confirm the autosave actually landed before saving, so clearing it is a
    // meaningful assertion rather than checking a key that was never set.
    await waitFor(() => expect(window.localStorage.getItem(DRAFT_STORAGE_KEY)).not.toBeNull());

    await user.click(getSaveButton());

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(window.localStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
  });
});
