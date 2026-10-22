import { AxiosError, type AxiosResponse } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithQuery } from '@/test/renderWithQuery';
import { BoardService } from '@/services';
import { useDeleteBoardWithUndo } from './useDeleteBoardWithUndo';

vi.mock('@/services', () => ({
  BoardService: { delete: vi.fn(), restore: vi.fn(), getAll: vi.fn(), getById: vi.fn() },
  DashboardService: { getStats: vi.fn() },
}));

const mockedBoardService = vi.mocked(BoardService);

const BOARDS = [
  { _id: 'board-1', title: 'Launch Plan' },
  { _id: 'board-2', title: 'Roadmap' },
  { _id: 'board-3', title: 'Retro' },
];

const Deleter = () => {
  const { deleteBoard } = useDeleteBoardWithUndo();

  return (
    <ul>
      {BOARDS.map(board => (
        <li key={board._id}>
          <button type="button" onClick={() => void deleteBoard(board)}>
            Delete {board.title}
          </button>
        </li>
      ))}
    </ul>
  );
};

const failedWith = (status: number) =>
  new AxiosError('refused', 'ERR_BAD_REQUEST', undefined, undefined, { status } as AxiosResponse);

/** The toast that says `message`, so a test presses the Undo of one board and not another. */
const toastSaying = (message: string) => {
  const toast = screen.getByText(message).closest<HTMLElement>('[data-testid="toast"]');

  if (!toast) throw new Error(`No toast says ${message}`);

  return toast;
};

beforeEach(() => {
  mockedBoardService.delete.mockReset().mockResolvedValue(undefined);
  mockedBoardService.restore.mockReset();
  mockedBoardService.getAll.mockReset().mockResolvedValue([]);
});

describe('useDeleteBoardWithUndo', () => {
  it('keeps one Undo per delete, and each restores its own board', async () => {
    mockedBoardService.restore.mockImplementation(async id => ({ _id: id }) as never);
    renderWithQuery(<Deleter />);

    await userEvent.click(screen.getByRole('button', { name: 'Delete Launch Plan' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete Roadmap' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete Retro' }));
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Undo' })).toHaveLength(3));

    // The middle one first, so a hook that remembered only the latest board
    // would restore the wrong one.
    await userEvent.click(within(toastSaying('Deleted "Roadmap"')).getByRole('button', { name: 'Undo' }));

    await waitFor(() => expect(mockedBoardService.restore).toHaveBeenCalledTimes(1));
    expect(mockedBoardService.restore).toHaveBeenCalledWith('board-2');
    expect(await screen.findByText('Restored "Roadmap"')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Undo' })).toHaveLength(2);

    await userEvent.click(within(toastSaying('Deleted "Launch Plan"')).getByRole('button', { name: 'Undo' }));

    await waitFor(() => expect(mockedBoardService.restore).toHaveBeenCalledTimes(2));
    expect(mockedBoardService.restore).toHaveBeenLastCalledWith('board-1');
  });

  it('still restores after the component that deleted the board has unmounted', async () => {
    mockedBoardService.restore.mockResolvedValue({ _id: 'board-1' } as never);
    const view = renderWithQuery(<Deleter />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete Launch Plan' }));
    await screen.findByRole('button', { name: 'Undo' });

    view.rerender(<div />);
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));

    await waitFor(() => expect(mockedBoardService.restore).toHaveBeenCalledWith('board-1'));
    expect(await screen.findByText('Restored "Launch Plan"')).toBeInTheDocument();
  });

  it.each([404, 403])('does not offer to try again when the restore answers %i', async status => {
    mockedBoardService.restore.mockRejectedValue(failedWith(status));
    renderWithQuery(<Deleter />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete Launch Plan' }));

    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }));

    expect(await screen.findByText('"Launch Plan" can no longer be restored.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    expect(mockedBoardService.restore).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a server error', failedWith(500)],
    ['a network failure', new Error('Network Error')],
  ])('still offers to try again after %s, because a second attempt can succeed', async (_label, error) => {
    mockedBoardService.restore.mockRejectedValueOnce(error).mockResolvedValue({ _id: 'board-1' } as never);
    renderWithQuery(<Deleter />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete Launch Plan' }));

    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Restored "Launch Plan"')).toBeInTheDocument();
    expect(mockedBoardService.restore).toHaveBeenCalledTimes(2);
  });
});
