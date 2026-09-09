import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Board from './Board';
import { BoardService, TaskService, ColorService, UserService } from '@/services';
import type { Board as BoardModel, Task } from '@/models';

// Board always mounts a TaskDrawer child (it just keeps it closed until a
// task is clicked), and that drawer loads colors on mount regardless of
// its open state. Every case below stubs ColorService/UserService too so
// that side effect never reaches the real, unmocked axios client.
vi.mock('@/services', () => ({
  BoardService: { getById: vi.fn() },
  TaskService: { getByBoard: vi.fn(), move: vi.fn(), updateOrders: vi.fn() },
  ColorService: { getByType: vi.fn() },
  UserService: { getBoardMembers: vi.fn(), getById: vi.fn() },
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
  template: {
    _id: 'template-1',
    name: 'Default',
    description: '',
    iconName: 'layout',
    columns: [
      { _id: 'col-todo', title: 'To Do', color: { _id: 'c1', value: '#3B82F6' }, order: 0 },
      { _id: 'col-done', title: 'Done', color: { _id: 'c2', value: '#22C55E' }, order: 1 },
    ],
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
  order: 0,
  ...overrides,
});

const renderBoard = () =>
  render(
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

    const { container } = renderBoard();

    // The spinner carries no role="status" or accessible name, another
    // accessibility gap: only its class identifies it as a loading cue.
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'To Do' })).not.toBeInTheDocument();
  });

  it('shows an error message with a retry when the fetch rejects, not a permanent spinner', async () => {
    mockedBoardService.getById.mockRejectedValue(new Error('network down'));

    const { container } = renderBoard();

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('This board could not be loaded')).toBeInTheDocument();
    expect(within(alert).getByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(container.querySelector('.animate-spin')).not.toBeInTheDocument();
  });
});
