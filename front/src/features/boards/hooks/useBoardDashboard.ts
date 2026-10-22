import { useState } from 'react';
import type { Board, DashboardStats } from '@/models';
import { useBoards, useDashboardStats } from '../queries';
import { useDeleteBoardWithUndo } from './useDeleteBoardWithUndo';
import type { BoardToDelete } from './useDeleteBoardWithUndo';

export interface UseBoardDashboardResult {
  boards: Board[];
  stats: DashboardStats;
  isLoading: boolean;
  /** The one message worth showing instead of the page, read or write. */
  error: string | null;
  isDeleting: (boardId: string) => boolean;
  /** Each write answers whether it landed, so the caller knows to close its form. */
  deleteBoard: (board: BoardToDelete) => Promise<boolean>;
}

const NO_BOARDS: Board[] = [];

const NO_STATS: DashboardStats = {
  totalBoards: 0,
  totalMembers: 0,
  totalTasks: 0,
  avgProgress: 0,
};

/**
 * Everything the dashboard reads and the write it owns.
 *
 * The write reports its failure, says whether it landed, and lets the cache
 * decide what the lists look like afterwards, because the mutation already
 * invalidates the keys it affects. Creating a board is not here: the dialog
 * that does it is the shell's, opened from the sidebar as well as from this
 * page. Adding members is not here either: `useAddMembersFlow` serves this
 * page and the board page alike.
 */
export function useBoardDashboard(): UseBoardDashboardResult {
  // Only failures the page causes itself. A failed read is reported by the
  // queries rather than kept in a second piece of state to be cleared by hand.
  const [writeError, setWriteError] = useState<string | null>(null);

  const boardsQuery = useBoards();
  const statsQuery = useDashboardStats();

  const boardDeletion = useDeleteBoardWithUndo();

  const run = async (action: () => Promise<unknown>, failure: string, logAs: string): Promise<boolean> => {
    try {
      await action();
      setWriteError(null);
      return true;
    } catch (err) {
      console.error(logAs, err);
      setWriteError(failure);
      return false;
    }
  };

  return {
    boards: boardsQuery.data ?? NO_BOARDS,
    stats: statsQuery.data ?? NO_STATS,
    isLoading: boardsQuery.isPending || statsQuery.isPending,
    error:
      writeError ??
      (boardsQuery.isError || statsQuery.isError ? 'Failed to load data. Please try again later.' : null),

    // Read from the mutation rather than mirrored into state beside it: a
    // mirror needs something to write the board id into it, and without that
    // the in-flight state cannot be reached at all.
    isDeleting: (boardId: string) => boardDeletion.pendingId === boardId,

    deleteBoard: board =>
      run(() => boardDeletion.deleteBoard(board), 'Failed to delete board. Please try again.', 'Error deleting board:'),
  };
}

export default useBoardDashboard;
