import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { renderWithQuery } from '@/test/renderWithQuery';
import Board from './Board';
import { BoardService, TaskService, ColorService, UserService } from '@/services';
import type { Board as BoardModel } from '@/models';

vi.mock('@/services', () => ({
  BoardService: { getById: vi.fn() },
  TaskService: { getByBoard: vi.fn(), move: vi.fn(), create: vi.fn(), update: vi.fn() },
  ColorService: { getByType: vi.fn() },
  UserService: { getBoardMembers: vi.fn(), getById: vi.fn() },
}));

// The page asks who is signed in, to make them the owner of a card they add,
// and it is rendered here without an AuthProvider.
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ isAuthenticated: true, loading: false, user: null }),
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

  it('opens the first column composer, the same as the header button', async () => {
    vi.mocked(TaskService.getByBoard).mockResolvedValue([]);
    renderBoard();

    await userEvent.click(await screen.findByRole('button', { name: 'Add your first card' }));

    expect(await screen.findByRole('textbox', { name: /new card in To Do/i })).toHaveFocus();
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

    expect(screen.queryByRole('heading', { name: /a fresh board/i })).not.toBeInTheDocument();
  });
});
