import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import { IconPlaneArrival, IconWind } from '@tabler/icons-react';

import type { Column as ColumnType, Task } from '@/models';
import { useBreeze } from '@/features/breeze';
import { CardComposer } from '@/features/tasks';
import type { LeavingCard, MoveTarget } from '@/features/tasks';
import { Icon } from '@/shared/ui';
import TaskCard, { TaskCardLeaving } from './TaskCard';
import type { CardEntrance } from './TaskCard';

interface ColumnProps {
  column: ColumnType;
  tasks: Task[];
  /** The board's last column, which is where a task has landed. */
  isLast?: boolean;
  /** The card a drag has in the air, which takes no room in its column. */
  heldId?: string | null;
  /**
   * Where the gap is drawn: the index the held card would take among this
   * column's other cards. Null when the card is not over this column.
   */
  gapIndex?: number | null;
  /** A card is over this column, so it is lit as the one that would take it. */
  highlighted?: boolean;
  /** The card that has just been dropped, and the one that has just been created. */
  landedId?: string | null;
  freshId?: string | null;
  onEntranceEnd?: (taskId: string) => void;
  onTaskClick: (task: Task) => void;
  /**
   * The hex value to paint one task with. Passed down rather than resolved in
   * the card, which used to ask the colour endpoint once per card.
   */
  colorOf: (task: Task) => string;
  /** The board's columns, for each card's "Move to" menu. */
  moveTargets?: MoveTarget[];
  onMove?: (task: Task, target: MoveTarget) => void;
  /** Adds a card to this column. Rejects when it could not be saved. */
  onCreateTask?: (title: string) => Promise<unknown>;
  /** Changes whenever something asks this column's composer to open. */
  composerRequest?: number;
  /**
   * Deleted cards still playing their exit. Each is drawn where it stood, in
   * the column it belongs to, and is not one of the column's tasks.
   */
  leaving?: LeavingCard[];
  onLeavingEnd?: (taskId: string) => void;
}

/** The empty slot a held card would drop into, 58 pixels tall as in the reference design. */
const Gap: React.FC = () => (
  <div
    data-drop-gap
    aria-hidden="true"
    className="mb-2.5 h-[58px] animate-bb-gap rounded-card border-2 border-dashed border-sky-edge bg-sky-tint/55"
  />
);

/**
 * What an empty column says. The icon sways while there is wind and is still
 * at Still, which is the Breeze setting's promise that nothing ambient moves.
 */
const StillAir: React.FC = () => {
  const { level } = useBreeze();

  return (
    <div
      data-still-air
      className="mb-2.5 flex animate-bb-fade flex-col items-center gap-1 rounded-card border-[1.5px] border-dashed border-line-22 px-4 py-7 text-center"
    >
      <Icon
        as={IconWind}
        size={24}
        className={`text-ink-tertiary ${level === 'still' ? '' : 'animate-bb-sway-slow'}`}
        aria-hidden="true"
      />
      <p className="text-[13.5px] font-semibold text-ink-secondary">Still air</p>
      <p className="text-xs text-ink-tertiary">Drop a card here or add one below.</p>
    </div>
  );
};

/**
 * Column component
 *
 * Represents a single Kanban column (e.g., "To Do", "In Progress", "Done"):
 * a glass panel with its name and count, the cards, and the composer at its
 * foot. It is a drop target, and while a card is carried it opens a gap where
 * the card would land.
 *
 * The column has a fixed width and fills the height of the row it sits in. The
 * header and the composer never move: only the body scrolls, so a long column
 * keeps its title, its count and its way of adding a card in view.
 *
 * The last column is drawn as where work lands: a green dot and the arrival
 * icon, and its cards carry a check. Its name is the person's own and is not
 * rewritten.
 */
const Column: React.FC<ColumnProps> = ({
  column,
  tasks,
  isLast = false,
  heldId = null,
  gapIndex = null,
  highlighted = false,
  landedId = null,
  freshId = null,
  onEntranceEnd,
  onTaskClick,
  colorOf,
  moveTargets,
  onMove,
  onCreateTask,
  composerRequest,
  leaving = [],
  onLeavingEnd,
}) => {
  const { setNodeRef } = useDroppable({
    id: column._id,
  });

  // The cards leaving this column. One that is back in the list, because it
  // was caught while it was still going, is the task again and not a picture.
  const heldAway = leaving.filter(
    ({ task }) => task.status === column._id && !tasks.some(other => other._id === task._id),
  );
  const leavingBefore = (beforeId: string | null) => heldAway.filter(card => card.beforeId === beforeId);
  const placedAmongTasks = new Set(tasks.map(task => task._id));

  const items: React.ReactNode[] = [];
  const pushLeaving = (cards: LeavingCard[]) =>
    cards.forEach(({ task }) =>
      items.push(
        <TaskCardLeaving
          key={`leaving-${task._id}`}
          task={task}
          color={colorOf(task)}
          done={isLast}
          onGone={id => onLeavingEnd?.(id)}
        />,
      ),
    );

  // The held card stays mounted, collapsed, where it was in the list. The gap
  // is counted among the cards that take room, so it is placed by walking the
  // list and skipping the held one.
  let visible = 0;
  tasks.forEach(task => {
    const held = task._id === heldId;
    pushLeaving(leavingBefore(task._id));
    if (!held && gapIndex === visible) items.push(<Gap key="gap" />);

    const entrance: CardEntrance | null = task._id === landedId ? 'landed' : task._id === freshId ? 'fresh' : null;
    items.push(
      <TaskCard
        key={task._id}
        task={task}
        color={colorOf(task)}
        done={isLast}
        held={held}
        entrance={entrance}
        onEntranceEnd={onEntranceEnd}
        onClick={() => onTaskClick(task)}
        moveTargets={moveTargets}
        onMove={onMove}
      />,
    );
    if (!held) visible += 1;
  });
  // A card that stood last, or whose lower neighbour has gone too, leaves from
  // the foot of the column.
  pushLeaving(heldAway.filter(card => card.beforeId === null || !placedAmongTasks.has(card.beforeId)));
  if (gapIndex !== null && gapIndex >= visible) items.push(<Gap key="gap" />);

  const empty = visible === 0 && gapIndex === null && heldAway.length === 0;
  const dot = typeof column.color === 'string' ? column.color : column.color.value;

  return (
    <div
      data-column={column._id}
      data-highlighted={highlighted ? '' : undefined}
      // `shrink-0` keeps the fixed width: without it a flex row squeezes every
      // column to fit instead of overflowing and scrolling.
      className={`flex h-full w-73 shrink-0 snap-start flex-col rounded-panel border-[1.5px] shadow-column backdrop-blur-[14px] transition-[background-color,border-color] duration-250 ${
        highlighted ? 'border-sky-edge bg-glass-strong' : 'border-glass-border bg-glass-column'
      }`}
    >
      {/* Column header with its colour, title and task count */}
      <div className="flex shrink-0 items-center gap-2.5 px-4 pb-2.5 pt-3.5">
        <span
          aria-hidden="true"
          className={`size-2.5 shrink-0 rotate-12 rounded-[3px] ${isLast ? 'bg-green-mid' : ''}`}
          style={isLast ? undefined : { backgroundColor: dot }}
        />
        <h2 className="min-w-0 truncate font-heading text-[14.5px] font-bold text-ink">{column.title}</h2>
        {isLast && <Icon as={IconPlaneArrival} size={16} className="shrink-0 text-green-deep" aria-hidden="true" />}
        <span className="ml-auto inline-flex h-[22px] min-w-6 items-center justify-center rounded-chip bg-line-06 px-1.5 font-mono text-[11.5px] text-ink-secondary">
          {tasks.length}
        </span>
      </div>

      {/*
        Droppable area where tasks can be placed. It is the whole body of the
        column, flexed to fill it, so an empty column is as easy a drop target
        as a full one.

        `relative` is load-bearing. An absolutely positioned descendant is only
        clipped and scrolled by a scroller that is also its containing block, and
        the cards carry `sr-only` text, which is absolute. Without it that text
        escapes the column, and the page grows to the position of the last card
        in the longest column.

        The cards space themselves with a bottom margin and not a flex gap,
        because a card in the air collapses to zero height and a gap would still
        leave its share of space behind.
      */}
      <div
        ref={setNodeRef}
        data-column-body={column._id}
        className="relative flex min-h-0 flex-1 flex-col overflow-y-auto px-2.5 pt-0.5"
      >
        {/* Strategy `() => null`: the gap moves the cards, so the sortable layer must not as well. */}
        <SortableContext items={tasks.map(task => task._id)} strategy={() => null}>
          {items}
        </SortableContext>

        {empty && <StillAir />}
      </div>

      {onCreateTask && (
        <div className="shrink-0 px-2.5 pb-2.5 pt-1">
          <CardComposer
            columnId={column._id}
            columnTitle={column.title}
            onSubmit={onCreateTask}
            openRequest={composerRequest}
          />
        </div>
      )}
    </div>
  );
};

export default Column;
