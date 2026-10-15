import { IconX } from '@tabler/icons-react';
import { BreezeBox, useBreeze } from '@/features/breeze';
import { Icon, IconButton } from '@/shared/ui';
import { BrandMark } from './BrandMark';
import { SidebarBoards } from './SidebarBoards';
import { SidebarFoot } from './SidebarFoot';
import { SidebarNav } from './SidebarNav';

export interface SidebarProps {
  onCreateBoard: () => void;
  /** Runs when a destination is chosen. */
  onNavigate?: () => void;
  /** Closes the panel the sidebar is where it is one. The button for it exists only there. */
  onClose?: () => void;
  className?: string;
}

/**
 * The glass panel down the left of the application: the logo, the places, the
 * boards and the account.
 *
 * It is a complementary landmark, so that the logo, the account and the
 * links at its foot are inside one: content outside every landmark is
 * unreachable by the landmark navigation of a screen reader.
 *
 * Its fill is white below the large breakpoint and glass from it up. As a
 * column it floats over the page's own light ground, where its small grey
 * text keeps 4.5:1. As a panel it floats over the navy scrim, which darkens
 * whatever shows through glass to about 2.5:1 for that same text.
 *
 * It is a column with a scrolling middle. The boards take whatever height is
 * left between the fixed parts above and below them, so the account button is
 * always at the foot of the screen and never pushed off it.
 */
export const Sidebar = ({ onCreateBoard, onNavigate, onClose, className = '' }: SidebarProps) => {
  // The logo's sway is ambient motion like the wind, so it follows the same
  // level and stops when the sky is still.
  const { level } = useBreeze();

  return (
    <aside
      aria-label="Sidebar"
      className={`min-h-0 flex-col gap-[18px] rounded-panel border border-glass-border bg-surface px-3 pb-3 pt-[18px] shadow-sidebar lg:bg-glass lg:backdrop-blur-[20px] lg:backdrop-saturate-150 ${className}`}
    >
      <div className="flex items-center justify-between gap-2">
        <BrandMark sway={level !== 'still'} onNavigate={onNavigate} />
        <IconButton
          type="button"
          size="lg"
          aria-label="Close navigation"
          onClick={onClose}
          className="shrink-0 lg:hidden"
        >
          <Icon as={IconX} size={20} />
        </IconButton>
      </div>
      <SidebarNav onNavigate={onNavigate} />
      <SidebarBoards onCreate={onCreateBoard} onNavigate={onNavigate} />
      <BreezeBox />
      <SidebarFoot />
    </aside>
  );
};

export default Sidebar;
