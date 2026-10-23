import { useMemo } from 'react';
import type { Board } from '@/models';
import { useToast } from '@/shared/hooks/useToast';
import { MIN_COLUMNS, columnNameProblem, columnsRequest, rowsFromColumns } from '../boardColumns';
import { useUpdateBoard } from '../queries';

/** What a column header needs to rename its column in place. */
export interface ColumnRenamer {
  /** Saves the new name. Rejects when it could not be saved. */
  save: (title: string) => Promise<void>;
  /** The reason the name may not be used, or null. */
  problem: (title: string) => string | null;
  /** Tells the person why nothing was saved. */
  onError: (message: string) => void;
}

/**
 * Renaming a column from its header on the board page.
 *
 * It answers with a renamer for each column, or `null` when the person may not
 * rename: only the board's owner can, as in the edit dialog, and a board with
 * fewer columns than a board keeps cannot be saved through this route at all.
 *
 * The request is the same one the dialog sends: the board's complete column
 * list with the one name changed, so the server checks the rename against the
 * same rules and writes it atomically.
 */
export const useRenameColumn = (board: Board | null | undefined): ((columnId: string) => ColumnRenamer) | null => {
  const { mutateAsync } = useUpdateBoard();
  const toast = useToast();

  return useMemo(() => {
    if (!board || board.viewerRole !== 'owner' || board.columns.length < MIN_COLUMNS) return null;

    const rows = rowsFromColumns(board.columns);

    return (columnId: string): ColumnRenamer => ({
      save: async title => {
        const renamed = rows.map(row => (row.columnId === columnId ? { ...row, title } : row));
        await mutateAsync({ boardId: board._id, changes: { columns: columnsRequest(renamed) } });
      },
      problem: title =>
        columnNameProblem(
          title,
          rows.filter(row => row.columnId !== columnId).map(row => row.title)
        ),
      onError: message => toast.show({ message }),
    });
  }, [board, mutateAsync, toast]);
};
