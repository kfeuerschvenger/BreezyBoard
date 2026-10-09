import type { ReactNode } from 'react';
import { useMatch } from 'react-router-dom';
import { IconChevronRight, IconHome2, IconLayoutKanban, IconSearchOff, IconUserCircle } from '@tabler/icons-react';
import type { Icon as TablerGlyph } from '@tabler/icons-react';
import { useBoard } from '@/features/boards';
import { Icon } from '@/shared/ui';

interface Section {
  icon: TablerGlyph;
  label: string;
  /** The board's id when the section is one board's page. */
  boardId?: string;
}

/** Which part of the application the address belongs to. */
const useSection = (): Section => {
  const board = useMatch('/board/:boardId');
  const home = useMatch({ path: '/', end: true });
  const profile = useMatch('/profile');

  if (board) return { icon: IconLayoutKanban, label: 'Boards', boardId: board.params.boardId };
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
 * The breadcrumb names the section and, on a board, the board. It describes
 * the place and does not navigate: the sidebar is how a person moves, and
 * `aria-current` marks the last entry as the page they are on. The box on the
 * right is filled by whatever view is showing, through `ShellAction`.
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
          <li
            aria-current={boardName ? undefined : 'page'}
            className="flex shrink-0 items-center gap-2 font-semibold text-ink-secondary"
          >
            <Icon as={section.icon} size={17} />
            {section.label}
          </li>
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
