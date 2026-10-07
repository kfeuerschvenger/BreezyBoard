import { useEffect, useMemo, useRef, useState } from 'react';
import type { CollisionDetection, DndContextProps, DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { Task } from '@/models';
import {
  buildSnapshot,
  createAnnouncements,
  createBoardCoordinateGetter,
  createCollisionDetection,
  SCREEN_READER_INSTRUCTIONS,
} from '../keyboardDrag';
import type { KeyboardTarget } from '../keyboardDrag';
import { useTaskMover } from './useTaskMover';
import type { MoveTarget, TaskCache, UseTaskMoverResult } from './useTaskMover';

export type { TaskCache } from './useTaskMover';

export interface UseTaskDragAndDropOptions {
  tasks: Task[];
  /** The columns a card may be dropped on, in board order. */
  columns: MoveTarget[];
  cache: TaskCache;
}

export interface UseTaskDragAndDropResult {
  /** The card currently held, for the drag overlay. */
  activeTask: Task | null;
  sensors: ReturnType<typeof useSensors>;
  collisionDetection: CollisionDetection;
  /** What a screen reader hears while a card is carried, naming tasks and columns. */
  accessibility: NonNullable<DndContextProps['accessibility']>;
  onDragStart: (event: DragStartEvent) => void;
  onDragEnd: (event: DragEndEvent) => Promise<void>;
  onDragCancel: () => void;
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
 *
 * The keyboard sensor steps through positions on the board rather than
 * through screen geometry, see `keyboardDrag`. Pointer dragging keeps the
 * default sensor and collision detection untouched.
 */
export function useTaskDragAndDrop({ tasks, columns, cache }: UseTaskDragAndDropOptions): UseTaskDragAndDropResult {
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const mover = useTaskMover({ tasks, cache });
  const columnIds = useMemo(() => columns.map(column => column.id), [columns]);

  // The keyboard getter, the collision detection and the announcements are
  // created once and read the board through a ref, so the sensor never holds a
  // stale board and the context is not handed new functions on every render.
  const snapshot = useMemo(() => buildSnapshot(columns, tasks), [columns, tasks]);
  const snapshotRef = useRef(snapshot);
  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  const keyboardTarget = useRef<KeyboardTarget | null>(null);
  const coordinateGetter = useMemo(
    () => createBoardCoordinateGetter({ getSnapshot: () => snapshotRef.current, target: keyboardTarget }),
    [],
  );
  const collisionDetection = useMemo(() => createCollisionDetection(keyboardTarget), []);
  const accessibility = useMemo(
    () => ({
      announcements: createAnnouncements(() => snapshotRef.current),
      screenReaderInstructions: { draggable: SCREEN_READER_INSTRUCTIONS },
    }),
    [],
  );

  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter }));

  const onDragStart = (event: DragStartEvent) => {
    keyboardTarget.current = null;
    setActiveTask(tasks.find(task => task._id === event.active.id) ?? null);
  };

  const onDragCancel = () => {
    keyboardTarget.current = null;
    setActiveTask(null);
  };

  const onDragEnd = async (event: DragEndEvent) => {
    const { over, activatorEvent } = event;
    keyboardTarget.current = null;

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

    // A card carried with the keyboard that lands in another column is a new
    // element and the handle that had focus is gone, so the page is asked to
    // focus the handle where the card now stands.
    if (activatorEvent instanceof KeyboardEvent) mover.requestFocus(activeTask._id, 'drag-handle');

    // `move` writes the cache synchronously before its first await, so the
    // card is already in its new column when the overlay is released.
    const pending = mover.move(activeTask, targetColumnId, overTask);
    const held = activeTask;
    setActiveTask(null);

    // dnd-kit announces the drop. A request that then fails is the one thing
    // it cannot know, and it is said through the mover's own live region so no
    // move is announced twice.
    if ((await pending) === 'failed') {
      const title = columns.find(column => column.id === targetColumnId)?.title ?? 'that column';
      mover.announce(`Could not move ${held.title} to ${title}.`);
    }
  };

  return { activeTask, sensors, collisionDetection, accessibility, onDragStart, onDragEnd, onDragCancel, mover };
}

export default useTaskDragAndDrop;
