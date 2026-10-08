import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithQuery } from '@/test/renderWithQuery';
import { BoardService, ColorService, DashboardService } from '@/services';
import type { Board, Color } from '@/models';
import { boardKeys } from '../queries';
import { BoardActions } from './BoardActions';

vi.mock('@/services', () => ({
  BoardService: { update: vi.fn(), getAll: vi.fn(), getById: vi.fn() },
  ColorService: { getByType: vi.fn() },
  DashboardService: { getStats: vi.fn() },
}));

const mockedBoardService = vi.mocked(BoardService);
const mockedColorService = vi.mocked(ColorService);
const mockedDashboardService = vi.mocked(DashboardService);

const BLUE: Color = { _id: 'color-blue', name: 'Royal Blue', value: '#0052CC' };
const GREEN: Color = { _id: 'color-green', name: 'Emerald', value: '#2F9E44' };

const makeBoard = (overrides: Partial<Board> = {}): Board => ({
  _id: 'board-1',
  title: 'Launch Plan',
  description: 'Old words',
  color: BLUE,
  columns: [],
  template: 'template-1',
  createdBy: 'user-1',
  members: [],
  taskCount: 4,
  memberCount: 2,
  progress: 50,
  viewerRole: 'owner',
  ...overrides,
});

beforeEach(() => {
  mockedBoardService.update.mockReset();
  mockedBoardService.getAll.mockReset();
  mockedBoardService.getById.mockReset();
  mockedDashboardService.getStats.mockReset();
  mockedColorService.getByType.mockReset().mockResolvedValue([BLUE, GREEN]);
});

const trigger = () => screen.getByRole('button', { name: 'Options for Launch Plan' });

const openEditor = async () => {
  await userEvent.click(trigger());
  await userEvent.click(screen.getByRole('menuitem', { name: 'Edit board' }));
};

describe('BoardActions', () => {
  it('offers the owner an options menu with Edit board', async () => {
    renderWithQuery(<BoardActions board={makeBoard()} />);

    await userEvent.click(trigger());

    expect(screen.getByRole('menuitem', { name: 'Edit board' })).toBeInTheDocument();
  });

  it.each([['member' as const], [undefined]])('offers nothing to a viewer whose role is %s', role => {
    renderWithQuery(<BoardActions board={makeBoard({ viewerRole: role })} />);

    expect(screen.queryByRole('button', { name: /options for/i })).not.toBeInTheDocument();
  });

  it('opens the editor on the board, and returns focus to the menu button when it closes', async () => {
    renderWithQuery(<BoardActions board={makeBoard()} />);

    await openEditor();

    expect(await screen.findByRole('dialog', { name: 'Edit Board' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /board name/i })).toHaveValue('Launch Plan');

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger()).toHaveFocus();
  });

  it('sends only name, description and colour', async () => {
    mockedBoardService.update.mockResolvedValue(makeBoard({ title: 'Renamed', color: GREEN }));
    renderWithQuery(<BoardActions board={makeBoard()} />);

    await openEditor();
    await userEvent.clear(await screen.findByRole('textbox', { name: /board name/i }));
    await userEvent.type(screen.getByRole('textbox', { name: /board name/i }), 'Renamed');
    await userEvent.click(await screen.findByRole('radio', { name: 'Emerald' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(mockedBoardService.update).toHaveBeenCalledTimes(1));
    expect(mockedBoardService.update).toHaveBeenCalledWith('board-1', {
      title: 'Renamed',
      description: 'Old words',
      color: 'color-green',
    });
  });

  it('writes the edit into the board page cache and the dashboard list, leaving the rest of each entry alone', async () => {
    mockedBoardService.update.mockResolvedValue(
      // What the server really answers: members populated, no viewerRole.
      makeBoard({ title: 'Renamed', description: 'New words', color: GREEN, viewerRole: undefined, members: [] })
    );
    const { queryClient } = renderWithQuery(<BoardActions board={makeBoard()} />);
    queryClient.setQueryData(boardKeys.detail('board-1'), makeBoard());
    queryClient.setQueryData(boardKeys.list(), [makeBoard(), makeBoard({ _id: 'board-2', title: 'Other' })]);
    queryClient.setQueryData(boardKeys.stats(), { totalBoards: 2, totalMembers: 1, totalTasks: 4, avgProgress: 50 });

    await openEditor();
    await userEvent.clear(await screen.findByRole('textbox', { name: /board name/i }));
    await userEvent.type(screen.getByRole('textbox', { name: /board name/i }), 'Renamed');
    await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(mockedBoardService.update).toHaveBeenCalled());

    await waitFor(() => expect(queryClient.getQueryData<Board>(boardKeys.detail('board-1'))?.title).toBe('Renamed'));

    const detail = queryClient.getQueryData<Board>(boardKeys.detail('board-1'));
    expect(detail).toMatchObject({ description: 'New words', color: GREEN, viewerRole: 'owner', taskCount: 4 });

    const list = queryClient.getQueryData<Board[]>(boardKeys.list());
    expect(list?.map(board => board.title)).toEqual(['Renamed', 'Other']);
    expect(list?.[0]).toMatchObject({ color: GREEN, progress: 50 });

    expect(queryClient.getQueryData(boardKeys.stats())).toEqual({
      totalBoards: 2,
      totalMembers: 1,
      totalTasks: 4,
      avgProgress: 50,
    });
  });
});
