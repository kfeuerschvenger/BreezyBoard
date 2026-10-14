import React, { useEffect, useMemo, useState } from 'react';
import { DndContext, DragOverlay } from '@dnd-kit/core';
import Column from '@/components/Column';
import { TaskCardOverlay } from '@/components/TaskCard';
import type { Task } from '@/models';
import { DEFAULT_HUE } from '@/shared/ui';
import type { Hue } from '@/shared/ui';
import { resolveColor } from '@/features/colors';
import type { ColorLookup } from '@/features/colors';
import type { ColumnData } from '../hooks/useBoardData';
import type { UseTaskDragAndDropResult } from '../hooks/useTaskDragAndDrop';
import { EmptyBoardHero } from './EmptyBoardHero';

export interface BoardColumnsProps {
  columns: ColumnData[];
  tasks: Task[];
  drag: UseTaskDragAndDropResult;
  /** The task palette, so no card has to resolve its own colour. */
  taskColors: ColorLookup;
  /** The board's hue, which the empty board banner is drawn in. */
  hue?: Hue;
  onTaskClick: (task: Task) => void;
  /** Adds a card to a column from its composer. Resolves to the card, rejects when it could not be saved. */
  onCreateTask: (columnId: string, title: string) => Promise<Task>;
  /**
   * Changes whenever something outside, the board header's "Add card" or the
   * empty board banner, asks for the first column's composer to open.
   */
  composerRequest?: number;
  /** Asks for it. The banner's button calls this. */
  onRequestComposer: () => void;
}

/**
 * The board's columns and the drag context around them.
 *
 * The context wraps the grid rather than the page, because the overlay has to
 * render inside it and nothing outside the grid is draggable.
 */
export const BoardColumns: React.FC<BoardColumnsProps> = ({
  columns,
  tasks,
  drag,
  taskColors,
  hue = DEFAULT_HUE,
  onTaskClick,
  onCreateTask,
  composerRequest = 0,
  onRequestComposer,
}) => {
  const colorOf = (task: Task) => resolveColor(task.color, taskColors);

  const { mover } = drag;
  const moveTargets = useMemo(() => columns.map(({ id, title }) => ({ id, title })), [columns]);
  const { focusRequest } = mover;

  // The card that has just been created plays its arrival, once. Cleared by
  // the card when the animation ends, which reduced motion collapses to an
  // instant but does not skip.
  const [freshId, setFreshId] = useState<string | null>(null);

  const onEntranceEnd = (taskId: string) => {
    setFreshId(current => (current === taskId ? null : current));
    drag.onLandingEnd?.(taskId);
  };

  const create = async (columnId: string, title: string) => {
    const created = await onCreateTask(columnId, title);
    setFreshId(created._id);
    return created;
  };

  // A card that changes column is a new element and the focused one is gone,
  // so focus goes to the same control of the same task where it now stands:
  // the "Move to" button after a menu move, the drag handle after a drag.
  // The new copy is not in the document until the cache write has rendered,
  // so the lookup retries across a few frames before giving up.
  useEffect(() => {
    if (!focusRequest) return;

    let frame = 0;
    let attempts = 0;
    const focusTrigger = () => {
      const attribute = focusRequest.target === 'drag-handle' ? 'data-task-drag-handle' : 'data-task-move-trigger';
      const trigger = document.querySelector<HTMLElement>(`[${attribute}="${CSS.escape(focusRequest.taskId)}"]`);
      if (trigger) trigger.focus();
      else if (attempts++ < 10) frame = requestAnimationFrame(focusTrigger);
    };
    frame = requestAnimationFrame(focusTrigger);

    return () => cancelAnimationFrame(frame);
  }, [focusRequest]);

  if (columns.length === 0) {
    return (
      <div className="py-12 text-center">
        <div className="text-lg text-ink-secondary">No columns available for this board</div>
        <p className="mt-2 text-ink-tertiary">This board template doesn&apos;t have any columns configured.</p>
      </div>
    );
  }

  const slot = drag.slot ?? null;
  const heldId = drag.activeTask?._id ?? null;
  const lastColumnId = columns.reduce((last, column) => (column.order > last.order ? column : last), columns[0]).id;
  const firstColumnId = columns[0].id;

  return (
    <>
      {/*
        Where the result of a menu move is announced. A card that moves leaves
        no trace at the place the person was working, so without this a screen
        reader hears nothing at all. It is mounted from the start and only its
        text changes, because a live region that appears together with its
        message is not reliably announced.
      */}
      <div role="status" data-move-announcer className="sr-only">
        {mover.announcement && <span key={mover.announcementId}>{mover.announcement}</span>}
      </div>

      {tasks.length === 0 && <EmptyBoardHero hue={hue} onAddFirstCard={onRequestComposer} />}

      <DndContext
        sensors={drag.sensors}
        collisionDetection={drag.collisionDetection}
        accessibility={drag.accessibility}
        onDragStart={drag.onDragStart}
        onDragMove={drag.onDragMove}
        onDragOver={drag.onDragOver}
        onDragEnd={drag.onDragEnd}
        onDragCancel={drag.onDragCancel}
      >
        {/*
        The one scroll container for the row. Columns keep a fixed width and
        overflow it sideways instead of wrapping, so a board of eight columns
        is the same shape as a board of three.

        It takes focus (tabIndex 0) because it is scrollable: with no task on
        the board there is no drag handle inside it, and a scroll region with
        nothing focusable would be unreachable from the keyboard on a screen
        too narrow for the columns. It is also what dnd-kit scrolls while a
        card is carried toward an off-screen column. Snapping is proximity, not
        mandatory, because mandatory snapping fights that auto-scroll.
      */}
        <div
          role="region"
          aria-label="Board columns"
          // The rule cannot know this region scrolls, which is what makes focus
          // here required (axe: scrollable-region-focusable) rather than decorative.
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
          tabIndex={0}
          className="focus-ring-inset flex min-h-0 flex-1 snap-x snap-proximity items-stretch gap-3.5 overflow-x-auto scroll-px-4 px-4 pb-4 sm:scroll-px-6 sm:px-6"
        >
          {columns.map(column => (
            <Column
              key={column.id}
              column={column}
              tasks={tasks.filter(task => task.status === column.id)}
              isLast={column.id === lastColumnId}
              heldId={heldId}
              gapIndex={slot?.columnId === column.id ? slot.index : null}
              highlighted={slot?.columnId === column.id}
              landedId={drag.landedId ?? null}
              freshId={freshId}
              onEntranceEnd={onEntranceEnd}
              onTaskClick={onTaskClick}
              colorOf={colorOf}
              moveTargets={moveTargets}
              onMove={mover.moveToColumn}
              onCreateTask={title => create(column.id, title)}
              composerRequest={column.id === firstColumnId ? composerRequest : 0}
            />
          ))}
        </div>

        {/*
          No drop animation. The overlay's own is measured against the card it
          came from, which is collapsed to nothing while it is in the air, and
          the settle is the card's: it lands in its place with a keyframe of
          its own (`bbLand`), which the global reduced motion rule collapses.
        */}
        <DragOverlay dropAnimation={null}>
          {drag.activeTask ? (
            <TaskCardOverlay
              task={drag.activeTask}
              color={colorOf(drag.activeTask)}
              done={drag.activeTask.status === lastColumnId}
            />
          ) : null}
        </DragOverlay>
      </DndContext>
    </>
  );
};

export default BoardColumns;
