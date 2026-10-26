import { useMemo } from 'react';
import type { Board } from '@/models';
import { useToast } from '@/shared/hooks/useToast';
import { COLUMN_NAME_MAX_LENGTH, columnNameProblem, rowsFromColumns } from '../boardColumns';
import { useRenameBoardColumn } from '../queries';

/** What a column header needs to rename its column in place. */
export interface ColumnRenamer {
  /** Saves the new name. Rejects when it could not be saved. */
  save: (title: string) => Promise<void>;
  /** The reason the name may not be used, or null. */
  problem: (title: string) => string | null;
  /** The most characters a name may have. */
  maxLength: number;
  /** Tells the person why nothing was saved. */
  onError: (message: string) => void;
}

/**
 * Renaming a column from its header on the board page.
 *
 * It answers with a renamer for each column, or `null` when the person may not
 * rename: only the board's owner can, as in the edit dialog.
 *
 * The request names the column and the new title and nothing else. It does not
 * carry the board's column list, so a page that is out of date cannot drop a
 * column another session added by renaming one, and the server checks the name
 * against the rules for a name in the list and writes it atomically.
 */
export const useRenameColumn = (board: Board | null | undefined): ((columnId: string) => ColumnRenamer) | null => {
  const { mutateAsync } = useRenameBoardColumn();
  const toast = useToast();

  return useMemo(() => {
    if (!board || board.viewerRole !== 'owner') return null;

    const rows = rowsFromColumns(board.columns);

    return (columnId: string): ColumnRenamer => ({
      save: async title => {
        await mutateAsync({ boardId: board._id, columnId, title: title.trim() });
      },
      problem: title =>
        columnNameProblem(
          title,
          rows.filter(row => row.columnId !== columnId).map(row => row.title)
        ),
      maxLength: COLUMN_NAME_MAX_LENGTH,
      onError: message => toast.show({ message }),
    });
  }, [board, mutateAsync, toast]);
};
