import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { motion } from 'framer-motion';
import { User, CircleCheck, AlertCircle, GripVertical, ShieldAlert } from 'lucide-react';
import type { Task } from '@/models';
import { resolveColorValue, resolveColorValueSync } from '@/utils/colorUtils';

type Priority = 'low' | 'medium' | 'high';

interface TaskCardProps {
  task: Task;
  onClick?: () => void;
  isDragging?: boolean;
}

/**
 * Priority visual mappings kept outside the component to avoid recreating them every render.
 */
const PRIORITY_STYLES: Record<Priority, string> = {
  low: 'bg-green-100 text-green-800',
  medium: 'bg-yellow-100 text-yellow-800',
  high: 'bg-red-100 text-red-800',
};

const PRIORITY_ICONS: Record<Priority, React.ElementType> = {
  low: CircleCheck,
  medium: AlertCircle,
  high: ShieldAlert,
};

const DEFAULT_COLOR = '#64748B';

/**
 * TaskCard: presentational card for a single task with optional drag support.
 */
const TaskCard: React.FC<TaskCardProps> = ({ task, onClick, isDragging = false }) => {
  // Use the task id as the sortable id (must be stable)
  const sortableId = task._id;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: sortableIsDragging,
  } = useSortable({ id: sortableId });

  // Convert dnd-kit transform to a style string; memoize so we don't recreate object every render.
  const style = useMemo(() => {
    return {
      transform: CSS.Transform.toString(transform),
      transition,
    } as React.CSSProperties;
  }, [transform, transition]);

  // Checklist progress calculations (memoized)
  const checklist = task.checklist ?? [];
  const completedItems = checklist.filter(item => !!item.completed).length;
  const totalItems = checklist.length;
  const progressPercentage = useMemo(() => {
    return totalItems > 0 ? (completedItems / totalItems) * 100 : 0;
  }, [completedItems, totalItems]);

  // Priority guards: ensure we only use known keys
  const priority = (task.priority as Priority) ?? 'low';
  const PriorityIcon = PRIORITY_ICONS[priority] ?? CircleCheck;
  const priorityClass = PRIORITY_STYLES[priority] ?? PRIORITY_STYLES.low;

  /**
   * Color resolution:
   * - We immediately set a sync fallback (fast), then try an async resolution.
   * - This pattern prevents layout shifts and lets us gracefully fall back.
   */
  const [colorHex, setColorHex] = useState<string>(() => resolveColorValueSync(task.color, DEFAULT_COLOR));

  useEffect(() => {
    let mounted = true;
    // immediate sync fallback
    setColorHex(resolveColorValueSync(task.color, DEFAULT_COLOR));

    // async resolution (if the util resolves from e.g. a token or remote source)
    (async () => {
      try {
        const resolved = await resolveColorValue(task.color, DEFAULT_COLOR);
        if (mounted && resolved) setColorHex(resolved);
      } catch {
        // keep fallback; avoid noisy logs in normal operation
        // console.warn('Could not resolve task color');
      }
    })();

    return () => {
      mounted = false;
    };
  }, [task.color]);

  // Owner name resolution (owner can be an object or an id)
  const ownerName = useMemo(() => {
    const owner = task.owner as any;
    if (owner && typeof owner === 'object') {
      return `${owner.firstName ?? ''} ${owner.lastName ?? ''}`.trim();
    }
    return '';
  }, [task.owner]);

  // stop propagation wrapper for drag handle clicks so parent onClick doesn't fire
  const stopAndHandle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  // Accessibility: allow keyboard to start dragging alternative action (calls listeners.onPointerDown if present)
  const handleDragHandleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Activate drag listeners on Space or Enter — mimic pointer interaction for keyboard users.
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        // Some dnd-kit listeners expect pointer events; we provide the listeners by calling the handler if exists.
        // If listeners has onPointerDown or onMouseDown, simulate a click by calling it with a synthetic event if possible.
        const anyListeners = listeners as any;
        if (typeof anyListeners.onPointerDown === 'function') {
          // create a minimal synthetic event shape expected by handler
          anyListeners.onPointerDown({} as any);
        } else if (typeof anyListeners.onMouseDown === 'function') {
          anyListeners.onMouseDown({} as any);
        }
      }
    },
    [listeners]
  );

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={`bg-white rounded-lg border border-gray-200 p-4 cursor-pointer transition-all ${
        sortableIsDragging || isDragging ? 'shadow-lg opacity-50' : 'hover:shadow-md'
      }`}
      onClick={onClick}
      role="article"
      aria-labelledby={`task-title-${sortableId}`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 pr-3">
          <h3 id={`task-title-${sortableId}`} className="font-medium text-gray-900 mb-1 font-heading">
            {task.title}
          </h3>
          {task.description && (
            <p className="text-sm text-gray-600 line-clamp-2 font-body" aria-label="Task description">
              {task.description}
            </p>
          )}
        </div>

        {/* Drag handle (accessible) */}
        <div
          className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600"
          {...listeners}
          {...attributes}
          onClick={stopAndHandle}
          role="button"
          aria-label="Drag handle"
          tabIndex={0}
          onKeyDown={handleDragHandleKeyDown}
          // prevent parent pointer/click from being interpreted when interacting with handle
          onPointerDown={e => e.stopPropagation()}
        >
          <GripVertical size={16} />
        </div>
      </div>

      {/* Progress / checklist */}
      {totalItems > 0 && (
        <div className="mb-3">
          <div className="flex items-center justify-between text-sm text-gray-600 mb-1">
            <span>
              {completedItems}/{totalItems} completed
            </span>
            <span>{Math.round(progressPercentage)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
            <motion.div
              className="h-2 rounded-full"
              // use resolved color for progress bar
              style={{ backgroundColor: colorHex }}
              initial={{ width: 0 }}
              animate={{ width: `${Math.max(0, Math.min(100, progressPercentage))}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${priorityClass}`}
            aria-hidden="true"
          >
            <PriorityIcon size={12} />
            {priority}
          </span>
        </div>

        {ownerName ? (
          <div className="flex items-center gap-1 text-xs text-gray-600">
            <User size={12} aria-hidden="true" />
            <span className="font-body">{ownerName}</span>
          </div>
        ) : null}
      </div>
    </motion.div>
  );
};

// memoize to avoid unnecessary re-renders when props are shallow-equal
export default React.memo(TaskCard);
