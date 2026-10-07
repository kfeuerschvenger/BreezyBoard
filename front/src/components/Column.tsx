import React from 'react';
import { motion } from 'framer-motion';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';

import type { Column as ColumnType, Task } from '@/models';
import TaskCard from './TaskCard';

interface ColumnProps {
  column: ColumnType;
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  /**
   * The hex value to paint one task with. Passed down rather than resolved in
   * the card, which used to ask the colour endpoint once per card.
   */
  colorOf: (task: Task) => string;
}

/**
 * Column component
 *
 * Represents a single Kanban column (e.g., "To Do", "In Progress", "Done").
 * It supports drag-and-drop reordering of tasks using dnd-kit.
 *
 * The column has a fixed width and fills the height of the row it sits in. The
 * header never moves: only the body scrolls, so a long column keeps its title
 * and count in view.
 */
const Column: React.FC<ColumnProps> = ({ column, tasks, onTaskClick, colorOf }) => {
  const { setNodeRef } = useDroppable({
    id: column._id,
  });

  return (
    <motion.div
      // Initial animation when the column appears
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      // `shrink-0` keeps the fixed width: without it a flex row squeezes every
      // column to fit instead of overflowing and scrolling.
      className="flex h-full w-72 shrink-0 snap-start flex-col rounded-xl border border-gray-200 bg-white shadow-sm sm:w-80"
    >
      {/* Column header with color indicator, title and task count */}
      <div className="flex shrink-0 items-center gap-3 p-4 pb-3">
        <div
          className="w-3 h-3 rounded-full"
          style={{
            backgroundColor: typeof column.color === 'string' ? column.color : column.color.value,
          }}
        />
        <h2 className="font-semibold text-gray-900 font-heading">{column.title}</h2>
        <span className="bg-gray-100 text-gray-600 text-sm px-2 py-1 rounded-full">{tasks.length}</span>
      </div>

      {/*
        Droppable area where tasks can be reordered. It is the whole body of the
        column, flexed to fill it, so an empty column is as easy a drop target
        as a full one.

        `relative` is load-bearing. An absolutely positioned descendant is only
        clipped and scrolled by a scroller that is also its containing block, and
        the cards carry `sr-only` text, which is absolute. Without it that text
        escapes the column, and the page grows to the position of the last card
        in the longest column.
      */}
      <div
        ref={setNodeRef}
        className="relative flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4"
      >
        <SortableContext items={tasks.map(task => task._id)} strategy={verticalListSortingStrategy}>
          {tasks.map(task => (
            <TaskCard key={task._id} task={task} color={colorOf(task)} onClick={() => onTaskClick(task)} />
          ))}
        </SortableContext>

        {tasks.length === 0 && (
          <p className="rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-600">
            No tasks here yet. Drag a task into this column to move it.
          </p>
        )}
      </div>
    </motion.div>
  );
};

export default Column;
