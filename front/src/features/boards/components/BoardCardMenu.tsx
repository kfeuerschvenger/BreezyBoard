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

const ITEM_CLASSES =
  'focus-ring-inset flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-button-small px-3 py-2 text-left text-sm font-medium transition-colors duration-150 sm:min-h-9';

/**
 * The per board options menu, drawn over the top right corner of the tile it
 * belongs to. Its positioned parent is the tile.
 *
 * The trigger is hidden until the tile is hovered only where hovering exists.
 * A phone has no hover, so there it stays visible, and it is 44 pixels square
 * below the large breakpoint where it is touched. It is a glass disc, so the
 * dots hold their contrast over every cover hue.
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
  <div className="absolute right-3 top-3 z-10">
    <button
      type="button"
      data-board-menu-btn
      onClick={onToggle}
      aria-expanded={open}
      aria-label={`Options for ${boardTitle}`}
      className="focus-ring inline-flex size-11 cursor-pointer items-center justify-center rounded-pill border border-glass-border bg-glass-strong text-ink-secondary opacity-100 backdrop-blur-sm transition-[opacity,color] hover:text-ink focus-visible:opacity-100 lg:size-8 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
    >
      <Icon as={IconDots} size={16} />
    </button>

    {open && (
      <div
        data-board-menu
        className="absolute right-0 mt-2 w-44 rounded-control border border-line-10 bg-surface p-1.5 shadow-tile-hover"
      >
        <button type="button" onClick={onAddMember} className={`${ITEM_CLASSES} text-ink hover:bg-line-06`}>
          <Icon as={IconUsers} size={14} />
          Add Member
        </button>

        <button
          type="button"
          onClick={onDelete}
          disabled={isDeleting}
          className={`${ITEM_CLASSES} text-danger hover:bg-danger-bg`}
        >
          <Icon as={IconTrash} size={14} />
          <span>{isDeleting ? 'Deleting...' : 'Delete'}</span>
        </button>
      </div>
    )}
  </div>
);

export default BoardCardMenu;
