import { ConfirmDialog } from '@/shared/ui';
import type { Board } from '@/models';

export interface DeleteBoardDialogProps {
  /** The board to delete, or null while the dialog is closed. */
  board: Pick<Board, 'title'> | null;
  isWorking?: boolean;
  /** Why the last attempt failed, shown in the dialog so it is read where the person is looking. */
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * The question asked before a board is deleted, from either place that can
 * delete one.
 *
 * It names the board, because the dialog opens from a menu item and a
 * confirmation that does not say what it confirms is easy to answer without
 * reading. It also says what the delete takes with it and that Undo exists,
 * so the confirmation is not the only thing standing between the person and
 * a mistake they would not know could be reversed.
 */
export const DeleteBoardDialog = ({ board, isWorking = false, error = null, onConfirm, onCancel }: DeleteBoardDialogProps) => (
  <ConfirmDialog
    open={board !== null}
    title="Delete this board?"
    description={
      <>
        <p>
          <strong className="font-semibold text-ink">{board?.title}</strong> and all of its tasks will be removed
          from your boards. You can undo this right after.
        </p>
        {error && (
          <p role="alert" className="mt-4 rounded-control bg-danger-bg p-3 text-sm text-danger-strong">
            {error}
          </p>
        )}
      </>
    }
    confirmLabel="Delete board"
    destructive
    isWorking={isWorking}
    onConfirm={onConfirm}
    onCancel={onCancel}
  />
);

export default DeleteBoardDialog;
