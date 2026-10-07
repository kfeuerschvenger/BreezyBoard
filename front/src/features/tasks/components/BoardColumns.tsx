import React from 'react';
import { closestCorners, DndContext, DragOverlay } from '@dnd-kit/core';
import Column from '@/components/Column';
import TaskCard from '@/components/TaskCard';
import type { Task } from '@/models';
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
}

/**
 * The board's columns and the drag context around them.
 *
 * The context wraps the grid rather than the page, because the overlay has to
 * render inside it and nothing outside the grid is draggable.
 */
export const BoardColumns: React.FC<BoardColumnsProps> = ({ columns, tasks, drag, taskColors, onTaskClick }) => {
  const colorOf = (task: Task) => resolveColor(task.color, taskColors);

  if (columns.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-500 text-lg">No columns available for this board</div>
        <p className="text-gray-400 mt-2">This board template doesn't have any columns configured.</p>
      </div>
    );
  }

  return (
    <DndContext
      sensors={drag.sensors}
      collisionDetection={closestCorners}
      onDragStart={drag.onDragStart}
      onDragEnd={drag.onDragEnd}
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
          />
        ))}
      </div>

      <DragOverlay>
        {drag.activeTask ? <TaskCard task={drag.activeTask} color={colorOf(drag.activeTask)} isDragging /> : null}
      </DragOverlay>
    </DndContext>
  );
};

export default BoardColumns;
