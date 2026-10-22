import React from 'react';
import { IconUsers } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import { resolveIcon } from '@/shared/lib/templateIcons';
import { Avatar, Cover, Icon, ProgressBar } from '@/shared/ui';
import type { Board } from '@/models';
import { boardHueOf } from '../boardHue';
import { BoardCardMenu } from './BoardCardMenu';

export interface BoardCardProps {
  board: Board;
  menuOpen: boolean;
  isDeleting: boolean;
  onToggleMenu: () => void;
  onAddMember: () => void;
  onDelete: () => void;
  /** Seconds to stagger the entrance by, within a grid. */
  delay?: number;
}

const formatUpdated = (dateString?: string) => {
  if (!dateString) return 'N/A';
  try {
    return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return 'Invalid date';
  }
};

/**
 * A board's progress as a whole percentage.
 *
 * The API sends a number. It has also sent an empty object, which is what the
 * guard is for and why this is not simply read off the board.
 */
const percentComplete = (board: Board): number => (typeof board.progress === 'number' ? board.progress : 0);

/**
 * The two wavy lines drawn over a tile's cover, stretched to whatever width
 * the tile has. Decoration: the cover is hidden from assistive technology.
 */
const CoverWaves: React.FC = () => (
  <svg viewBox="0 0 300 96" preserveAspectRatio="none" aria-hidden="true" className="absolute inset-0 size-full">
    <path
      d="M-10 58 C 60 30, 120 80, 190 50 S 280 26, 320 44"
      fill="none"
      stroke="white"
      strokeOpacity={0.6}
      strokeWidth={1.5}
    />
    <path
      d="M-10 74 C 70 54, 140 96, 210 68 S 290 52, 320 62"
      fill="none"
      stroke="white"
      strokeOpacity={0.35}
      strokeWidth={1.2}
    />
  </svg>
);

/**
 * One board in the grid on the home page: a cover in the board's hue, its name,
 * its description, how far along it is and a few counts.
 *
 * The tile is a container rather than a control. Its title is a real link whose
 * hit area is stretched over the whole tile by a pseudo element, so a mouse
 * keeps the large target and the keyboard gets one link per tile instead of a
 * button holding buttons. The focus ring is the tile's own outline, drawn while
 * the title link has keyboard focus, so it surrounds the whole tile and not the
 * words of the title; it is why the tile does not clip its overflow, because
 * the ring sits outside the edge. The cover clips its own corners. Everything
 * else that can be clicked sits above the link on z-10.
 *
 * The backdrop blur makes each tile a stacking context of its own, so a tile
 * whose menu is open is lifted above the tiles after it, or the next row would
 * paint over the menu.
 *
 * The cover carries the owner, the one person the data says every board has.
 * The count in the footer is every member, owner included.
 *
 * The footer text is the tertiary colour on the tile's glass, which is the
 * ground behind a white wash: 4.99:1 at the lowest.
 */
export const BoardCard: React.FC<BoardCardProps> = ({
  board,
  menuOpen,
  isDeleting,
  onToggleMenu,
  onAddMember,
  onDelete,
  delay = 0,
}) => {
  const hue = boardHueOf(board.color);
  const template = typeof board.template === 'object' ? board.template : null;
  const TemplateIcon = resolveIcon(template?.iconName);

  const title = board.title || 'Untitled Board';
  const progress = percentComplete(board);

  const owner = typeof board.createdBy === 'object' ? board.createdBy : null;
  const ownerName = owner ? `${owner.firstName} ${owner.lastName}`.trim() : '';

  return (
    <div
      style={delay > 0 ? { animationDelay: `${delay}s` } : undefined}
      data-hue={hue}
      className="group relative flex animate-bb-up has-[[data-board-menu]]:z-20 has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-focus flex-col rounded-tile border border-glass-border bg-glass-strong shadow-tile backdrop-blur-[14px] transition-[translate,rotate,box-shadow] duration-300 ease-standard hover:-translate-y-1 hover:-rotate-[0.6deg] hover:shadow-tile-hover"
    >
      {/* The owner sits beside the cover rather than inside it: the cover is hidden from assistive technology. */}
      <div className="relative">
        <Cover hue={hue} className="h-24 rounded-t-tile">
          <CoverWaves />
          <Icon as={TemplateIcon} size={22} className="absolute bottom-3 left-4 text-white" aria-hidden="true" />
        </Cover>
        {owner && (
          <span className="absolute bottom-3 right-4 flex">
            <Avatar name={ownerName} src={owner.avatar} seed={owner._id} size="sm" ring="surface" decorative />
            <span className="sr-only">Owner: {ownerName}</span>
          </span>
        )}
      </div>

      {/*
        Both actions in the menu are owner only on the server, so for anybody
        else the menu would hold nothing that can succeed and is not rendered
        at all. The role is the server's: a workspace admin arrives as an
        owner, and a board without a role is treated as not owned rather than
        guessed at.
      */}
      {board.viewerRole === 'owner' && (
        <BoardCardMenu
          boardTitle={title}
          open={menuOpen}
          isDeleting={isDeleting}
          onToggle={onToggleMenu}
          onAddMember={onAddMember}
          onDelete={onDelete}
        />
      )}

      <div className="flex flex-1 flex-col px-4 pb-4 pt-3.5">
        <h3 className="break-words font-heading text-[17px] font-[650] tracking-[-0.01em] text-ink">
          <Link
            to={`/board/${board._id}`}
            className="outline-none after:absolute after:inset-0 after:rounded-tile"
          >
            {title}
          </Link>
        </h3>

        <p className="mt-1 line-clamp-2 min-h-10 text-[13px] leading-5 text-ink-secondary">
          {board.description || 'No description'}
        </p>

        <div className="mt-3 flex items-center gap-3">
          <ProgressBar value={progress} label={`Progress of ${title}`} hue={hue} size={6} />
          <span className="font-mono text-[11.5px] text-ink-tertiary">{progress}%</span>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-ink-tertiary">
          <div className="flex items-center gap-3">
            <span>{typeof board.taskCount === 'number' ? board.taskCount : 0} tasks</span>
            <span className="flex items-center gap-1">
              <Icon as={IconUsers} size={13} aria-hidden="true" />
              <span>{typeof board.memberCount === 'number' ? board.memberCount : 0}</span>
            </span>
          </div>
          <span>Updated {formatUpdated(board.updatedAt || new Date().toISOString())}</span>
        </div>
      </div>
    </div>
  );
};

export default BoardCard;
