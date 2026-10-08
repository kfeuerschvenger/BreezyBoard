import React, { useEffect, useMemo } from 'react';
import { ClipboardList, Plus } from 'lucide-react';
import { DndContext, DragOverlay } from '@dnd-kit/core';
import Column from '@/components/Column';
import TaskCard from '@/components/TaskCard';
import type { Task } from '@/models';
import { EmptyState } from '@/shared/ui';
import { resolveColor } from '@/features/colors';
import type { ColorLookup } from '@/features/colors';
import type { ColumnData } from '../hooks/useBoardData';
import type { UseTaskDragAndDropResult } from '../hooks/useTaskDragAndDrop';

export interface BoardColumnsProps {
  columns: ColumnData[];
  tasks: Task[];
  drag: UseTaskDragAndDropResult;
  /** The task palette, so no card has to resolve its own colour. */
  taskColors: ColorLookup;
  onTaskClick: (task: Task) => void;
  /** Starts a new task in the first column, the same flow as the page header's button. */
  onAddTask: () => void;
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
  onTaskClick,
  onAddTask,
}) => {
  const colorOf = (task: Task) => resolveColor(task.color, taskColors);

  const { mover } = drag;
  const moveTargets = useMemo(() => columns.map(({ id, title }) => ({ id, title })), [columns]);
  const { focusRequest } = mover;

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
      <div className="text-center py-12">
        <div className="text-gray-500 text-lg">No columns available for this board</div>
        <p className="text-gray-400 mt-2">This board template doesn't have any columns configured.</p>
      </div>
    );
  }

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

      {/*
        A banner above the row rather than inside a column: it describes the
        whole board, it never covers a drop target, and it is the same shape at
        390 and 1440 pixels. It is shown only while the board has no task at all
        and the columns and their hints stay on screen beneath it.
      */}
      {tasks.length === 0 && (
        <div className="mx-4 mb-4 shrink-0 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:mx-6">
          <EmptyState
            compact
            headingLevel={2}
            icon={<ClipboardList size={20} className="text-gray-500" />}
            title="This board has no tasks yet"
            description="Add the first one, or drag tasks in once they exist."
            action={
              <button
                type="button"
                onClick={onAddTask}
                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors cursor-pointer"
              >
                <Plus size={18} aria-hidden="true" />
                Add task
              </button>
            }
          />
        </div>
      )}
      <DndContext
        sensors={drag.sensors}
        collisionDetection={drag.collisionDetection}
        accessibility={drag.accessibility}
        onDragStart={drag.onDragStart}
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
          className="flex min-h-0 flex-1 snap-x snap-proximity items-stretch gap-4 overflow-x-auto scroll-px-4 px-4 pb-4 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-500 sm:scroll-px-6 sm:px-6"
        >
          {columns.map(column => (
            <Column
              key={column.id}
              column={column}
              tasks={tasks.filter(task => task.status === column.id)}
              onTaskClick={onTaskClick}
              colorOf={colorOf}
              moveTargets={moveTargets}
              onMove={mover.moveToColumn}
            />
          ))}
        </div>

        <DragOverlay>
          {drag.activeTask ? <TaskCard task={drag.activeTask} color={colorOf(drag.activeTask)} isDragging /> : null}
        </DragOverlay>
      </DndContext>
    </>
  );
};

export default BoardColumns;
