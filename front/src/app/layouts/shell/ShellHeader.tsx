import type { ReactNode } from 'react';
import { Link, useMatch } from 'react-router-dom';
import { IconChevronRight, IconHome2, IconSearchOff, IconUserCircle } from '@tabler/icons-react';
import type { Icon as TablerGlyph } from '@tabler/icons-react';
import { useBoard } from '@/features/boards';
import { Icon } from '@/shared/ui';

interface Section {
  icon: TablerGlyph;
  label: string;
  /** The board's id when the section is one board's page. */
  boardId?: string;
  /** Where the section's entry leads when it is not the page the person is on. */
  to?: string;
}

/** Which part of the application the address belongs to. */
const useSection = (): Section => {
  const board = useMatch('/board/:boardId');
  const home = useMatch({ path: '/', end: true });
  const profile = useMatch('/profile');

  // A board lives under Home, so that is the section it is named by and the
  // place its entry leads back to.
  if (board) return { icon: IconHome2, label: 'Home', boardId: board.params.boardId, to: '/' };
  if (home) return { icon: IconHome2, label: 'Home' };
  if (profile) return { icon: IconUserCircle, label: 'Profile' };
  return { icon: IconSearchOff, label: 'Not found' };
};

export interface ShellHeaderProps {
  /** Receives the box that holds the view's main action. */
  slotRef: (element: HTMLElement | null) => void;
  /** The button that opens the sidebar where it is a panel. */
  menuButton?: ReactNode;
}

/**
 * The strip above the page: where the person is, and the one thing the view
 * offers to do.
 *
 * The breadcrumb names the section and, on a board, the board. On a board the
 * section entry is a link back to Home and the board's name is text marked
 * `aria-current`, the page the person is on. Anywhere else there is one entry,
 * the page itself, and it is text with `aria-current`: a link to the page
 * already open would only reload it. The box on the right is filled by
 * whatever view is showing, through `ShellAction`.
 */
export const ShellHeader = ({ slotRef, menuButton }: ShellHeaderProps) => {
  const section = useSection();
  const board = useBoard(section.boardId);
  const boardName = board.data?.title;

  return (
    <header className="flex h-14 shrink-0 items-center gap-3">
      {menuButton}

      <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
        <ol className="flex min-w-0 items-center gap-2 text-sm">
          {section.to && boardName ? (
            <li className="flex shrink-0 items-center">
              {/* Padded and pulled back by the same amount, so the target is 44 pixels tall on touch without moving the text. */}
              <Link
                to={section.to}
                className="focus-ring -mx-2 flex min-h-11 items-center gap-2 rounded-control px-2 font-semibold text-ink-secondary transition-colors duration-200 hover:text-ink lg:min-h-8"
              >
                <Icon as={section.icon} size={17} />
                {section.label}
              </Link>
            </li>
          ) : (
            <li
              aria-current={boardName ? undefined : 'page'}
              className="flex shrink-0 items-center gap-2 font-semibold text-ink-secondary"
            >
              <Icon as={section.icon} size={17} />
              {section.label}
            </li>
          )}
          {boardName && (
            <>
              <li aria-hidden="true" className="flex shrink-0 items-center text-ink-tertiary">
                <Icon as={IconChevronRight} size={15} />
              </li>
              <li aria-current="page" className="min-w-0 truncate font-semibold text-ink" title={boardName}>
                {boardName}
              </li>
            </>
          )}
        </ol>
      </nav>

      <div ref={slotRef} className="flex shrink-0 items-center gap-2" />
    </header>
  );
};

export default ShellHeader;
