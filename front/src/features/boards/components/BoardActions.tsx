import { useState } from 'react';
import { MoreHorizontal, Pencil } from 'lucide-react';
import type { Board } from '@/models';
import { Menu, MenuItem } from '@/shared/ui';
import { useUpdateBoard } from '../queries';
import { EditBoardModal } from './EditBoardModal';

export interface BoardActionsProps {
  board: Board;
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
export const BoardActions = ({ board }: BoardActionsProps) => {
  const [editing, setEditing] = useState(false);
  const updateBoard = useUpdateBoard();

  if (board.viewerRole !== 'owner') return null;

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
            <MoreHorizontal size={20} className="text-gray-600" aria-hidden="true" />
          </button>
        )}
      >
        <MenuItem onSelect={() => setEditing(true)}>
          <Pencil size={16} className="text-gray-400" aria-hidden="true" />
          <span>Edit board</span>
        </MenuItem>
      </Menu>

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
