import React, { useEffect, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { motion } from 'framer-motion';
import { User, CircleCheck, AlertCircle, GripVertical, ShieldAlert } from 'lucide-react';
import type { Task } from '@/models';
import { resolveColorValue, resolveColorValueSync } from '@/utils/colorUtils';

interface TaskCardProps {
  task: Task;
  onClick?: () => void;
  isDragging?: boolean;
}

const TaskCard: React.FC<TaskCardProps> = ({ task, onClick, isDragging = false }) => {
  const sortableId = task._id;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: sortableIsDragging,
  } = useSortable({ id: sortableId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const checklist = task.checklist ?? [];
  const completedItems = checklist.filter(item => item.completed).length;
  const totalItems = checklist.length;
  const progressPercentage = totalItems > 0 ? (completedItems / totalItems) * 100 : 0;

  const priorityColors: Record<string, string> = {
    low: 'bg-green-100 text-green-800',
    medium: 'bg-yellow-100 text-yellow-800',
    high: 'bg-red-100 text-red-800',
  };

  const priorityIcons: Record<string, React.ElementType> = {
    low: CircleCheck,
    medium: AlertCircle,
    high: ShieldAlert,
  };

  const PriorityIcon = priorityIcons[task.priority] ?? CircleCheck;

  // immediate fallback (sync) and then async resolution if needed
  const [colorHex, setColorHex] = useState<string>(() => resolveColorValueSync(task.color, '#64748B'));

  useEffect(() => {
    let mounted = true;

    // set immediate sync fallback while we resolve
    setColorHex(resolveColorValueSync(task.color, '#64748B'));

    (async () => {
      try {
        const hex = await resolveColorValue(task.color, '#64748B');
        if (mounted) setColorHex(hex);
      } catch {
        // console.warn('Could not resolve task color');
      }
    })();

    return () => {
      mounted = false;
    };
  }, [task.color]);

  // owner might be User object or string id; handle safely
  const ownerName =
    typeof task.owner === 'object' && task.owner
      ? `${task.owner.firstName ?? ''} ${task.owner.lastName ?? ''}`.trim()
      : '';

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={`bg-white rounded-lg border border-gray-200 p-4 cursor-pointer transition-all hover:shadow-md ${
        sortableIsDragging || isDragging ? 'shadow-lg opacity-50' : ''
      }`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <h3 className="font-medium text-gray-900 mb-1 font-heading">{task.title}</h3>
          {task.description && <p className="text-sm text-gray-600 line-clamp-2 font-body">{task.description}</p>}
        </div>
        {/* Drag handle */}
        <div
          className="w-6 h-6 flex items-center justify-center cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600"
          {...listeners}
          {...attributes}
          onClick={e => {
            e.stopPropagation();
          }}
        >
          <GripVertical size={16} />
        </div>
      </div>

      {totalItems > 0 && (
        <div className="mb-3">
          <div className="flex items-center justify-between text-sm text-gray-600 mb-1">
            <span>
              {completedItems}/{totalItems} completed
            </span>
            <span>{Math.round(progressPercentage)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <motion.div
              className="bg-blue-600 h-2 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progressPercentage}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
              priorityColors[task.priority]
            }`}
          >
            <PriorityIcon size={12} />
            {task.priority}
          </span>
        </div>

        {ownerName ? (
          <div className="flex items-center gap-1 text-xs text-gray-600">
            <User size={12} />
            <span className="font-body">{ownerName}</span>
          </div>
        ) : null}
      </div>
    </motion.div>
  );
};

export default TaskCard;
