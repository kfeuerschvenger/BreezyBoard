import { NavLink } from 'react-router-dom';
import { IconPlus } from '@tabler/icons-react';
import { useBoards } from '@/features/boards';
import { Icon, IconButton, MID_BACKGROUND, hueFromSeed } from '@/shared/ui';

export interface SidebarBoardsProps {
  /** Opens the create board dialog. */
  onCreate: () => void;
  /** Runs when a board is chosen, for a panel that closes when a destination is. */
  onNavigate?: () => void;
}

const ITEM_CLASSES =
  'focus-ring flex min-h-11 items-center gap-3 rounded-control px-3 text-sm transition-colors duration-200 lg:min-h-[38px]';

/**
 * Every board the person can open, each one a link, with the way to start a
 * new one beside the label.
 *
 * A board's dot takes its hue from its id, so the same board is the same
 * colour here, on the home page and anywhere else that draws it. The list
 * scrolls inside the sidebar: the logo above it and the controls below it stay
 * where they are however many boards there are.
 */
export const SidebarBoards = ({ onCreate, onNavigate }: SidebarBoardsProps) => {
  const boards = useBoards();

  return (
    <section aria-labelledby="sidebar-boards-label" className="flex min-h-0 flex-1 flex-col">
      <div className="mb-1 flex items-center justify-between pl-3">
        <p id="sidebar-boards-label" className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-tertiary">
          Boards
        </p>
        <IconButton type="button" size="sm" aria-label="Create board" onClick={onCreate} className="group">
          <Icon as={IconPlus} size={16} className="transition-transform duration-300 group-hover:rotate-90" />
        </IconButton>
      </div>

      <nav aria-labelledby="sidebar-boards-label" className="min-h-0 flex-1 overflow-y-auto">
        {boards.isPending && <p className="px-3 py-2 text-sm text-ink-tertiary">Loading boards</p>}

        {boards.isError && (
          <div role="alert" className="px-3 py-2 text-sm text-ink-secondary">
            <p>Boards could not be loaded.</p>
            <button
              type="button"
              onClick={() => void boards.refetch()}
              className="focus-ring mt-1 min-h-7 cursor-pointer rounded-chip font-semibold text-link underline underline-offset-2"
            >
              Try again
            </button>
          </div>
        )}

        {boards.data?.length === 0 && <p className="px-3 py-2 text-sm text-ink-tertiary">No boards yet</p>}

        <ul className="flex flex-col gap-0.5">
          {boards.data?.map(board => (
            <li key={board._id}>
              <NavLink
                to={`/board/${board._id}`}
                onClick={onNavigate}
                title={board.title}
                className={({ isActive }) =>
                  `${ITEM_CLASSES} ${
                    isActive
                      ? 'bg-surface font-semibold text-ink shadow-nav-active'
                      : 'font-medium text-ink-secondary hover:bg-surface/95 hover:text-ink'
                  }`
                }
              >
                {/* TODO(phase 6b, slice 5): the dot takes the hue the board's owner chose,
                    one of the six design system hues. A hash of the id stands in until
                    the board palette is those six hues, see docs/REVIVAL-PLAN.md 12.6b. */}
                <span
                  aria-hidden="true"
                  className={`size-3 shrink-0 rotate-12 rounded-dot ${MID_BACKGROUND[hueFromSeed(board._id)]}`}
                />
                <span className="truncate">{board.title}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </section>
  );
};

export default SidebarBoards;
