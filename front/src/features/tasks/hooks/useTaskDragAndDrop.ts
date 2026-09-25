import { useEffect, useRef, useState } from 'react';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import type { Task } from '@/models';
import { TaskService } from '@/services';
import { arrangeColumn, neighboursOf } from '@/features/board';

export interface TaskCache {
  write: (tasks: Task[]) => void;
  replace: (task: Task) => void;
  refetch: () => Promise<unknown> | void;
}

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
}

/**
 * Moving a card between and within columns.
 *
 * Lifted out of the board page because it is business logic rather than
 * markup, and because none of it could be tested where it was. Two of the
 * rules below were findings before they were code, so they are the ones any
 * change here has to keep.
 */
export function useTaskDragAndDrop({ tasks, columnIds, cache }: UseTaskDragAndDropOptions): UseTaskDragAndDropResult {
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  // The move request currently in flight, if any. A second drag started
  // before the first one answers aborts it rather than racing it: without
  // this, a slow first request can resolve after a second one and roll its
  // own stale snapshot back over an update already on screen. That is
  // finding P2-6.
  const inFlightMove = useRef<AbortController | null>(null);

  useEffect(() => () => inFlightMove.current?.abort(), []);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
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
    // case takes the target column from the card underneath.
    const overTask = tasks.find(task => task._id === over.id);
    const targetColumnId = columnIds.includes(over.id as string) ? (over.id as string) : overTask?.status;

    if (!targetColumnId) {
      setActiveTask(null);
      return;
    }

    // Build the column exactly as it will look after the drop, then read the
    // dropped card's neighbours out of it. One arrangement drives both the
    // optimistic render and the request, so the two cannot disagree.
    //
    // This is also what fixes the cross-column drop. The previous version
    // computed one past the maximum order of the target column, so a card
    // dropped halfway down another column always landed at the bottom of it,
    // wherever it was released.
    const arranged = arrangeColumn(tasks, activeTask, targetColumnId, overTask);
    if (!arranged) {
      setActiveTask(null);
      return;
    }

    inFlightMove.current?.abort();
    const controller = new AbortController();
    inFlightMove.current = controller;

    // Straight into the query cache rather than into component state. This is
    // the external write path the data layer exists for: the same one a
    // server-sent event would use, exercised every time somebody drags a card.
    const movedTask = activeTask;
    cache.write([
      ...tasks.filter(task => task.status !== targetColumnId && task._id !== movedTask._id),
      ...arranged.column,
    ]);
    setActiveTask(null);

    try {
      const moved = await TaskService.move(movedTask._id, targetColumnId, neighboursOf(arranged), controller.signal);

      // The server owns the ordering key, so the card is replaced with what
      // it actually wrote rather than left holding the placeholder used for
      // the optimistic render.
      cache.replace(moved);
    } catch (error) {
      // A move this client abandoned because a newer one replaced it. The
      // newer one owns the board's state now, so touching it here is exactly
      // the rollback-over-a-newer-update this guard exists to prevent.
      if (controller.signal.aborted) return;

      // Anything else, including the 409 the server sends when the
      // neighbours have moved, is answered by asking the server what the
      // board actually looks like. Restoring a snapshot taken before the drag
      // would be wrong for the same reason: by now it may be older than
      // changes that did land.
      console.error('Error moving task:', error);
      await cache.refetch();
    } finally {
      if (inFlightMove.current === controller) inFlightMove.current = null;
    }
  };

  return { activeTask, sensors, onDragStart, onDragEnd };
}

export default useTaskDragAndDrop;
