import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { IconDots, IconPencil, IconPlus, IconTrash, IconUserPlus } from '@tabler/icons-react';
import type { Board } from '@/models';
import { BoardService } from '@/services';
import { AddMemberModal } from '@/features/users';
import { Button, Menu, MenuItem, Icon } from '@/shared/ui';
import { useAddMembersFlow } from '../hooks/useAddMembersFlow';
import { useDeleteBoardWithUndo } from '../hooks/useDeleteBoardWithUndo';
import { boardKeys, useUpdateBoard } from '../queries';
import { DeleteBoardDialog } from './DeleteBoardDialog';
import { EditBoardModal } from './EditBoardModal';

export interface BoardActionsProps {
  board: Board;
  /** Runs once the board is deleted, to leave a page that no longer has a board. */
  onDeleted: () => void;
  /**
   * Live cards in each column, by column id. Given by the page that holds the
   * board's cards, and what lets the owner manage the columns from here: it
   * adds the "Add column" button and the columns section of the edit dialog,
   * which needs the counts to know which columns can be removed.
   */
  taskCounts?: Readonly<Record<string, number>>;
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
export const BoardActions = ({ board, onDeleted, taskCounts }: BoardActionsProps) => {
  const [editing, setEditing] = useState(false);
  // The edit dialog opens on the columns section from "Add column", and on the
  // top of the form from the menu.
  const [focusColumns, setFocusColumns] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const updateBoard = useUpdateBoard();
  const queryClient = useQueryClient();
  const { deleteBoard } = useDeleteBoardWithUndo();
  const addMembers = useAddMembersFlow();

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

  // Reads the board again, whatever the cache holds, which also brings the page
  // behind the dialog to the columns the dialog is about to show.
  const reloadColumns = async () => {
    const fresh = await queryClient.fetchQuery({
      queryKey: boardKeys.detail(board._id),
      queryFn: () => BoardService.getById(board._id),
      staleTime: 0,
    });

    void queryClient.invalidateQueries({ queryKey: boardKeys.list() });

    return { columns: fresh.columns, columnsVersion: fresh.columnsVersion };
  };

  const edit = (onColumns: boolean) => {
    setFocusColumns(onColumns);
    setEditing(true);
  };

  return (
    <>
      {taskCounts && (
        <Button
          type="button"
          variant="glass"
          size="sm"
          className="shrink-0"
          onClick={() => edit(true)}
          leftIcon={<Icon as={IconPlus} size={18} aria-hidden="true" />}
        >
          Add column
        </Button>
      )}

      <Menu
        renderTrigger={props => (
          <button
            type="button"
            {...props}
            aria-label={`Options for ${board.title}`}
            className="focus-ring inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-pill border border-glass-border bg-glass-strong text-ink-secondary backdrop-blur-sm transition-colors duration-200 hover:bg-surface hover:text-ink sm:size-9.5"
          >
            <Icon as={IconDots} size={20} aria-hidden="true" />
          </button>
        )}
      >
        <MenuItem onSelect={() => edit(false)}>
          <Icon as={IconPencil} size={16} className="text-ink-tertiary" aria-hidden="true" />
          <span>Edit board</span>
        </MenuItem>

        <MenuItem onSelect={() => addMembers.open(board)}>
          <Icon as={IconUserPlus} size={16} className="text-ink-tertiary" aria-hidden="true" />
          <span>Add members</span>
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

      <AddMemberModal {...addMembers.dialogProps} />

      <DeleteBoardDialog
        board={confirmingDelete ? board : null}
        isWorking={isDeleting}
        error={deleteError}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setConfirmingDelete(false)}
      />

      <EditBoardModal
        open={editing}
        board={taskCounts ? board : { title: board.title, description: board.description, color: board.color }}
        taskCounts={taskCounts}
        focusColumns={focusColumns}
        onClose={() => setEditing(false)}
        onSave={async values => {
          await updateBoard.mutateAsync({ boardId: board._id, changes: values });
        }}
        onReloadColumns={reloadColumns}
      />
    </>
  );
};

export default BoardActions;
