import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { renderWithQuery } from '@/test/renderWithQuery';
import Board from './Board';
import { BoardService, TaskService, ColorService, UserService } from '@/services';
import type { Board as BoardModel, Task } from '@/models';

vi.mock('@/services', () => ({
  BoardService: { getById: vi.fn() },
  TaskService: { getByBoard: vi.fn(), move: vi.fn(), create: vi.fn(), update: vi.fn() },
  ColorService: { getByType: vi.fn() },
  UserService: { getBoardMembers: vi.fn(), getById: vi.fn() },
}));

// The drawer is replaced by a probe that prints the task it was handed, so
// the test can see which column a new task was aimed at without driving the
// whole form.
vi.mock('@/features/tasks/components/TaskDrawer', () => ({
  default: ({ open, task }: { open: boolean; task: Partial<Task> | null }) =>
    open ? <div data-testid="drawer">{String(task?.status)}</div> : null,
}));

const board: BoardModel = {
  _id: 'board-1',
  title: 'Launch Plan',
  description: '',
  color: '#3B82F6',
  columns: [
    { _id: 'col-todo', title: 'To Do', color: { _id: 'c1', value: '#3B82F6' }, order: 0 },
    { _id: 'col-done', title: 'Done', color: { _id: 'c2', value: '#22C55E' }, order: 1 },
  ],
  template: { _id: 't', name: 'Default', description: '', iconName: 'layout', columns: [] },
  createdBy: 'user-1',
  members: [],
  taskCount: 0,
  memberCount: 0,
  progress: 0,
};

const renderBoard = () =>
  renderWithQuery(
    <MemoryRouter initialEntries={['/board/board-1']}>
      <Routes>
        <Route path="/board/:boardId" element={<Board />} />
      </Routes>
    </MemoryRouter>,
  );

describe('Board, empty board banner', () => {
  beforeEach(() => {
    vi.mocked(BoardService.getById).mockReset().mockResolvedValue(board);
    vi.mocked(ColorService.getByType).mockReset().mockResolvedValue([]);
    vi.mocked(UserService.getBoardMembers).mockReset().mockResolvedValue([]);
  });

  it('opens the drawer aimed at the first column, the same as the header button', async () => {
    vi.mocked(TaskService.getByBoard).mockResolvedValue([]);
    renderBoard();

    await userEvent.click(await screen.findByRole('button', { name: 'Add task' }));

    expect(screen.getByTestId('drawer')).toHaveTextContent('col-todo');
  });

  it('is not shown when the board already has a task', async () => {
    vi.mocked(TaskService.getByBoard).mockResolvedValue([
      {
        _id: 't1',
        title: 'First',
        description: '',
        status: 'col-done',
        priority: 'low',
        color: '#3B82F6',
        owner: '',
        boardId: 'board-1',
        checklist: [],
        order: 'a0',
      },
    ]);
    renderBoard();

    await screen.findByText('First');

    expect(screen.queryByRole('heading', { name: /no tasks yet/i })).not.toBeInTheDocument();
  });
});
