import React from 'react';
import { IconPlus } from '@tabler/icons-react';
import { Icon } from '@/shared/ui';

export interface NewBoardTileProps {
  onClick: () => void;
  /** Seconds to stagger the entrance by, within a grid. */
  delay?: number;
}

/**
 * The last cell of the board grid: a dashed outline that starts a new board.
 *
 * It is a button, not a link, because it opens the create dialog and goes
 * nowhere. The outline is the control border colour, 3.34:1 on the ground,
 * so the edge of the target is visible and not only its words; on hover and
 * keyboard focus it takes the accent.
 */
export const NewBoardTile: React.FC<NewBoardTileProps> = ({ onClick, delay = 0 }) => (
  <button
    type="button"
    onClick={onClick}
    style={delay > 0 ? { animationDelay: `${delay}s` } : undefined}
    className="focus-ring group flex min-h-49 w-full animate-bb-up cursor-pointer flex-col items-center justify-center gap-2 rounded-tile border-2 border-dashed border-line-control bg-glass p-6 text-center transition-[background-color,border-color,translate] duration-300 ease-standard hover:-translate-y-[3px] hover:border-accent hover:bg-glass-strong"
  >
    <span className="mb-1 flex size-11 items-center justify-center rounded-control bg-surface text-accent shadow-tile">
      <Icon as={IconPlus} size={22} />
    </span>
    <span className="font-heading text-[17px] font-[650] tracking-[-0.01em] text-ink">New board</span>
    <span className="text-[13px] text-ink-secondary">Fresh board, ready for take-off.</span>
  </button>
);

export default NewBoardTile;
