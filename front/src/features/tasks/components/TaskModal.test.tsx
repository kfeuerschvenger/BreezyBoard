import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithQuery } from '@/test/renderWithQuery';
import TaskModal from './TaskModal';
import { ColorService, UserService } from '@/services';
import type { Color, User } from '@/models';

// TaskModal is the highest value target here: a year-long regression made
// task creation impossible because the submit gate counted error object
// keys instead of error values. Selecting an owner cleared the owner error
// by writing `undefined` over the existing key, which kept the key around,
// which kept the gate permanently closed. These tests pin the fixed
// behavior so that regression cannot come back unnoticed.

vi.mock('@/services', () => ({
  ColorService: { getByType: vi.fn() },
  UserService: { getBoardMembers: vi.fn(), getById: vi.fn() },
}));

// TaskModal now autosaves a draft to localStorage as the user types (see the
// draft-persistence describe block below). Without this, a draft written by
// one test would leak into the next test that opens the modal for the same
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
// reliable query. This is an accessibility gap in TaskModal worth fixing.
const getTitleInput = () => screen.getByPlaceholderText('Enter task title');
const getDescriptionInput = () => screen.getByPlaceholderText('Enter task description');
// The one primary button of the footer. It is found by its name, which is the
// name a move target named "Done" would share, so a test that has such a column
// reads the footer's button from the dialog's own footer instead.
const getSaveButton = () => screen.getByRole('button', { name: 'Done' });

// A stored task with nothing filled in, so a test can say exactly which fields
// it fills. Hoisted so its identity is stable: the form rebuilds when the task
// changes.
const BARE_TASK = { _id: 'task-1', boardId: 'board-1' };

// Waits for the color swatches to paint before a test starts interacting.
// This used to be load bearing: the reset effect depended on taskColors, so
// it rebuilt the whole form when the request resolved and wiped any typing
// that happened first. That is fixed, and the test at the bottom of this
// file pins it. The helper stays because tests that need a color to click
// have to wait for one to exist anyway.
const waitForColorsLoaded = async () => {
  const swatch = await screen.findByRole('radio', { name: 'Blue' });
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 50));
  });
  return swatch;
};

const renderModal = (onSave = vi.fn()) => {
  const onClose = vi.fn();
  renderWithQuery(<TaskModal open task={BARE_TASK} onClose={onClose} onSave={onSave} />);
  return { onSave, onClose };
};

const selectOwner = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
  const ownerSearch = screen.getByLabelText(/Owner/);
  await user.type(ownerSearch, name);
  // The suggestion list is behind a 220ms debounce on a real timer, stacked on
  // top of the colour settle above. The default 5s was close enough to the edge
  // that this timed out under CPU load from an unrelated build.
  await user.click(await screen.findByText('Ada Lovelace', {}, { timeout: 15_000 }));
};

describe('TaskModal submit gating', () => {
  beforeEach(() => {
    mockedColorService.getByType.mockReset().mockResolvedValue(COLORS);
    mockedUserService.getBoardMembers.mockReset().mockResolvedValue(MEMBERS);
    mockedUserService.getById.mockReset();
  });

  it('disables Save when the modal opens with an empty form', async () => {
    renderModal();

    await waitForColorsLoaded();

    expect(getSaveButton()).toBeDisabled();
  });

  it('enables Save once title, description, owner and color are all provided', async () => {
    const user = userEvent.setup();
    renderModal();
    await waitForColorsLoaded();

    await user.type(getTitleInput(), 'Ship the release notes');
    await user.type(getDescriptionInput(), 'Write and publish the notes for this cycle.');
    await user.click(screen.getByRole('radio', { name: 'Blue' }));

    expect(getSaveButton()).toBeDisabled();

    // Selecting an owner is the exact path that used to break the gate: it
    // writes `errors.owner = undefined` over an existing key. If the gate
    // ever regresses back to counting keys instead of values, this is where
    // it fails.
    await selectOwner(user, 'Ada');

    // The owner selection triggers two chained state updates (TaskModal's
    // formData/errors, then UserSearchInput's own effect reacting to the
    // new `value` prop); waitFor absorbs that extra render tick instead of
    // asserting against a single, possibly-stale, render.
    await waitFor(() => expect(getSaveButton()).toBeEnabled());
  });

  // A card made from a column composer has a title and an owner and no
  // description. It has to open ready to save and save as it is.
  it('opens a task that has no description ready to save, and saves it', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const titleOnly = {
      _id: 'task-1',
      boardId: 'board-1',
      status: 'col-todo',
      title: 'Pack the stove',
      owner: MEMBERS[0],
      color: '#3B82F6',
    };
    renderWithQuery(<TaskModal open task={titleOnly} onClose={vi.fn()} onSave={onSave} />);
    await waitForColorsLoaded();

    expect(getDescriptionInput()).not.toBeRequired();
    expect(getDescriptionInput()).toHaveValue('');
    await waitFor(() => expect(getSaveButton()).toBeEnabled());

    await user.click(getSaveButton());

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ _id: 'task-1', title: 'Pack the stove', description: '' })),
    );
    expect(screen.queryByText('Description is required')).not.toBeInTheDocument();
  });

  it('disables Save again after selecting an owner and then clearing it', async () => {
    const user = userEvent.setup();
    renderModal();
    await waitForColorsLoaded();

    await user.type(getTitleInput(), 'Ship the release notes');
    await user.type(getDescriptionInput(), 'Write and publish the notes for this cycle.');
    await user.click(screen.getByRole('radio', { name: 'Blue' }));
    await selectOwner(user, 'Ada');
    await waitFor(() => expect(getSaveButton()).toBeEnabled());

    await user.click(screen.getByRole('button', { name: 'Clear selected user' }));

    await waitFor(() => expect(getSaveButton()).toBeDisabled());
  });

  it('shows an error message and keeps the modal open when onSave rejects', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockRejectedValue(new Error('network down'));
    const { onClose } = renderModal(onSave);
    await waitForColorsLoaded();

    await user.type(getTitleInput(), 'Ship the release notes');
    await user.type(getDescriptionInput(), 'Write and publish the notes for this cycle.');
    await user.click(screen.getByRole('radio', { name: 'Blue' }));
    await selectOwner(user, 'Ada');
    await waitFor(() => expect(getSaveButton()).toBeEnabled());

    await user.click(getSaveButton());

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/could not be saved/i)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});


describe('TaskModal form state versus the async color fetch', () => {
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
    renderWithQuery(<TaskModal open task={BARE_TASK} onClose={vi.fn()} onSave={vi.fn()} />);

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
    await screen.findByRole('radio', { name: 'Blue' });

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

    renderWithQuery(
      <TaskModal
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

    // The raw hex resolves to the matching swatch rather than being kept as
    // is. Asserted on the control's own state rather than on a CSS class,
    // which is both sturdier and what a user of assistive technology is
    // actually told.
    const red = await screen.findByRole('radio', { name: 'Red' });
    expect(red).toBeChecked();
  });
});

describe('TaskModal draft persistence', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockedColorService.getByType.mockReset().mockResolvedValue(COLORS);
    mockedUserService.getBoardMembers.mockReset().mockResolvedValue(MEMBERS);
    mockedUserService.getById.mockReset();
  });

  const DRAFT_STORAGE_KEY = 'breezyboard:draft:task:task-1';

  it('restores a draft into the form when one exists in storage for the task', async () => {
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

    renderWithQuery(<TaskModal open task={BARE_TASK} onClose={vi.fn()} onSave={vi.fn()} />);
    await waitForColorsLoaded();

    expect(getTitleInput()).toHaveValue('Draft title');
    expect(getDescriptionInput()).toHaveValue('Draft description');
  });

  it('clears the stored draft after a successful save', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    renderWithQuery(<TaskModal open task={BARE_TASK} onClose={onClose} onSave={onSave} />);
    await waitForColorsLoaded();

    await user.type(getTitleInput(), 'Ship the release notes');
    await user.type(getDescriptionInput(), 'Write and publish the notes for this cycle.');
    await user.click(screen.getByRole('radio', { name: 'Blue' }));
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

describe('TaskModal owner suggestions, by keyboard alone', () => {
  beforeEach(() => {
    mockedColorService.getByType.mockReset().mockResolvedValue(COLORS);
    mockedUserService.getBoardMembers.mockReset().mockResolvedValue(MEMBERS);
    mockedUserService.getById.mockReset();
  });

  // The suggestion list used to be a stack of divs with click handlers,
  // reachable by mouse and by nothing else, which is what P4-3 records. The
  // near-identical list in AddMemberModal already did this correctly, which
  // is usually the sign that the pattern was known and this one was missed.
  const openSuggestions = async (user: ReturnType<typeof userEvent.setup>, query = 'Ada') => {
    renderModal();
    await waitForColorsLoaded();

    const combobox = screen.getByLabelText(/Owner/);
    // Two characters minimum: the component treats anything shorter as
    // not yet a search, so typing one shows nothing and the wait below
    // would time out on a component that is working correctly.
    await user.type(combobox, query);
    await screen.findAllByRole('option', {}, { timeout: 15_000 });

    return combobox;
  };

  it('announces itself as a combobox that owns the list', async () => {
    const user = userEvent.setup();
    const combobox = await openSuggestions(user);

    expect(combobox).toHaveAttribute('role', 'combobox');
    expect(combobox).toHaveAttribute('aria-expanded', 'true');
    expect(combobox).toHaveAttribute('aria-controls', screen.getByRole('listbox').id);
  });

  it('moves the highlight with the arrow keys without moving focus off the input', async () => {
    const user = userEvent.setup();
    const combobox = await openSuggestions(user);

    await user.keyboard('{ArrowDown}');

    const [first] = screen.getAllByRole('option');
    expect(first).toHaveAttribute('aria-selected', 'true');
    // The combobox pattern keeps focus on the input throughout and points at
    // the highlighted option instead. Moving focus into the list would take
    // the typing away from the person using it.
    expect(combobox).toHaveFocus();
    expect(combobox).toHaveAttribute('aria-activedescendant', first.id);
  });

  it('wraps around at the ends rather than dead ending', async () => {
    const user = userEvent.setup();
    // Matches both seeded members, since lovelACe and grACe both contain it.
    // Ada alone matches one, and a wrap test over a list of one proves
    // nothing whichever way it goes.
    await openSuggestions(user, 'ac');

    const options = screen.getAllByRole('option');
    expect(options.length).toBeGreaterThan(1);

    await user.keyboard('{ArrowUp}');
    expect(options[options.length - 1]).toHaveAttribute('aria-selected', 'true');
  });

  it('selects the highlighted suggestion with Enter', async () => {
    const user = userEvent.setup();
    const combobox = await openSuggestions(user);

    await user.keyboard('{ArrowDown}{Enter}');

    expect(combobox).toHaveValue('Ada Lovelace');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('leaves Enter alone when no suggestion is highlighted, so the form can still submit', async () => {
    const user = userEvent.setup();
    const combobox = await openSuggestions(user);

    await user.keyboard('{Enter}');

    // Nothing was chosen, so the typed text stands and the list is untouched.
    expect(combobox).toHaveValue('Ada');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('dismisses the list with Escape without discarding what was typed', async () => {
    const user = userEvent.setup();
    const combobox = await openSuggestions(user);

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(combobox).toHaveValue('Ada');
  });
});

// Characterization, written before the shell and the form were split apart.
// Choosing the title is the only decision the shell keeps after that split,
// and nothing pinned it, so the split could have dropped it and left every
// other test in this file green.
describe('TaskModal title', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockedColorService.getByType.mockReset().mockResolvedValue(COLORS);
    mockedUserService.getBoardMembers.mockReset().mockResolvedValue(MEMBERS);
    mockedUserService.getById.mockReset();
  });

  // Asserted as the dialog's accessible name rather than as text on the page,
  // which is both what assistive technology announces and the thing section
  // 10.2 records as having been missing here.
  it('announces the task as an edit, and has no creation to announce', async () => {
    renderWithQuery(
      <TaskModal
        open
        task={{ _id: 'task-1', boardId: 'board-1', title: 'Existing' }}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );

    expect(await screen.findByRole('dialog', { name: 'Edit Task' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /create/i })).not.toBeInTheDocument();
  });
});

describe('TaskModal reference data fetching', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockedColorService.getByType.mockReset().mockResolvedValue(COLORS);
    mockedUserService.getBoardMembers.mockReset().mockResolvedValue(MEMBERS);
    mockedUserService.getById.mockReset();
  });

  // The palette of task colours is the same list for every task in the
  // product. Refetching it each time the modal is pointed at a different
  // task is a request that can never return anything new, and on a board
  // being worked through task by task it is one such request per open.
  it('fetches the task colours once across two tasks', async () => {
    const { rerender } = renderWithQuery(
      <TaskModal open task={{ _id: 'task-1', boardId: 'board-1' }} onClose={vi.fn()} onSave={vi.fn()} />
    );
    await waitForColorsLoaded();

    rerender(<TaskModal open task={{ _id: 'task-2', boardId: 'board-1' }} onClose={vi.fn()} onSave={vi.fn()} />);
    await waitForColorsLoaded();

    expect(mockedColorService.getByType).toHaveBeenCalledTimes(1);
  });

  // Same argument, one scope narrower: the member list belongs to the board,
  // so moving between two tasks of that board asks for a list already held.
  it('fetches the board members once across two tasks of the same board', async () => {
    const { rerender } = renderWithQuery(
      <TaskModal open task={{ _id: 'task-1', boardId: 'board-1' }} onClose={vi.fn()} onSave={vi.fn()} />
    );
    await waitForColorsLoaded();

    rerender(<TaskModal open task={{ _id: 'task-2', boardId: 'board-1' }} onClose={vi.fn()} onSave={vi.fn()} />);
    await waitForColorsLoaded();

    expect(mockedUserService.getBoardMembers).toHaveBeenCalledTimes(1);
    expect(mockedUserService.getBoardMembers).toHaveBeenCalledWith('board-1');
  });

  // The counterpart, so the test above cannot be satisfied by never fetching
  // again at all: a different board is a different list and must be asked for.
  it('fetches the members again when the modal moves to another board', async () => {
    const { rerender } = renderWithQuery(
      <TaskModal open task={{ _id: 'task-1', boardId: 'board-1' }} onClose={vi.fn()} onSave={vi.fn()} />
    );
    await waitForColorsLoaded();

    rerender(<TaskModal open task={{ _id: 'task-2', boardId: 'board-2' }} onClose={vi.fn()} onSave={vi.fn()} />);
    await waitForColorsLoaded();

    await waitFor(() => expect(mockedUserService.getBoardMembers).toHaveBeenCalledWith('board-2'));
    expect(mockedUserService.getBoardMembers).toHaveBeenCalledTimes(2);
  });

  // A modal that has never been opened holds no task, so there is no board to
  // ask for members of, and asking would be a request with an undefined id in
  // the query string.
  it('asks for no members at all before it has been given a task', async () => {
    renderWithQuery(<TaskModal open={false} task={null} onClose={vi.fn()} onSave={vi.fn()} />);
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
    });

    expect(mockedUserService.getBoardMembers).not.toHaveBeenCalled();
  });
});

describe('TaskModal on a task that exists', () => {
  const COLUMNS = [
    { id: 'col-todo', title: 'To Do' },
    { id: 'col-doing', title: 'In motion' },
    { id: 'col-done', title: 'Landed' },
  ];

  const EXISTING = {
    _id: 'task-1',
    boardId: 'board-1',
    status: 'col-todo',
    title: 'Pack the stove',
    description: 'Before the trek.',
    owner: MEMBERS[0],
    color: '#3B82F6',
  };

  beforeEach(() => {
    window.localStorage.clear();
    mockedColorService.getByType.mockReset().mockResolvedValue(COLORS);
    mockedUserService.getBoardMembers.mockReset().mockResolvedValue(MEMBERS);
    mockedUserService.getById.mockReset();
  });

  const renderExisting = (props: Partial<React.ComponentProps<typeof TaskModal>> = {}) => {
    const handlers = { onClose: vi.fn(), onSave: vi.fn().mockResolvedValue(undefined), onMove: vi.fn(), onDelete: vi.fn() };
    handlers.onDelete.mockResolvedValue(undefined);
    renderWithQuery(
      <TaskModal
        open
        task={EXISTING}
        boardTitle="Launch Plan"
        hue="teal"
        columns={COLUMNS}
        columnId="col-doing"
        {...handlers}
        {...props}
      />,
    );
    return handlers;
  };

  describe('the header strip', () => {
    it('says where the task is, and keeps a named close button out of the decoration', async () => {
      const { onClose } = renderExisting();
      await waitForColorsLoaded();

      const dialog = screen.getByRole('dialog', { name: 'Edit Task' });
      expect(within(dialog).getByText('Launch Plan · In motion')).toBeInTheDocument();
      expect(within(dialog).getByRole('heading', { name: 'Edit Task', level: 2 })).toBeInTheDocument();

      await userEvent.setup().click(within(dialog).getByRole('button', { name: 'Close' }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    // The gradient behind the strip is hidden from assistive technology, and
    // hiding a parent hides everything inside it, so a control placed in it
    // would be gone from the tree while still on screen.
    it('does not hide the close button from assistive technology', async () => {
      renderExisting();
      await waitForColorsLoaded();

      const close = screen.getByRole('button', { name: 'Close' });
      expect(close.closest('[aria-hidden="true"]')).toBeNull();
    });
  });

  describe('Move to', () => {
    it('lists every column with the current one pressed', async () => {
      renderExisting();
      await waitForColorsLoaded();

      const group = screen.getByRole('group', { name: /move to/i });
      const buttons = within(group).getAllByRole('button');

      expect(buttons.map(button => button.textContent)).toEqual(['To Do', 'In motion', 'Landed']);
      expect(buttons.map(button => button.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false']);
    });

    it('moves at once to the column that was pressed, and not to the one it is already in', async () => {
      const user = userEvent.setup();
      const { onMove } = renderExisting();
      await waitForColorsLoaded();

      await user.click(screen.getByRole('button', { name: 'In motion' }));
      expect(onMove).not.toHaveBeenCalled();

      await user.click(screen.getByRole('button', { name: 'Landed' }));
      expect(onMove).toHaveBeenCalledWith({ id: 'col-done', title: 'Landed' });
    });

    it('is not drawn when the modal is not told the board columns', async () => {
      renderExisting({ columns: undefined, columnId: undefined, onMove: undefined });
      await waitForColorsLoaded();

      expect(screen.queryByRole('group', { name: /move to/i })).not.toBeInTheDocument();
    });
  });

  describe('saving', () => {
    // A task moved from "Move to" while the form was open would be put back by
    // a save that still carried the column it was opened in.
    it('does not send the column it was opened in', async () => {
      const user = userEvent.setup();
      const { onSave } = renderExisting();
      await waitForColorsLoaded();
      await waitFor(() => expect(getSaveButton()).toBeEnabled());

      await user.click(getSaveButton());

      await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
      expect(onSave.mock.calls[0][0]).toMatchObject({ _id: 'task-1', title: 'Pack the stove' });
      expect(onSave.mock.calls[0][0]).not.toHaveProperty('status');
    });
  });

  describe('Blow it away', () => {
    it('deletes the task, drops its draft and closes', async () => {
      const user = userEvent.setup();
      const { onDelete, onClose } = renderExisting();
      await waitForColorsLoaded();
      await user.type(getTitleInput(), ' twice');
      await waitFor(() => expect(window.localStorage.getItem('breezyboard:draft:task:task-1')).not.toBeNull());

      await user.click(screen.getByRole('button', { name: 'Blow it away' }));

      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ _id: 'task-1' }));
      expect(window.localStorage.getItem('breezyboard:draft:task:task-1')).toBeNull();
    });

    it('says so and stays open, holding the draft, when the delete fails', async () => {
      const user = userEvent.setup();
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const { onClose, onDelete } = renderExisting();
      onDelete.mockRejectedValue(new Error('refused'));
      await waitForColorsLoaded();
      await user.type(getTitleInput(), ' twice');

      await user.click(screen.getByRole('button', { name: 'Blow it away' }));

      const alert = await screen.findByRole('alert');
      expect(within(alert).getByText(/could not be blown away/i)).toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
      expect(getTitleInput()).toHaveValue('Pack the stove twice');
      expect(window.localStorage.getItem('breezyboard:draft:task:task-1')).not.toBeNull();
    });

    it('is not offered when the caller cannot delete', async () => {
      renderExisting({ onDelete: undefined });
      await waitForColorsLoaded();

      expect(screen.queryByRole('button', { name: 'Blow it away' })).not.toBeInTheDocument();
      expect(getSaveButton()).toBeInTheDocument();
    });
  });

  describe('the footer', () => {
    const footerOf = () => {
      const done = getSaveButton();
      const footer = done.parentElement as HTMLElement;
      return { done, footer };
    };

    it('has "Blow it away" and a single "Done", and no Cancel and no Save', async () => {
      renderExisting();
      await waitForColorsLoaded();

      const { footer } = footerOf();
      const buttons = within(footer).getAllByRole('button');

      expect(buttons.map(button => button.textContent)).toEqual(['Blow it away', 'Done']);
      expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument();
    });

    it('draws the danger action as a ghost with the wind icon and Done as the one dark button', async () => {
      renderExisting();
      await waitForColorsLoaded();

      const blow = screen.getByRole('button', { name: 'Blow it away' });
      const { done } = footerOf();

      expect(blow).toHaveAttribute('type', 'button');
      expect(blow.querySelector('svg')).not.toBeNull();
      expect(blow.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
      expect(blow).toHaveClass('text-danger');
      expect(blow).not.toHaveClass('bg-ink');
      expect(done).toHaveClass('bg-ink');
      // Done is the form's own submit, so Enter in a field and the button agree.
      expect(done).toHaveAttribute('type', 'submit');
      expect(done).toHaveAttribute('form', 'task-form');
      expect(document.getElementById('task-form')).toBeInstanceOf(HTMLFormElement);
    });

    it('saves and closes on Done', async () => {
      const user = userEvent.setup();
      const { onSave, onClose } = renderExisting();
      await waitForColorsLoaded();
      await waitFor(() => expect(getSaveButton()).toBeEnabled());

      await user.click(getSaveButton());

      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      expect(onSave).toHaveBeenCalledTimes(1);
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ _id: 'task-1', title: 'Pack the stove' }));
    });

    it('reports a failed save from Done, stays open and keeps the draft', async () => {
      const user = userEvent.setup();
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const { onClose, onSave } = renderExisting();
      onSave.mockRejectedValue(new Error('network down'));
      await waitForColorsLoaded();
      await user.type(getTitleInput(), ' twice');
      await waitFor(() => expect(getSaveButton()).toBeEnabled());

      await user.click(getSaveButton());

      const alert = await screen.findByRole('alert');
      expect(within(alert).getByText(/could not be saved/i)).toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
      expect(getSaveButton()).toBeEnabled();
      expect(getTitleInput()).toHaveValue('Pack the stove twice');
      expect(window.localStorage.getItem('breezyboard:draft:task:task-1')).not.toBeNull();
    });

    it('is disabled while the form is not valid', async () => {
      renderExisting({ task: { ...EXISTING, title: '' } });
      await waitForColorsLoaded();

      expect(getSaveButton()).toBeDisabled();
    });

    it('is disabled while the delete is in flight, so a save cannot race it', async () => {
      const user = userEvent.setup();
      let release: () => void = () => {};
      const { onDelete } = renderExisting();
      onDelete.mockReturnValue(new Promise<void>(resolve => (release = resolve)));
      await waitForColorsLoaded();
      await waitFor(() => expect(getSaveButton()).toBeEnabled());

      await user.click(screen.getByRole('button', { name: 'Blow it away' }));

      expect(getSaveButton()).toBeDisabled();
      await act(async () => release());
    });

    // The close button and Escape leave without saving, and the draft stays.
    it('leaves the draft in place when the modal is closed with the close button', async () => {
      const user = userEvent.setup();
      const { onClose, onSave } = renderExisting();
      await waitForColorsLoaded();
      await user.type(getTitleInput(), ' twice');
      await waitFor(() => expect(window.localStorage.getItem('breezyboard:draft:task:task-1')).not.toBeNull());

      await user.click(screen.getByRole('button', { name: 'Close' }));

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onSave).not.toHaveBeenCalled();
      expect(window.localStorage.getItem('breezyboard:draft:task:task-1')).not.toBeNull();
    });
  });
});
