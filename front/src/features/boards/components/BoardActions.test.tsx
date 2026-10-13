import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithQuery } from '@/test/renderWithQuery';
import { BoardService, ColorService, DashboardService } from '@/services';
import type { Board, Color } from '@/models';
import { boardKeys } from '../queries';
import { BoardActions } from './BoardActions';

vi.mock('@/services', () => ({
  BoardService: { update: vi.fn(), getAll: vi.fn(), getById: vi.fn(), delete: vi.fn(), restore: vi.fn() },
  ColorService: { getByType: vi.fn() },
  DashboardService: { getStats: vi.fn() },
}));

const mockedBoardService = vi.mocked(BoardService);
const mockedColorService = vi.mocked(ColorService);
const mockedDashboardService = vi.mocked(DashboardService);

const BLUE: Color = { _id: 'color-blue', name: 'Sky', value: 'sky' };
const GREEN: Color = { _id: 'color-green', name: 'Green', value: 'green' };

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
  mockedBoardService.delete.mockReset();
  mockedBoardService.restore.mockReset();
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
    renderWithQuery(<BoardActions board={makeBoard()} onDeleted={vi.fn()} />);

    await userEvent.click(trigger());

    expect(screen.getByRole('menuitem', { name: 'Edit board' })).toBeInTheDocument();
  });

  it.each([['member' as const], [undefined]])('offers nothing to a viewer whose role is %s', role => {
    renderWithQuery(<BoardActions board={makeBoard({ viewerRole: role })} onDeleted={vi.fn()} />);

    expect(screen.queryByRole('button', { name: /options for/i })).not.toBeInTheDocument();
  });

  it('opens the editor on the board, and returns focus to the menu button when it closes', async () => {
    renderWithQuery(<BoardActions board={makeBoard()} onDeleted={vi.fn()} />);

    await openEditor();

    expect(await screen.findByRole('dialog', { name: 'Edit Board' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /board name/i })).toHaveValue('Launch Plan');

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger()).toHaveFocus();
  });

  it('sends only name, description and colour', async () => {
    mockedBoardService.update.mockResolvedValue(makeBoard({ title: 'Renamed', color: GREEN }));
    renderWithQuery(<BoardActions board={makeBoard()} onDeleted={vi.fn()} />);

    await openEditor();
    await userEvent.clear(await screen.findByRole('textbox', { name: /board name/i }));
    await userEvent.type(screen.getByRole('textbox', { name: /board name/i }), 'Renamed');
    await userEvent.click(await screen.findByRole('radio', { name: 'Green' }));
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
    const { queryClient } = renderWithQuery(<BoardActions board={makeBoard()} onDeleted={vi.fn()} />);
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

describe('BoardActions deleting', () => {
  const openDeleteDialog = async () => {
    await userEvent.click(trigger());
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete board' }));
    return screen.findByRole('dialog', { name: 'Delete this board?' });
  };

  const confirmDelete = async () => {
    await userEvent.click(screen.getByRole('button', { name: 'Delete board' }));
  };

  it('asks first, naming the board, with focus on Cancel, and deletes nothing yet', async () => {
    renderWithQuery(<BoardActions board={makeBoard()} onDeleted={vi.fn()} />);

    const dialog = await openDeleteDialog();

    expect(dialog).toHaveTextContent('Launch Plan');
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    expect(mockedBoardService.delete).not.toHaveBeenCalled();
  });

  it('deletes nothing when cancelled, and returns focus to the menu button', async () => {
    const onDeleted = vi.fn();
    renderWithQuery(<BoardActions board={makeBoard()} onDeleted={onDeleted} />);
    await openDeleteDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mockedBoardService.delete).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
    expect(trigger()).toHaveFocus();
  });

  it('deletes the board once confirmed, leaves the page, and offers Undo', async () => {
    mockedBoardService.delete.mockResolvedValue(undefined);
    const onDeleted = vi.fn();
    renderWithQuery(<BoardActions board={makeBoard()} onDeleted={onDeleted} />);
    await openDeleteDialog();

    await confirmDelete();

    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    expect(mockedBoardService.delete).toHaveBeenCalledWith('board-1');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('status')).toHaveTextContent('Deleted "Launch Plan"');
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
  });

  it('keeps the dialog open and says so when the delete fails, with no toast and no navigation', async () => {
    mockedBoardService.delete.mockRejectedValue(new Error('refused'));
    const onDeleted = vi.fn();
    renderWithQuery(<BoardActions board={makeBoard()} onDeleted={onDeleted} />);
    await openDeleteDialog();

    await confirmDelete();

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be deleted/i);
    expect(screen.getByRole('dialog', { name: 'Delete this board?' })).toBeInTheDocument();
    expect(onDeleted).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('restores the board when Undo is pressed, even after the page that deleted it is gone', async () => {
    mockedBoardService.delete.mockResolvedValue(undefined);
    mockedBoardService.restore.mockResolvedValue(makeBoard());
    const view = renderWithQuery(<BoardActions board={makeBoard()} onDeleted={vi.fn()} />);
    await openDeleteDialog();
    await confirmDelete();
    await screen.findByRole('button', { name: 'Undo' });

    // The board page navigates to the dashboard straight after deleting.
    view.rerender(<div />);
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));

    await waitFor(() => expect(mockedBoardService.restore).toHaveBeenCalledWith('board-1'));
    expect(await screen.findByText('Restored "Launch Plan"')).toBeInTheDocument();
  });

  it('says so, and offers to try again, when the restore fails', async () => {
    mockedBoardService.delete.mockResolvedValue(undefined);
    mockedBoardService.restore.mockRejectedValueOnce(new Error('down')).mockResolvedValue(makeBoard());
    renderWithQuery(<BoardActions board={makeBoard()} onDeleted={vi.fn()} />);
    await openDeleteDialog();
    await confirmDelete();

    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Restored "Launch Plan"')).toBeInTheDocument();
    expect(mockedBoardService.restore).toHaveBeenCalledTimes(2);
  });

  it('drops the board from the board page cache and refreshes the list and totals, and puts them back on restore', async () => {
    mockedBoardService.delete.mockResolvedValue(undefined);
    mockedBoardService.restore.mockResolvedValue(makeBoard());
    mockedBoardService.getAll.mockResolvedValue([]);
    mockedDashboardService.getStats.mockResolvedValue({ totalBoards: 0, totalMembers: 0, totalTasks: 0, avgProgress: 0 });
    const { queryClient } = renderWithQuery(<BoardActions board={makeBoard()} onDeleted={vi.fn()} />);
    queryClient.setQueryData(boardKeys.detail('board-1'), makeBoard());
    const invalidated = vi.spyOn(queryClient, 'invalidateQueries');
    await openDeleteDialog();

    await confirmDelete();
    await screen.findByRole('button', { name: 'Undo' });

    expect(queryClient.getQueryData(boardKeys.detail('board-1'))).toBeUndefined();
    expect(invalidated).toHaveBeenCalledWith({ queryKey: boardKeys.list() });
    expect(invalidated).toHaveBeenCalledWith({ queryKey: boardKeys.stats() });

    invalidated.mockClear();
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await screen.findByText('Restored "Launch Plan"');

    expect(invalidated).toHaveBeenCalledWith({ queryKey: boardKeys.list() });
    expect(invalidated).toHaveBeenCalledWith({ queryKey: boardKeys.stats() });
  });
});
