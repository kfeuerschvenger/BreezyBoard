import { useState } from 'react';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import type { Task } from '@/models';
import { useTaskMover } from './useTaskMover';
import type { TaskCache, UseTaskMoverResult } from './useTaskMover';

export type { TaskCache } from './useTaskMover';

export interface UseTaskDragAndDropOptions {
  tasks: Task[];
  /** The ids of the columns a card may be dropped on. */
  columnIds: string[];
  cache: TaskCache;
}

export interface UseTaskDragAndDropResult {
  /** The card currently held, for the drag overlay. */
  activeTask: Task | null;
  sensors: ReturnType<typeof useSensors>;
  onDragStart: (event: DragStartEvent) => void;
  onDragEnd: (event: DragEndEvent) => Promise<void>;
  /**
   * The move path a drop ends on, which the "Move to" menu shares. It lives on
   * this result so one in-flight guard covers both ways of moving a card.
   */
  mover: UseTaskMoverResult;
}

/**
 * Picking a card up and putting it down.
 *
 * Lifted out of the board page because it is business logic rather than
 * markup, and because none of it could be tested where it was. What a drop
 * turns into, the optimistic write, the request and the in-flight guard, is
 * `useTaskMover`; this hook is the part that is specific to dnd-kit: the
 * sensors, the held card and reading the drop target.
 */
export function useTaskDragAndDrop({ tasks, columnIds, cache }: UseTaskDragAndDropOptions): UseTaskDragAndDropResult {
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const mover = useTaskMover({ tasks, cache });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragStart = (event: DragStartEvent) => {
    setActiveTask(tasks.find(task => task._id === event.active.id) ?? null);
  };

  const onDragEnd = async (event: DragEndEvent) => {
    const { over } = event;
    if (!over || !activeTask) {
      setActiveTask(null);
      return;
    }

    // A card may be released over a column or over another card. The second
    // case takes the target column from the card underneath, and the card
    // itself is where the dropped one lands: its position, pushed down.
    const overTask = tasks.find(task => task._id === over.id);
    const targetColumnId = columnIds.includes(over.id as string) ? (over.id as string) : overTask?.status;

    if (!targetColumnId) {
      setActiveTask(null);
      return;
    }

    // `move` writes the cache synchronously before its first await, so the
    // card is already in its new column when the overlay is released.
    const pending = mover.move(activeTask, targetColumnId, overTask);
    setActiveTask(null);
    await pending;
  };

  return { activeTask, sensors, onDragStart, onDragEnd, mover };
}

export default useTaskDragAndDrop;
