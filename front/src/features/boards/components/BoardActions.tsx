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
            className="flex cursor-pointer items-center justify-center rounded-lg p-3 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:p-2"
          >
            <Icon as={IconDots} size={20} className="text-gray-600" aria-hidden="true" />
          </button>
        )}
      >
        <MenuItem onSelect={() => setEditing(true)}>
          <Icon as={IconPencil} size={16} className="text-gray-400" aria-hidden="true" />
          <span>Edit board</span>
        </MenuItem>

        <MenuItem
          onSelect={() => {
            setDeleteError(null);
            setConfirmingDelete(true);
          }}
          className="text-red-600 hover:bg-red-50"
        >
          <Icon as={IconTrash} size={16} className="text-red-500" aria-hidden="true" />
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
