import { useToast } from '@/shared/hooks/useToast';
import { httpStatusOf } from '@/shared/lib/httpStatus';
import type { Board } from '@/models';
import { useDeleteBoard, useRestoreBoard } from '../queries';

export type BoardToDelete = Pick<Board, '_id' | 'title'>;

export interface UseDeleteBoardWithUndoResult {
  /** Rejects when the delete fails, so the caller can say so where the person is looking. */
  deleteBoard: (board: BoardToDelete) => Promise<void>;
  /** The board being deleted right now, if any. */
  pendingId: string | null;
}

/**
 * The one way a board is deleted, from the dashboard and from the board page.
 *
 * The delete is a soft delete on the server, so Undo is a real restore rather
 * than a request held back on the client: it works after the tab that deleted
 * the board has navigated away, and every other tab stops showing the board
 * the moment the list refetches.
 *
 * The toast outlives the page that raised it, because the board page
 * navigates to the dashboard straight after deleting. Everything Undo needs
 * is captured when the toast is made, and the restore mutation keeps running
 * after the component that started it is gone.
 *
 * A failed restore says so rather than leaving the person believing the board
 * is back. It offers to try again only when trying again can change the
 * answer: a 404 means the retention window has passed and the board is gone,
 * and a 403 means the person no longer has the right to bring it back, and
 * both would answer the same on every attempt.
 */
export const useDeleteBoardWithUndo = (): UseDeleteBoardWithUndoResult => {
  const toast = useToast();
  const deleteMutation = useDeleteBoard();
  const restoreMutation = useRestoreBoard();

  const undo = async (board: BoardToDelete): Promise<void> => {
    try {
      await restoreMutation.mutateAsync(board._id);
      toast.show({ message: `Restored "${board.title}"` });
    } catch (error) {
      const status = httpStatusOf(error);

      if (status === 404 || status === 403) {
        toast.show({ message: `"${board.title}" can no longer be restored.` });
        return;
      }

      toast.show({
        message: `"${board.title}" could not be restored.`,
        action: { label: 'Try again', onAction: () => void undo(board) },
      });
    }
  };

  const deleteBoard = async (board: BoardToDelete): Promise<void> => {
    await deleteMutation.mutateAsync(board._id);
    toast.show({
      message: `Deleted "${board.title}"`,
      action: { label: 'Undo', onAction: () => void undo(board) },
    });
  };

  return {
    deleteBoard,
    pendingId: deleteMutation.isPending ? (deleteMutation.variables ?? null) : null,
  };
};

export default useDeleteBoardWithUndo;
