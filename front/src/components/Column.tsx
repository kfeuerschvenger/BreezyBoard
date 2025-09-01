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
}

/**
 * Column component
 *
 * Represents a single Kanban column (e.g., "To Do", "In Progress", "Done").
 * It supports drag-and-drop reordering of tasks using dnd-kit.
 */
const Column: React.FC<ColumnProps> = ({ column, tasks, onTaskClick }) => {
  const { setNodeRef } = useDroppable({
    id: column._id,
  });

  return (
    <motion.div
      // Initial animation when the column appears
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 min-h-[600px]"
    >
      {/* Column header with color indicator, title and task count */}
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-3 h-3 rounded-full"
          style={{
            backgroundColor: typeof column.color === 'string' ? column.color : column.color.value,
          }}
        />
        <h2 className="font-semibold text-gray-900 font-heading">{column.title}</h2>
        <span className="bg-gray-100 text-gray-600 text-sm px-2 py-1 rounded-full">{tasks.length}</span>
      </div>

      {/* Droppable area where tasks can be reordered */}
      <div ref={setNodeRef} className="space-y-3 min-h-[500px]">
        <SortableContext items={tasks.map(task => task._id)} strategy={verticalListSortingStrategy}>
          {tasks.map(task => (
            <TaskCard key={task._id} task={task} onClick={() => onTaskClick(task)} />
          ))}
        </SortableContext>
      </div>
    </motion.div>
  );
};

export default Column;
