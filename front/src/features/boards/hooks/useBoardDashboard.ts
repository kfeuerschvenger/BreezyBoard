import { useMemo, useState } from 'react';
import { toColorLookup } from '@/features/colors';
import type { ColorLookup } from '@/features/colors';
import { useColors } from '@/features/colors';
import type { Board, DashboardStats, User } from '@/models';
import { useAddBoardMembers, useBoards, useCreateBoard, useDashboardStats, useDeleteBoard } from '../queries';

export type NewBoard = Pick<Board, 'title' | 'description' | 'color' | 'template'>;

export interface UseBoardDashboardResult {
  boards: Board[];
  stats: DashboardStats;
  colorLookup: ColorLookup;
  isLoading: boolean;
  /** The one message worth showing instead of the page, read or write. */
  error: string | null;
  isDeleting: (boardId: string) => boolean;
  /** Each write answers whether it landed, so the caller knows to close its form. */
  createBoard: (board: NewBoard) => Promise<boolean>;
  deleteBoard: (boardId: string) => Promise<boolean>;
  addMembers: (boardId: string, members: User[]) => Promise<boolean>;
}

const NO_BOARDS: Board[] = [];

const NO_STATS: DashboardStats = {
  totalBoards: 0,
  totalMembers: 0,
  totalTasks: 0,
  avgProgress: 0,
};

/**
 * Everything the dashboard reads and everything it writes.
 *
 * The three writes share a shape worth keeping in one place: report the
 * failure, say whether it landed, and let the cache decide what the lists
 * look like afterwards. None of them touches a list directly, because each
 * mutation already invalidates the two keys it affects.
 */
export function useBoardDashboard(): UseBoardDashboardResult {
  // Only failures the page causes itself. A failed read is reported by the
  // queries rather than kept in a second piece of state to be cleared by hand.
  const [writeError, setWriteError] = useState<string | null>(null);

  const boardsQuery = useBoards();
  const statsQuery = useDashboardStats();

  // The whole board palette in one request. The colours a board can carry are
  // a fixed seeded list, so resolving each board's colour separately was a
  // call per board for parts of a list one call already covers.
  const { data: palette } = useColors('board');
  const colorLookup = useMemo(() => toColorLookup(palette ?? []), [palette]);

  const createBoardMutation = useCreateBoard();
  const deleteBoardMutation = useDeleteBoard();
  const addMembersMutation = useAddBoardMembers();

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
    colorLookup,
    isLoading: boardsQuery.isPending || statsQuery.isPending,
    error:
      writeError ??
      (boardsQuery.isError || statsQuery.isError ? 'Failed to load data. Please try again later.' : null),

    // Read from the mutation rather than mirrored into state beside it. The
    // mirror was the defect recorded as P4-8: nothing ever wrote a board id
    // into it, so the in-flight state could not be reached at all.
    isDeleting: (boardId: string) => deleteBoardMutation.isPending && deleteBoardMutation.variables === boardId,

    createBoard: board =>
      run(() => createBoardMutation.mutateAsync(board), 'Failed to create board. Please try again.', 'Error creating board:'),

    deleteBoard: boardId =>
      run(() => deleteBoardMutation.mutateAsync(boardId), 'Failed to delete board. Please try again.', 'Error deleting board:'),

    addMembers: (boardId, members) =>
      run(
        () => addMembersMutation.mutateAsync({ boardId, memberIds: members.map(member => member._id) }),
        'Failed to add members. Please try again.',
        'Error adding members:'
      ),
  };
}

export default useBoardDashboard;
