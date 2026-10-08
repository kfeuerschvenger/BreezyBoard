import React from 'react';
import { IconDots, IconTrash, IconUsers } from '@tabler/icons-react';
import { Icon } from '@/shared/ui';

export interface BoardCardMenuProps {
  /** Names the trigger, so one card's options are distinguishable from another's. */
  boardTitle: string;
  open: boolean;
  isDeleting: boolean;
  onToggle: () => void;
  onAddMember: () => void;
  onDelete: () => void;
}

/**
 * The per board options menu.
 *
 * The trigger is hidden until the card is hovered only where hovering exists.
 * A phone has no hover, so there it stays visible, and it is 44 pixels square
 * below the medium breakpoint where it is touched.
 *
 * The two `data-board-menu` attributes are what the page's outside click
 * handler looks for to decide a click was not aimed at the menu. They are
 * markup hooks rather than styling, which is why they carry no value.
 */
export const BoardCardMenu: React.FC<BoardCardMenuProps> = ({
  boardTitle,
  open,
  isDeleting,
  onToggle,
  onAddMember,
  onDelete,
}) => (
  <div className="relative z-10">
    <button
      data-board-menu-btn
      onClick={onToggle}
      className="p-3 md:p-1 opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-visible:opacity-100 transition-opacity hover:bg-gray-100 rounded"
      aria-label={`Options for ${boardTitle}`}
    >
      <Icon as={IconDots} size={16} className="text-gray-400" />
    </button>

    {open && (
      <div
        data-board-menu
        className="absolute right-0 mt-2 w-44 bg-white border border-gray-200 rounded-lg shadow-lg z-50"
      >
        <button
          onClick={onAddMember}
          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2 cursor-pointer"
        >
          <Icon as={IconUsers} size={14} />
          Add Member
        </button>

        <button
          onClick={onDelete}
          disabled={isDeleting}
          className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 cursor-pointer"
        >
          <Icon as={IconTrash} size={14} className="text-red-600" />
          <span className="text-red-600">{isDeleting ? 'Deleting...' : 'Delete'}</span>
        </button>
      </div>
    )}
  </div>
);

export default BoardCardMenu;
