import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithQuery } from '@/test/renderWithQuery';
import { BoardService } from '@/services';
import { CreateBoardDialog } from './CreateBoardDialog';

vi.mock('@/services', () => ({
  BoardService: { create: vi.fn(), getAll: vi.fn() },
}));

// The form is tested on its own. What this component adds is what happens
// after the form submits, so the form is a button that submits.
vi.mock('@/features/boards', async importOriginal => {
  const actual = await importOriginal<typeof import('@/features/boards')>();
  return {
    ...actual,
    CreateBoardModal: ({
      open,
      onCreateBoard,
    }: {
      open: boolean;
      onCreateBoard: (board: { title: string; description: string; color: string; template: string }) => void;
    }) =>
      open ? (
        <button
          type="button"
          onClick={() => onCreateBoard({ title: 'Roadmap', description: 'Plans', color: 'c1', template: 't1' })}
        >
          Submit the form
        </button>
      ) : null,
  };
});

const mockedBoards = vi.mocked(BoardService);

beforeEach(() => {
  mockedBoards.create.mockReset();
  mockedBoards.getAll.mockReset().mockResolvedValue([]);
});

describe('CreateBoardDialog', () => {
  it('creates the board with what the form sent and closes', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    mockedBoards.create.mockResolvedValue({ _id: 'board-1' } as never);
    renderWithQuery(<CreateBoardDialog open onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Submit the form' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(mockedBoards.create).toHaveBeenCalledWith({
      title: 'Roadmap',
      description: 'Plans',
      color: 'c1',
      template: 't1',
    });
  });

  // The form clears its saved draft once the dialog has closed after a
  // submit, so closing on a failure would throw away the text the person
  // needs to send again.
  it('stays open and says so in a toast when the board could not be created', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockedBoards.create.mockRejectedValue(new Error('offline'));
    renderWithQuery(<CreateBoardDialog open onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Submit the form' }));

    expect(await screen.findByText('Failed to create board. Please try again.')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('refreshes the list of boards so the sidebar shows the new one', async () => {
    const user = userEvent.setup();
    mockedBoards.create.mockResolvedValue({ _id: 'board-1' } as never);
    const { queryClient } = renderWithQuery(<CreateBoardDialog open onClose={vi.fn()} />);
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    await user.click(screen.getByRole('button', { name: 'Submit the form' }));

    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['boards', 'list'] }))
    );
  });
});
