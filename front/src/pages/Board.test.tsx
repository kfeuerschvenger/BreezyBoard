import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createTestQueryClient, renderWithQuery } from '@/test/renderWithQuery';
import { ToastProvider } from '@/shared/ui';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AxiosError, AxiosHeaders } from 'axios';
import Board from './Board';
import { useAuth } from '@/hooks/useAuth';
import { BoardService, TaskService, ColorService, UserService } from '@/services';
import type { Board as BoardModel, Color, Task, User } from '@/models';

// Board always mounts a TaskModal child (it just keeps it closed until a
// task is clicked), and that modal loads colors on mount regardless of
// its open state. Every case below stubs ColorService/UserService too so
// that side effect never reaches the real, unmocked axios client.
vi.mock('@/services', () => ({
  BoardService: { getById: vi.fn(), update: vi.fn(), delete: vi.fn(), restore: vi.fn() },
  TaskService: {
    getByBoard: vi.fn(),
    move: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    restore: vi.fn(),
  },
  ColorService: { getByType: vi.fn() },
  UserService: { getBoardMembers: vi.fn(), getById: vi.fn() },
}));

// The not found page asks who is signed in to choose its link, and the page
// is rendered here without an AuthProvider.
vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

const SIGNED_IN_AS_NOBODY = { isAuthenticated: true, loading: false, user: null } as unknown as ReturnType<typeof useAuth>;
const mockedUseAuth = vi.mocked(useAuth);

beforeEach(() => {
  mockedUseAuth.mockReset().mockReturnValue(SIGNED_IN_AS_NOBODY);
});

const mockedBoardService = vi.mocked(BoardService);
const mockedTaskService = vi.mocked(TaskService);
const mockedColorService = vi.mocked(ColorService);
const mockedUserService = vi.mocked(UserService);

const BOARD_ID = 'board-1';

const board: BoardModel = {
  _id: BOARD_ID,
  title: 'Launch Plan',
  description: '',
  color: '#3B82F6',
  columns: [
    { _id: 'col-todo', title: 'To Do', color: { _id: 'c1', value: '#3B82F6' }, order: 0 },
    { _id: 'col-done', title: 'Done', color: { _id: 'c2', value: '#22C55E' }, order: 1 },
  ],
  template: {
    _id: 'template-1',
    name: 'Default',
    description: '',
    iconName: 'layout',
    columns: [],
  },
  createdBy: 'user-1',
  members: [],
  taskCount: 0,
  memberCount: 0,
  progress: 0,
};

const makeTask = (overrides: Partial<Task>): Task => ({
  _id: 'task-default',
  title: 'Untitled',
  description: '',
  status: 'col-todo',
  priority: 'low',
  color: '#3B82F6',
  owner: '',
  boardId: BOARD_ID,
  checklist: [],
  order: 'a0',
  ...overrides,
});

// A failed request as axios reports it: a rejection carrying the response.
const rejectedWith = (status: number) =>
  new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    statusText: '',
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: {},
  });

const renderBoard = () =>
  renderWithQuery(
    <MemoryRouter initialEntries={[`/board/${BOARD_ID}`]}>
      <Routes>
        <Route path="/board/:boardId" element={<Board />} />
      </Routes>
    </MemoryRouter>
  );

describe('Board page rendering', () => {
  beforeEach(() => {
    mockedBoardService.getById.mockReset();
    mockedTaskService.getByBoard.mockReset();
    mockedColorService.getByType.mockReset().mockResolvedValue([]);
    mockedUserService.getBoardMembers.mockReset().mockResolvedValue([]);
  });

  it('renders each task inside the column whose id matches its status', async () => {
    mockedBoardService.getById.mockResolvedValue(board);
    mockedTaskService.getByBoard.mockResolvedValue([
      makeTask({ _id: 'task-todo', title: 'Write the spec', status: 'col-todo' }),
    ]);

    renderBoard();

    const todoHeading = await screen.findByRole('heading', { name: 'To Do' });
    const doneHeading = screen.getByRole('heading', { name: 'Done' });

    // Column has no role/landmark or test id tying it to its heading, so
    // scoping a query to "this column's DOM subtree" means walking up to
    // the container that holds both the header row and the task list.
    const todoColumn = todoHeading.parentElement?.parentElement;
    const doneColumn = doneHeading.parentElement?.parentElement;
    if (!todoColumn || !doneColumn) throw new Error('Column container not found');

    expect(within(todoColumn).getByText('Write the spec')).toBeInTheDocument();
    expect(within(doneColumn).queryByText('Write the spec')).not.toBeInTheDocument();

    // The count badge next to the heading is the only other place task
    // counts are exposed; use it to confirm Done really is empty.
    expect(within(todoColumn.firstElementChild as HTMLElement).getByText('1')).toBeInTheDocument();
    expect(within(doneColumn.firstElementChild as HTMLElement).getByText('0')).toBeInTheDocument();
  });

  it('pins current behavior: a task with a status matching no column renders in no column, and the board still renders', async () => {
    mockedBoardService.getById.mockResolvedValue(board);
    mockedTaskService.getByBoard.mockResolvedValue([
      makeTask({ _id: 'task-todo', title: 'Write the spec', status: 'col-todo' }),
      makeTask({ _id: 'task-orphan', title: 'Orphaned task', status: 'this-status-does-not-exist' }),
    ]);

    renderBoard();

    await screen.findByRole('heading', { name: 'To Do' });

    // This is documenting an unvalidated status reference, not desired
    // behavior: the orphaned task silently disappears instead of raising
    // an error or falling back to a default column.
    expect(screen.queryByText('Orphaned task')).not.toBeInTheDocument();
    // The board itself does not crash or show an error for the orphan.
    expect(screen.getByRole('heading', { name: 'To Do' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Done' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('names the tab with the board, and says Board while it is still on its way', async () => {
    mockedBoardService.getById.mockResolvedValue(board);
    mockedTaskService.getByBoard.mockResolvedValue([]);

    renderBoard();

    expect(document.title).toBe('Board | BreezyBoard');
    await screen.findByRole('heading', { name: 'To Do' });
    expect(document.title).toBe('Launch Plan | BreezyBoard');
  });

  it('shows a loading indicator while the fetch is pending', () => {
    mockedBoardService.getById.mockReturnValue(new Promise(() => {}));
    mockedTaskService.getByBoard.mockReturnValue(new Promise(() => {}));

    renderBoard();

    // Asserted as a named status rather than as a spinning class. Until the
    // loading screen became a primitive, only the class identified this as a
    // loading cue, so the page read as empty to anyone not looking at it.
    expect(screen.getByRole('status', { name: 'Loading this board' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'To Do' })).not.toBeInTheDocument();
  });

  it('shows an error message with a retry when the fetch rejects, not a permanent spinner', async () => {
    mockedBoardService.getById.mockRejectedValue(new Error('network down'));

    renderBoard();

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('This board could not be loaded')).toBeInTheDocument();
    expect(within(alert).getByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading this board' })).not.toBeInTheDocument();
  });

  it.each([
    [404, 'a board that is missing or deleted'],
    [403, 'a board the caller may not read'],
    [400, 'an address that is not an id'],
  ])('shows a not found page, with no retry, for a %i (%s)', async status => {
    mockedBoardService.getById.mockRejectedValue(rejectedWith(status));
    mockedTaskService.getByBoard.mockRejectedValue(rejectedWith(status));

    renderBoard();

    expect(await screen.findByRole('heading', { level: 1, name: 'Board not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to my boards' })).toHaveAttribute('href', '/');
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(document.title).toBe('Board not found | BreezyBoard');
  });

  // Effects run child first. When the page is shown again for an address the
  // cache already knows is missing, the not found page is there from the first
  // render, and a parent that set its own title in that same pass would take
  // the tab from it.
  it('keeps the not found title when the missing board is shown again from the cache', async () => {
    mockedBoardService.getById.mockRejectedValue(rejectedWith(404));
    mockedTaskService.getByBoard.mockRejectedValue(rejectedWith(404));
    const queryClient = createTestQueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    );
    const page = (
      <MemoryRouter initialEntries={[`/board/${BOARD_ID}`]}>
        <Routes>
          <Route path="/board/:boardId" element={<Board />} />
        </Routes>
      </MemoryRouter>
    );

    const first = render(page, { wrapper });
    await screen.findByRole('heading', { level: 1, name: 'Board not found' });
    first.unmount();
    // An errored query refetches when it is mounted again, and while it does
    // it reads as loading. Left as it is, the cached failure is not there to
    // be drawn in the first pass.
    queryClient.setDefaultOptions({
      queries: { retry: false, refetchOnWindowFocus: false, staleTime: Infinity, retryOnMount: false },
    });
    document.title = 'Home | BreezyBoard';

    render(page, { wrapper });

    await screen.findByRole('heading', { level: 1, name: 'Board not found' });
    expect(document.title).toBe('Board not found | BreezyBoard');
  });

  it('keeps the retry for a server failure, where trying again can change the answer', async () => {
    mockedBoardService.getById.mockRejectedValue(rejectedWith(500));
    mockedTaskService.getByBoard.mockRejectedValue(rejectedWith(500));

    renderBoard();

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Board not found' })).not.toBeInTheDocument();
  });
});

describe('Board page adding and saving a task', () => {
  const COLORS: Color[] = [{ _id: 'color-blue', name: 'Blue', value: '#3B82F6' }];
  const ADA: User = { _id: 'user-ada', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', avatar: '' };
  const MEMBERS: User[] = [
    ADA,
    { _id: 'user-grace', firstName: 'Grace', lastName: 'Hopper', email: 'grace@example.com', avatar: '' },
  ];

  beforeEach(() => {
    window.localStorage.clear();
    mockedBoardService.getById.mockReset().mockResolvedValue(board);
    mockedTaskService.getByBoard.mockReset().mockResolvedValue([]);
    mockedTaskService.create.mockReset();
    mockedTaskService.update.mockReset();
    mockedColorService.getByType.mockReset().mockResolvedValue(COLORS);
    mockedUserService.getBoardMembers.mockReset().mockResolvedValue(MEMBERS);
    mockedUserService.getById.mockReset();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  describe('from a column composer', () => {
    it('makes its author the owner of the card', async () => {
      const user = userEvent.setup();
      mockedUseAuth.mockReturnValue({ isAuthenticated: true, loading: false, user: ADA } as unknown as ReturnType<typeof useAuth>);
      mockedTaskService.create.mockResolvedValue(
        makeTask({ _id: 'task-new', title: 'Pack the stove', status: 'col-done' }),
      );
      renderBoard();

      await typeInto(user, 'Done', 'Pack the stove');

      await waitFor(() =>
        expect(mockedTaskService.create).toHaveBeenCalledWith(
          BOARD_ID,
          expect.objectContaining({ title: 'Pack the stove', owner: ADA._id }),
        ),
      );
      expect(mockedTaskService.create.mock.calls[0][1]).not.toHaveProperty('description');
    });

    const typeInto = async (user: ReturnType<typeof userEvent.setup>, column: string, title: string) => {
      await user.click(await screen.findByRole('button', { name: `Add a card to ${column}` }));
      await user.type(
        screen.getByRole('textbox', { name: new RegExp(`new card in ${column}`, 'i') }),
        `${title}{Enter}`,
      );
    };

    it('creates a card from its title alone, in that column, with the first task colour', async () => {
      const user = userEvent.setup();
      mockedTaskService.create.mockResolvedValue(
        makeTask({ _id: 'task-new', title: 'Pack the stove', status: 'col-done' }),
      );
      renderBoard();

      await typeInto(user, 'Done', 'Pack the stove');

      await waitFor(() =>
        expect(mockedTaskService.create).toHaveBeenCalledWith(BOARD_ID, {
          title: 'Pack the stove',
          status: 'col-done',
          color: 'color-blue',
        }),
      );
    });

    it('puts the new card in its column at once, without a refetch', async () => {
      const user = userEvent.setup();
      mockedTaskService.create.mockResolvedValue(
        makeTask({ _id: 'task-new', title: 'Pack the stove', status: 'col-todo', order: 'a1' }),
      );
      renderBoard();

      await typeInto(user, 'To Do', 'Pack the stove');

      const heading = await screen.findByRole('heading', { name: 'To Do' });
      const column = heading.parentElement?.parentElement as HTMLElement;
      expect(await within(column).findByRole('button', { name: 'Pack the stove' })).toBeInTheDocument();
      expect(mockedTaskService.getByBoard).toHaveBeenCalledTimes(1);
    });

    it('keeps what was typed and says so when the server refuses the card', async () => {
      const user = userEvent.setup();
      mockedTaskService.create.mockRejectedValue(new Error('refused'));
      renderBoard();

      await typeInto(user, 'To Do', 'Pack the stove');

      expect(await screen.findByRole('alert')).toHaveTextContent('The card could not be added');
      expect(screen.getByRole('textbox', { name: /new card in To Do/i })).toHaveValue('Pack the stove');
      expect(screen.queryByRole('button', { name: 'Pack the stove' })).not.toBeInTheDocument();
    });

    // The server requires a colour. Without the palette there is nothing valid
    // to send, and a request that is bound to be refused is not sent.
    it('does not send a card it cannot colour, and says so', async () => {
      const user = userEvent.setup();
      mockedColorService.getByType.mockResolvedValue([]);
      renderBoard();

      await typeInto(user, 'To Do', 'Pack the stove');

      expect(await screen.findByRole('alert')).toHaveTextContent('The card could not be added');
      expect(mockedTaskService.create).not.toHaveBeenCalled();
    });

    it('opens the first column composer from the header button', async () => {
      const user = userEvent.setup();
      renderBoard();
      await screen.findByRole('heading', { name: 'To Do' });

      await user.click(screen.getByRole('button', { name: 'Add card' }));

      expect(await screen.findByRole('textbox', { name: /new card in To Do/i })).toHaveFocus();
    });

    it('opens it from the empty board banner as well', async () => {
      const user = userEvent.setup();
      renderBoard();

      await user.click(await screen.findByRole('button', { name: 'Add your first card' }));

      expect(await screen.findByRole('textbox', { name: /new card in To Do/i })).toHaveFocus();
    });
  });

  describe('through the modal, for a card that exists', () => {
    const existing = makeTask({
      _id: 'task-1',
      title: 'Write the spec',
      description: 'For this cycle.',
      owner: ADA,
    });

    /** Opens the card from its title and changes the title, which is all a valid card needs to be saved. */
    const editTitle = async (user: ReturnType<typeof userEvent.setup>) => {
      mockedTaskService.getByBoard.mockResolvedValue([existing]);
      renderBoard();

      await user.click(await screen.findByRole('button', { name: 'Write the spec' }));
      await screen.findByRole('dialog');
      await screen.findByRole('radio', { name: 'Blue' });

      const title = screen.getByPlaceholderText('Enter task title');
      await user.clear(title);
      await user.type(title, 'Write the release notes');

      const save = getDone(screen.getByRole('dialog'));
      await waitFor(() => expect(save).toBeEnabled());
      return save;
    };

    /** The footer's button: the only one named Done, since a column's is named "Move to Done". */
    const getDone = (dialog: HTMLElement) => within(dialog).getByRole('button', { name: 'Done' });

    it('opens for editing, and not for creating, when a card is pressed', async () => {
      const user = userEvent.setup();
      mockedTaskService.getByBoard.mockResolvedValue([existing]);
      renderBoard();

      await user.click(await screen.findByRole('button', { name: 'Write the spec' }));

      expect(await screen.findByRole('dialog', { name: 'Edit task' })).toBeInTheDocument();
    });

    it('saves the edit and closes the modal when the server accepts it', async () => {
      const user = userEvent.setup();
      mockedTaskService.update.mockResolvedValue({ ...existing, title: 'Write the release notes' });

      const save = await editTitle(user);
      await user.click(save);

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(mockedTaskService.update).toHaveBeenCalledWith(
        'task-1',
        expect.objectContaining({ title: 'Write the release notes' }),
      );
      expect(await screen.findByRole('button', { name: 'Write the release notes' })).toBeInTheDocument();
    });

    // The modal knows how to report a failed save and is tested doing it. It
    // can only do so if the failure reaches it, and a page handler that catches
    // everything and returns normally tells it the save succeeded: it clears
    // the draft and closes, and the work is gone with nothing ever written.
    it('keeps the modal open and says so when the server refuses the edit', async () => {
      const user = userEvent.setup();
      mockedTaskService.update.mockRejectedValue(new Error('refused'));
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const save = await editTitle(user);
      await user.click(save);

      const alert = await screen.findByRole('alert');
      expect(within(alert).getByText(/could not be saved/i)).toBeInTheDocument();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Enter task title')).toHaveValue('Write the release notes');
    });

    it('names the board and the column on the header strip, and follows a move made from inside', async () => {
      const user = userEvent.setup();
      mockedTaskService.getByBoard.mockResolvedValue([existing]);
      mockedTaskService.move.mockResolvedValue({ ...existing, status: 'col-done', order: 'a0' });
      renderBoard();

      await user.click(await screen.findByRole('button', { name: 'Write the spec' }));
      const dialog = await screen.findByRole('dialog', { name: 'Edit task' });
      expect(within(dialog).getByText('Launch Plan · To Do')).toBeInTheDocument();

      const moveTo = within(dialog).getByRole('group', { name: /move to/i });
      await user.click(within(moveTo).getByRole('button', { name: 'Move to Done' }));

      await waitFor(() => expect(mockedTaskService.move).toHaveBeenCalledWith('task-1', 'col-done', expect.anything(), expect.anything()));
      expect(await within(dialog).findByText('Launch Plan · Done')).toBeInTheDocument();
      expect(within(moveTo).getByRole('button', { name: 'Move to Done' })).toHaveAttribute('aria-pressed', 'true');
      // The modal is still open: moving is not saving and does not close it.
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('does not put a card back in the column it was opened in when it is saved after a move', async () => {
      const user = userEvent.setup();
      mockedTaskService.getByBoard.mockResolvedValue([existing]);
      mockedTaskService.move.mockResolvedValue({ ...existing, status: 'col-done', order: 'a0' });
      mockedTaskService.update.mockResolvedValue({ ...existing, status: 'col-done', title: 'Write the release notes' });
      renderBoard();

      await user.click(await screen.findByRole('button', { name: 'Write the spec' }));
      const dialog = await screen.findByRole('dialog');
      const moveTo = within(dialog).getByRole('group', { name: /move to/i });
      await user.click(within(moveTo).getByRole('button', { name: 'Move to Done' }));
      await within(dialog).findByText('Launch Plan · Done');
      await screen.findByRole('radio', { name: 'Blue' });
      const title = screen.getByPlaceholderText('Enter task title');
      await user.clear(title);
      await user.type(title, 'Write the release notes');
      const save = getDone(dialog);
      await waitFor(() => expect(save).toBeEnabled());

      await user.click(save);

      await waitFor(() => expect(mockedTaskService.update).toHaveBeenCalled());
      expect(mockedTaskService.update.mock.calls[0][1]).not.toHaveProperty('status');
    });

    it('blows the card away, closes, and brings the same card back with Catch it', async () => {
      const user = userEvent.setup();
      mockedTaskService.getByBoard.mockResolvedValue([existing]);
      mockedTaskService.delete.mockResolvedValue(undefined);
      mockedTaskService.restore.mockResolvedValue(existing);
      renderBoard();

      await user.click(await screen.findByRole('button', { name: 'Write the spec' }));
      await user.click(await screen.findByRole('button', { name: 'Blow it away' }));

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(mockedTaskService.delete).toHaveBeenCalledWith('task-1');
      expect(screen.queryByRole('button', { name: 'Write the spec' })).not.toBeInTheDocument();
      expect(await screen.findByText('Card blown away.')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Catch it' }));

      expect(await screen.findByRole('button', { name: 'Write the spec' })).toBeInTheDocument();
      expect(mockedTaskService.restore).toHaveBeenCalledWith('task-1');
      expect(mockedTaskService.create).not.toHaveBeenCalled();
    });

    describe('the exit of a card that is blown away', () => {
      const leavingPicture = () => document.querySelector('[data-task-leaving="task-1"]');

      const blowAway = async (user: ReturnType<typeof userEvent.setup>) => {
        mockedTaskService.getByBoard.mockResolvedValue([existing]);
        mockedTaskService.delete.mockResolvedValue(undefined);
        mockedTaskService.restore.mockResolvedValue(existing);
        renderBoard();

        await user.click(await screen.findByRole('button', { name: 'Write the spec' }));
        await user.click(await screen.findByRole('button', { name: 'Blow it away' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      };

      it('plays from a picture of the card, which is no longer one of the board cards', async () => {
        const user = userEvent.setup();

        await blowAway(user);

        expect(leavingPicture()).toHaveClass('animate-bb-away');
        expect(document.querySelector('[data-task-card="task-1"]')).toBeNull();
        expect(screen.queryByRole('button', { name: 'Write the spec' })).not.toBeInTheDocument();
        // It is not counted: the column's count is read from the list.
        const todo = document.querySelector('[data-column="col-todo"]') as HTMLElement;
        expect(within(todo).getByText('0')).toBeInTheDocument();
        expect(todo).toContainElement(leavingPicture() as HTMLElement);
      });

      it('does not hold back the request or the Catch it toast for it', async () => {
        const user = userEvent.setup();

        await blowAway(user);

        // The animation has not ended, and the toast and the request are there.
        expect(leavingPicture()).not.toBeNull();
        expect(mockedTaskService.delete).toHaveBeenCalledWith('task-1');
        expect(screen.getByRole('button', { name: 'Catch it' })).toBeInTheDocument();
      });

      it('leaves the board when its animation ends', async () => {
        const user = userEvent.setup();
        await blowAway(user);

        act(() => {
          leavingPicture()!.dispatchEvent(new Event('animationend', { bubbles: true }));
        });

        expect(leavingPicture()).toBeNull();
        // Both columns are empty now, and say so.
        expect(screen.getAllByText('Still air')).toHaveLength(2);
      });

      it('shows the card once, in place, when it is caught while it is still leaving', async () => {
        const user = userEvent.setup();
        await blowAway(user);

        await user.click(screen.getByRole('button', { name: 'Catch it' }));

        expect(await screen.findByRole('button', { name: 'Write the spec' })).toBeInTheDocument();
        expect(leavingPicture()).toBeNull();
        expect(screen.getAllByRole('button', { name: 'Write the spec' })).toHaveLength(1);
      });

      it('plays nothing when the server refuses the delete, and the card stays', async () => {
        const user = userEvent.setup();
        vi.spyOn(console, 'error').mockImplementation(() => {});
        mockedTaskService.getByBoard.mockResolvedValue([existing]);
        mockedTaskService.delete.mockRejectedValue(new Error('refused'));
        renderBoard();

        await user.click(await screen.findByRole('button', { name: 'Write the spec' }));
        await user.click(await screen.findByRole('button', { name: 'Blow it away' }));

        expect(await screen.findByRole('alert')).toBeInTheDocument();
        expect(leavingPicture()).toBeNull();
        expect(document.querySelector('[data-task-card="task-1"]')).not.toBeNull();
      });
    });
  });
});

describe('Board page owner actions', () => {
  beforeEach(() => {
    mockedBoardService.getById.mockReset();
    mockedBoardService.update.mockReset();
    mockedBoardService.delete.mockReset();
    mockedBoardService.restore.mockReset();
    mockedTaskService.getByBoard.mockReset().mockResolvedValue([]);
    mockedColorService.getByType.mockReset().mockResolvedValue([{ _id: 'c-blue', name: 'Blue', value: '#3B82F6' }]);
    mockedUserService.getBoardMembers.mockReset().mockResolvedValue([]);
  });

  it('shows the owner a board options menu and a member none', async () => {
    mockedBoardService.getById.mockResolvedValue({ ...board, viewerRole: 'owner' });
    const owner = renderBoard();
    expect(await screen.findByRole('button', { name: 'Options for Launch Plan' })).toBeInTheDocument();
    owner.unmount();

    mockedBoardService.getById.mockResolvedValue({ ...board, viewerRole: 'member' });
    renderBoard();
    await screen.findByRole('heading', { name: 'Launch Plan' });
    expect(screen.queryByRole('button', { name: /options for/i })).not.toBeInTheDocument();
  });

  it('shows an edited name in the page header as soon as it is saved', async () => {
    const user = userEvent.setup();
    mockedBoardService.getById.mockResolvedValue({ ...board, viewerRole: 'owner' });
    mockedBoardService.update.mockResolvedValue({ ...board, title: 'Relaunch Plan' });
    renderBoard();

    await user.click(await screen.findByRole('button', { name: 'Options for Launch Plan' }));
    await user.click(screen.getByRole('menuitem', { name: 'Edit board' }));
    const name = await screen.findByRole('textbox', { name: /board name/i });
    await user.clear(name);
    await user.type(name, 'Relaunch Plan');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Relaunch Plan' })).toBeInTheDocument();
    expect(mockedBoardService.getById).toHaveBeenCalledTimes(1);
  });

  it('leaves for the dashboard once the board is deleted, and the Undo toast goes with the person', async () => {
    const user = userEvent.setup();
    mockedBoardService.getById.mockResolvedValue({ ...board, viewerRole: 'owner' });
    mockedBoardService.delete.mockResolvedValue(undefined);
    renderWithQuery(
      <MemoryRouter initialEntries={[`/board/${BOARD_ID}`]}>
        <Routes>
          <Route path="/" element={<h1>Dashboard page</h1>} />
          <Route path="/board/:boardId" element={<Board />} />
        </Routes>
      </MemoryRouter>
    );

    await user.click(await screen.findByRole('button', { name: 'Options for Launch Plan' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete board' }));
    await user.click(await screen.findByRole('button', { name: 'Delete board' }));

    expect(await screen.findByRole('heading', { name: 'Dashboard page' })).toBeInTheDocument();
    expect(mockedBoardService.delete).toHaveBeenCalledWith(BOARD_ID);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
  });

  it('never reads the board again, or shows it as missing, on the way out after deleting it', async () => {
    const user = userEvent.setup();
    mockedBoardService.getById
      .mockResolvedValueOnce({ ...board, viewerRole: 'owner' })
      .mockRejectedValue(rejectedWith(404));
    mockedBoardService.delete.mockResolvedValue(undefined);
    renderWithQuery(
      <MemoryRouter initialEntries={[`/board/${BOARD_ID}`]}>
        <Routes>
          <Route path="/" element={<h1>Dashboard page</h1>} />
          <Route
            path="/board/:boardId"
            element={<Board />}
          />
        </Routes>
      </MemoryRouter>
    );

    await user.click(await screen.findByRole('button', { name: 'Options for Launch Plan' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete board' }));

    // Watches every change to the document, so a not found page that is
    // shown for one commit and gone the next is still caught.
    let sawNotFound = false;
    const observer = new MutationObserver(() => {
      if (document.body.textContent?.includes('Board not found')) sawNotFound = true;
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    await user.click(await screen.findByRole('button', { name: 'Delete board' }));
    await screen.findByRole('heading', { name: 'Dashboard page' });
    observer.disconnect();

    expect(mockedBoardService.getById).toHaveBeenCalledTimes(1);
    expect(sawNotFound).toBe(false);
  });
});
