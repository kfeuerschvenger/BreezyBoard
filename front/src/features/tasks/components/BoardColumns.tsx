import React from 'react';
import { closestCorners, DndContext, DragOverlay } from '@dnd-kit/core';
import Column from '@/components/Column';
import TaskCard from '@/components/TaskCard';
import type { Task } from '@/models';
import type { ColumnData } from '../hooks/useBoardData';
import type { UseTaskDragAndDropResult } from '../hooks/useTaskDragAndDrop';

export interface BoardColumnsProps {
  columns: ColumnData[];
  tasks: Task[];
  drag: UseTaskDragAndDropResult;
  onTaskClick: (task: Task) => void;
}

/**
 * The board's columns and the drag context around them.
 *
 * The context wraps the grid rather than the page, because the overlay has to
 * render inside it and nothing outside the grid is draggable.
 */
export const BoardColumns: React.FC<BoardColumnsProps> = ({ columns, tasks, drag, onTaskClick }) => {
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {columns.map(column => (
          <Column
            key={column.id}
            column={column}
            tasks={tasks.filter(task => task.status === column.id)}
            onTaskClick={onTaskClick}
          />
        ))}
      </div>

      <DragOverlay>{drag.activeTask ? <TaskCard task={drag.activeTask} isDragging /> : null}</DragOverlay>
    </DndContext>
  );
};

export default BoardColumns;
