import { useState } from 'react';
import { IconDots, IconPencil, IconTrash } from '@tabler/icons-react';
import type { Board } from '@/models';
import { Menu, MenuItem, Icon } from '@/shared/ui';
import { useDeleteBoardWithUndo } from '../hooks/useDeleteBoardWithUndo';
import { useUpdateBoard } from '../queries';
import { DeleteBoardDialog } from './DeleteBoardDialog';
import { EditBoardModal } from './EditBoardModal';

export interface BoardActionsProps {
  board: Board;
  /** Runs once the board is deleted, to leave a page that no longer has a board. */
  onDeleted: () => void;
}

/**
 * What the owner can do to the board they are looking at.
 *
 * Nothing renders for anybody else. The server refuses these routes to a
 * member, and offering a control that can only fail is worse than not
 * offering it. The decision is the server's, delivered as `viewerRole` on the
 * board read, so a workspace admin, who the server treats as an owner, sees
 * the menu too.
 */
export const BoardActions = ({ board, onDeleted }: BoardActionsProps) => {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const updateBoard = useUpdateBoard();
  const { deleteBoard } = useDeleteBoardWithUndo();

  if (board.viewerRole !== 'owner') return null;

  const confirmDelete = async () => {
    setIsDeleting(true);
    setDeleteError(null);

    try {
      await deleteBoard(board);
    } catch {
      // Said in the dialog, which stays open: the person is looking at it, and
      // closing over a failure would read as the board having been deleted.
      setDeleteError('The board could not be deleted. Nothing was changed, so you can try again.');
      return;
    } finally {
      setIsDeleting(false);
    }

    setConfirmingDelete(false);
    onDeleted();
  };

  return (
    <>
      <Menu
        renderTrigger={props => (
          <button
            type="button"
            {...props}
            aria-label={`Options for ${board.title}`}
            className="focus-ring inline-flex size-11 cursor-pointer items-center justify-center rounded-pill border border-glass-border bg-glass-strong text-ink-secondary backdrop-blur-sm transition-colors duration-200 hover:bg-surface hover:text-ink sm:size-9.5"
          >
            <Icon as={IconDots} size={20} aria-hidden="true" />
          </button>
        )}
      >
        <MenuItem onSelect={() => setEditing(true)}>
          <Icon as={IconPencil} size={16} className="text-ink-tertiary" aria-hidden="true" />
          <span>Edit board</span>
        </MenuItem>

        <MenuItem
          onSelect={() => {
            setDeleteError(null);
            setConfirmingDelete(true);
          }}
          className="text-danger hover:bg-danger-bg"
        >
          <Icon as={IconTrash} size={16} aria-hidden="true" />
          <span>Delete board</span>
        </MenuItem>
      </Menu>

      <DeleteBoardDialog
        board={confirmingDelete ? board : null}
        isWorking={isDeleting}
        error={deleteError}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setConfirmingDelete(false)}
      />

      <EditBoardModal
        open={editing}
        board={board}
        onClose={() => setEditing(false)}
        onSave={async values => {
          await updateBoard.mutateAsync({
            boardId: board._id,
            changes: { title: values.title, description: values.description, color: values.color },
          });
        }}
      />
    </>
  );
};

export default BoardActions;
