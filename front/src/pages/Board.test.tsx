import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithQuery } from '@/test/renderWithQuery';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AxiosError, AxiosHeaders } from 'axios';
import Board from './Board';
import { BoardService, TaskService, ColorService, UserService } from '@/services';
import type { Board as BoardModel, Color, Task, User } from '@/models';

// Board always mounts a TaskDrawer child (it just keeps it closed until a
// task is clicked), and that drawer loads colors on mount regardless of
// its open state. Every case below stubs ColorService/UserService too so
// that side effect never reaches the real, unmocked axios client.
vi.mock('@/services', () => ({
  BoardService: { getById: vi.fn(), update: vi.fn(), delete: vi.fn(), restore: vi.fn() },
  TaskService: { getByBoard: vi.fn(), move: vi.fn(), create: vi.fn(), update: vi.fn() },
  ColorService: { getByType: vi.fn() },
  UserService: { getBoardMembers: vi.fn(), getById: vi.fn() },
}));

// The not found page asks who is signed in to choose its link, and the page
// is rendered here without an AuthProvider.
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ isAuthenticated: true, loading: false, user: null }),
}));

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
    expect(todoHeading.nextElementSibling).toHaveTextContent('1');
    expect(doneHeading.nextElementSibling).toHaveTextContent('0');
  });

  it('pins current behavior (finding P2-9): a task with a status matching no column renders in no column, and the board still renders', async () => {
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

  it('keeps the retry for a server failure, where trying again can change the answer', async () => {
    mockedBoardService.getById.mockRejectedValue(rejectedWith(500));
    mockedTaskService.getByBoard.mockRejectedValue(rejectedWith(500));

    renderBoard();

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Board not found' })).not.toBeInTheDocument();
  });
});

describe('Board page saving a task', () => {
  const COLORS: Color[] = [{ _id: 'color-blue', name: 'Blue', value: '#3B82F6' }];
  const MEMBERS: User[] = [
    { _id: 'user-ada', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', avatar: '' },
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

  /** Opens the drawer through Add Task and fills it to the point of being submittable. */
  const fillNewTask = async (user: ReturnType<typeof userEvent.setup>) => {
    renderBoard();
    await screen.findByRole('heading', { name: 'To Do' });

    await user.click(screen.getByRole('button', { name: /Add Task/ }));
    await screen.findByRole('dialog');
    // The colour arrives from the column the task is created in, so only the
    // three remaining required fields have to be filled here.
    await screen.findByRole('radio', { name: 'Blue' });

    const title = screen.getByPlaceholderText('Enter task title');
    await user.clear(title);
    await user.type(title, 'Write the release notes');
    await user.type(screen.getByPlaceholderText('Enter task description'), 'For this cycle.');

    await user.type(screen.getByLabelText(/Owner/), 'Ada');
    await user.click(await screen.findByText('Ada Lovelace', {}, { timeout: 15_000 }));

    const save = screen.getByRole('button', { name: 'Save Changes' });
    await waitFor(() => expect(save).toBeEnabled());
    return save;
  };

  it('creates the task and closes the drawer when the server accepts it', async () => {
    const user = userEvent.setup();
    mockedTaskService.create.mockResolvedValue(
      makeTask({ _id: 'task-new', title: 'Write the release notes', status: 'col-todo' })
    );

    const save = await fillNewTask(user);
    await user.click(save);

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mockedTaskService.create).toHaveBeenCalledWith(BOARD_ID, expect.objectContaining({ title: 'Write the release notes' }));
  });

  // The drawer knows how to report a failed save and is tested doing it. It
  // can only do so if the failure reaches it, and the page's save handler
  // catches everything and returns normally, so the drawer is told the save
  // succeeded: it clears the draft and closes. The work is gone and nothing
  // was ever written.
  it('keeps the drawer open and says so when the server refuses the task', async () => {
    const user = userEvent.setup();
    mockedTaskService.create.mockRejectedValue(new Error('refused'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const save = await fillNewTask(user);
    await user.click(save);

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/could not be saved/i)).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter task title')).toHaveValue('Write the release notes');
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
