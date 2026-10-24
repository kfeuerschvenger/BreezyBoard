import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, AxiosHeaders } from 'axios';
import { renderWithQuery } from '@/test/renderWithQuery';
import { BoardService, ColorService, DashboardService, UserService } from '@/services';
import type { Board, Color } from '@/models';
import { userKeys } from '@/features/users';
import { boardKeys } from '../queries';
import { BoardActions } from './BoardActions';

vi.mock('@/services', () => ({
  BoardService: { addMembers: vi.fn(), update: vi.fn(), getAll: vi.fn(), getById: vi.fn(), delete: vi.fn(), restore: vi.fn() },
  ColorService: { getByType: vi.fn() },
  DashboardService: { getStats: vi.fn() },
  UserService: { search: vi.fn() },
}));

const mockedBoardService = vi.mocked(BoardService);
const mockedColorService = vi.mocked(ColorService);
const mockedDashboardService = vi.mocked(DashboardService);
const mockedUserService = vi.mocked(UserService);

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

    expect(await screen.findByRole('dialog', { name: 'Edit board' })).toBeInTheDocument();
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

describe('BoardActions managing columns', () => {
  const columns = [
    { _id: 'col-a', title: 'Backlog', color: BLUE, order: 0 },
    { _id: 'col-b', title: 'Done', color: GREEN, order: 1 },
  ];

  it('sends the whole column list with the fields and writes what the server answers into both caches', async () => {
    const answered = [
      { _id: 'col-a', title: 'Inbox', color: BLUE, order: 0 },
      { _id: 'col-b', title: 'Done', color: GREEN, order: 1 },
    ];
    mockedBoardService.update.mockResolvedValue(makeBoard({ columns: answered, columnsVersion: 6, viewerRole: undefined }));
    const board = makeBoard({ columns, columnsVersion: 5 });
    const { queryClient } = renderWithQuery(<BoardActions board={board} onDeleted={vi.fn()} taskCounts={{}} />);
    queryClient.setQueryData(boardKeys.detail('board-1'), board);
    queryClient.setQueryData(boardKeys.list(), [board]);

    await openEditor();
    await userEvent.clear(await screen.findByRole('textbox', { name: 'Name of column 1' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Name of column 1' }), 'Inbox');
    await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(mockedBoardService.update).toHaveBeenCalledTimes(1));
    expect(mockedBoardService.update).toHaveBeenCalledWith('board-1', {
      title: 'Launch Plan',
      description: 'Old words',
      color: 'color-blue',
      columns: [
        { _id: 'col-a', title: 'Inbox', color: 'color-blue' },
        { _id: 'col-b', title: 'Done', color: 'color-green' },
      ],
      columnsVersion: 5,
    });
    await waitFor(() =>
      expect(queryClient.getQueryData<Board>(boardKeys.detail('board-1'))?.columns.map(item => item.title)).toEqual([
        'Inbox',
        'Done',
      ])
    );
    expect(queryClient.getQueryData<Board>(boardKeys.detail('board-1'))?.columnsVersion).toBe(6);
    expect(queryClient.getQueryData<Board[]>(boardKeys.list())?.[0].columns.map(item => item.title)).toEqual([
      'Inbox',
      'Done',
    ]);
  });

  it('leaves the columns of the caches alone when the save did not carry any', async () => {
    mockedBoardService.update.mockResolvedValue(makeBoard({ title: 'Renamed', columns: [] }));
    const board = makeBoard({ columns });
    const { queryClient } = renderWithQuery(<BoardActions board={board} onDeleted={vi.fn()} taskCounts={{}} />);
    queryClient.setQueryData(boardKeys.detail('board-1'), board);

    await openEditor();
    await userEvent.clear(await screen.findByRole('textbox', { name: /^board name/i }));
    await userEvent.type(screen.getByRole('textbox', { name: /^board name/i }), 'Renamed');
    await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(queryClient.getQueryData<Board>(boardKeys.detail('board-1'))?.title).toBe('Renamed'));
    expect(queryClient.getQueryData<Board>(boardKeys.detail('board-1'))?.columns).toHaveLength(2);
  });

  describe('when the columns changed after the dialog was opened', () => {
    const staleAnswer = () =>
      new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 409,
        statusText: '',
        headers: {},
        config: { headers: new AxiosHeaders() },
        data: { success: false, message: 'The board columns were changed by someone else.', code: 'COLUMNS_STALE', errors: [] },
      });

    const renameFirstColumn = async (name: string) => {
      await userEvent.clear(await screen.findByRole('textbox', { name: 'Name of column 1' }));
      await userEvent.type(screen.getByRole('textbox', { name: 'Name of column 1' }), name);
      await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    };

    it('says the board changed, saved nothing, and keeps the dialog and what was typed', async () => {
      mockedBoardService.update.mockRejectedValue(staleAnswer());
      renderWithQuery(<BoardActions board={makeBoard({ columns, columnsVersion: 5 })} onDeleted={vi.fn()} taskCounts={{}} />);

      await openEditor();
      await renameFirstColumn('Inbox');

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(
        'The columns of this board were changed by someone else while you were editing. Nothing was saved. Reload the columns to see the current list, then make your column changes again.'
      );
      expect(within(alert).getByRole('button', { name: 'Reload columns' })).toBeInTheDocument();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: 'Name of column 1' })).toHaveValue('Inbox');
    });

    it('does not show the reload offer for any other refusal', async () => {
      mockedBoardService.update.mockRejectedValue(new Error('offline'));
      renderWithQuery(<BoardActions board={makeBoard({ columns, columnsVersion: 5 })} onDeleted={vi.fn()} taskCounts={{}} />);

      await openEditor();
      await renameFirstColumn('Inbox');

      expect(await screen.findByText(/The board could not be saved/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Reload columns' })).not.toBeInTheDocument();
    });

    it('reloads the columns on request, keeps the other fields as typed, and saves against the new version', async () => {
      mockedBoardService.update.mockRejectedValueOnce(staleAnswer()).mockResolvedValue(makeBoard({ columns }));
      const current = [
        { _id: 'col-a', title: 'Backlog', color: BLUE, order: 0 },
        { _id: 'col-new', title: 'Added elsewhere', color: GREEN, order: 1 },
        { _id: 'col-b', title: 'Done', color: GREEN, order: 2 },
      ];
      mockedBoardService.getById.mockResolvedValue(makeBoard({ columns: current, columnsVersion: 9 }));
      renderWithQuery(<BoardActions board={makeBoard({ columns, columnsVersion: 5 })} onDeleted={vi.fn()} taskCounts={{}} />);

      await openEditor();
      await userEvent.clear(await screen.findByRole('textbox', { name: /^board name/i }));
      await userEvent.type(screen.getByRole('textbox', { name: /^board name/i }), 'Typed title');
      await renameFirstColumn('Inbox');
      await userEvent.click(await screen.findByRole('button', { name: 'Reload columns' }));

      await waitFor(() => expect(screen.getByRole('textbox', { name: 'Name of column 2' })).toHaveValue('Added elsewhere'));
      expect(screen.getByRole('textbox', { name: 'Name of column 1' })).toHaveValue('Backlog');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: /^board name/i })).toHaveValue('Typed title');

      await userEvent.clear(screen.getByRole('textbox', { name: 'Name of column 3' }));
      await userEvent.type(screen.getByRole('textbox', { name: 'Name of column 3' }), 'Finished');
      await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

      await waitFor(() => expect(mockedBoardService.update).toHaveBeenCalledTimes(2));
      expect(mockedBoardService.update).toHaveBeenLastCalledWith(
        'board-1',
        expect.objectContaining({ title: 'Typed title', columnsVersion: 9 })
      );
    });

    it('says so when the columns could not be reloaded, and keeps the offer', async () => {
      mockedBoardService.update.mockRejectedValue(staleAnswer());
      mockedBoardService.getById.mockRejectedValue(new Error('offline'));
      renderWithQuery(<BoardActions board={makeBoard({ columns, columnsVersion: 5 })} onDeleted={vi.fn()} taskCounts={{}} />);

      await openEditor();
      await renameFirstColumn('Inbox');
      await userEvent.click(await screen.findByRole('button', { name: 'Reload columns' }));

      expect(await screen.findByText(/The columns could not be reloaded. Try again./)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Reload columns' })).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: 'Name of column 1' })).toHaveValue('Inbox');
    });

    it('builds the save on the columns the dialog was opened with, even if the board is refetched meanwhile', async () => {
      mockedBoardService.update.mockResolvedValue(makeBoard({ columns }));
      const { rerender } = renderWithQuery(
        <BoardActions board={makeBoard({ columns, columnsVersion: 5 })} onDeleted={vi.fn()} taskCounts={{}} />
      );

      await openEditor();
      await screen.findByRole('textbox', { name: 'Name of column 1' });
      rerender(
        <BoardActions
          board={makeBoard({ columns: [...columns, { _id: 'col-c', title: 'Late', color: GREEN, order: 2 }], columnsVersion: 6 })}
          onDeleted={vi.fn()}
          taskCounts={{}}
        />
      );
      await userEvent.clear(screen.getByRole('textbox', { name: 'Name of column 1' }));
      await userEvent.type(screen.getByRole('textbox', { name: 'Name of column 1' }), 'Inbox');
      await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

      await waitFor(() => expect(mockedBoardService.update).toHaveBeenCalledTimes(1));
      expect(mockedBoardService.update).toHaveBeenCalledWith(
        'board-1',
        expect.objectContaining({ columnsVersion: 5, columns: expect.arrayContaining([expect.objectContaining({ title: 'Inbox' })]) })
      );
    });

    it('sends no columns and no version when only the name of the board was edited', async () => {
      mockedBoardService.update.mockResolvedValue(makeBoard({ title: 'Renamed' }));
      renderWithQuery(<BoardActions board={makeBoard({ columns, columnsVersion: 5 })} onDeleted={vi.fn()} taskCounts={{}} />);

      await openEditor();
      await userEvent.clear(await screen.findByRole('textbox', { name: /^board name/i }));
      await userEvent.type(screen.getByRole('textbox', { name: /^board name/i }), 'Renamed');
      await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

      await waitFor(() => expect(mockedBoardService.update).toHaveBeenCalledTimes(1));
      expect(mockedBoardService.update).toHaveBeenCalledWith('board-1', {
        title: 'Renamed',
        description: 'Old words',
        color: 'color-blue',
      });
    });
  });

  it('has no Add column button and no columns section without the counts of the page that holds the cards', async () => {
    renderWithQuery(<BoardActions board={makeBoard({ columns })} onDeleted={vi.fn()} />);

    expect(screen.queryByRole('button', { name: 'Add column' })).not.toBeInTheDocument();
    await openEditor();
    await screen.findByRole('dialog', { name: 'Edit board' });
    expect(screen.queryByRole('heading', { name: 'Columns' })).not.toBeInTheDocument();
  });
});

describe('BoardActions adding members', () => {
  const ADA = { _id: 'user-ada', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', avatar: '' };

  const openAddMembers = async () => {
    await userEvent.click(trigger());
    await userEvent.click(screen.getByRole('menuitem', { name: 'Add members' }));
    return screen.findByRole('dialog', { name: /Add members/ });
  };

  const addAda = async () => {
    await userEvent.click(await screen.findByRole('button', { name: /Ada Lovelace/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Add 1 Member' }));
  };

  beforeEach(() => {
    mockedBoardService.addMembers.mockReset();
    mockedUserService.search.mockReset().mockResolvedValue([ADA]);
  });

  it('puts Add members in the board menu, between editing and deleting', async () => {
    renderWithQuery(<BoardActions board={makeBoard()} onDeleted={vi.fn()} />);

    await userEvent.click(trigger());

    expect(screen.getAllByRole('menuitem').map(item => item.textContent)).toEqual([
      'Edit board',
      'Add members',
      'Delete board',
    ]);
  });

  // The server refuses the route to anybody but an owner, and a menu that
  // does not render is what keeps a member from being offered it.
  it.each([['member' as const], [undefined]])('is not offered to a viewer whose role is %s', role => {
    renderWithQuery(<BoardActions board={makeBoard({ viewerRole: role })} onDeleted={vi.fn()} />);

    expect(screen.queryByRole('button', { name: /options for/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Add members' })).not.toBeInTheDocument();
  });

  it('opens the dialog on this board and returns focus to the menu button when it is cancelled', async () => {
    renderWithQuery(<BoardActions board={makeBoard()} onDeleted={vi.fn()} />);

    const dialog = await openAddMembers();

    expect(dialog).toBeInTheDocument();
    expect(mockedUserService.search).toHaveBeenCalledWith('', 'board-1');

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mockedBoardService.addMembers).not.toHaveBeenCalled();
    expect(trigger()).toHaveFocus();
  });

  it('adds the people chosen to this board and refreshes everything that lists them', async () => {
    mockedBoardService.addMembers.mockResolvedValue(makeBoard());
    mockedBoardService.getAll.mockResolvedValue([]);
    mockedDashboardService.getStats.mockResolvedValue({ totalBoards: 0, totalMembers: 0, totalTasks: 0, avgProgress: 0 });
    const { queryClient } = renderWithQuery(<BoardActions board={makeBoard()} onDeleted={vi.fn()} />);
    const invalidated = vi.spyOn(queryClient, 'invalidateQueries');
    await openAddMembers();

    await addAda();

    await waitFor(() => expect(mockedBoardService.addMembers).toHaveBeenCalledWith('board-1', ['user-ada']));
    await waitFor(() => expect(invalidated).toHaveBeenCalledWith({ queryKey: boardKeys.detail('board-1') }));
    expect(invalidated).toHaveBeenCalledWith({ queryKey: userKeys.boardMembers('board-1') });
    expect(invalidated).toHaveBeenCalledWith({ queryKey: boardKeys.list() });
    expect(invalidated).toHaveBeenCalledWith({ queryKey: boardKeys.stats() });
  });

  it('says so in a toast when the write fails, and leaves the board page alone', async () => {
    mockedBoardService.addMembers.mockRejectedValue(new Error('refused'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderWithQuery(<BoardActions board={makeBoard()} onDeleted={vi.fn()} />);
    await openAddMembers();

    await addAda();

    expect(await screen.findByRole('status')).toHaveTextContent('could not be added');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
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
