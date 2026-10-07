import React, { useMemo, useCallback } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { motion } from 'framer-motion';
import { User, CircleCheck, AlertCircle, GripVertical, ShieldAlert } from 'lucide-react';
import type { Task } from '@/models';
import { COLOR_FALLBACK } from '@/features/colors';
import { asTaskPriority, PRIORITY_BADGE_CLASSES, TaskMoveMenu } from '@/features/tasks';
import type { MoveTarget, TaskPriority } from '@/features/tasks';

interface TaskCardProps {
  task: Task;
  /**
   * The hex value to paint the progress bar with, already resolved.
   *
   * The card used to resolve this itself, which meant a request per card for
   * any task whose colour was stored as an id: a board of thirty tasks asked
   * the colour endpoint thirty times for parts of a list it serves whole.
   * Whoever renders the board reads that list once and passes the answer.
   */
  color?: string;
  onClick?: () => void;
  isDragging?: boolean;
  /**
   * The columns the card can be moved to without dragging. The "Move to" menu
   * renders only when this and `onMove` are both given, so the copy of the card
   * in the drag overlay never carries one.
   */
  moveTargets?: MoveTarget[];
  onMove?: (task: Task, target: MoveTarget) => void;
}

/**
 * The icons are the card's own. The colours are not: which colour a priority
 * is gets decided once, in features/tasks/priority, because it used to be
 * decided here and again in the picker. That is the priority half of P3-6.
 */
const PRIORITY_ICONS: Record<TaskPriority, React.ElementType> = {
  low: CircleCheck,
  medium: AlertCircle,
  high: ShieldAlert,
};

/**
 * TaskCard: presentational card for a single task with optional drag support.
 */
const TaskCard: React.FC<TaskCardProps> = ({
  task,
  color = COLOR_FALLBACK,
  onClick,
  isDragging = false,
  moveTargets,
  onMove,
}) => {
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

  // Anything unrecognised reads as the least urgent rather than crashing.
  const priority = asTaskPriority(task.priority);
  const PriorityIcon = PRIORITY_ICONS[priority];
  const priorityClass = PRIORITY_BADGE_CLASSES[priority];

  // Owner name resolution (owner can be an object or an id)
  const ownerName = useMemo(() => {
    const owner = task.owner;
    if (owner && typeof owner === 'object') {
      return `${owner.firstName ?? ''} ${owner.lastName ?? ''}`.trim();
    }
    return '';
  }, [task.owner]);

  // stop propagation wrapper for drag handle clicks so parent onClick doesn't fire
  const stopAndHandle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

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

        {/*
          A real button rather than a div carrying a role. As a div it relied
          on dnd-kit to supply the role, the tab stop and the key handling,
          none of which static analysis can see through a spread, so it sat
          under two permanent accessibility warnings that could not be
          answered without rewriting it. A button needs none of them to be
          reachable, and dnd-kit's own attributes sit on top unchanged.

          The dnd-kit spreads MUST still come last: they supply onPointerDown
          and onKeyDown, which are the sensor activators, and a duplicate JSX
          prop declared after a spread silently replaces them. That is finding
          P0-3. aria-label survives because dnd-kit does not set it, and
          onClick is not an activator.
        */}
        <div className="flex shrink-0 items-center gap-1">
          {moveTargets && onMove && (
            <TaskMoveMenu
              taskId={task._id}
              taskTitle={task.title}
              columns={moveTargets}
              currentColumnId={task.status}
              onMove={target => onMove(task, target)}
            />
          )}
          <button
            type="button"
            className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600 cursor-grab focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
            aria-label="Drag handle"
            onClick={stopAndHandle}
            {...attributes}
            {...listeners}
          >
            <GripVertical size={16} />
          </button>
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
              style={{ backgroundColor: color }}
              initial={{ width: 0 }}
              animate={{ width: `${Math.max(0, Math.min(100, progressPercentage))}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/*
            Not aria-hidden any more. Finding P4-3 recorded this whole badge
            as hidden, which hid real information rather than a decorative
            icon: it is the only place a task shows its priority, so a card
            said nothing about it at all.

            The icon is hidden instead, because the word beside it already
            says the same thing, and the word gains a subject that is carried
            for assistive technology only, so the badge still reads as one
            word on screen.
          */}
          <span
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${priorityClass}`}
          >
            <PriorityIcon size={12} aria-hidden="true" />
            <span className="sr-only">Priority: </span>
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
