import React from 'react';
import type { Board } from '@/models';
import { useToast } from '@/shared/hooks/useToast';
import { Avatar, Cover, InlineEdit, ProgressBar } from '@/shared/ui';
import { boardHueOf } from '../boardHue';
import { useUpdateBoard } from '../queries';
import { BoardActions } from './BoardActions';

export interface BoardHeaderProps {
  board: Board;
  /** Cards in the board's last column, where work has landed. */
  landed: number;
  /** Every card on the board. */
  total: number;
  /** Runs once the board is deleted, to leave a page that no longer has a board. */
  onDeleted: () => void;
  /** Live cards in each column, by column id. With it the owner can manage the board's columns from the header. */
  taskCounts?: Readonly<Record<string, number>>;
  /** Reads the board's cards again, for the dialog that manages the columns. */
  onRefreshTasks?: () => Promise<unknown>;
}

/**
 * The two strokes of the wind mark drawn on a board's cover, in a 56 pixel
 * square. Decoration: the cover is hidden from assistive technology.
 */
const CoverMark: React.FC = () => (
  <svg viewBox="0 0 56 56" aria-hidden="true" className="absolute inset-0 size-full">
    <path d="M6 24 h22 a6 6 0 1 0 -6 -6" fill="none" stroke="white" strokeWidth={3} strokeLinecap="round" />
    <path
      d="M6 33 h32 a6 6 0 1 1 -6 6"
      fill="none"
      stroke="white"
      strokeOpacity={0.75}
      strokeWidth={3}
      strokeLinecap="round"
    />
  </svg>
);

/**
 * The title block of a board's page: its cover and name, how far along it is,
 * who owns it and what the owner can do to it.
 *
 * The page's one `h1` is the board's name. It is a `header` inside `main`, so
 * it is a sectioning header and not a second banner.
 *
 * Progress is read from the cards on the page and not from the figure the
 * board list carries, because a drag changes it and only the cards are updated
 * when one lands.
 *
 * One person is shown, the owner. A board has members, but a task has one
 * assignee and the design's stack of every member would imply more than the
 * product offers.
 *
 * The owner edits the name where it is read, and it saves when the field loses
 * focus. The field wraps a long name onto as many lines as it needs, so the
 * owner reads all of it just as anybody else does. Anybody else reads it as
 * text.
 */
export const BoardHeader: React.FC<BoardHeaderProps> = ({
  board,
  landed,
  total,
  onDeleted,
  taskCounts,
  onRefreshTasks,
}) => {
  const updateBoard = useUpdateBoard();
  const toast = useToast();
  const hue = boardHueOf(board.color);
  const title = board.title || 'Untitled Board';
  const isOwner = board.viewerRole === 'owner';
  const percent = total === 0 ? 0 : Math.round((landed / total) * 100);

  const owner = typeof board.createdBy === 'object' ? board.createdBy : null;
  const ownerName = owner ? `${owner.firstName} ${owner.lastName}`.trim() : '';

  return (
    <header
      data-board-header
      className="flex shrink-0 flex-wrap items-end gap-x-7 gap-y-4 px-4 pb-4 pt-1 sm:px-6"
    >
      <div className="flex min-w-0 flex-1 basis-72 items-center gap-4">
        <Cover hue={hue} className="size-14 shrink-0 rounded-float">
          <CoverMark />
        </Cover>

        <div className="min-w-0 flex-1">
          <h1 className="break-words font-heading text-[28px] font-bold leading-tight tracking-tight text-ink sm:text-4xl">
            {isOwner ? (
              <InlineEdit
                value={title}
                label="Board name"
                wrap
                emptyMessage="A board needs a name."
                failureMessage="The board could not be renamed. Nothing was changed."
                onError={message => toast.show({ message })}
                onSave={async next => {
                  await updateBoard.mutateAsync({ boardId: board._id, changes: { title: next } });
                }}
              />
            ) : (
              title
            )}
          </h1>
          {board.description && (
            <p className="mt-0.5 line-clamp-2 text-[14.5px] leading-snug text-ink-secondary">{board.description}</p>
          )}
        </div>
      </div>

      <div className="ml-auto flex max-w-full flex-wrap items-end justify-end gap-x-4 gap-y-3">
        {/* 190 pixels where there is room, and less on a 320 pixel phone, where the avatar and the menu need theirs. */}
        <div className="w-47.5 min-w-0 shrink">
          <div className="mb-1.5 flex items-baseline justify-between gap-2 text-[12.5px] text-ink-secondary">
            <span>
              {landed} of {total} landed
            </span>
            <span className="font-mono text-ink-tertiary">{percent}%</span>
          </div>
          <ProgressBar
            value={landed}
            max={Math.max(total, 1)}
            label={`Progress of ${title}`}
            valueText={`${landed} of ${total} landed`}
            hue={hue}
            size={8}
          />
        </div>

        {owner && (
          <span className="flex" title={`Owner: ${ownerName}`}>
            <Avatar name={ownerName} src={owner.avatar} seed={owner._id} size="md" ring="ground" decorative />
            <span className="sr-only">Owner: {ownerName}</span>
          </span>
        )}

        <BoardActions board={board} onDeleted={onDeleted} taskCounts={taskCounts} onRefreshTasks={onRefreshTasks} />
      </div>
    </header>
  );
};

export default BoardHeader;
