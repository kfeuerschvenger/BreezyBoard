import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Column as ColumnType, Task } from '@/models';
import { motion } from 'framer-motion';
import TaskCard from './TaskCard';

interface ColumnProps {
  column: ColumnType;
  tasks: Task[];
  onTaskClick: (task: Task) => void;
}

const Column = ({ column, tasks, onTaskClick }: ColumnProps) => {
  const { setNodeRef } = useDroppable({
    id: column._id,
  });

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 min-h-[600px]"
    >
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
